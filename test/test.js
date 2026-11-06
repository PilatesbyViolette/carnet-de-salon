// Page de test de l'étape 2 : connexion Google (variantes A et B) et chaîne Drive complète.
// Référence : docs/claude_carnet_de_salon_test_connexion.md. Fichier supprimé avant la recette.

const ID_CLIENT = '1000669439525-sknk86orjceivhtnjknfaj4jsg4c25f9.apps.googleusercontent.com';
const PORTEES = 'https://www.googleapis.com/auth/drive.file openid email';
const URI_RETOUR = location.origin + '/test/';
const NOM_TABLEAU = 'Carnet de salon · Test connexion';
const NOM_DOSSIER = 'Carnet de salon · Test photos';
const ENTETES = ['Id', 'Date', 'Pris par', 'Nom', 'Entreprise', 'E-mail', 'Téléphone', 'Site',
  'Note', 'Photo', 'Statut', 'Relance J+2', 'Relance J+7', 'Texte lu sur la carte'];
const MARGE_PEREMPTION_MS = 5 * 60 * 1000;

let clientJeton = null;   // client Google Identity Services (variante A)
let jeton = null;         // { valeur, expireA, variante, obtenuA }
let compte = '';          // e-mail du compte connecté

// ---------- Journal à l'écran ----------

// Ajoute une ligne horodatée au journal visible (rouge si erreur).
function noter(message, estErreur) {
  const ligne = document.createElement('div');
  ligne.textContent = new Date().toLocaleTimeString('fr-FR') + '  ' + message;
  if (estErreur) ligne.className = 'erreur';
  document.getElementById('journal').prepend(ligne);
}

window.addEventListener('error', (e) => noter('Erreur : ' + e.message, true));
window.addEventListener('unhandledrejection', (e) => noter('Erreur : ' + (e.reason && e.reason.message || e.reason), true));

// ---------- Mode d'affichage ----------

// Affiche « standalone » si la page tourne installée, sinon « navigateur ».
function afficherMode() {
  const installee = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  document.getElementById('mode').textContent = installee ? 'standalone' : 'navigateur';
  document.getElementById('appareil').textContent = navigator.userAgent;
}

// ---------- Jeton ----------

// Garde le jeton en mémoire et dans sessionStorage, puis met à jour l'écran.
function garderJeton(valeur, expiresIn, variante) {
  const maintenant = Date.now();
  jeton = { valeur, expireA: maintenant + Number(expiresIn) * 1000, variante, obtenuA: maintenant };
  sessionStorage.setItem('jeton', JSON.stringify(jeton));
  localStorage.setItem('derniereVariante', variante);
  document.getElementById('variante').textContent = variante;
  document.getElementById('heure').textContent = new Date(maintenant).toLocaleTimeString('fr-FR');
  document.getElementById('duree').textContent = expiresIn;
  noter('Jeton obtenu (variante ' + variante + ', expires_in ' + expiresIn + ' s)');
  lireCompte();
}

// Recharge le jeton de sessionStorage s'il existe encore.
function relireJeton() {
  const brut = sessionStorage.getItem('jeton');
  if (!brut) return;
  jeton = JSON.parse(brut);
  document.getElementById('variante').textContent = jeton.variante + ' (repris de la session)';
  noter('Jeton repris de la session');
  lireCompte();
}

// Vrai si le jeton manque ou expire dans moins de 5 minutes.
function jetonPerime() {
  return !jeton || Date.now() > jeton.expireA - MARGE_PEREMPTION_MS;
}

// Oublie le jeton (mémoire et session).
function oublierJeton() {
  jeton = null;
  sessionStorage.removeItem('jeton');
  document.getElementById('compte').textContent = 'non connecté';
}

// ---------- Variante A : fenêtre Google Identity Services ----------

