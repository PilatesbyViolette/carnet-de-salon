// Écran « À relancer » : contacts du tableau (copie locale relue à chaque synchronisation) à relancer à J+2, puis à J+7.
// « Relancer » ouvre la messagerie (mailto: avec objet et corps remplis), « Copier le message » le copie.
// Au retour dans l'appli : « Relance envoyée ? Oui / Plus tard » ; Oui écrit « Envoyée le JJ/MM » dans la colonne de relance.
// Mode Équipe : chacun ne voit que ses propres contacts (relances parties de sa propre messagerie) ; le responsable
// peut afficher « Toute l'équipe ».

import { enregistrerEcran, ecranAffiche, el, message, montrerErreur, copierTexte, lienMailto } from './interface.js';
import * as base from './base.js';
import * as espace from './espace.js';
import { synchroniser } from './file.js';
import { jetonValide } from './connexion.js';
import { dateCourte, jourMois } from './dates.js';
import { civiliteEtNom } from './prenoms.js';
import { contexteEquipe } from './equipe.js';
import { estAMoi, prisParAffiche, ROLE_COMMERCIAL, ROLE_RESPONSABLE } from './equipe-regles.js';
import { lireLocal, ecrireLocal, retirerLocal } from './stockage.js';

export { lienMailto } from './interface.js';

const JOUR_MS = 24 * 60 * 60 * 1000;
const EN_COURS = 'relanceEnCours'; // relance ouverte, en attente de la réponse « Relance envoyée ? »
let toutesLEquipe = false; // filtre « Toute l'équipe » du responsable

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

// Valeurs des variables des modèles pour un contact.
// {prenom} : « M. Durand » ou « Mme Durand » (civilité d'après le prénom, puis nom de famille) ;
// vide si le prénom est inconnu ou mixte, et « Bonjour {prenom}, » devient alors « Bonjour, ».
export function valeursModele(c, r) {
  return {
    prenom: civiliteEtNom(c.nom), entreprise: c.entreprise || '', note: c.note || '',
    salon: r.salon || '', exposant: r.exposant || '', signature: r.signature || ''
  };
}

// Remplit un modèle des Réglages ; sans prénom, « Bonjour {prenom}, » devient « Bonjour, ».
// Sans salon, « échange au {salon} » devient « échange » ; sans entreprise, « le stand {exposant} » devient « notre stand ».
// Sans signature, le message se termine par « Bien cordialement, ».
// Variable inconnue gardée.
export function remplirModele(modele, valeurs) {
  let texte = String(modele || '');
  if (!valeurs.prenom) texte = texte.replace(/[ \t]*\{prenom\}/g, '');
  if (!valeurs.salon) {
    texte = texte.replace(/[ \t]+(?:au|du|à|sur le|lors du|pendant le|après le)[ \t]+\{salon\}/gi, '')
      .replace(/[ \t]*\{salon\}/g, '');
  }
  if (!valeurs.exposant) texte = texte.replace(/\ble stand[ \t]+\{exposant\}/g, 'notre stand');
  // Sans signature, la ligne {signature} disparaît : le message finit par « Bien cordialement, »
  if (!valeurs.signature) texte = texte.replace(/(?:\r?\n)?[ \t]*\{signature\}[ \t]*/g, '').replace(/\s+$/, '');
  return texte.replace(/\{(\w+)\}/g, (tout, nom) => (Object.prototype.hasOwnProperty.call(valeurs, nom) ? valeurs[nom] : tout));
}

// Nombre de jours lu dans les Réglages (valeur par défaut si illisible).
function entier(texte, defaut) {
  const n = parseInt(texte, 10);
  return isNaN(n) ? defaut : n;
}

// Réglages utiles aux relances : délais, modèles, salon, exposant, signature.
// Commercial : sa signature personnelle (gardée sur son téléphone), jamais celle du responsable.
async function reglagesRelance() {
  const r = (cle) => espace.reglage(cle);
  const signature = contexteEquipe().role === ROLE_COMMERCIAL ? await base.lireReglage('_maSignature', '') : await r('Votre signature');
  return {
    delai2: entier(await r('Délai J+2'), 2), delai7: entier(await r('Délai J+7'), 7),
    'J+2': { objet: await r('Objet J+2'), message: await r('Message J+2') },
    'J+7': { objet: await r('Objet J+7'), message: await r('Message J+7') },
    salon: await r('Nom du salon'), exposant: await r('Votre entreprise'),
    // Signature saisie dans les Réglages, sinon rien (jamais l'e-mail du compte ni « Votre nom »)
    signature
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
// Mode Équipe : seulement ceux que j'ai pris, sauf equipeEntiere (filtre « Toute l'équipe » du responsable).
export async function contactsARelancer(maintenant = new Date(), equipeEntiere = false) {
  const r = await reglagesRelance();
  const ctx = contexteEquipe();
  const miens = (c) => !ctx.role || (equipeEntiere && ctx.role === ROLE_RESPONSABLE) || estAMoi(c, ctx);
  return (await espace.lignesAvecRelances())
    .filter(miens)
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
  ecrireLocal(EN_COURS, JSON.stringify({ id: x.contact.id, type: x.type, nom: nomAffiche(x.contact) }));
}

// Relance ouverte en attente de réponse, ou null.
function relanceEnCours() {
  try { return JSON.parse(lireLocal(EN_COURS)); } catch (e) { return null; }
}

// Oublie la relance ouverte et ferme la question.
function oublierRelanceEnCours() {
  retirerLocal(EN_COURS);
  document.getElementById('question-relance').hidden = true;
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
  const ctx = contexteEquipe();
  const pris = ctx.role && toutesLEquipe ? prisParAffiche(c, ctx) : '';
  const carte = el('li', { class: 'relance' },
    el('div', { class: 'relance__tete' },
      el('div', { class: 'contact__texte' },
        el('div', { class: 'contact__nom' }, nomAffiche(c)),
        el('div', { class: 'contact__info' }, [c.nom ? c.entreprise : '', dateCourte(c.creeLe), pris ? 'pris par ' + pris : ''].filter(Boolean).join(' · ')),
        el('div', { class: 'contact__info' }, c.nom || c.entreprise ? c.email : '')),
      el('span', { class: 'badge badge-relance' }, x.type)),
    el('p', { class: 'relance__objet' }, 'Objet : ' + x.objet));
  carte.append(el('div', { class: 'relance__actions' },
    el('a', { class: 'bouton bouton-principal', href: x.lien, onclick: () => commencerRelance(x) }, 'Relancer'),
    el('button', { class: 'bouton bouton-secondaire', type: 'button', onclick: () => surCopier(x, carte) }, 'Copier le message')));
  return carte;
}

// Remplit la liste « À relancer » (filtre « Mes contacts / Toute l'équipe » visible pour le responsable).
async function rafraichirListe() {
  const responsable = contexteEquipe().role === ROLE_RESPONSABLE;
  document.getElementById('filtre-relances').hidden = !responsable;
  if (!responsable) toutesLEquipe = false;
  document.querySelectorAll('#filtre-relances button').forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.portee === 'equipe') === toutesLEquipe)));
  const relances = await contactsARelancer(new Date(), toutesLEquipe);
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
  document.querySelectorAll('#filtre-relances button').forEach((b) => b.addEventListener('click', () => {
    toutesLEquipe = b.dataset.portee === 'equipe';
    rafraichirListe().catch((e) => montrerErreur('Relances : ' + e.message));
  }));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') poserQuestion(); });
  window.addEventListener('carnet:sync', (e) => { if (e.detail.fini && ecranAffiche() === 'relancer') rafraichirListe(); });
}
