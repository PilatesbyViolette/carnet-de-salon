// File d'attente de synchronisation : envoie vers le Drive tout contact local pas encore écrit.
// Pour chaque contact, dans l'ordre : envoi de la photo, lecture OCR + tri, écriture de la ligne (sans doublon).
// Un seul passage à la fois. Trois échecs consécutifs : état « erreur », visible sur l'accueil avec « Réessayer ».

import * as base from './base.js';
import * as drive from './drive.js';
import * as espace from './espace.js';
import { jetonValide, compteConnu } from './connexion.js';
import { extraireChamps } from './tri.js';

const ESSAIS_MAX = 3;
const CHAMPS_LUS = ['nom', 'entreprise', 'email', 'tel', 'site'];

let enCours = false;
let relancer = false;
export let dernierEtat = {};

// Annonce l'état de la synchronisation à l'interface (hors ligne, reconnexion, erreur générale).
function annoncer(etat) {
  dernierEtat = etat;
  window.dispatchEvent(new CustomEvent('carnet:sync', { detail: etat }));
}

// Annonce la mise à jour d'un contact (l'écran Nouveau contact pré-remplit ses champs vides).
function annoncerContact(contact) {
  if (contact) window.dispatchEvent(new CustomEvent('carnet:contact', { detail: contact }));
}

// Contacts qui attendent encore un envoi (hors erreurs), du plus ancien au plus récent.
async function contactsATraiter() {
  const tous = await base.tousLesContacts();
  return tous.filter((c) => c.etat !== 'ecrit' && c.etat !== 'erreur')
    .sort((a, b) => String(a.creeLe).localeCompare(String(b.creeLe)));
}

// Vrai s'il reste au moins un contact à traiter.
export async function resteDuTravail() {
  return (await contactsATraiter()).length > 0;
}

// Un passage complet de la file ; si un passage tourne déjà, un nouveau est lancé juste après.
export async function synchroniser() {
  if (enCours) { relancer = true; return; }
  if (!compteConnu()) return;
  enCours = true;
  annoncer({ enCours: true });
  try {
    if (!navigator.onLine) { annoncer({ horsLigne: true }); return; }
    if (!jetonValide()) { annoncer({ reconnexion: true }); return; }
    await espace.preparerEspace();
    await espace.envoyerReglagesSiBesoin();
    for (const contact of await contactsATraiter()) await traiterContact(contact.id);
    await espace.rafraichirDepuisTableau();
    annoncer({ fini: true });
  } catch (e) {
    if (e instanceof drive.ErreurJeton) annoncer({ reconnexion: true });
    else if (e instanceof drive.ErreurReseau) annoncer({ horsLigne: true });
    else annoncer({ erreur: e.message });
  } finally {
    enCours = false;
    if (relancer) { relancer = false; synchroniser(); }
  }
}

// Fait avancer un contact ; une erreur Google compte un essai, une erreur de jeton ou de réseau arrête le passage.
async function traiterContact(id) {
  try {
    await etapePhoto(id);
    await etapeLecture(id);
    await etapeEcriture(id);
  } catch (e) {
    if (e instanceof drive.ErreurJeton || e instanceof drive.ErreurReseau) throw e;
    annoncerContact(await base.majContact(id, (c) => {
      c.essais = (c.essais || 0) + 1;
      c.derniereErreur = e.message;
      if (c.essais >= ESSAIS_MAX) c.etat = 'erreur';
    }));
  }
}

// Étape 1 : envoi de la photo dans le dossier Drive (si photo locale et pas encore envoyée).
async function etapePhoto(id) {
  const c = await base.lireContact(id);
  if (!c || !c.photo || c.photoId) return;
  const nom = 'carte-' + String(c.creeLe).slice(0, 10) + '-' + id.slice(0, 8) + '.jpg';
  const fichier = await drive.envoyerPhoto(c.photo, espace.idDossier(), nom);
  annoncerContact(await base.majContact(id, (x) => {
    x.photoId = fichier.id;
    x.photoLien = fichier.webViewLink || '';
    x.etat = 'photo_envoyee';
    x.essais = 0;
  }));
}

// Étape 2 : lecture OCR et tri ; remplit seulement les champs restés vides (jamais ce que l'exposant a tapé).
async function etapeLecture(id) {
  const c = await base.lireContact(id);
  if (!c || !c.photo || c.texte != null) return;
  const texte = await drive.lireTexteCarte(c.photo, espace.idDossier());
  const champs = extraireChamps(texte, '');
  annoncerContact(await base.majContact(id, (x) => {
    x.texte = texte;
    CHAMPS_LUS.forEach((k) => { if (!x[k] && champs[k]) x[k] = champs[k]; });
    x.etat = 'lu';
    x.essais = 0;
  }));
}

// Étape 3 : écriture de la ligne une fois le contact enregistré ; vérifie l'absence de l'id avant, relit après.
async function etapeEcriture(id) {
  const c = await base.lireContact(id);
  if (!c || !c.statut) return;
  if (c.photo && c.texte == null) return;
  const tableau = espace.idTableau();
  let ids = await drive.lireIds(tableau);
  if (!ids.includes(id)) {
    await drive.ajouterLigne(tableau, espace.contactVersLigne(c, await espace.prisPar()));
    ids = await drive.lireIds(tableau);
    if (!ids.includes(id)) throw new Error('Ligne non retrouvée dans le tableau après écriture');
  }
  annoncerContact(await base.majContact(id, (x) => {
    delete x.photo; // la photo locale n'est effacée qu'après relecture de la ligne écrite
    x.etat = 'ecrit';
    x.essais = 0;
    x.derniereErreur = '';
  }));
}

// Remet un contact en erreur dans la file (bouton « Réessayer »).
export async function reessayer(id) {
  await base.majContact(id, (c) => { c.etat = 'local'; c.essais = 0; c.derniereErreur = ''; });
}

// Branche les déclencheurs : retour du réseau, puis toutes les 60 s tant qu'il reste du travail.
export function demarrerFile() {
  window.addEventListener('online', () => synchroniser());
  window.addEventListener('offline', () => annoncer({ horsLigne: true }));
  setInterval(async () => { if (await resteDuTravail()) synchroniser(); }, 60 * 1000);
}