// Prépare le client GIS dès le chargement du script, pour qu'un tap puisse l'appeler sans attente.
function preparerGis() {
  clientJeton = google.accounts.oauth2.initTokenClient({
    client_id: ID_CLIENT,
    scope: PORTEES,
    callback: (reponse) => {
      if (reponse.error) { noter('Variante A refusée : ' + reponse.error + ' ' + (reponse.error_description || ''), true); return; }
      garderJeton(reponse.access_token, reponse.expires_in, 'A');
    },
    error_callback: (erreur) => noter('Variante A, fenêtre : ' + erreur.type + ' ' + (erreur.message || ''), true)
  });
  noter('Google Identity Services prêt');
}

// Lance la variante A ; appelé directement dans le gestionnaire du tap (jamais après un await).
function connexionA(silencieuse) {
  if (!clientJeton) { noter('Script Google pas encore chargé, réessayez dans 2 s', true); return; }
  noter('Variante A : ouverture de la fenêtre Google' + (silencieuse ? ' (renouvellement)' : ''));
  const options = silencieuse ? { prompt: '' } : { prompt: 'select_account' };
  if (silencieuse && compte) options.login_hint = compte;
  clientJeton.requestAccessToken(options);
}

// ---------- Variante B : redirection ----------

// Quitte la page vers Google ; le retour se fait sur /test/ avec le jeton dans l'ancre.
function connexionB(silencieuse) {
  const etat = crypto.randomUUID();
  sessionStorage.setItem('etatB', etat);
  const parametres = new URLSearchParams({
    client_id: ID_CLIENT,
    redirect_uri: URI_RETOUR,
    response_type: 'token',
    scope: PORTEES,
    include_granted_scopes: 'true',
    state: etat,
    prompt: silencieuse ? 'none' : 'select_account'
  });
  if (silencieuse && compte) parametres.set('login_hint', compte);
  noter('Variante B : départ vers Google' + (silencieuse ? ' (prompt=none)' : ''));
  location.href = 'https://accounts.google.com/o/oauth2/v2/auth?' + parametres.toString();
}

// Au chargement, lit l'ancre de retour de la variante B, vérifie state et garde le jeton.
function lireRetourB() {
  if (!location.hash || location.hash.length < 2) return;
  const p = new URLSearchParams(location.hash.slice(1));
  history.replaceState(null, '', location.pathname);
  const attendu = sessionStorage.getItem('etatB');
  sessionStorage.removeItem('etatB');
  if (p.get('error')) { noter('Variante B refusée : ' + p.get('error'), true); return; }
  if (!p.get('access_token')) return;
  if (!attendu || p.get('state') !== attendu) { noter('Variante B : state différent ou perdu (session vidée pendant le passage chez Google)', true); return; }
  garderJeton(p.get('access_token'), p.get('expires_in'), 'B');
}

// Simule l'expiration : oublie le jeton puis relance la dernière variante en mode silencieux.
function renouveler() {
  const variante = (jeton && jeton.variante) || localStorage.getItem('derniereVariante') || 'A';
  oublierJeton();
  noter('Renouvellement de la variante ' + variante);
  if (variante === 'B') connexionB(true); else connexionA(true);
}

// ---------- Appels Google ----------

// Appelle une API Google avec le jeton ; 401 et 403 donnent un message lisible.
async function appelGoogle(url, options = {}) {
  if (jetonPerime()) throw new Error('Pas de jeton valide : touchez Connexion A ou B');
  options.headers = Object.assign({ Authorization: 'Bearer ' + jeton.valeur }, options.headers || {});
  const reponse = await fetch(url, options);
  if (reponse.ok) return reponse;
  let detail = '';
  try { const corps = await reponse.json(); detail = corps.error && (corps.error.message || corps.error) || ''; } catch (e) { /* corps non JSON */ }
  if (reponse.status === 401) { oublierJeton(); throw new Error('Jeton refusé (401), touchez Renouveler. ' + detail); }
  throw new Error('Google a répondu ' + reponse.status + ' : ' + detail);
}

