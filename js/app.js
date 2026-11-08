// Démarrage de l'appli : activation, écrans, connexion, file d'attente, service worker et bandeaux.

import { afficher, enregistrerEcran, montrerErreur, fermerErreur, message } from './interface.js';
import * as base from './base.js';
import * as drive from './drive.js';
import * as espace from './espace.js';
import { synchroniser, demarrerFile, MESSAGE_ATTENTE } from './file.js';
import { demanderJeton, compteConnu } from './connexion.js';
import { initAccueil } from './accueil.js';
import { initNouveau } from './nouveau.js';
import { initVerifier } from './verifier.js';
import { initReglages, ouvrirReglagesPremiereFois } from './reglages.js';
import { initAide, doitMontrerAide } from './aide.js';
import { initRelances } from './relances.js';
import { initContacts } from './contacts.js';
import { initActivation, chargerActivation, estActive, essaiTermine } from './activation.js';

// Lien d'achat Stripe, sans code promo prérempli : le client saisit lui-même son code sur la page Stripe.
const LIEN_ACHAT = 'https://buy.stripe.com/28E5kCdjp5bC87f20Oc3m00';

// Met le lien d'achat sur tous les liens « Acheter ».
function brancherLiensAchat() {
  document.querySelectorAll('[data-lien-achat]').forEach((a) => { a.href = LIEN_ACHAT; });
}

// Écran à ouvrir une fois l'appli activée : connexion Google, essai terminé ou accueil.
function ouvrirApresActivation() {
  if (!compteConnu()) { afficher('connexion'); return; }
  afficher(essaiTermine() ? 'essai' : 'accueil');
  synchroniser();
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
    localStorage.setItem('compte', await drive.lireEmailCompte());
    await espace.preparerEspace();
    await espace.rafraichirDepuisTableau(); // « Essai commencé le » du tableau fait foi (essai déjà consommé ?)
    await chargerActivation(); // recopie aussi le code et l'essai dans les Réglages (vidés à la déconnexion)
    if (essaiTermine()) afficher('essai');
    // Premier lancement : nom du salon encore vide (« Votre nom » est caché, réservé à la future version Équipe)
    else if (!(await espace.reglage('Nom du salon'))) ouvrirReglagesPremiereFois();
    else afficher(doitMontrerAide() ? 'aide' : 'accueil');
    synchroniser();
  } catch (e) {
    montrerErreur('Préparation de votre espace impossible : ' + e.message);
  } finally {
    etat.hidden = true;
  }
}

// Captures interrompues (appli fermée pendant une saisie) : gardées avec le statut « À vérifier » si une photo existe.
async function reprendreCapturesInterrompues() {
  for (const c of await base.tousLesContacts()) {
    if (c.statut) continue;
    if (c.photo || c.photoId) await base.majContact(c.id, (x) => { x.statut = base.A_VERIFIER; });
    else await base.supprimerContact(c.id);
  }
}

// Service worker : installation hors ligne et bandeau « Nouvelle version disponible ».
function enregistrerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
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
  document.getElementById('bandeau-erreur').addEventListener('click', fermerErreur);
  document.getElementById('bandeau-maj').addEventListener('click', () => location.reload());
  window.addEventListener('error', (e) => montrerErreur('Erreur : ' + e.message));
  window.addEventListener('unhandledrejection', (e) => montrerErreur('Erreur : ' + ((e.reason && e.reason.message) || e.reason)));
  window.addEventListener('carnet:sync', (e) => {
    if (e.detail.erreur) montrerErreur('Envoi vers Google : ' + e.detail.erreur);
    else if (e.detail.attente) message(MESSAGE_ATTENTE); // 5xx persistant : message bref, sans alarme
  });
}

// Point d'entrée.
async function demarrer() {
  brancherBandeaux();
  enregistrerServiceWorker();
  enregistrerEcran('connexion', {});
  brancherLiensAchat();
  initActivation(ouvrirApresActivation);
  initRelances();
  initAccueil();
  initContacts();
  initNouveau();
  initVerifier();
  initReglages();
  initAide();
  document.getElementById('bouton-connexion').addEventListener('click', surConnexion);
  document.querySelectorAll('[data-retour]').forEach((b) => b.addEventListener('click', () => afficher('accueil')));
  await reprendreCapturesInterrompues();
  await chargerActivation();
  demarrerFile();
  if (!estActive()) { afficher('activation'); return; }
  ouvrirApresActivation();
}

demarrer().catch((e) => montrerErreur('Démarrage : ' + e.message));
