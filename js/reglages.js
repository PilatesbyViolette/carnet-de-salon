// Écran Réglages (cahier des charges § 5.4) : valeurs écrites dans l'onglet Réglages du tableau et copiées en local.

import { afficher, enregistrerEcran, message, montrerErreur, pluriel } from './interface.js';
import * as base from './base.js';
import * as espace from './espace.js';
import { synchroniser } from './file.js';
import { jetonDansLeGeste, jetonValide, demanderJeton, deconnecter, compteConnu } from './connexion.js';
import { doitMontrerAide } from './aide.js';
import { descriptionActivation, roleEquipe, activer, messageCodeActive } from './activation.js';
import { chargerContexteEquipe } from './equipe.js';
import { prenomDe, peutSaisirAutreCode, ROLE_RESPONSABLE, ROLE_COMMERCIAL } from './equipe-regles.js';

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

// Partie de l'écran qui dépend de l'activation : mode (prénom, « Mon équipe »), description du code, « Saisir un autre code ».
async function rafraichirActivation() {
  await adapterAuMode();
  document.getElementById('reg-code').textContent = descriptionActivation();
  document.getElementById('reg-autre-code').hidden = !peutSaisirAutreCode(roleEquipe());
}

// « Saisir un autre code » replié : bouton seul, champ vide, pas d'erreur.
function replierAutreCode() {
  document.getElementById('bouton-autre-code').hidden = false;
  document.getElementById('formulaire-autre-code').hidden = true;
  document.getElementById('champ-autre-code').value = '';
  document.getElementById('autre-code-erreur').hidden = true;
}

// « Activer ce code » : essai → Solo ou Équipe, Solo → Équipe, sans vider le téléphone ni changer de tableau.
// Jeton demandé dans le geste, puis synchronisation (mode Équipe préparé dans le tableau, code recopié dans Réglages).
function surAutreCode(evenement) {
  evenement.preventDefault();
  const erreur = document.getElementById('autre-code-erreur');
  const bouton = document.getElementById('bouton-activer-autre-code');
  erreur.hidden = true;
  bouton.disabled = true;
  const jeton = jetonDansLeGeste().catch(() => {});
  activer(document.getElementById('champ-autre-code').value)
    .then(async () => {
      await rafraichirActivation();
      replierAutreCode();
      message(messageCodeActive());
      jeton.then(() => synchroniser());
    })
    .catch(async (e) => {
      await rafraichirActivation().catch(() => {});
      erreur.textContent = e.message;
      erreur.hidden = false;
    })
    .finally(() => { bouton.disabled = false; });
}

// Remplit l'écran avec les valeurs locales.
async function remplir() {
  for (const [id, cle] of Object.entries(CHAMPS)) document.getElementById(id).value = await espace.reglage(cle);
  await rafraichirActivation();
  replierAutreCode();
  document.getElementById('reg-compte').textContent = compteConnu() || 'non connecté';
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

// Libellé et état du bouton « Synchroniser maintenant » (le retour se lit dans le bouton, sans bulle de message).
const LIBELLE_SYNCHRO = 'Synchroniser maintenant';
const DUREE_SYNCHRONISE_MS = 2500;
let toucherSynchro = 0; // dernier toucher : un ancien minuteur ne remet pas le libellé pendant un nouveau passage
function etatBoutonSynchro(texte, occupe) {
  const bouton = document.getElementById('bouton-synchroniser');
  bouton.textContent = texte;
  bouton.disabled = occupe;
}

// Lance un passage de la file et attend son issue (fini, erreur, hors connexion, reconnexion, attente du serveur).
function synchroniserEtAttendre() {
  return new Promise((ok) => {
    const fin = (e) => {
      if (e.detail.enCours) return;
      window.removeEventListener('carnet:sync', fin);
      clearTimeout(securite);
      ok(e.detail);
    };
    const securite = setTimeout(() => { window.removeEventListener('carnet:sync', fin); ok({}); }, 120000);
    window.addEventListener('carnet:sync', fin);
    synchroniser();
  });
}

// « Synchroniser maintenant » : nouveau jeton dans le geste si besoin, « Synchronisation… » pendant le passage,
// puis « Synchronisé » quelques secondes. Les erreurs passent par le bandeau habituel (montrerErreur).
function surSynchroniser() {
  const numero = ++toucherSynchro;
  if (!compteConnu()) { montrerErreur('Connectez-vous à Google pour synchroniser.'); return; }
  const jeton = jetonValide() ? Promise.resolve() : demanderJeton(false);
  etatBoutonSynchro('Synchronisation…', true);
  jeton.then(synchroniserEtAttendre).then((issue) => {
    if (numero !== toucherSynchro) return;
    // Erreur Google, retrait de l'équipe, attente du serveur : déjà annoncés par js/app.js
    if (issue.horsLigne) montrerErreur('Hors connexion : vos contacts restent sur le téléphone. Synchronisez une fois le réseau revenu.');
    else if (issue.reconnexion) montrerErreur('Reconnexion à Google nécessaire : touchez à nouveau « ' + LIBELLE_SYNCHRO + ' ».');
    if (!issue.fini) { etatBoutonSynchro(LIBELLE_SYNCHRO, false); return; }
    etatBoutonSynchro('Synchronisé', false);
    setTimeout(() => { if (numero === toucherSynchro) etatBoutonSynchro(LIBELLE_SYNCHRO, false); }, DUREE_SYNCHRONISE_MS);
  }).catch((e) => {
    if (numero === toucherSynchro) etatBoutonSynchro(LIBELLE_SYNCHRO, false);
    montrerErreur(e.message);
  });
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
  document.getElementById('bouton-autre-code').addEventListener('click', () => {
    document.getElementById('bouton-autre-code').hidden = true;
    document.getElementById('formulaire-autre-code').hidden = false;
    document.getElementById('champ-autre-code').focus();
  });
  document.getElementById('formulaire-autre-code').addEventListener('submit', surAutreCode);
}
