// Écran Nouveau contact : photo réduite affichée tout de suite, contact créé en local avant même la lecture,
// Note en premier, champs vides pré-remplis par la lecture sans écraser ce que l'exposant a tapé.

import { afficher, enregistrerEcran, message, montrerErreur } from './interface.js';
import * as base from './base.js';
import * as drive from './drive.js';
import { preparerPhoto } from './image.js';
import { synchroniser } from './file.js';
import { jetonDansLeGeste, jetonValide } from './connexion.js';
import { extraireChamps } from './tri.js';
import { dateIso } from './dates.js';
import { captureAutorisee } from './activation.js';

const CHAMPS = ['note', 'nom', 'entreprise', 'email', 'tel', 'site'];
const CHAMPS_LUS = ['nom', 'entreprise', 'email', 'tel', 'site'];

let capture = null; // { id, avecPhoto, pret (promesse), adresseApercu }

// Champ de saisie d'après son nom.
function champ(nom) {
  return document.getElementById('champ-' + nom);
}

// Colore en corail les champs encore vides.
function colorerVides() {
  CHAMPS.forEach((n) => champ(n).classList.toggle('vide', !champ(n).value.trim()));
}

// Texte de l'indicateur de lecture.
function indiquer(texte) {
  const zone = document.getElementById('indicateur-lecture');
  zone.textContent = texte;
  zone.hidden = !texte;
}

// Bandeau hors connexion de l'écran.
function majBandeauHorsLigne() {
  document.getElementById('bandeau-horsligne-nouveau').hidden = navigator.onLine;
}

// Remet l'écran à zéro pour une nouvelle saisie.
function preparerEcran(avecPhoto) {
  CHAMPS.forEach((n) => { champ(n).value = ''; });
  document.getElementById('apercu').hidden = !avecPhoto;
  document.getElementById('apercu-image').removeAttribute('src');
  indiquer(avecPhoto ? 'Préparation de la photo' : '');
  majBandeauHorsLigne();
  colorerVides();
}

// Contact vierge tel que stocké dans la base locale.
function contactVierge(id, avecPhoto) {
  return {
    id, creeLe: dateIso(new Date()), note: '', nom: '', entreprise: '', email: '', tel: '', site: '',
    photo: null, photoId: '', photoLien: '', texte: avecPhoto ? null : '', statut: '', etat: 'local',
    essais: 0, derniereErreur: '', relanceJ2: '', relanceJ7: ''
  };
}

// Ouvre l'écran après une photo : la Note prend le focus, la photo est traitée et la lecture lancée.
function nouveauAvecPhoto(fichier) {
  const id = crypto.randomUUID();
  capture = { id, avecPhoto: true };
  preparerEcran(true);
  afficher('nouveau');
  champ('note').focus();
  capture.pret = traiterPhoto(fichier, id);
}

// Réduit la photo, l'affiche, crée le contact local puis lance la file (envoi et lecture pendant la dictée).
async function traiterPhoto(fichier, id) {
  try {
    const photo = await preparerPhoto(fichier);
    if (!capture || capture.id !== id) return;
    capture.adresseApercu = URL.createObjectURL(photo);
    document.getElementById('apercu-image').src = capture.adresseApercu;
    const contact = contactVierge(id, true);
    contact.photo = photo;
    await base.ajouterContact(contact);
    if (!navigator.onLine) indiquer('Carte gardée sur le téléphone');
    else if (!jetonValide()) indiquer('Carte gardée : elle sera lue après la reconnexion Google');
    else indiquer('Lecture de la carte');
    synchroniser();
  } catch (e) {
    capture.avecPhoto = false;
    indiquer('Photo non traitée, complétez à la main');
    montrerErreur('Photo illisible : ' + e.message);
  }
}

// Ouvre l'écran sans photo (« Saisir sans carte ») ; le focus dans le geste ouvre le clavier.
function nouveauSansPhoto() {
  capture = { id: crypto.randomUUID(), avecPhoto: false, pret: Promise.resolve() };
  preparerEcran(false);
  afficher('nouveau');
  champ('note').focus();
}