// Lit l'e-mail du compte connecté et l'affiche.
async function lireCompte() {
  try {
    const r = await appelGoogle('https://www.googleapis.com/oauth2/v3/userinfo');
    compte = (await r.json()).email || '';
    document.getElementById('compte').textContent = compte || '(e-mail absent)';
    noter('Compte : ' + compte);
  } catch (e) { noter(e.message, true); }
}

// Cherche un fichier créé par l'appli d'après son nom et son type ; renvoie son id ou null.
async function chercherFichier(nom, typeMime) {
  const q = "name='" + nom + "' and mimeType='" + typeMime + "' and trashed=false";
  const r = await appelGoogle('https://www.googleapis.com/drive/v3/files?fields=files(id,name)&q=' + encodeURIComponent(q));
  const fichiers = (await r.json()).files || [];
  return fichiers.length ? fichiers[0].id : null;
}

// Retrouve ou crée le dossier de photos de test.
async function dossierPhotos() {
  const type = 'application/vnd.google-apps.folder';
  const existant = await chercherFichier(NOM_DOSSIER, type);
  if (existant) return existant;
  const r = await appelGoogle('https://www.googleapis.com/drive/v3/files?fields=id', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: NOM_DOSSIER, mimeType: type })
  });
  noter('Dossier de photos créé');
  return (await r.json()).id;
}

// Retrouve ou crée le tableau de test avec ses deux onglets et leurs en-têtes.
async function tableauTest() {
  const existant = await chercherFichier(NOM_TABLEAU, 'application/vnd.google-apps.spreadsheet');
  if (existant) return existant;
  const ligne = (valeurs) => ({ values: valeurs.map((v) => ({ userEnteredValue: { stringValue: v } })) });
  const r = await appelGoogle('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      properties: { title: NOM_TABLEAU },
      sheets: [
        { properties: { title: 'Contacts' }, data: [{ startRow: 0, startColumn: 0, rowData: [ligne(ENTETES)] }] },
        { properties: { title: 'Réglages' }, data: [{ startRow: 0, startColumn: 0, rowData: [ligne(['Clé', 'Valeur'])] }] }
      ]
    })
  });
  noter('Tableau de test créé');
  return (await r.json()).spreadsheetId;
}

// Construit un corps multipart/related (métadonnées JSON + image) pour l'API d'envoi Drive.
function corpsMultipart(metadonnees, image) {
  const limite = 'cds' + Date.now();
  const corps = new Blob([
    '--' + limite + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n',
    JSON.stringify(metadonnees),
    '\r\n--' + limite + '\r\nContent-Type: image/jpeg\r\n\r\n',
    image,
    '\r\n--' + limite + '--'
  ]);
  return { corps, type: 'multipart/related; boundary=' + limite };
}

// Envoie la photo dans le dossier ; renvoie { id, webViewLink }.
async function envoyerPhoto(image, idDossier, nom) {
  const m = corpsMultipart({ name: nom, parents: [idDossier] }, image);
  const r = await appelGoogle('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
    method: 'POST', headers: { 'Content-Type': m.type }, body: m.corps
  });
  return r.json();
}

// Lit le texte de la carte : conversion OCR en document, export texte, suppression du document.
async function lireTexte(image, idDossier) {
  const m = corpsMultipart({ name: 'ocr-temporaire', parents: [idDossier], mimeType: 'application/vnd.google-apps.document' }, image);
  const r = await appelGoogle('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&ocrLanguage=fr&fields=id', {
    method: 'POST', headers: { 'Content-Type': m.type }, body: m.corps
  });
  const idDoc = (await r.json()).id;
  const texte = await (await appelGoogle('https://www.googleapis.com/drive/v3/files/' + idDoc + '/export?mimeType=text/plain')).text();
  await appelGoogle('https://www.googleapis.com/drive/v3/files/' + idDoc, { method: 'DELETE' });
  return texte.replace(/^﻿/, '').trim();
}

