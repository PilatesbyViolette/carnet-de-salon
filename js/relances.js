// Écran « À relancer » : contacts du tableau (copie locale relue à chaque synchronisation) à relancer à J+2, puis à J+7.
// « Relancer » ouvre la messagerie (mailto: avec objet et corps remplis), « Copier le message » le copie.
// Au retour dans l'appli : « Relance envoyée ? Oui / Plus tard » ; Oui écrit « Envoyée le JJ/MM » dans la colonne de relance.

import { enregistrerEcran, ecranAffiche, el, message, montrerErreur } from './interface.js';
import * as espace from './espace.js';
import { synchroniser } from './file.js';
import { jetonValide } from './connexion.js';
import { dateCourte, jourMois } from './dates.js';

const JOUR_MS = 24 * 60 * 60 * 1000;
const EN_COURS = 'relanceEnCours'; // relance ouverte, en attente de la réponse « Relance envoyée ? »

// Nombre de jours de calendrier entre la date ISO du contact et maintenant (-1 si date illisible).
export function joursEcoules(iso, maintenant) {
  const d = new Date(iso);
  if (isNaN(d)) return -1;
  const debut = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const fin = new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate());
  return Math.round((fin - debut) / JOUR_MS);
}

// Relance due : 'J+2' si la première manque, puis 'J+7' une fois la première faite ; '' sinon (ou sans e-mail).
export function relanceDue(c, delai2, delai7, maintenant) {
  if (!c.email) return '';
  const jours = joursEcoules(c.creeLe, maintenant);
  if (!c.relanceJ2) return jours >= delai2 ? 'J+2' : '';
  if (!c.relanceJ7) return jours >= delai7 ? 'J+7' : '';
  return '';
}

// Valeurs des variables des modèles pour un contact ({prenom} : premier mot du nom).
export function valeursModele(c, r) {
  return {
    prenom: String(c.nom || '').trim().split(/\s+/)[0], entreprise: c.entreprise || '', note: c.note || '',
    salon: r.salon || '', exposant: r.exposant || '', signature: r.signature || ''
  };
}

// Remplit un modèle des Réglages ; sans prénom, « Bonjour {prenom}, » devient « Bonjour, ». Variable inconnue gardée.
export function remplirModele(modele, valeurs) {
  let texte = String(modele || '');
  if (!valeurs.prenom) texte = texte.replace(/[ \t]*\{prenom\}/g, '');
  return texte.replace(/\{(\w+)\}/g, (tout, nom) => (Object.prototype.hasOwnProperty.call(valeurs, nom) ? valeurs[nom] : tout));
}

// Lien mailto: : objet et corps encodés par encodeURIComponent, sauts de ligne du corps en %0D%0A.
export function lienMailto(email, objet, corps) {
  const objetSurUneLigne = String(objet).replace(/\s*\r?\n\s*/g, ' ');
  const corpsCrlf = String(corps).replace(/\r?\n/g, '\r\n');
  return 'mailto:' + String(email).trim() + '?subject=' + encodeURIComponent(objetSurUneLigne) +
    '&body=' + encodeURIComponent(corpsCrlf);
}

// Nombre de jours lu dans les Réglages (valeur par défaut si illisible).
function entier(texte, defaut) {
  const n = parseInt(texte, 10);
  return isNaN(n) ? defaut : n;
}

// Réglages utiles aux relances : délais, modèles, salon, exposant, signature.
async function reglagesRelance() {
  const r = (cle) => espace.reglage(cle);
  return {
    delai2: entier(await r('Délai J+2'), 2), delai7: entier(await r('Délai J+7'), 7),
    'J+2': { objet: await r('Objet J+2'), message: await r('Message J+2') },
    'J+7': { objet: await r('Objet J+7'), message: await r('Message J+7') },
    salon: await r('Nom du salon'), exposant: await r('Votre entreprise'),
    signature: (await r('Votre signature')) || (await r('Votre nom'))
  };
}

// Relance prête pour un contact : type, objet, corps et lien mailto:.
function preparerRelance(contact, type, r) {
  const valeurs = valeursModele(contact, r);
  const objet = remplirModele(r[type].objet, valeurs);
  const corps = remplirModele(r[type].message, valeurs);
  return { contact, type, objet, corps, lien: lienMailto(contact.email, objet, corps) };
}

// Contacts à relancer, du plus ancien au plus récent, avec leur message rempli.
export async function contactsARelancer(maintenant = new Date()) {
  const r = await reglagesRelance();
  return (await espace.lignesAvecRelances())
    .map((c) => ({ c, type: relanceDue(c, r.delai2, r.delai7, maintenant) }))
    .filter((x) => x.type)
    .sort((a, b) => (Date.parse(a.c.creeLe) || 0) - (Date.parse(b.c.creeLe) || 0))
    .map((x) => preparerRelance(x.c, x.type, r));
}

// Nom à afficher pour un contact.
function nomAffiche(c) {
  return c.nom || c.entreprise || c.email || 'Contact sans nom';
}