// Reçoit les mises à jour de la file : remplit les champs encore vides et met à jour l'indicateur.
function surContactMisAJour(evenement) {
  const c = evenement.detail;
  if (!capture || c.id !== capture.id) return;
  CHAMPS_LUS.forEach((k) => { if (!champ(k).value.trim() && c[k]) champ(k).value = c[k]; });
  colorerVides();
  if (c.texte != null) indiquer(c.nom || c.email || c.tel ? 'Carte lue' : 'Carte peu lisible, complétez à la main');
  else if (c.derniereErreur) indiquer('Lecture en attente : ' + c.derniereErreur);
}

// Enregistre : jeton redemandé dans le geste si besoin, contact mis à jour en local, retour à l'accueil, file relancée.
function surEnregistrer(evenement) {
  evenement.preventDefault();
  if (!capture) return;
  const jeton = jetonDansLeGeste().catch((e) => montrerErreur(e.message)); // avant tout await (iOS)
  enregistrer()
    .then((ok) => { if (ok) jeton.then(() => synchroniser()); })
    .catch((e) => montrerErreur('Enregistrement impossible : ' + e.message));
}

// Écrit le contact dans la base locale avec son statut.
async function enregistrer() {
  const valeurs = {};
  CHAMPS.forEach((n) => { valeurs[n] = champ(n).value.trim(); });
  if (!capture.avecPhoto && !Object.values(valeurs).some(Boolean)) { message('Rien à enregistrer'); return false; }
  const complement = extraireChamps('', valeurs.note);
  if (!valeurs.email) valeurs.email = complement.email;
  if (!valeurs.tel) valeurs.tel = complement.tel;
  const { id } = capture;
  await capture.pret;
  const maj = await base.majContact(id, (c) => {
    Object.assign(c, valeurs);
    c.statut = c.texte != null ? base.VERIFIE : base.A_VERIFIER;
  });
  if (!maj) await base.ajouterContact(Object.assign(contactVierge(id, false), valeurs, { statut: base.VERIFIE }));
  terminer();
  afficher('accueil');
  message('Contact enregistré');
  return true;
}

// Libère la capture en cours.
function terminer() {
  if (capture && capture.adresseApercu) URL.revokeObjectURL(capture.adresseApercu);
  capture = null;
}

// Abandon (Annuler ou bouton retour) : supprime la capture non enregistrée, et sa photo déjà envoyée.
async function abandonner() {
  const c = capture;
  terminer();
  if (!c || !c.avecPhoto) return;
  await c.pret;
  const contact = await base.lireContact(c.id);
  if (!contact || contact.statut) return;
  await base.supprimerContact(c.id);
  if (contact.photoId && jetonValide()) drive.supprimerFichier(contact.photoId).catch(() => {});
}

// Capture refusée si l'essai est terminé : ouvre l'écran « Votre essai est terminé » ; vrai si refusée.
function captureRefusee(evenement) {
  if (captureAutorisee()) return false;
  if (evenement) evenement.preventDefault();
  afficher('essai');
  return true;
}

// Branche l'appareil photo, les boutons et les champs.
export function initNouveau() {
  enregistrerEcran('nouveau', { quitter: () => { if (capture) abandonner(); } });
  const entree = document.getElementById('entree-photo');
  document.querySelector('label[for="entree-photo"]').addEventListener('click', captureRefusee);
  entree.addEventListener('change', () => {
    if (entree.files[0] && !captureRefusee()) nouveauAvecPhoto(entree.files[0]);
    entree.value = '';
  });
  document.getElementById('bouton-sans-carte').addEventListener('click', () => { if (!captureRefusee()) nouveauSansPhoto(); });
  document.getElementById('formulaire-contact').addEventListener('submit', surEnregistrer);
  document.getElementById('bouton-annuler').addEventListener('click', () => afficher('accueil'));
  CHAMPS.forEach((n) => champ(n).addEventListener('input', colorerVides));
  window.addEventListener('carnet:contact', surContactMisAJour);
  window.addEventListener('online', majBandeauHorsLigne);
  window.addEventListener('offline', majBandeauHorsLigne);
}
