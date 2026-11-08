// Appels aux API Google Drive et Sheets (fetch + jeton). Les erreurs sont traduites en messages lisibles.

import { jetonActuel, oublierJeton } from './connexion.js';

export const NOM_TABLEAU = 'Carnet de salon · Mes contacts';
export const NOM_DOSSIER = 'Carnet de salon · Photos des cartes';
export const TYPE_TABLEAU = 'application/vnd.google-apps.spreadsheet';
export const TYPE_DOSSIER = 'application/vnd.google-apps.folder';
export const ENTETES = ['Id', 'Date', 'Pris par', 'Nom', 'Entreprise', 'E-mail', 'Téléphone', 'Site',
  'Note', 'Photo', 'Statut', 'Relance J+2', 'Relance J+7', 'Texte lu sur la carte'];

const DRIVE = 'https://www.googleapis.com/drive/v3';
const ENVOI = 'https://www.googleapis.com/upload/drive/v3';
const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets';

// Erreur de jeton (absent, périmé ou refusé) : il faut se reconnecter.
export class ErreurJeton extends Error {}
// Erreur réseau : on réessaiera au retour du réseau, sans compter d'échec.
export class ErreurReseau extends Error {}

// Appelle une API Google avec le jeton ; 401 = reconnexion, autres erreurs = message Google tel quel.
export async function appelGoogle(url, options = {}) {
  const jeton = jetonActuel();
  if (!jeton) throw new ErreurJeton('Reconnexion Google nécessaire');
  const entetes = Object.assign({ Authorization: 'Bearer ' + jeton }, options.headers || {});
  let reponse;
  try {
    reponse = await fetch(url, Object.assign({}, options, { headers: entetes }));
  } catch (e) {
    throw new ErreurReseau('Réseau indisponible');
  }
  if (reponse.ok) return reponse;
  let detail = '';
  try {
    const corps = await reponse.json();
    detail = (corps.error && (corps.error.message || corps.error)) || '';
  } catch (e) { /* corps non JSON */ }
  if (reponse.status === 401) {
    oublierJeton();
    throw new ErreurJeton('Session Google expirée : reconnexion nécessaire');
  }
  const erreur = new Error('Google (' + reponse.status + ') : ' + (detail || reponse.statusText));
  erreur.statut = reponse.status;
  throw erreur;
}

// Envoie du JSON et renvoie la réponse JSON.
async function envoyerJson(url, methode, corps) {
  const reponse = await appelGoogle(url, {
    method: methode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corps)
  });
  return reponse.json();
}

// Plage A1 encodée pour l'URL, avec le nom d'onglet entre apostrophes.
function plage(onglet, cellules) {
  return encodeURIComponent('\'' + onglet + '\'!' + cellules);
}

// Lit l'e-mail du compte connecté.
export async function lireEmailCompte() {
  const reponse = await appelGoogle('https://www.googleapis.com/oauth2/v3/userinfo');
  return (await reponse.json()).email || '';
}

// Cherche un fichier créé par l'appli d'après son nom et son type (drive.file ne voit que ceux-là) ; id ou null.
export async function chercherFichier(nom, type) {
  const q = 'name=\'' + nom + '\' and mimeType=\'' + type + '\' and trashed=false';
  const reponse = await appelGoogle(DRIVE + '/files?fields=files(id)&orderBy=createdTime&q=' + encodeURIComponent(q));
  const fichiers = (await reponse.json()).files || [];
  return fichiers.length ? fichiers[0].id : null;
}

// Vrai si le fichier existe et n'est pas à la corbeille.
export async function fichierExiste(id) {
  try {
    const reponse = await appelGoogle(DRIVE + '/files/' + id + '?fields=id,trashed');
    return !(await reponse.json()).trashed;
  } catch (e) {
    if (e.statut === 404) return false;
    throw e;
  }
}

// Crée le dossier des photos ; renvoie son id.
export async function creerDossier() {
  const fichier = await envoyerJson(DRIVE + '/files?fields=id', 'POST', { name: NOM_DOSSIER, mimeType: TYPE_DOSSIER });
  return fichier.id;
}

// Crée le tableau avec les onglets Contacts et Réglages (en-têtes en gras, première ligne figée) ; renvoie son id.
export async function creerTableau(lignesReglages) {
  const ligne = (valeurs, gras) => ({
    values: valeurs.map((v) => ({
      userEnteredValue: { stringValue: String(v) },
      userEnteredFormat: gras ? { textFormat: { bold: true }, backgroundColor: { red: 0.933, green: 0.941, blue: 1 } } : { wrapStrategy: 'WRAP' }
    }))
  });
  const onglet = (titre, lignes) => ({
    properties: { title: titre, gridProperties: { frozenRowCount: 1 } },
    data: [{ startRow: 0, startColumn: 0, rowData: lignes }]
  });
  const tableau = await envoyerJson(SHEETS, 'POST', {
    properties: { title: NOM_TABLEAU, locale: 'fr_FR' },
    sheets: [
      onglet('Contacts', [ligne(ENTETES, true)]),
      onglet('Réglages', [ligne(['Réglage', 'Valeur'], true)].concat(lignesReglages.map((l) => ligne(l, false))))
    ]
  });
  return tableau.spreadsheetId;
}

