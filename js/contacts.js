// Fiche d'un contact (consulter, modifier) et écran « Tous les contacts » (liste complète avec recherche).
// Un tap sur un contact, dans l'accueil comme dans « Tous les contacts », ouvre sa fiche.
// « Enregistrer » : contact mis à jour en local, puis ligne du tableau mise à jour par la file d'attente (hors connexion compris).

import { afficher, enregistrerEcran, el, message, montrerErreur, ecranAffiche } from './interface.js';
import * as base from './base.js';
import * as drive from './drive.js';
import * as espace from './espace.js';
import { synchroniser } from './file.js';
import { jetonDansLeGeste, jetonValide } from './connexion.js';
import { dateCourte } from './dates.js';
import { sansAccent } from './tri.js';
import { CHAMPS_MODIFIABLES, idPhoto } from './operations.js';

let ouvert = null;          // contact affiché dans la fiche
let origine = 'accueil';    // écran à retrouver en quittant la fiche
let adressePhoto = '';      // adresse locale de l'image affichée (à libérer)

// Nom à afficher pour un contact.
export function nomAffiche(c) {
  return c.nom || c.entreprise || c.email || 'Contact sans nom';
}

// Champ de la fiche d'après son nom.
function champ(nom) {
  return document.getElementById('fiche-' + nom);
}

// ---------- Appui long : icône corbeille sur la ligne ----------

const DUREE_APPUI_LONG = 600; // ms
const TOLERANCE_MOUVEMENT = 10; // px : au-delà, c'est un défilement, pas un appui long
let ligneCorbeille = null;  // ligne qui montre sa corbeille
let ignorerClic = false;    // le tap qui ferme la corbeille n'ouvre pas la fiche

// Icône corbeille en trait simple (SVG), couleur du texte du bouton.
function iconeCorbeille() {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '22');
  svg.setAttribute('height', '22');
  svg.setAttribute('aria-hidden', 'true');
  ['M4 7h16', 'M9 7V4h6v3', 'M6 7l1 13h10l1-13', 'M10 11v6', 'M14 11v6'].forEach((d) => {
    const p = document.createElementNS(ns, 'path');
    p.setAttribute('d', d);
    svg.append(p);
  });
  return svg;
}

// Cache la corbeille affichée.
function cacherCorbeille() {
  if (ligneCorbeille) ligneCorbeille.classList.remove('ligne-contact--corbeille');
  ligneCorbeille = null;
}

// Montre la corbeille d'une ligne (une seule à la fois).
function montrerCorbeille(ligne) {
  cacherCorbeille();
  ligneCorbeille = ligne;
  ligne.classList.add('ligne-contact--corbeille');
  if (navigator.vibrate) navigator.vibrate(15);
}

