// Écran d'aide à l'installation (étape 5) : iPhone (Safari ou Chrome) et Android.
// Affiché à la première ouverture si l'appli n'est pas installée, et accessible depuis Réglages.

import { afficher, enregistrerEcran } from './interface.js';
import { lireLocal, ecrireLocal } from './stockage.js';

let invitationAndroid = null; // événement beforeinstallprompt gardé pour le bouton « Installer »

// Vrai si l'appli tourne déjà installée (icône de l'écran d'accueil).
export function estInstallee() {
  return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}

// Plateforme du téléphone : 'iphone', 'android' ou 'autre'.
function plateforme() {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'iphone';
  if (/Android/.test(ua)) return 'android';
  return 'autre';
}

// Vrai si l'aide doit s'afficher d'elle-même (première ouverture, appli pas installée).
export function doitMontrerAide() {
  let dejaVue = false;
  dejaVue = lireLocal('aideVue') === 'oui';
  return !estInstallee() && !dejaVue;
}

// Prépare l'écran : met en avant les consignes du téléphone utilisé.
function preparer() {
  const p = plateforme();
  document.getElementById('aide-installee').hidden = !estInstallee();
  document.getElementById('aide-iphone').classList.toggle('aide-bloc--actif', p === 'iphone');
  document.getElementById('aide-android').classList.toggle('aide-bloc--actif', p === 'android');
  document.getElementById('bouton-installer').hidden = !invitationAndroid;
}

// Bouton « Installer l'application » (Android, quand Chrome le propose).
async function surInstaller() {
  if (!invitationAndroid) return;
  invitationAndroid.prompt();
  await invitationAndroid.userChoice;
  invitationAndroid = null;
  preparer();
}

// Branche l'écran.
export function initAide() {
  enregistrerEcran('aide', {
    afficher: preparer,
    quitter: () => ecrireLocal('aideVue', 'oui')
  });
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); invitationAndroid = e; });
  document.getElementById('bouton-installer').addEventListener('click', surInstaller);
  document.getElementById('bouton-aide-continuer').addEventListener('click', () => afficher('accueil'));
}