// Ajoute une ligne de test à l'onglet Contacts (valeurs brutes, aucune formule interprétée).
async function ecrireLigne(idTableau, valeurs) {
  const plage = encodeURIComponent('Contacts!A:N');
  await appelGoogle('https://sheets.googleapis.com/v4/spreadsheets/' + idTableau + '/values/' + plage +
    ':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: [valeurs] })
  });
}

// ---------- Photo ----------

// Réduit la photo à 1 600 px sur le plus grand côté, orientation corrigée, en JPEG 0,85.
async function reduirePhoto(fichier) {
  let source;
  try { source = await createImageBitmap(fichier, { imageOrientation: 'from-image' }); }
  catch (e) { source = await createImageBitmap(fichier); }
  const echelle = Math.min(1, 1600 / Math.max(source.width, source.height));
  const toile = document.createElement('canvas');
  toile.width = Math.round(source.width * echelle);
  toile.height = Math.round(source.height * echelle);
  toile.getContext('2d').drawImage(source, 0, 0, toile.width, toile.height);
  return new Promise((ok) => toile.toBlob(ok, 'image/jpeg', 0.85));
}

// Date ISO 8601 avec fuseau, par exemple 2026-11-13T10:42:00+01:00.
function dateIso(d) {
  const deux = (n) => String(Math.abs(n)).padStart(2, '0');
  const decalage = -d.getTimezoneOffset();
  return d.getFullYear() + '-' + deux(d.getMonth() + 1) + '-' + deux(d.getDate()) + 'T' +
    deux(d.getHours()) + ':' + deux(d.getMinutes()) + ':' + deux(d.getSeconds()) +
    (decalage >= 0 ? '+' : '-') + deux(Math.floor(Math.abs(decalage) / 60)) + ':' + deux(Math.abs(decalage) % 60);
}

// Chaîne complète du bloc Drive : réduction, envoi, OCR, écriture, avec durée totale.
async function traiterPhoto(fichier) {
  const debut = Date.now();
  try {
    noter('Photo reçue (' + Math.round(fichier.size / 1024) + ' Ko), réduction');
    const image = await reduirePhoto(fichier);
    noter('Photo réduite (' + Math.round(image.size / 1024) + ' Ko)');
    const idDossier = await dossierPhotos();
    const id = crypto.randomUUID();
    const photo = await envoyerPhoto(image, idDossier, 'carte-' + id + '.jpg');
    noter('Photo envoyée : ' + photo.id);
    const texte = await lireTexte(image, idDossier);
    document.getElementById('texte').textContent = texte || '(texte vide)';
    noter('Texte lu : ' + texte.split(/\s+/).slice(0, 10).join(' '));
    const idTableau = await tableauTest();
    document.getElementById('tableau').textContent = idTableau;
    await ecrireLigne(idTableau, [id, dateIso(new Date()), compte, '', '', '', '', '', 'Test de connexion',
      photo.webViewLink || '', 'À vérifier', '', '', texte]);
    noter('Ligne écrite. Durée totale : ' + ((Date.now() - debut) / 1000).toFixed(1) + ' s');
  } catch (e) {
    noter(e.message, true);
  }
}

// ---------- Démarrage ----------

// Branche les boutons ; les connexions sont lancées sans aucun await avant.
function brancherBoutons() {
  document.getElementById('boutonA').addEventListener('click', () => connexionA(false));
  document.getElementById('boutonB').addEventListener('click', () => connexionB(false));
  document.getElementById('boutonRenouveler').addEventListener('click', renouveler);
  document.getElementById('boutonVider').addEventListener('click', () => { document.getElementById('journal').textContent = ''; });
  document.getElementById('photo').addEventListener('change', (e) => {
    if (e.target.files[0]) traiterPhoto(e.target.files[0]);
    e.target.value = '';
  });
}

afficherMode();
brancherBoutons();
lireRetourB();
if (!jeton) relireJeton();
noter('Page chargée, adresse de retour B : ' + URI_RETOUR);