// Branche l'appui long sur le bouton d'une ligne ; un tap simple ouvre la fiche.
function brancherAppuiLong(ligne, bouton, c) {
  let minuterie = null;
  let depart = null;
  let declenche = false;
  const arreter = () => { clearTimeout(minuterie); minuterie = null; };
  bouton.addEventListener('pointerdown', (e) => {
    declenche = false;
    depart = [e.clientX, e.clientY];
    arreter();
    minuterie = setTimeout(() => { declenche = true; montrerCorbeille(ligne); }, DUREE_APPUI_LONG);
  });
  bouton.addEventListener('pointermove', (e) => {
    if (depart && Math.hypot(e.clientX - depart[0], e.clientY - depart[1]) > TOLERANCE_MOUVEMENT) arreter();
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((t) => bouton.addEventListener(t, arreter));
  bouton.addEventListener('contextmenu', (e) => e.preventDefault()); // pas de menu du navigateur à l'appui long
  bouton.addEventListener('click', (e) => {
    if (declenche || ignorerClic) { e.preventDefault(); declenche = false; ignorerClic = false; return; }
    ouvrirFiche(c);
  });
}

// Ligne de liste pour un contact : bouton (tap = fiche, appui long = corbeille) avec nom, entreprise, date et badge.
export function elementContact(c) {
  let badge = null;
  if (c.source === 'local' && c.etat !== 'ecrit') badge = el('span', { class: 'badge badge-attente' }, 'En attente');
  else if (c.statut === base.A_VERIFIER) badge = el('span', { class: 'badge badge-verifier' }, 'À vérifier');
  const bouton = el('button', { class: 'contact contact-bouton', type: 'button' },
    el('div', { class: 'contact__texte' },
      el('div', { class: 'contact__nom' }, nomAffiche(c)),
      el('div', { class: 'contact__info' }, [c.entreprise && c.nom ? c.entreprise : '', dateCourte(c.creeLe)].filter(Boolean).join(' · '))),
    badge);
  const corbeille = el('button', {
    class: 'corbeille', type: 'button', 'aria-label': 'Supprimer ' + nomAffiche(c),
    onclick: () => { cacherCorbeille(); demanderSuppression(c); }
  }, iconeCorbeille());
  const ligne = el('li', { class: 'ligne-contact' }, bouton, corbeille);
  brancherAppuiLong(ligne, bouton, c);
  return ligne;
}

// ---------- Suppression (confirmation, puis file d'attente) ----------

// Fenêtre de confirmation ; résout vrai sur « Supprimer », faux sur « Annuler ».
function confirmer(texte) {
  const fenetre = document.getElementById('confirmation');
  document.getElementById('confirmation-texte').textContent = texte;
  fenetre.hidden = false;
  document.getElementById('confirmation-non').focus();
  return new Promise((ok) => {
    const fermer = (reponse) => {
      fenetre.hidden = true;
      document.getElementById('confirmation-oui').onclick = null;
      document.getElementById('confirmation-non').onclick = null;
      ok(reponse);
    };
    document.getElementById('confirmation-oui').onclick = () => fermer(true);
    document.getElementById('confirmation-non').onclick = () => fermer(false);
  });
}

// Demande confirmation puis supprime : retrait local immédiat, tableau et photo par la file d'attente.
export async function demanderSuppression(c) {
  if (!(await confirmer('Supprimer ' + nomAffiche(c) + ' ? Le contact sera retiré de votre tableau.'))) return false;
  try {
    await espace.supprimerContactPartout(c);
  } catch (e) {
    montrerErreur('Suppression impossible : ' + e.message);
    return false;
  }
  message('Contact supprimé');
  window.dispatchEvent(new CustomEvent('carnet:contacts'));
  if (navigator.onLine && jetonValide()) synchroniser();
  return true;
}

// Libère l'image de la fiche.
function oublierPhoto() {
  if (adressePhoto) URL.revokeObjectURL(adressePhoto);
  adressePhoto = '';
  document.getElementById('fiche-apercu').hidden = true;
  document.getElementById('fiche-image').removeAttribute('src');
}

// Montre une image (Blob) dans la fiche.
function montrerPhoto(image) {
  oublierPhoto();
  adressePhoto = URL.createObjectURL(image);
  document.getElementById('fiche-image').src = adressePhoto;
  document.getElementById('fiche-apercu').hidden = false;
}

// Photo de la carte : celle du téléphone si elle n'est pas encore envoyée, sinon celle du Drive (si connecté) ;
// à défaut, un lien pour l'ouvrir dans Google Drive.
async function chargerPhoto(c) {
  const lien = document.getElementById('fiche-lien-photo');
  lien.hidden = !c.photoLien;
  if (c.photoLien) lien.href = c.photoLien;
  const local = await base.lireContact(c.id);
  if (ouvert !== c) return;
  if (local && local.photo) { montrerPhoto(local.photo); return; }
  const id = (local && local.photoId) || idPhoto(c.photoLien);
  if (!id || !navigator.onLine || !jetonValide()) return;
  try {
    const image = await drive.lirePhoto(id);
    if (ouvert === c) montrerPhoto(image);
  } catch (e) { /* lien « Voir la photo » gardé */ }
}

// Ouvre la fiche d'un contact.
export function ouvrirFiche(c) {
  const ecran = ecranAffiche();
  origine = ecran === 'contacts' ? 'contacts' : 'accueil';
  ouvert = c;
  CHAMPS_MODIFIABLES.forEach((k) => { champ(k).value = c[k] || ''; });
  document.getElementById('fiche-date').textContent = c.creeLe ? 'Enregistré le ' + dateCourte(c.creeLe) : '';
  oublierPhoto();
  afficher('fiche');
  chargerPhoto(c);
}

// Quitte la fiche vers l'écran d'origine.
function quitterFiche() {
  afficher(origine);
}

// « Enregistrer » : jeton redemandé dans le geste si besoin (avant tout await), contact modifié en local, file relancée.
function surEnregistrer(evenement) {
  evenement.preventDefault();
  if (!ouvert) return;
  const contact = ouvert;
  const champs = {};
  CHAMPS_MODIFIABLES.forEach((k) => { champs[k] = champ(k).value.trim(); });
  const jeton = navigator.onLine ? jetonDansLeGeste().catch(() => {}) : Promise.resolve();
  espace.modifierContact(contact, champs)
    .then(() => {
      message('Contact modifié');
      quitterFiche();
      jeton.then(() => synchroniser());
    })
    .catch((e) => montrerErreur('Modification impossible : ' + e.message));
}

// Remplit « Tous les contacts », filtrée par la recherche (nom ou entreprise, sans tenir compte des accents).
async function rafraichirTous() {
  const recherche = sansAccent(document.getElementById('recherche-contacts').value.trim());
  const contacts = (await espace.vueContacts())
    .filter((c) => !recherche || sansAccent((c.nom || '') + ' ' + (c.entreprise || '')).includes(recherche));
  document.getElementById('liste-tous').replaceChildren(...contacts.map(elementContact));
  document.getElementById('aucun-trouve').hidden = contacts.length > 0;
}

// Branche la fiche et l'écran « Tous les contacts ».
export function initContacts() {
  enregistrerEcran('fiche', { quitter: () => { ouvert = null; oublierPhoto(); } });
  enregistrerEcran('contacts', { afficher: () => rafraichirTous().catch((e) => montrerErreur('Contacts : ' + e.message)) });
  document.getElementById('formulaire-fiche').addEventListener('submit', surEnregistrer);
  document.getElementById('fiche-retour').addEventListener('click', quitterFiche);
  document.getElementById('bouton-tous-contacts').addEventListener('click', () => afficher('contacts'));
  document.getElementById('recherche-contacts').addEventListener('input', () => rafraichirTous());
  document.getElementById('fiche-supprimer').addEventListener('click', () => {
    if (!ouvert) return;
    const c = ouvert;
    demanderSuppression(c).then((supprime) => { if (supprime && ouvert === c) quitterFiche(); });
  });
  // Un tap ailleurs que sur la corbeille la fait disparaître (et ce tap n'ouvre pas de fiche)
  document.addEventListener('pointerdown', (e) => {
    ignorerClic = false;
    if (!ligneCorbeille || e.target.closest('.corbeille')) return;
    if (e.target.closest('.contact-bouton')) ignorerClic = true;
    cacherCorbeille();
  }, true);
  const siListe = () => { if (ecranAffiche() === 'contacts') rafraichirTous(); };
  ['carnet:sync', 'carnet:contacts'].forEach((evt) => window.addEventListener(evt, siListe));
}
