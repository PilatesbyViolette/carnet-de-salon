// Connexion Google côté navigateur : Google Identity Services, modèle à jeton (fenêtre).
// Variante retenue au test de l'étape 2 (README.md, docs/claude_carnet_de_salon_test_connexion.md) :
// Android installé = A (fenêtre). iPhone : test en attente ; si le test impose la redirection (B), elle sera ajoutée ici.

import { lireLocal, retirerLocal, lireSession, ecrireSession, retirerSession } from './stockage.js';

const ID_CLIENT ='1000669439525-sknk86orjceivhtnjknfaj4jsg4c25f9.apps.googleusercontent.com';
const PORTEE_DRIVE = 'https://www.googleapis.com/auth/drive.file';
const PORTEES = PORTEE_DRIVE + ' openid email';
const MARGE_MS = 5 * 60 * 1000; // jeton considéré périmé 5 minutes avant son expiration

let client = null;   // client Google Identity Services
let jeton = null;    // { valeur, expireA }
let attente = null;  // { ok, ko } de la demande en cours

// Prévient l'interface qu'il y a du nouveau côté jeton.
function signaler() {
  window.dispatchEvent(new CustomEvent('carnet:jeton'));
}

// Relit le jeton gardé dans sessionStorage (il ne survit pas à la fermeture complète de l'appli).
function relire() {
  try { jeton = JSON.parse(lireSession('jeton')); } catch (e) { jeton = null; }
}

// Vrai si un jeton existe et n'expire pas dans les 5 minutes.
export function jetonValide() {
  return !!jeton && Date.now() < jeton.expireA - MARGE_MS;
}

// Renvoie le jeton s'il est valide, sinon null.
export function jetonActuel() {
  return jetonValide() ? jeton.valeur : null;
}

// Oublie le jeton (mémoire et session).
export function oublierJeton() {
  jeton = null;
  retirerSession('jeton');
  signaler();
}

// E-mail du compte connecté, gardé sur le téléphone.
export function compteConnu() {
  return lireLocal('compte') || '';
}

// Prépare le client dès que le script Google est chargé (appelé par l'attribut onload d'index.html).
function preparerClient() {
  if (client || !window.google || !google.accounts || !google.accounts.oauth2) return;
  client = google.accounts.oauth2.initTokenClient({
    client_id: ID_CLIENT,
    scope: PORTEES,
    callback: recevoirJeton,
    error_callback: erreurFenetre
  });
}

// Reçoit la réponse de Google : vérifie l'accès Drive, garde le jeton.
function recevoirJeton(reponse) {
  const demande = attente;
  attente = null;
  if (reponse.error) {
    if (demande) demande.ko(new Error('Connexion Google refusée : ' + reponse.error));
    return;
  }
  if (!google.accounts.oauth2.hasGrantedAllScopes(reponse, PORTEE_DRIVE)) {
    if (demande) demande.ko(new Error('Google Drive n\'a pas été autorisé. Reconnectez-vous et cochez la case Google Drive sur l\'écran Google.'));
    return;
  }
  jeton = { valeur: reponse.access_token, expireA: Date.now() + Number(reponse.expires_in) * 1000 };
  ecrireSession('jeton', JSON.stringify(jeton));
  signaler();
  if (demande) demande.ok(jeton.valeur);
}

// Traduit les erreurs de la fenêtre Google en message lisible.
function erreurFenetre(erreur) {
  const demande = attente;
  attente = null;
  const messages = {
    popup_closed: 'Fenêtre Google fermée avant la fin de la connexion',
    popup_failed_to_open: 'La fenêtre Google n\'a pas pu s\'ouvrir'
  };
  if (demande) demande.ko(new Error(messages[erreur.type] || 'Connexion Google : ' + erreur.type));
}

// Demande un jeton. À appeler directement dans le gestionnaire du tap, jamais après un await (sinon iOS bloque la fenêtre).
export function demanderJeton(premiere) {
  if (!client) {
    return Promise.reject(new Error(navigator.onLine
      ? 'Le service Google se charge encore, réessayez dans quelques secondes'
      : 'Pas de réseau : connexion Google impossible pour le moment'));
  }
  if (attente) attente.ko(new Error('Demande remplacée'));
  const promesse = new Promise((ok, ko) => { attente = { ok, ko }; });
  const options = premiere ? { prompt: 'select_account' } : { prompt: '' };
  if (!premiere && compteConnu()) options.login_hint = compteConnu();
  client.requestAccessToken(options);
  return promesse;
}

// Dans un geste (Enregistrer, Synchroniser, Valider) : redemande un jeton seulement s'il est périmé et que le réseau est là.
export function jetonDansLeGeste() {
  if (jetonValide() || !navigator.onLine || !compteConnu()) return Promise.resolve();
  return demanderJeton(false);
}

// Déconnexion : révoque le jeton auprès de Google et oublie le compte.
export function deconnecter() {
  if (jeton && window.google && google.accounts) google.accounts.oauth2.revoke(jeton.valeur, () => {});
  retirerLocal('compte');
  oublierJeton();
}

window.carnetGisCharge = preparerClient;
relire();
preparerClient();
