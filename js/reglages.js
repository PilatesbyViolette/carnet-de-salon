// Écran Réglages (cahier des charges § 5.4) : valeurs écrites dans l'onglet Réglages du tableau et copiées en local.

import { afficher, enregistrerEcran, message, montrerErreur, pluriel } from './interface.js';
import * as base from './base.js';
import * as espace from './espace.js';
import { synchroniser } from './file.js';
import { jetonDansLeGeste, jetonValide, demanderJeton, deconnecter, compteConnu } from './connexion.js';
import { doitMontrerAide } from './aide.js';
import { descriptionActivation, roleEquipe } from './activation.js';
import { chargerContexteEquipe } from './equipe.js';
import { prenomDe, ROLE_RESPONSABLE, ROLE_COMMERCIAL } from './equipe-regles.js';

// Champ de l'écran -> clé de l'onglet Réglages.
const CHAMPS = {
  'reg-entreprise': 'Votre entreprise',
  'reg-salon': 'Nom du salon',
  'reg-nom': 'Votre nom',
  'reg-signature': 'Votre signature',
  'reg-delai2': 'Délai J+2',
  'reg-delai7': 'Délai J+7',
  'reg-objet2': 'Objet J+2',
  'reg-message2': 'Message J+2',
  'reg-objet7': 'Objet J+7',
  'reg-message7': 'Message J+7'
};

let premiereFois = false;
let confirmationDeconnexion = false;

// Ouvre les Réglages juste après la première connexion, avec une invitation à les compléter.
export function ouvrirReglagesPremiereFois() {
  premiereFois = true;
  afficher('reglages');
}

// Champs réglés pour toute l'équipe par le responsable : en lecture seule chez un commercial.
const CHAMPS_EQUIPE = ['reg-entreprise', 'reg-salon', 'reg-delai2', 'reg-delai7', 'reg-objet2', 'reg-message2', 'reg-objet7', 'reg-message7'];

// Adapte l'écran au mode : Solo (comme avant), responsable (prénom, « Mon équipe »), commercial (lecture seule).
async function adapterAuMode() {
  const ctx = await chargerContexteEquipe();
  const commercial = ctx.role === ROLE_COMMERCIAL;
  const responsable = ctx.role === ROLE_RESPONSABLE;
  document.getElementById('reg-nom-bloc').hidden = !responsable;
  document.getElementById('bouton-mon-equipe').hidden = !responsable;
  document.getElementById('reg-note-commercial').hidden = !commercial;
  CHAMPS_EQUIPE.forEach((id) => { document.getElementById(id).readOnly = commercial; });
  const prenom = document.getElementById('reg-prenom-equipe');
  prenom.hidden = !commercial;
  document.getElementById('reg-prenom-equipe-titre').hidden = !commercial;
  if (commercial) {
    prenom.textContent = prenomDe(ctx.membres, ctx.moi) || '(donné par le responsable)';
    document.getElementById('reg-signature').value = await base.lireReglage('_maSignature', '');
  }
}

// Remplit l'écran avec les valeurs locales.
async function remplir() {
  for (const [id, cle] of Object.entries(CHAMPS)) document.getElementById(id).value = await espace.reglage(cle);
  await adapterAuMode();
  document.getElementById('reg-compte').textContent = compteConnu() || 'non connecté';
  document.getElementById('reg-code').textContent = descriptionActivation();
  const lien = document.getElementById('reg-lien-tableau');
  const adresse = await espace.lienTableau();
  lien.hidden = !adresse;
  if (adresse) lien.href = adresse;
  document.getElementById('reg-bienvenue').hidden = !premiereFois;
  confirmationDeconnexion = false;
  document.getElementById('bouton-deconnexion').textContent = 'Se déconnecter';
}

// Lit les valeurs saisies ; nom du salon obligatoire au premier lancement ; délais en nombres de jours.
function lireValeurs() {
  const valeurs = {};
  for (const [id, cle] of Object.entries(CHAMPS)) valeurs[cle] = document.getElementById(id).value.trim();
  if (premiereFois && !valeurs['Nom du salon']) {
    document.getElementById('reg-salon').focus();
    throw new Error('Indiquez le nom du salon : il figure dans vos relances');
  }
  for (const cle of ['Délai J+2', 'Délai J+7']) {
    if (!/^\d{1,3}$/.test(valeurs[cle])) throw new Error('Le champ « ' + cle + ' » doit être un nombre de jours');
  }
  return valeurs;
}

// Enregistre : jeton dans le geste si besoin, écriture locale, envoi par la file.
function surEnregistrer(evenement) {
  evenement.preventDefault();
  // Commercial : seule sa signature est à lui, gardée sur son téléphone (les autres réglages sont ceux de l'équipe)
  if (roleEquipe() === ROLE_COMMERCIAL) {
    base.ecrireReglage('_maSignature', document.getElementById('reg-signature').value.trim())
      .then(() => { message('Signature enregistrée'); if (premiereFois) { premiereFois = false; afficher(doitMontrerAide() ? 'aide' : 'accueil'); } })
      .catch((e) => montrerErreur('Signature non enregistrée : ' + e.message));
    return;
  }
  let valeurs;
  try { valeurs = lireValeurs(); } catch (e) { montrerErreur(e.message); return; }
  const jeton = jetonDansLeGeste().catch((e) => montrerErreur(e.message));
  espace.enregistrerReglages(valeurs).then(() => {
    message('Réglages enregistrés');
    jeton.then(() => synchroniser());
    if (premiereFois) {
      premiereFois = false;
      afficher(doitMontrerAide() ? 'aide' : 'accueil');
    }
  }).catch((e) => montrerErreur('Réglages non enregistrés : ' + e.message));
}

// « Synchroniser maintenant » : nouveau jeton dans le geste si besoin, puis passage de la file.
function surSynchroniser() {
  const jeton = jetonValide() ? Promise.resolve() : demanderJeton(false);
  jeton.then(() => { message('Synchronisation lancée'); return synchroniser(); }).catch((e) => montrerErreur(e.message));
}

// Déconnexion : refusée s'il reste des contacts ou des relances à envoyer ; second tap pour confirmer ; vide le téléphone.
async function surDeconnexion() {
  const enAttente = (await base.tousLesContacts()).filter((c) => c.statut && c.etat !== 'ecrit').length;
  if (enAttente) {
    montrerErreur(pluriel(enAttente, 'contact') + ' pas encore envoyé(s) vers votre Drive : synchronisez avant de vous déconnecter.');
    return;
  }
  const relances = await espace.relancesEnAttente();
  if (relances) {
    montrerErreur(pluriel(relances, 'relance') + ' notée(s) pas encore écrite(s) dans votre tableau : synchronisez avant de vous déconnecter.');
    return;
  }
  const bouton = document.getElementById('bouton-deconnexion');
  if (!confirmationDeconnexion) {
    confirmationDeconnexion = true;
    bouton.textContent = 'Toucher encore pour confirmer';
    return;
  }
  deconnecter();
  await base.viderBase();
  espace.oublierEspace();
  afficher('connexion');
  message('Déconnecté. Vos contacts restent dans votre Drive.');
}

// Branche l'écran.
export function initReglages() {
  enregistrerEcran('reglages', { afficher: remplir, quitter: () => { premiereFois = false; } });
  document.getElementById('formulaire-reglages').addEventListener('submit', surEnregistrer);
  document.getElementById('bouton-synchroniser').addEventListener('click', surSynchroniser);
  document.getElementById('bouton-aide').addEventListener('click', () => afficher('aide'));
  document.getElementById('bouton-deconnexion').addEventListener('click', surDeconnexion);
}
