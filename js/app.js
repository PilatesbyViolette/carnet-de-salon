// Démarrage de l'appli : activation, invitation d'équipe, écrans, connexion, file d'attente, service worker et bandeaux.

import { afficher, enregistrerEcran, montrerErreur, fermerErreur, message } from './interface.js';
import * as base from './base.js';
import * as drive from './drive.js';
import * as espace from './espace.js';
import { synchroniser, demarrerFile, MESSAGE_ATTENTE } from './file.js';
import { demanderJeton, compteConnu, jetonActuel } from './connexion.js';
import { initAccueil } from './accueil.js';
import { initNouveau } from './nouveau.js';
import { initVerifier } from './verifier.js';
import { initReglages, ouvrirReglagesPremiereFois } from './reglages.js';
import { initAide, doitMontrerAide } from './aide.js';
import { initRelances } from './relances.js';
import { initContacts } from './contacts.js';
import { initActivation, chargerActivation, estActive, essaiTermine, roleEquipe, quitterEquipe } from './activation.js';
import { initEquipe, chargerContexteEquipe } from './equipe.js';
import { initRejoindre, capterInvitation } from './rejoindre.js';
import { ROLE_COMMERCIAL, ErreurEquipe } from './equipe-regles.js';
import { ENV } from './environnement.js';
import { ecrireLocal } from './stockage.js';
import { initSignal, viderFileSignaux } from './signal.js';

// Version de l'appli (même valeur que VERSION dans sw.js) : jointe au signal d'essai vers Optimisons.ai.
const VERSION = 'carnet-2026-11-09-equipe-prod-5';
// Signal discret de lancement d'essai (et d'achat) vers Optimisons.ai : aucune donnée de contact, voir js/signal.js.
const URL_SIGNAL = 'https://script.google.com/macros/s/AKfycbzYCsnnfv4-2oSdcbYWMOg9ViQdqqcsCPfobHy5126llYFKqAQfpM0VfT50bFllXt_M/exec';

// Lien d'achat Stripe Solo, sans code promo prérempli : le client saisit lui-même son code sur la page Stripe.
const LIEN_ACHAT = 'https://buy.stripe.com/28E5kCdjp5bC87f20Oc3m00';
// Lien d'achat Stripe Équipe, sans code promo prérempli.
const LIEN_ACHAT_EQUIPE = 'https://buy.stripe.com/8x24gydjp6fGbjr48Wc3m01';

// Met les liens d'achat sur tous les liens « Acheter » (Solo et Équipe).
function brancherLiensAchat() {
  document.querySelectorAll('[data-lien-achat]').forEach((a) => { a.href = LIEN_ACHAT; });
  document.querySelectorAll('[data-lien-achat-equipe]').forEach((a) => { a.href = LIEN_ACHAT_EQUIPE; });
}

// Écran à ouvrir une fois l'appli activée : connexion Google, essai terminé ou accueil.
function ouvrirApresActivation() {
  if (!compteConnu()) { afficher('connexion'); return; }
  afficher(essaiTermine() ? 'essai' : 'accueil');
  synchroniser();
}

// Écran à ouvrir au démarrage ou après « Plus tard » sur l'écran Rejoindre.
function ouvrirEcranHabituel() {
  if (!estActive()) { afficher('activation'); return; }
  ouvrirApresActivation();
}

// Bouton « Se connecter avec Google » : la fenêtre Google s'ouvre dans le geste.
function surConnexion() {
  demanderJeton(true).then(apresConnexion).catch((e) => montrerErreur(e.message));
}

// Après la première connexion : compte, tableau et dossier retrouvés ou créés, réglages, essai, aide à l'installation.
async function apresConnexion() {
  const etat = document.getElementById('connexion-etat');
  etat.hidden = false;
  try {
    ecrireLocal('compte', await drive.lireEmailCompte());
    await espace.preparerEspace();
    await espace.rafraichirDepuisTableau(); // « Essai commencé le » du tableau fait foi (essai déjà consommé ?)
    await chargerActivation(); // recopie aussi le code et l'essai dans les Réglages (vidés à la déconnexion)
    await chargerContexteEquipe();
    if (essaiTermine()) afficher('essai');
    // Premier lancement : nom du salon encore vide (un commercial reçoit les réglages de son responsable)
    else if (roleEquipe() !== ROLE_COMMERCIAL && !(await espace.reglage('Nom du salon'))) ouvrirReglagesPremiereFois();
    else afficher(doitMontrerAide() ? 'aide' : 'accueil');
    synchroniser();
  } catch (e) {
    if (e instanceof ErreurEquipe) retirerDeLEquipe(e.message);
    else montrerErreur('Préparation de votre espace impossible : ' + e.message);
  } finally {
    etat.hidden = true;
  }
}