// Corps multipart/related (métadonnées JSON + image JPEG) pour l'envoi Drive.
function corpsMultipart(metadonnees, image) {
  const limite = 'carnet' + Date.now();
  return {
    type: 'multipart/related; boundary=' + limite,
    corps: new Blob([
      '--' + limite + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n',
      JSON.stringify(metadonnees),
      '\r\n--' + limite + '\r\nContent-Type: image/jpeg\r\n\r\n',
      image,
      '\r\n--' + limite + '--'
    ])
  };
}

// Envoie la photo dans le dossier ; renvoie { id, webViewLink }.
export async function envoyerPhoto(image, idDossier, nom) {
  const m = corpsMultipart({ name: nom, parents: [idDossier] }, image);
  const reponse = await appelGoogle(ENVOI + '/files?uploadType=multipart&fields=id,webViewLink', {
    method: 'POST', headers: { 'Content-Type': m.type }, body: m.corps
  });
  return reponse.json();
}

// Supprime un fichier Drive.
export async function supprimerFichier(id) {
  await appelGoogle(DRIVE + '/files/' + id, { method: 'DELETE' });
}

// Lit le texte de la carte : conversion OCR en document Google, export texte, suppression du document.
export async function lireTexteCarte(image, idDossier) {
  const m = corpsMultipart({ name: 'lecture-temporaire', parents: [idDossier], mimeType: 'application/vnd.google-apps.document' }, image);
  const reponse = await appelGoogle(ENVOI + '/files?uploadType=multipart&ocrLanguage=fr&fields=id', {
    method: 'POST', headers: { 'Content-Type': m.type }, body: m.corps
  });
  const idDoc = (await reponse.json()).id;
  try {
    const texte = await (await appelGoogle(DRIVE + '/files/' + idDoc + '/export?mimeType=text/plain')).text();
    return texte.replace(/^﻿/, '').trim();
  } finally {
    supprimerFichier(idDoc).catch(() => {});
  }
}

// Lit la colonne Id de l'onglet Contacts (en-tête compris : l'index + 1 donne le numéro de ligne).
export async function lireIds(idTableau) {
  const reponse = await appelGoogle(SHEETS + '/' + idTableau + '/values/' + plage('Contacts', 'A:A'));
  return ((await reponse.json()).values || []).map((l) => l[0] || '');
}

// Ajoute une ligne à l'onglet Contacts, en valeurs brutes (aucune formule interprétée).
export async function ajouterLigne(idTableau, valeurs) {
  await envoyerJson(SHEETS + '/' + idTableau + '/values/' + plage('Contacts', 'A:N') +
    ':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS', 'POST', { values: [valeurs] });
}

// Lit toutes les lignes de contacts (sans l'en-tête).
export async function lireLignes(idTableau) {
  const reponse = await appelGoogle(SHEETS + '/' + idTableau + '/values/' + plage('Contacts', 'A2:N'));
  return (await reponse.json()).values || [];
}

// Remplace les valeurs d'une plage de l'onglet donné.
export async function ecrirePlage(idTableau, onglet, cellules, valeurs) {
  await envoyerJson(SHEETS + '/' + idTableau + '/values/' + plage(onglet, cellules) + '?valueInputOption=RAW', 'PUT', { values: valeurs });
}

// Identifiant numérique (sheetId) d'un onglet d'après son titre.
export async function idOnglet(idTableau, titre) {
  const reponse = await appelGoogle(SHEETS + '/' + idTableau + '?fields=sheets.properties(sheetId,title)');
  const onglet = ((await reponse.json()).sheets || []).find((s) => s.properties.title === titre);
  if (!onglet) throw new Error('Onglet « ' + titre + ' » introuvable dans le tableau');
  return onglet.properties.sheetId;
}

// Supprime une ligne d'un onglet (numéro de ligne à partir de 1, comme dans Google Sheets).
export async function supprimerLigne(idTableau, idOngletNum, numero) {
  await envoyerJson(SHEETS + '/' + idTableau + ':batchUpdate', 'POST', {
    requests: [{ deleteDimension: { range: { sheetId: idOngletNum, dimension: 'ROWS', startIndex: numero - 1, endIndex: numero } } }]
  });
}

// Place un fichier dans la corbeille Drive ; un fichier déjà disparu (404) n'est pas une erreur.
export async function mettreALaCorbeille(id) {
  try {
    await envoyerJson(DRIVE + '/files/' + id + '?fields=id', 'PATCH', { trashed: true });
  } catch (e) {
    if (e.statut !== 404) throw e;
  }
}

// Télécharge une photo du Drive (image de la fiche contact).
export async function lirePhoto(id) {
  return (await appelGoogle(DRIVE + '/files/' + id + '?alt=media')).blob();
}

// Lit les paires de l'onglet Réglages (sans l'en-tête).
export async function lireReglagesTableau(idTableau) {
  const reponse = await appelGoogle(SHEETS + '/' + idTableau + '/values/' + plage('Réglages', 'A2:B'));
  return (await reponse.json()).values || [];
}