// Garde la relance ouverte, pour poser la question au retour dans l'appli.
function commencerRelance(x) {
  try {
    localStorage.setItem(EN_COURS, JSON.stringify({ id: x.contact.id, type: x.type, nom: nomAffiche(x.contact) }));
  } catch (e) { /* stockage indisponible : pas de question au retour */ }
}

// Relance ouverte en attente de réponse, ou null.
function relanceEnCours() {
  try { return JSON.parse(localStorage.getItem(EN_COURS)); } catch (e) { return null; }
}

// Oublie la relance ouverte et ferme la question.
function oublierRelanceEnCours() {
  try { localStorage.removeItem(EN_COURS); } catch (e) { /* stockage indisponible */ }
  document.getElementById('question-relance').hidden = true;
}

// Copie un texte : presse-papiers, sinon repli par sélection d'une zone de texte ; vrai si la copie a marché.
async function copierTexte(texte) {
  try {
    await navigator.clipboard.writeText(texte);
    return true;
  } catch (e) { /* repli ci-dessous */ }
  const zone = el('textarea', { class: 'zone-copie', readonly: true }, texte);
  document.body.append(zone);
  zone.select();
  zone.setSelectionRange(0, texte.length);
  let ok = false;
  try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
  zone.remove();
  return ok;
}

// « Copier le message » : copie le corps ; si la copie échoue, le message s'affiche sélectionné pour une copie à la main.
async function surCopier(x, carte) {
  if (await copierTexte(x.corps)) {
    commencerRelance(x);
    message('Message copié');
    return;
  }
  const zone = el('textarea', { class: 'texte-lu zone-visible', readonly: true, rows: 8 }, x.corps);
  carte.append(zone);
  zone.focus();
  zone.select();
  montrerErreur('Copie automatique impossible : le message est sélectionné, copiez-le à la main.');
}

// Carte d'un contact à relancer : nom, date, e-mail, badge, objet, boutons « Relancer » et « Copier le message ».
function elementRelance(x) {
  const c = x.contact;
  const carte = el('li', { class: 'relance' },
    el('div', { class: 'relance__tete' },
      el('div', { class: 'contact__texte' },
        el('div', { class: 'contact__nom' }, nomAffiche(c)),
        el('div', { class: 'contact__info' }, [c.nom ? c.entreprise : '', dateCourte(c.creeLe)].filter(Boolean).join(' · ')),
        el('div', { class: 'contact__info' }, c.nom || c.entreprise ? c.email : '')),
      el('span', { class: 'badge badge-relance' }, x.type)),
    el('p', { class: 'relance__objet' }, 'Objet : ' + x.objet));
  carte.append(el('div', { class: 'relance__actions' },
    el('a', { class: 'bouton bouton-principal', href: x.lien, onclick: () => commencerRelance(x) }, 'Relancer'),
    el('button', { class: 'bouton bouton-secondaire', type: 'button', onclick: () => surCopier(x, carte) }, 'Copier le message')));
  return carte;
}

// Remplit la liste « À relancer ».
async function rafraichirListe() {
  const relances = await contactsARelancer();
  document.getElementById('liste-relancer').replaceChildren(...relances.map(elementRelance));
  document.getElementById('aucun-a-relancer').hidden = relances.length > 0;
}

// Pose la question « Relance envoyée ? » s'il y a une relance ouverte.
function poserQuestion() {
  const r = relanceEnCours();
  if (!r) return;
  document.getElementById('question-relance-texte').textContent = 'Relance ' + r.type + ' envoyée à ' + r.nom + ' ?';
  document.getElementById('question-relance').hidden = false;
}

// « Oui » : relance notée en local (« Envoyée le JJ/MM »), écrite dans le tableau par la file (tout de suite si connecté).
function surOui() {
  const r = relanceEnCours();
  oublierRelanceEnCours();
  if (!r) return;
  espace.noterRelance(r.id, r.type, 'Envoyée le ' + jourMois(new Date()))
    .then(() => {
      message('Relance notée');
      if (ecranAffiche() === 'relancer') rafraichirListe();
      if (jetonValide()) synchroniser();
    })
    .catch((e) => montrerErreur('Relance non notée : ' + e.message));
}

// À l'affichage : liste depuis la copie locale, synchronisation si possible, question en attente.
function afficherEcran() {
  rafraichirListe().catch((e) => montrerErreur('Relances : ' + e.message));
  if (jetonValide()) synchroniser();
  poserQuestion();
}

// Branche l'écran, la question au retour dans l'appli et le rafraîchissement après synchronisation.
export function initRelances() {
  enregistrerEcran('relancer', { afficher: afficherEcran });
  document.getElementById('relance-oui').addEventListener('click', surOui);
  document.getElementById('relance-plus-tard').addEventListener('click', oublierRelanceEnCours);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') poserQuestion(); });
  window.addEventListener('carnet:sync', (e) => { if (e.detail.fini && ecranAffiche() === 'relancer') rafraichirListe(); });
}