// Commercial retiré de l'équipe (ou carnet d'équipe disparu) : retour à l'écran d'activation (essai ou code).
async function retirerDeLEquipe(motif) {
  if (roleEquipe() !== ROLE_COMMERCIAL) return;
  await quitterEquipe();
  await espace.oublierEquipeSurTelephone();
  await chargerContexteEquipe();
  afficher('activation');
  montrerErreur(motif + ' Vous pouvez commencer votre propre essai ou saisir un code.');
}

// Captures interrompues (appli fermée pendant une saisie) : gardées avec le statut « À vérifier » si une photo existe.
async function reprendreCapturesInterrompues() {
  for (const c of await base.tousLesContacts()) {
    if (c.statut) continue;
    if (c.photo || c.photoId) await base.majContact(c.id, (x) => { x.statut = base.A_VERIFIER; });
    else await base.supprimerContact(c.id);
  }
}

// Service worker : installation hors ligne et bandeau « Nouvelle version disponible » (pas dans la version de test).
function enregistrerServiceWorker() {
  if (!ENV.serviceWorker || !('serviceWorker' in navigator)) return;
  const avaitUnControleur = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('/sw.js').then((inscription) => {
    document.addEventListener('visibilitychange', () => { if (!document.hidden) inscription.update().catch(() => {}); });
  }).catch(() => { /* sans service worker, l'appli marche en ligne */ });
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (avaitUnControleur) document.getElementById('bandeau-maj').hidden = false;
  });
}

// Branche les bandeaux, les erreurs non prévues et les messages de la file.
function brancherBandeaux() {
  document.getElementById('bandeau-test').hidden = !ENV.test;
  document.body.classList.toggle('version-test', ENV.test);
  document.getElementById('bandeau-erreur').addEventListener('click', fermerErreur);
  document.getElementById('bandeau-maj').addEventListener('click', () => location.reload());
  window.addEventListener('error', (e) => montrerErreur('Erreur : ' + e.message));
  window.addEventListener('unhandledrejection', (e) => montrerErreur('Erreur : ' + ((e.reason && e.reason.message) || e.reason)));
  window.addEventListener('carnet:sync', (e) => {
    if (e.detail.retrait) retirerDeLEquipe(e.detail.retrait).catch((err) => montrerErreur('Équipe : ' + err.message));
    else if (e.detail.erreur) montrerErreur('Envoi vers Google : ' + e.detail.erreur);
    else if (e.detail.attente) message(MESSAGE_ATTENTE); // 5xx persistant : message bref, sans alarme
    else if (e.detail.fini) viderFileSignaux(); // signal d'essai/achat en attente : part dès qu'un jeton est valable
  });
}

// Point d'entrée.
async function demarrer() {
  brancherBandeaux();
  enregistrerServiceWorker();
  enregistrerEcran('connexion', {});
  brancherLiensAchat();
  initSignal({ url: URL_SIGNAL, email: compteConnu, jeton: jetonActuel, reglage: espace.reglage, version: VERSION, envoyer: (adresse, options) => fetch(adresse, options) });
  initActivation(() => chargerContexteEquipe().then(ouvrirApresActivation)); // essai → Équipe : rôle responsable sans réinstaller
  initRelances();
  initAccueil();
  initContacts();
  initNouveau();
  initVerifier();
  initReglages();
  initEquipe();
  initRejoindre(ouvrirEcranHabituel);
  initAide();
  document.getElementById('bouton-connexion').addEventListener('click', surConnexion);
  document.querySelectorAll('[data-retour]').forEach((b) => b.addEventListener('click', () => afficher('accueil')));
  const invitation = capterInvitation();
  await reprendreCapturesInterrompues();
  await chargerActivation();
  await chargerContexteEquipe();
  demarrerFile();
  viderFileSignaux(); // essai déjà en cours ou achat en attente : envoi silencieux à l'ouverture
  if (invitation) { afficher('rejoindre'); return; }
  ouvrirEcranHabituel();
}

demarrer().catch((e) => montrerErreur('Démarrage : ' + e.message));
