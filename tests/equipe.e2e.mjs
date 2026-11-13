// Test de bout en bout du mode Équipe, à deux personnes (responsable et commercial) dans Chromium sans tête,
// avec un faux Google en mémoire (connexion, Drive, Sheets, partage, Google Picker). Hors appli, jamais servi.
//   node tests/equipe.e2e.mjs [chemin]     chemin : '' (racine, branche equipe) ou 'equipe-test/' (copie de test)
// Playwright : PLAYWRIGHT=chemin/vers/playwright/index.mjs (par défaut celui du dossier du site).
// Code Équipe : première ligne de outils/codes_equipe_a_importer.csv (fichier local), sinon un code de test.
// Codes de test (CODES_TEST) : ajoutés à js/codes.js par le serveur du test seulement, jamais dans le dépôt servi.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PW = process.env.PLAYWRIGHT || 'C:/Users/Nico/Documents/site-marque-ia/node_modules/playwright/index.mjs';
const { chromium } = await import(pathToFileURL(PW).href);
const CHEMIN = process.argv[2] || '';
const PORT = 8766;
const BASE = 'http://127.0.0.1:' + PORT + '/';
const APPLI = BASE + CHEMIN;
const CAPTURES = process.env.CAPTURES || '';

// ---------- Vérifications ----------
let verts = 0;
const rouges = [];
function verifier(nom, condition, detail = '') {
  if (condition) verts++;
  else rouges.push(nom + (detail ? ' (' + detail + ')' : ''));
  console.log((condition ? 'vert  ' : 'ROUGE ') + nom + (condition || !detail ? '' : ' : ' + detail));
}

// ---------- Codes de test ----------
const CODES_TEST = { nico: 'CDE-TEST-NICO', solo: 'CDS-TEST-SOLO', equipe: 'CDE-TEST-EQPE' };
const empreinteDe = (c) => crypto.createHash('sha256').update(c.toUpperCase().replace(/[\s-]+/g, '')).digest('hex');
const LIGNES_TEST = Object.values(CODES_TEST).map((c) => { const t = c.startsWith('CDE') ? ['equipe', 'équipe'] : ['achat', 'achat'];
  return `  { empreinte: '${empreinteDe(c)}', type: '${t[0]}', dureeHeures: null, libelle: '${t[1]}' }`; }).join(',\n');

// ---------- Serveur statique ----------
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml' };
const serveur = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, BASE).pathname);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(RACINE, p);
  if (!f.startsWith(RACINE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('absent'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  if (p.endsWith('/js/codes.js')) { res.end(fs.readFileSync(f, 'utf8').replace(/\s*\];\s*$/, ',\n' + LIGNES_TEST + '\n];\n')); return; }
  fs.createReadStream(f).pipe(res);
});
await new Promise((ok) => serveur.listen(PORT, '127.0.0.1', ok));

// ---------- Faux Google ----------
const fichiers = new Map(); // id -> { id, name, mimeType, owner, trashed, permissions: [], app: Set(e-mails), onglets? }
let compteurId = 0;
const nouvelId = (p) => p + '_' + (++compteurId).toString(36) + 'x'.repeat(12);
const jetonVersEmail = (entetes) => decodeURIComponent(String(entetes.authorization || '').replace('Bearer jeton-', ''));
const clesPicker = [];

function accessible(f, email) {
  if (!f) return false;
  if (f.owner === email) return true;
  return f.app.has(email) && f.permissions.some((p) => p.emailAddress === email);
}
function colonne(lettres) { let n = 0; for (const c of lettres) n = n * 26 + (c.charCodeAt(0) - 64); return n - 1; }
function lirePlage(texte) { // 'Onglet'!A2:O  ->  { onglet, c1, l1, c2, l2 }
  const m = /^'(.+)'!([A-Z]+)(\d*)(?::([A-Z]+)(\d*))?$/.exec(texte);
  if (!m) throw new Error('plage illisible ' + texte);
  return { onglet: m[1], c1: colonne(m[2]), l1: m[3] ? Number(m[3]) - 1 : 0, c2: m[4] ? colonne(m[4]) : (m[3] ? colonne(m[2]) : colonne(m[2])), l2: m[5] ? Number(m[5]) - 1 : (m[4] ? Infinity : (m[3] ? Number(m[3]) - 1 : Infinity)) };
}
function couper(ligne) { const l = ligne.map((v) => (v == null ? '' : String(v))); while (l.length && l[l.length - 1] === '') l.pop(); return l; }
function lireValeurs(onglet, p) {
  const lignes = [];
  for (let i = p.l1; i < Math.min(onglet.lignes.length, p.l2 + 1); i++) lignes.push(couper((onglet.lignes[i] || []).slice(p.c1, p.c2 + 1)));
  while (lignes.length && !lignes[lignes.length - 1].length) lignes.pop();
  return lignes;
}
function ecrireValeurs(onglet, l1, c1, valeurs) {
  valeurs.forEach((ligne, i) => {
    const cible = onglet.lignes[l1 + i] || (onglet.lignes[l1 + i] = []);
    ligne.forEach((v, j) => { cible[c1 + j] = String(v); });
  });
}
const erreur = (code, message) => ({ status: code, body: { error: { code, message } } });

function repondreGoogle(methode, url, entetes, corps) {
  const email = jetonVersEmail(entetes);
  const u = new URL(url);
  const chemin = u.pathname;
  if (u.hostname === 'fake.picker') { // le Picker donne l'accès drive.file au fichier choisi
    const f = fichiers.get(u.searchParams.get('id'));
    const qui = decodeURIComponent(u.searchParams.get('jeton').replace('jeton-', ''));
    clesPicker.push(u.searchParams.get('cle'));
    if (f && (f.owner === qui || f.permissions.some((p) => p.emailAddress === qui))) f.app.add(qui);
    return { status: 200, body: { ok: true } };
  }
  if (!email) return erreur(401, 'pas de jeton');
  if (chemin === '/oauth2/v3/userinfo') return { status: 200, body: { email } };

  // Drive
  let m;
  if (u.hostname === 'www.googleapis.com' && chemin === '/drive/v3/files' && methode === 'GET') {
    const q = u.searchParams.get('q');
    const nom = /name='([^']+)'/.exec(q)[1];
    const type = /mimeType='([^']+)'/.exec(q)[1];
    const trouves = [...fichiers.values()].filter((f) => f.name === nom && f.mimeType === type && !f.trashed && f.owner === email && f.app.has(email));
    return { status: 200, body: { files: trouves.map((f) => ({ id: f.id })) } };
  }
  if (chemin === '/drive/v3/files' && methode === 'POST') {
    const meta = JSON.parse(corps);
    const f = { id: nouvelId('dossier'), name: meta.name, mimeType: meta.mimeType, owner: email, trashed: false, permissions: [], app: new Set([email]) };
    fichiers.set(f.id, f);
    return { status: 200, body: { id: f.id } };
  }
  if ((m = /^\/drive\/v3\/files\/([^/]+)\/permissions(?:\/([^/]+))?$/.exec(chemin))) {
    const f = fichiers.get(m[1]);
    if (!f || f.owner !== email) return erreur(f ? 403 : 404, 'File not found: ' + m[1]);
    if (methode === 'GET') return { status: 200, body: { permissions: [{ id: 'proprio', emailAddress: f.owner, role: 'owner' }].concat(f.permissions) } };
    if (methode === 'POST') {
      if (u.searchParams.get('sendNotificationEmail') !== 'false') return erreur(400, 'notification attendue à false');
      const p = JSON.parse(corps);
      f.permissions.push({ id: 'perm' + (++compteurId), emailAddress: p.emailAddress, role: p.role });
      return { status: 200, body: { id: 'perm' + compteurId } };
    }
    if (methode === 'DELETE') { f.permissions = f.permissions.filter((p) => p.id !== m[2]); return { status: 204, body: null }; }
  }
  if ((m = /^\/drive\/v3\/files\/([^/]+)\/export$/.exec(chemin))) return { status: 200, body: 'ALAIN BERNARD\nDirecteur\nalain@bernard-industrie.fr\n06 12 34 56 78', texte: true };
  if ((m = /^\/drive\/v3\/files\/([^/]+)$/.exec(chemin))) {
    const f = fichiers.get(m[1]);
    if (!accessible(f, email)) return erreur(404, 'File not found: ' + m[1]);
    if (methode === 'GET' && u.searchParams.get('alt') === 'media') return { status: 200, body: fs.readFileSync(path.join(RACINE, 'images/icone-192.png')), binaire: true };
    if (methode === 'GET') return { status: 200, body: { id: f.id, trashed: f.trashed } };
    if (methode === 'PATCH') { if (f.owner !== email) return erreur(403, 'The user does not have sufficient permissions for this file.'); f.trashed = true; return { status: 200, body: { id: f.id } }; }
    if (methode === 'DELETE') { fichiers.delete(f.id); return { status: 204, body: null }; }
  }
  if (u.hostname === 'www.googleapis.com' && chemin === '/upload/drive/v3/files') {
    const texte = corps.toString('latin1');
    const meta = JSON.parse(/\r\n\r\n(\{.*?\})\r\n--/s.exec(texte)[1]);
    const parent = fichiers.get(meta.parents[0]);
    if (!parent || parent.owner !== email) return erreur(404, 'dossier introuvable');
    const f = { id: nouvelId(meta.mimeType ? 'doc' : 'photo'), name: meta.name, mimeType: meta.mimeType || 'image/jpeg', owner: email, trashed: false, permissions: [], app: new Set([email]), parent: parent.id };
    fichiers.set(f.id, f);
    return { status: 200, body: { id: f.id, webViewLink: 'https://drive.google.com/file/d/' + f.id + '/view' } };
  }

  // Sheets
  if (u.hostname === 'sheets.googleapis.com') {
    if (chemin === '/v4/spreadsheets' && methode === 'POST') {
      const def = JSON.parse(corps);
      const f = { id: nouvelId('tableau'), name: def.properties.title, mimeType: 'application/vnd.google-apps.spreadsheet', owner: email, trashed: false, permissions: [], app: new Set([email]), onglets: new Map() };
      def.sheets.forEach((s, i) => f.onglets.set(s.properties.title, { sheetId: i, lignes: s.data[0].rowData.map((r) => r.values.map((v) => v.userEnteredValue.stringValue)) }));
      fichiers.set(f.id, f);
      return { status: 200, body: { spreadsheetId: f.id } };
    }
    m = /^\/v4\/spreadsheets\/([^/:]+)(.*)$/.exec(chemin);
    const f = fichiers.get(m[1]);
    if (!accessible(f, email) || f.trashed) return erreur(f ? 403 : 404, 'The caller does not have permission');
    const reste = decodeURIComponent(m[2]);
    if (reste === '' && methode === 'GET') return { status: 200, body: { sheets: [...f.onglets].map(([title, o]) => ({ properties: { title, sheetId: o.sheetId } })) } };
    if (reste === ':batchUpdate') {
      for (const r of JSON.parse(corps).requests) {
        if (r.addSheet) f.onglets.set(r.addSheet.properties.title, { sheetId: f.onglets.size + 100, lignes: [] });
        if (r.deleteDimension) {
          const o = [...f.onglets.values()].find((x) => x.sheetId === r.deleteDimension.range.sheetId);
          o.lignes.splice(r.deleteDimension.range.startIndex, r.deleteDimension.range.endIndex - r.deleteDimension.range.startIndex);
        }
      }
      return { status: 200, body: {} };
    }
    if ((m = /^\/values\/(.+?)(:append)?$/.exec(reste))) {
      const p = lirePlage(m[1]);
      const o = f.onglets.get(p.onglet);
      if (!o) return erreur(400, 'Unable to parse range: ' + m[1]);
      if (methode === 'GET') return { status: 200, body: { values: lireValeurs(o, p) } };
      const valeurs = JSON.parse(corps).values;
      if (m[2]) { let n = o.lignes.length; while (n > 0 && !couper(o.lignes[n - 1] || []).length) n--; ecrireValeurs(o, n, 0, valeurs); return { status: 200, body: {} }; }
      ecrireValeurs(o, p.l1, p.c1, valeurs);
      return { status: 200, body: {} };
    }
  }
  return erreur(501, 'faux Google : ' + methode + ' ' + url);
}

// Script de connexion Google (GIS) : jeton immédiat pour le compte du contexte.
const FAUX_GIS = `window.google = window.google || {};
google.accounts = { oauth2: {
  initTokenClient(cfg) { return { requestAccessToken() { setTimeout(() => cfg.callback({ access_token: 'jeton-' + encodeURIComponent(window.__compteTest), expires_in: 3600 }), 20); } }; },
  hasGrantedAllScopes() { return true; }, revoke() {} } };
if (window.carnetGisCharge) window.carnetGisCharge();`;
// Google Picker : « choisit » le fichier filtré par setFileIds, après avoir donné l'accès au faux Drive.
const FAUX_PICKER = `window.gapi = { load(nom, o) { setTimeout(o.callback, 0); } };
window.google = window.google || {};
google.picker = {
  ViewId: { SPREADSHEETS: 'spreadsheets' }, DocsViewMode: { LIST: 'list' },
  Action: { PICKED: 'picked', CANCEL: 'cancel' }, Response: { ACTION: 'action', DOCUMENTS: 'docs' }, Document: { ID: 'id' },
  DocsView: class { setMode() { return this; } setFileIds(i) { this.ids = i; return this; } },
  PickerBuilder: class {
    setAppId(a) { this.a = a; return this; } setOAuthToken(t) { this.t = t; return this; } setDeveloperKey(k) { this.k = k; return this; }
    setLocale() { return this; } setTitle() { return this; } addView(v) { this.v = v; return this; } setCallback(c) { this.c = c; return this; }
    build() { const s = this; return { setVisible() {
      const id = window.__choixPicker || s.v.ids;
      fetch('https://fake.picker/choisir?id=' + encodeURIComponent(id) + '&jeton=' + encodeURIComponent(s.t) + '&cle=' + encodeURIComponent(s.k), { method: 'POST' })
        .then(() => s.c({ action: 'picked', docs: [{ id }] }));
    } }; }
  }
};`;

const signauxOptimisons = []; // signaux d'essai/achat reçus par le faux Optimisons.ai
async function brancherFauxGoogle(ctx) {
  await ctx.route(/script\.google\.com\/macros\//, (r) => {
    try { signauxOptimisons.push(JSON.parse(r.request().postData() || '{}')); } catch (e) { signauxOptimisons.push({ illisible: true }); }
    return r.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: '{"ok":true}' });
  });
  await ctx.route(/accounts\.google\.com\/gsi\/client/, (r) => r.fulfill({ contentType: 'text/javascript', body: FAUX_GIS }));
  await ctx.route(/apis\.google\.com\/js\/api\.js/, (r) => r.fulfill({ contentType: 'text/javascript', body: FAUX_PICKER }));
  await ctx.route(/googleapis\.com|fake\.picker/, async (r) => {
    const q = r.request();
    if (q.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    let rep;
    try { rep = repondreGoogle(q.method(), q.url(), q.headers(), q.postDataBuffer() || Buffer.alloc(0)); } catch (e) { rep = erreur(500, 'faux Google : ' + e.message); }
    const entetes = { 'access-control-allow-origin': '*' };
    if (rep.binaire) return r.fulfill({ status: rep.status, headers: entetes, contentType: 'image/png', body: rep.body });
    if (rep.texte) return r.fulfill({ status: rep.status, headers: entetes, contentType: 'text/plain', body: rep.body });
    return r.fulfill({ status: rep.status, headers: entetes, contentType: 'application/json', body: rep.body == null ? '' : JSON.stringify(rep.body) });
  });
}

// ---------- Personnes ----------
const navigateur = await chromium.launch();
const erreursConsole = [];
async function personne(email, nom) {
  const ctx = await navigateur.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, serviceWorkers: 'block' });
  await ctx.addInitScript(([e]) => { window.__compteTest = e; window.__nomBaseTest = location.pathname.includes('equipe-test') ? 'carnet-equipe-test' : 'carnet'; try { localStorage.setItem((location.pathname.includes('equipe-test') ? 'equipeTest_' : '') + 'aideVue', 'oui'); } catch (x) { /* rien */ } }, [email]);
  await brancherFauxGoogle(ctx);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => erreursConsole.push(nom + ' : ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') erreursConsole.push(nom + ' console : ' + m.text()); });
  page.on('dialog', (d) => d.dismiss());
  return { ctx, page, email, nom };
}
const visible = (page, sel) => page.isVisible(sel);
const attendreEcran = (page, nom) => page.waitForSelector('#ecran-' + nom + ':not([hidden])', { timeout: 8000 });
const textes = (page, sel) => page.$$eval(sel, (e) => e.map((x) => x.textContent.trim()));
// Textes d'une liste, attendus jusqu'à 3 s (rendu asynchrone) ; renvoie ce qui est affiché à la fin.
async function textesAttendus(page, sel, attendu) {
  for (let i = 0; i < 30; i++) { const t = (await textes(page, sel)).join(); if (t === attendu) return t; await page.waitForTimeout(100); }
  return (await textes(page, sel)).join();
}
const bandeauErreur = async (page) => ((await visible(page, '#bandeau-erreur')) ? (await page.textContent('#bandeau-erreur span')) : '');
async function synchroniser(page) {
  await page.evaluate(() => new Promise((ok) => {
    const fin = (e) => { if (e.detail.fini || e.detail.erreur || e.detail.retrait || e.detail.horsLigne) { window.removeEventListener('carnet:sync', fin); ok(); } };
    window.addEventListener('carnet:sync', fin);
    document.getElementById('bouton-synchroniser').click();
  }));
  await page.waitForTimeout(300);
}
async function capture(p, nom) { if (CAPTURES) await p.page.screenshot({ path: path.join(CAPTURES, nom + '.png'), fullPage: true }); }
async function saisirSansCarte(page, champs) {
  await page.click('#bouton-sans-carte');
  await attendreEcran(page, 'nouveau');
  for (const [k, v] of Object.entries(champs)) await page.fill('#champ-' + k, v);
  await page.click('#formulaire-contact button[type=submit]');
  await attendreEcran(page, 'accueil');
}
const tableau = () => [...fichiers.values()].find((f) => f.onglets && f.owner === 'nicolas@exemple.com' && !f.trashed);
const reglagesDuTableau = () => Object.fromEntries(tableau().onglets.get('Réglages').lignes.slice(1).map((l) => [l[0], l[1]]));
const lignesContacts = () => tableau().onglets.get('Contacts').lignes.slice(1).filter((l) => l && l[0]);

const CSV_EQUIPE = path.join(RACINE, 'outils/codes_equipe_a_importer.csv');
const code = fs.existsSync(CSV_EQUIPE) ? fs.readFileSync(CSV_EQUIPE, 'utf8').split(/\r?\n/)[1].split(',')[0] : CODES_TEST.nico;
const empreinteCode = empreinteDe(code);

try {
  // ===== 1. Responsable : activation par code Équipe =====
  const nico = await personne('nicolas@exemple.com', 'responsable');
  await nico.page.goto(APPLI);
  await attendreEcran(nico.page, 'activation');
  const offres = await nico.page.$$eval('#ecran-activation .offre', (e) => e.map((a) => a.textContent.replace(/\s+/g, ' ').trim() + ' -> ' + a.href));
  verifier('Activation : deux offres, Équipe recommandée en premier', offres.length === 2 && /Recommandé.*Équipe · 990 €.*utilisateurs illimités/.test(offres[0]) && /Solo · 690 €/.test(offres[1]), offres.join(' | '));
  verifier('Activation : liens Solo et Équipe vers Stripe', offres[1].includes('buy.stripe.com/28E5') && offres[0].includes('buy.stripe.com/8x24'), offres.join(' | '));
  await capture(nico, 'e2e-1-activation');
  await nico.page.fill('#champ-code', code.toLowerCase().replace(/-/g, ' '));
  await nico.page.click('#formulaire-activation button[type=submit]');
  await attendreEcran(nico.page, 'connexion');
  await nico.page.click('#bouton-connexion');
  await attendreEcran(nico.page, 'reglages');
  verifier('Responsable : champ « Votre prénom » visible', await nico.page.waitForSelector('#reg-nom-bloc:not([hidden])', { timeout: 3000 }).then(() => true, () => false));
  verifier('Responsable : bouton « Mon équipe » visible', await visible(nico.page, '#bouton-mon-equipe'));
  verifier('Responsable : code Équipe masqué dans Réglages', /^CDE-••••-.{4} · Équipe, vous êtes responsable$/.test(await nico.page.textContent('#reg-code')), await nico.page.textContent('#reg-code'));
  await nico.page.fill('#reg-entreprise', 'Ateliers Dupont');
  await nico.page.fill('#reg-salon', 'Salon de test');
  await nico.page.fill('#reg-nom', 'Nicolas');
  await nico.page.click('#formulaire-reglages button[type=submit]');
  await attendreEcran(nico.page, 'accueil');
  await nico.page.waitForTimeout(800);
  await nico.page.click('#bouton-reglages'); await attendreEcran(nico.page, 'reglages');
  await synchroniser(nico.page);
  await synchroniser(nico.page);
  const reg = reglagesDuTableau();
  verifier('Tableau : Mode = Équipe', reg['Mode'] === 'Équipe', JSON.stringify(reg));
  verifier('Tableau : Responsable = e-mail du responsable', reg['Responsable'] === 'nicolas@exemple.com');
  verifier('Tableau : Code équipe = empreinte SHA-256, jamais le code', reg['Code équipe'] === empreinteCode && !JSON.stringify(tableau().onglets.get('Réglages').lignes).includes(code));
  const ongletEquipe = tableau().onglets.get('Équipe');
  verifier('Tableau : onglet Équipe créé avec le responsable', !!ongletEquipe && ongletEquipe.lignes[0].join('|') === 'E-mail|Prénom|Rôle|Ajouté le' && ongletEquipe.lignes[1][0] === 'nicolas@exemple.com' && ongletEquipe.lignes[1][1] === 'Nicolas' && ongletEquipe.lignes[1][2] === 'responsable', ongletEquipe && JSON.stringify(ongletEquipe.lignes));
  verifier('Tableau : en-tête de la colonne O « Compte »', tableau().onglets.get('Contacts').lignes[0][14] === 'Compte');

  await nico.page.click('[data-retour]:visible');
  await saisirSansCarte(nico.page, { note: 'gamme pro', nom: 'Marie Dupont', entreprise: 'Ateliers Marie', email: 'marie@exemple.com' });
  await nico.page.click('#bouton-reglages'); await attendreEcran(nico.page, 'reglages');
  await synchroniser(nico.page);
  const marie = lignesContacts().find((l) => l[3] === 'Marie Dupont');
  verifier('Capture du responsable : Pris par = prénom, Compte = e-mail', marie && marie[2] === 'Nicolas' && marie[14] === 'nicolas@exemple.com', JSON.stringify(marie));

  // ===== 2. Invitation =====
  await nico.page.click('#bouton-mon-equipe');
  await attendreEcran(nico.page, 'equipe');
  const membresNico = await textesAttendus(nico.page, '#liste-membres .contact__nom', 'Nicolas');
  verifier('Mon équipe : le responsable est listé', membresNico === 'Nicolas', membresNico);
  await nico.page.click('#bouton-inviter');
  await nico.page.fill('#invite-email', 'pas-une-adresse');
  await nico.page.click('#bouton-envoyer-invitation');
  await nico.page.waitForTimeout(300);
  verifier('Invitation : adresse invalide refusée', (await bandeauErreur(nico.page)).includes('adresse Google'));
  await nico.page.click('#bandeau-erreur');
  await nico.page.fill('#invite-email', 'julie.martin@exemple.com');
  await nico.page.fill('#invite-prenom', 'Julie');
  await nico.page.click('#bouton-envoyer-invitation');
  await nico.page.waitForSelector('#invitation-prete:not([hidden])', { timeout: 8000 });
  const lien = await nico.page.textContent('#invitation-lien');
  const mailto = await nico.page.getAttribute('#invitation-mailto', 'href');
  const idTableau = tableau().id;
  verifier('Invitation : lien ?rejoindre=idDuTableau', lien.includes('?rejoindre=' + idTableau) && lien.startsWith(CHEMIN.includes('equipe-test') ? 'https://app.optimisons.ai/equipe-test/' : 'https://app.optimisons.ai/'), lien);
  verifier('Invitation : mailto vers le commercial, objet prévu', mailto.startsWith('mailto:julie.martin@exemple.com?subject=Rejoignez%20notre%20carnet%20de%20salon&body=') && decodeURIComponent(mailto).includes(lien));
  verifier('Invitation : tableau partagé en écriture, sans e-mail Google', tableau().permissions.some((p) => p.emailAddress === 'julie.martin@exemple.com' && p.role === 'writer'));
  const dossierNico = [...fichiers.values()].find((f) => f.mimeType === 'application/vnd.google-apps.folder' && f.owner === 'nicolas@exemple.com');
  verifier('Invitation : dossier des photos partagé', dossierNico.permissions.some((p) => p.emailAddress === 'julie.martin@exemple.com'));
  verifier('Invitation : ligne dans l\'onglet Équipe', tableau().onglets.get('Équipe').lignes.some((l) => l[0] === 'julie.martin@exemple.com' && l[1] === 'Julie' && l[2] === 'commercial'));
  verifier('Mon équipe : deux membres, « Retirer » pour le commercial seulement', (await textes(nico.page, '#liste-membres .contact__nom')).join() === 'Nicolas,Julie' && (await nico.page.$$('#liste-membres button')).length === 1);
  await capture(nico, 'e2e-2-mon-equipe');
  await nico.page.click('#bouton-inviter');
  await nico.page.fill('#invite-email', 'Julie.Martin@exemple.com');
  await nico.page.click('#bouton-envoyer-invitation');
  await nico.page.waitForTimeout(400);
  verifier('Invitation : membre déjà présent refusé', (await bandeauErreur(nico.page)).includes('fait déjà partie'));
  await nico.page.click('#bandeau-erreur');

  // ===== 3. Le commercial rejoint par le lien =====
  const julie = await personne('julie.martin@exemple.com', 'commercial');
  await julie.page.goto(APPLI + new URL(lien).search);
  await attendreEcran(julie.page, 'rejoindre');
  verifier('Rejoindre : titre avec le nom de l\'entreprise', (await julie.page.textContent('#ecran-rejoindre h1')).includes('Rejoindre le carnet de Ateliers Dupont'));
  verifier('Rejoindre : adresse nettoyée (plus de ?rejoindre)', !julie.page.url().includes('rejoindre'));
  await capture(julie, 'e2e-3-rejoindre');
  await julie.page.click('#bouton-rejoindre-connexion');
  await julie.page.waitForSelector('#bouton-choisir-carnet:not([hidden])');
  verifier('Rejoindre : aide « fenêtre Google blanche » sous le bouton', (await visible(julie.page, '#rejoindre-aide-picker')) && (await julie.page.textContent('#rejoindre-aide-picker')).includes('pas en navigation privée'));
  await julie.page.click('#bouton-choisir-carnet');
  await attendreEcran(julie.page, 'accueil');
  await julie.page.waitForTimeout(600);
  verifier('Rejoindre : Picker appelé avec la clé de js/picker.js', clesPicker.length === 1 && /^AIza/.test(clesPicker[0]) && fs.readFileSync(path.join(RACINE, CHEMIN, 'js/picker.js'), 'utf8').includes(clesPicker[0]));
  verifier('Rejoindre : accueil du commercial sans erreur', !(await bandeauErreur(julie.page)), await bandeauErreur(julie.page));
  verifier('Commercial : ses compteurs seulement (0)', (await julie.page.textContent('#chiffre-total')) === '0');
  verifier('Commercial : pas de compteurs par commercial', !(await visible(julie.page, '#compteurs-equipe')));

  // Capture avec photo (lecture de la carte) et sans carte
  await julie.page.setInputFiles('#entree-photo', path.join(RACINE, 'images/icone-192.png'));
  await attendreEcran(julie.page, 'nouveau');
  await julie.page.waitForFunction(() => document.getElementById('champ-nom').value !== '', null, { timeout: 8000 });
  await julie.page.fill('#champ-note', 'rappeler en décembre');
  await julie.page.click('#formulaire-contact button[type=submit]');
  await attendreEcran(julie.page, 'accueil');
  await julie.page.click('#bouton-reglages'); await attendreEcran(julie.page, 'reglages');
  await synchroniser(julie.page);
  const alain = lignesContacts().find((l) => l[3] === 'Alain Bernard');
  verifier('Capture du commercial : ligne écrite, Pris par = Julie, Compte = son e-mail', alain && alain[2] === 'Julie' && alain[14] === 'julie.martin@exemple.com', JSON.stringify(alain));
  const photo = alain && fichiers.get(/\/d\/([^/]+)/.exec(alain[9])[1]);
  const dossierJulie = photo && fichiers.get(photo.parent);
  verifier('Photo du commercial : dans un dossier de son propre Drive', !!dossierJulie && dossierJulie.owner === 'julie.martin@exemple.com');
  verifier('Photo du commercial : dossier partagé en lecture avec le responsable', !!dossierJulie && dossierJulie.permissions.some((p) => p.emailAddress === 'nicolas@exemple.com' && p.role === 'reader'));
  verifier('Commercial : réglages de l\'équipe en lecture seule', await julie.page.$eval('#reg-salon', (e) => e.readOnly && e.value === 'Salon de test'));
  verifier('Commercial : prénom de l\'équipe affiché', (await julie.page.textContent('#reg-prenom-equipe')) === 'Julie');
  verifier('Commercial : pas de « Mon équipe »', !(await visible(julie.page, '#bouton-mon-equipe')));
  verifier('Commercial : description de l\'activation', (await julie.page.textContent('#reg-code')).startsWith('Membre de l\'équipe Ateliers Dupont'));
  await julie.page.fill('#reg-signature', 'Julie Martin\nAteliers Dupont');
  await julie.page.click('#formulaire-reglages button[type=submit]');
  await julie.page.waitForTimeout(300);
  await synchroniser(julie.page);
  verifier('Commercial : sa signature ne touche pas l\'onglet Réglages de l\'équipe', !reglagesDuTableau()['Votre signature'] && !JSON.stringify(tableau().onglets.get('Réglages').lignes).includes('Julie Martin'));
  await capture(julie, 'e2e-4-reglages-commercial');

  // Tous les contacts et droits
  await julie.page.click('[data-retour]:visible');
  await attendreEcran(julie.page, 'accueil');
  verifier('Commercial : Pris par affiché dans la liste', (await textes(julie.page, '#liste-derniers .contact__info')).some((t) => t.includes('pris par Julie')));
  await julie.page.click('#bouton-tous-contacts');
  await attendreEcran(julie.page, 'contacts');
  const tousJulieDefaut = await textesAttendus(julie.page, '#liste-tous .contact__nom', 'Alain Bernard');
  verifier('Tous les contacts (commercial) : ses contacts par défaut', tousJulieDefaut === 'Alain Bernard', tousJulieDefaut);
  await julie.page.selectOption('#filtre-membre', '');
  await julie.page.waitForTimeout(200);
  verifier('Tous les contacts : « Toute l\'équipe »', (await textes(julie.page, '#liste-tous .contact__nom')).sort().join() === 'Alain Bernard,Marie Dupont');
  verifier('Droits : pas de corbeille sur le contact du responsable', (await julie.page.$$('#liste-tous .corbeille')).length === 1);
  await julie.page.click('#liste-tous li:has-text("Marie Dupont") .contact-bouton');
  await attendreEcran(julie.page, 'fiche');
  verifier('Droits : fiche du responsable en lecture seule', (await julie.page.$eval('#fiche-nom', (e) => e.readOnly)) && !(await visible(julie.page, '#fiche-enregistrer')) && !(await visible(julie.page, '#fiche-supprimer')) && (await visible(julie.page, '#fiche-lecture-seule')));
  verifier('Fiche : « pris par Nicolas »', (await julie.page.textContent('#fiche-date')).includes('pris par Nicolas'));
  await julie.page.click('#fiche-retour');

  // ===== 4. Vue responsable =====
  await nico.page.click('[data-retour]:visible');
  await nico.page.click('#bouton-reglages'); await attendreEcran(nico.page, 'reglages');
  await synchroniser(nico.page);
  await nico.page.click('[data-retour]:visible'); await attendreEcran(nico.page, 'accueil');
  const compteurs = await textes(nico.page, '#compteurs-equipe li');
  verifier('Accueil responsable : compteurs par commercial', compteurs.join(' | ') === 'Nicolas1 aujourd\'hui · 1 au total | Julie1 aujourd\'hui · 1 au total', compteurs.join(' | '));
  verifier('Accueil responsable : total de l\'équipe', (await nico.page.textContent('#chiffre-total')) === '2' && (await nico.page.textContent('#libelle-total')).includes('équipe'));
  await capture(nico, 'e2e-5-accueil-responsable');
  await nico.page.click('#bouton-tous-contacts'); await attendreEcran(nico.page, 'contacts');
  await nico.page.selectOption('#filtre-membre', 'julie.martin@exemple.com');
  await nico.page.waitForTimeout(200);
  verifier('Tous les contacts (responsable) : filtre par commercial', (await textes(nico.page, '#liste-tous .contact__nom')).join() === 'Alain Bernard');
  await nico.page.click('#liste-tous li:has-text("Alain Bernard") .contact-bouton');
  await attendreEcran(nico.page, 'fiche');
  verifier('Droits : le responsable modifie le contact du commercial', await visible(nico.page, '#fiche-enregistrer'));
  await nico.page.fill('#fiche-note', 'rappeler en décembre, devis envoyé');
  await nico.page.click('#fiche-enregistrer');
  await nico.page.waitForTimeout(300);
  await nico.page.click('[data-retour]:visible').catch(() => {});
  await nico.page.click('#bouton-reglages'); await attendreEcran(nico.page, 'reglages');
  await synchroniser(nico.page);
  verifier('Modification par le responsable : ligne retrouvée par Id', lignesContacts().find((l) => l[3] === 'Alain Bernard')[8] === 'rappeler en décembre, devis envoyé');

  // ===== 5. Relances par commercial =====
  const ilYA3Jours = new Date(Date.now() - 3 * 86400000).toISOString();
  const contacts = tableau().onglets.get('Contacts').lignes;
  contacts.push(['r-julie', ilYA3Jours, 'Julie', 'Sophie Laurent', 'Laurent SA', 'sophie@exemple.com', '', '', 'catalogue', '', 'Vérifié dans l\'appli', '', '', '', 'julie.martin@exemple.com']);
  contacts.push(['r-nico', ilYA3Jours, 'Nicolas', 'Bernard Petit', 'Petit SARL', 'bernard@exemple.com', '', '', '', '', 'Vérifié dans l\'appli', '', '', '', 'nicolas@exemple.com']);
  await synchroniser(julie.page.isClosed() ? nico.page : (await julie.page.click('#bouton-reglages').catch(() => {}), julie.page));
  await julie.page.click('[data-retour]:visible'); await attendreEcran(julie.page, 'accueil');
  await julie.page.click('#bouton-a-relancer'); await attendreEcran(julie.page, 'relancer');
  await julie.page.waitForTimeout(300);
  verifier('Relances du commercial : seulement les siennes', (await textes(julie.page, '#liste-relancer .contact__nom')).join() === 'Sophie Laurent');
  verifier('Relances du commercial : pas de filtre équipe', !(await visible(julie.page, '#filtre-relances')));
  const corpsJulie = decodeURIComponent(await julie.page.getAttribute('#liste-relancer a.bouton', 'href'));
  verifier('Relances du commercial : sa propre signature', corpsJulie.endsWith('Bien cordialement,\r\nJulie Martin\r\nAteliers Dupont'), corpsJulie.slice(-80));
  await nico.page.click('[data-retour]:visible'); await attendreEcran(nico.page, 'accueil');
  await nico.page.click('#bouton-reglages'); await attendreEcran(nico.page, 'reglages');
  await synchroniser(nico.page);
  await nico.page.click('[data-retour]:visible'); await attendreEcran(nico.page, 'accueil');
  const aRelancerNico = await textesAttendus(nico.page, '#compte-a-relancer', '1');
  verifier('Accueil responsable : compteur À relancer = ses relances', aRelancerNico === '1', aRelancerNico);
  await nico.page.click('#bouton-a-relancer'); await attendreEcran(nico.page, 'relancer');
  await nico.page.waitForTimeout(300);
  verifier('Relances du responsable : les siennes', (await textes(nico.page, '#liste-relancer .contact__nom')).join() === 'Bernard Petit');
  await nico.page.click('#filtre-relances [data-portee=equipe]');
  await nico.page.waitForTimeout(300);
  verifier('Relances du responsable : « Toute l\'équipe »', (await textes(nico.page, '#liste-relancer .contact__nom')).join() === 'Sophie Laurent,Bernard Petit' || (await textes(nico.page, '#liste-relancer .contact__nom')).sort().join() === 'Bernard Petit,Sophie Laurent');
  verifier('Relances « Toute l\'équipe » : pris par', (await textes(nico.page, '#liste-relancer .contact__info')).some((t) => t.includes('pris par Julie')));
  await capture(nico, 'e2e-6-relances-equipe');

  // ===== 6. Hors connexion des deux côtés, écritures concurrentes =====
  await julie.ctx.setOffline(true);
  await nico.ctx.setOffline(true);
  await julie.page.click('[data-retour]:visible').catch(() => {});
  await attendreEcran(julie.page, 'accueil');
  await saisirSansCarte(julie.page, { nom: 'Hugo Leroy', email: 'hugo@exemple.com' });
  await nico.page.click('[data-retour]:visible'); await attendreEcran(nico.page, 'accueil');
  await saisirSansCarte(nico.page, { nom: 'Inès Moreau', email: 'ines@exemple.com' });
  verifier('Mode avion : contacts gardés sur les téléphones', (await nico.page.isVisible('#pastille-attente')) && (await julie.page.isVisible('#pastille-attente')));
  // Le responsable supprime (hors connexion) le contact Sophie du commercial
  await nico.page.click('#bouton-tous-contacts'); await attendreEcran(nico.page, 'contacts');
  await nico.page.click('#liste-tous li:has-text("Sophie Laurent") .contact-bouton'); await attendreEcran(nico.page, 'fiche');
  await nico.page.click('#fiche-supprimer');
  await nico.page.click('#confirmation-oui');
  await nico.page.waitForTimeout(300);
  await julie.ctx.setOffline(false);
  await nico.ctx.setOffline(false);
  await julie.page.click('#bouton-reglages'); await attendreEcran(julie.page, 'reglages');
  await nico.page.click('#bouton-reglages').catch(async () => { await nico.page.click('[data-retour]:visible'); await nico.page.click('#bouton-reglages'); });
  await attendreEcran(nico.page, 'reglages');
  await Promise.all([synchroniser(julie.page), synchroniser(nico.page)]);
  await synchroniser(julie.page);
  const noms = lignesContacts().map((l) => l[3]);
  verifier('Retour du réseau : les deux contacts ajoutés, une seule fois', noms.filter((n) => n === 'Hugo Leroy').length === 1 && noms.filter((n) => n === 'Inès Moreau').length === 1, noms.join());
  verifier('Retour du réseau : suppression du responsable appliquée (ligne retrouvée par Id)', !noms.includes('Sophie Laurent') && noms.includes('Bernard Petit') && noms.includes('Alain Bernard'), noms.join());

  // ===== 6 bis. Suppression par le responsable d'un contact pris (et donc gardé en local) par le commercial =====
  const nomBase = await julie.page.evaluate(async () => (await import(new URL('js/environnement.js', location.href).href)).ENV.nomBase);
  const contactsLocaux = (page) => page.evaluate((nom) => new Promise((ok, ko) => {
    const d = indexedDB.open(nom);
    d.onsuccess = () => { const r = d.result.transaction('contacts').objectStore('contacts').getAll(); r.onsuccess = () => ok(r.result.map((c) => ({ id: c.id, nom: c.nom, etat: c.etat }))); };
    d.onerror = () => ko(d.error);
  }), nomBase);
  // Contact pas encore envoyé chez le commercial (en erreur, absent du tableau) : ne doit jamais être retiré
  await julie.page.evaluate((nom) => new Promise((ok) => {
    const d = indexedDB.open(nom);
    d.onsuccess = () => { const t = d.result.transaction('contacts', 'readwrite'); t.objectStore('contacts').put({ id: 'pas-envoye', creeLe: new Date().toISOString(), nom: 'Paul Attente', statut: 'Vérifié dans l\'appli', etat: 'erreur', essais: 3 }); t.oncomplete = ok; };
  }), nomBase);
  verifier('Avant suppression : Hugo Leroy gardé en local chez le commercial', (await contactsLocaux(julie.page)).some((c) => c.nom === 'Hugo Leroy' && c.etat === 'ecrit'));
  await nico.page.click('[data-retour]:visible'); await attendreEcran(nico.page, 'accueil');
  await nico.page.click('#bouton-tous-contacts'); await attendreEcran(nico.page, 'contacts');
  await nico.page.selectOption('#filtre-membre', '');
  await nico.page.waitForTimeout(200);
  await nico.page.click('#liste-tous li:has-text("Hugo Leroy") .contact-bouton'); await attendreEcran(nico.page, 'fiche');
  await nico.page.click('#fiche-supprimer');
  await nico.page.click('#confirmation-oui');
  await nico.page.waitForTimeout(300);
  await nico.page.click('[data-retour]:visible').catch(() => {});
  await nico.page.click('#bouton-reglages').catch(async () => { await nico.page.click('[data-retour]:visible'); await nico.page.click('#bouton-reglages'); });
  await attendreEcran(nico.page, 'reglages');
  await synchroniser(nico.page);
  verifier('Suppression par le responsable : ligne retirée du tableau', !lignesContacts().some((l) => l[3] === 'Hugo Leroy'));
  await synchroniser(julie.page);
  const locauxJulie = await contactsLocaux(julie.page);
  verifier('Synchro du commercial : contact supprimé retiré de sa base locale', !locauxJulie.some((c) => c.nom === 'Hugo Leroy'), JSON.stringify(locauxJulie));
  verifier('Synchro du commercial : contact pas encore envoyé gardé', locauxJulie.some((c) => c.id === 'pas-envoye'));
  verifier('Synchro du commercial : contacts encore dans le tableau gardés', locauxJulie.some((c) => c.nom === 'Alain Bernard'));
  await julie.page.click('[data-retour]:visible'); await attendreEcran(julie.page, 'accueil');
  await julie.page.waitForTimeout(300);
  verifier('Accueil du commercial : compteur sans le contact supprimé', (await julie.page.textContent('#chiffre-total')) === '2', await julie.page.textContent('#chiffre-total'));
  await julie.page.click('#bouton-tous-contacts'); await attendreEcran(julie.page, 'contacts');
  await julie.page.waitForTimeout(300);
  const tousJulie = await textes(julie.page, '#liste-tous .contact__nom');
  verifier('Tous les contacts du commercial : plus de Hugo Leroy', !tousJulie.includes('Hugo Leroy') && tousJulie.includes('Alain Bernard'), tousJulie.join());
  // Le contact factice ne doit pas gêner la suite (retrait du commercial)
  await julie.page.evaluate((nom) => new Promise((ok) => {
    const d = indexedDB.open(nom);
    d.onsuccess = () => { const t = d.result.transaction('contacts', 'readwrite'); t.objectStore('contacts').delete('pas-envoye'); t.oncomplete = ok; };
  }), nomBase);
  await julie.page.click('[data-retour]:visible'); await attendreEcran(julie.page, 'accueil');
  await julie.page.click('#bouton-reglages'); await attendreEcran(julie.page, 'reglages');
  await nico.page.click('[data-retour]:visible').catch(() => {});
  await attendreEcran(nico.page, 'accueil');
  await nico.page.click('#bouton-reglages'); await attendreEcran(nico.page, 'reglages');

  // ===== 7. Retrait du commercial =====
  await nico.page.click('#bouton-mon-equipe'); await attendreEcran(nico.page, 'equipe');
  await nico.page.click('#liste-membres li:has-text("Julie") button');
  verifier('Retrait : confirmation demandée', (await nico.page.textContent('#confirmation-texte')).startsWith('Retirer Julie de l\'équipe ?') && (await nico.page.textContent('#confirmation-oui')) === 'Retirer');
  await nico.page.click('#confirmation-oui');
  await nico.page.waitForTimeout(800);
  verifier('Retrait : partage du tableau supprimé', !tableau().permissions.some((p) => p.emailAddress === 'julie.martin@exemple.com'));
  verifier('Retrait : partage du dossier supprimé', !dossierNico.permissions.some((p) => p.emailAddress === 'julie.martin@exemple.com'));
  verifier('Retrait : ligne de l\'onglet Équipe supprimée', !tableau().onglets.get('Équipe').lignes.some((l) => l[0] === 'julie.martin@exemple.com'));
  verifier('Retrait : ses contacts restent dans le tableau', lignesContacts().some((l) => l[3] === 'Alain Bernard'));
  await julie.page.click('#bouton-synchroniser');
  await attendreEcran(julie.page, 'activation');
  verifier('Retrait : le commercial retombe sur l\'écran d\'activation', true);
  verifier('Retrait : message clair', (await bandeauErreur(julie.page)).startsWith('Vous n\'avez plus accès au carnet de votre équipe'), await bandeauErreur(julie.page));
  const restes = await julie.page.evaluate(() => new Promise((ok) => { const d = indexedDB.open(window.__nomBaseTest || 'carnet'); d.onsuccess = () => { const g = d.result.transaction('reglages').objectStore('reglages').getAll(); g.onsuccess = () => ok(g.result.map((r) => r.cle)); }; }));
  verifier('Retrait : réglages et copie du tableau d\'équipe effacés du téléphone', !restes.includes('_lignes') && !restes.includes('_idTableau'), restes.join());
  await capture(julie, 'e2e-7-retrait');

  // ===== 8. Un intrus qui ouvre le lien est refusé =====
  const intrus = await personne('intrus@exemple.com', 'intrus');
  await intrus.page.goto(APPLI + new URL(lien).search);
  await attendreEcran(intrus.page, 'rejoindre');
  await intrus.page.click('#bouton-rejoindre-connexion');
  await intrus.page.waitForSelector('#bouton-choisir-carnet:not([hidden])');
  await intrus.page.click('#bouton-choisir-carnet');
  await intrus.page.waitForTimeout(800);
  verifier('Intrus : refusé (pas de partage)', (await visible(intrus.page, '#ecran-rejoindre')) && (await bandeauErreur(intrus.page)).length > 0, await bandeauErreur(intrus.page));

  // ===== 9. Solo inchangé =====
  const solo = await personne('solo@exemple.com', 'solo');
  await solo.page.goto(APPLI);
  await attendreEcran(solo.page, 'activation');
  await solo.page.click('#bouton-essai-gratuit');
  await attendreEcran(solo.page, 'connexion');
  await solo.page.click('#bouton-connexion');
  await attendreEcran(solo.page, 'reglages');
  verifier('Solo : pas de champ prénom ni « Mon équipe »', !(await visible(solo.page, '#reg-nom-bloc')) && !(await visible(solo.page, '#bouton-mon-equipe')));
  await solo.page.fill('#reg-salon', 'Salon solo');
  await solo.page.click('#formulaire-reglages button[type=submit]');
  await attendreEcran(solo.page, 'accueil');
  await saisirSansCarte(solo.page, { nom: 'Luc Solo', email: 'luc@exemple.com' });
  await solo.page.click('#bouton-reglages'); await attendreEcran(solo.page, 'reglages');
  await synchroniser(solo.page);
  await solo.page.waitForTimeout(300);
  const signalSolo = signauxOptimisons.find((x) => x.email === 'solo@exemple.com' && x.type === 'essai');
  verifier('Signal : essai envoyé à Optimisons.ai après connexion (e-mail, début, relance, version, jeton), sans contact',
    !!signalSolo && signalSolo.relance === true && !!signalSolo.debut && !!signalSolo.jeton && !!signalSolo.version
      && 'salon' in signalSolo && 'entreprise' in signalSolo && !('nom' in signalSolo) && !('contacts' in signalSolo), JSON.stringify(signalSolo));
  const tSolo = [...fichiers.values()].find((f) => f.onglets && f.owner === 'solo@exemple.com');
  const lSolo = tSolo.onglets.get('Contacts').lignes[1];
  verifier('Solo : ligne écrite comme avant (Pris par = e-mail)', lSolo[3] === 'Luc Solo' && lSolo[2] === 'solo@exemple.com', JSON.stringify(lSolo));
  verifier('Solo : pas d\'onglet Équipe ni de Mode', !tSolo.onglets.has('Équipe') && !tSolo.onglets.get('Réglages').lignes.some((l) => l[0] === 'Mode'));
  await solo.page.click('[data-retour]:visible'); await attendreEcran(solo.page, 'accueil');
  verifier('Solo : pas de « pris par » ni de compteurs d\'équipe', !(await textes(solo.page, '#liste-derniers .contact__info')).some((t) => t.includes('pris par')) && !(await visible(solo.page, '#compteurs-equipe')));
  // Solo : ligne supprimée directement dans Google Sheets, retirée du téléphone à la synchronisation suivante
  verifier('Solo : contact gardé en local après envoi', (await contactsLocaux(solo.page)).some((c) => c.nom === 'Luc Solo' && c.etat === 'ecrit'));
  tSolo.onglets.get('Contacts').lignes.splice(1, 1);
  await solo.page.click('#bouton-reglages'); await attendreEcran(solo.page, 'reglages');
  await synchroniser(solo.page);
  verifier('Solo : ligne supprimée dans le tableau, contact retiré du téléphone', !(await contactsLocaux(solo.page)).some((c) => c.nom === 'Luc Solo'));
  await solo.page.click('[data-retour]:visible'); await attendreEcran(solo.page, 'accueil');
  await solo.page.waitForTimeout(300);
  verifier('Solo : accueil sans le contact supprimé', !(await textes(solo.page, '#liste-derniers .contact__nom')).includes('Luc Solo') && (await solo.page.textContent('#chiffre-total')) === '0');

  // Synchroniser maintenant : retour dans le bouton (Synchronisation… puis Synchronisé), pas de bulle en plus
  await solo.page.click('#bouton-reglages'); await attendreEcran(solo.page, 'reglages');
  await solo.page.evaluate(() => {
    window.__libellesSynchro = [];
    const b = document.getElementById('bouton-synchroniser');
    new MutationObserver(() => window.__libellesSynchro.push(b.textContent + (b.disabled ? ' (désactivé)' : ''))).observe(b, { childList: true, characterData: true, subtree: true, attributes: true });
  });
  await solo.page.click('#bouton-synchroniser');
  const synchronise = await solo.page.waitForFunction(() => document.getElementById('bouton-synchroniser').textContent === 'Synchronisé', null, { timeout: 8000 }).then(() => true, () => false);
  const libelles = await solo.page.evaluate(() => window.__libellesSynchro.join(' | '));
  verifier('Synchroniser maintenant : « Synchronisation… » (désactivé) puis « Synchronisé »', synchronise && libelles.includes('Synchronisation… (désactivé)'), libelles);
  verifier('Synchroniser maintenant : pas de bulle « Synchronisation lancée »', !(await solo.page.textContent('#message')).includes('Synchronisation lancée'));
  verifier('Synchroniser maintenant : libellé remis après quelques secondes', await solo.page.waitForFunction(() => { const b = document.getElementById('bouton-synchroniser'); return b.textContent === 'Synchroniser maintenant' && !b.disabled; }, null, { timeout: 6000 }).then(() => true, () => false));
  await solo.page.click('[data-retour]:visible'); await attendreEcran(solo.page, 'accueil');

  // ===== 9 bis. Essai en cours → Solo (écran Essai) → Équipe (Réglages), sans réinstaller =====
  const ess = await personne('essai@exemple.com', 'essai');
  await ess.page.goto(APPLI);
  await attendreEcran(ess.page, 'activation');
  await ess.page.click('#bouton-essai-gratuit');
  await attendreEcran(ess.page, 'connexion');
  await ess.page.click('#bouton-connexion');
  await attendreEcran(ess.page, 'reglages');
  verifier('Essai : « Saisir un autre code » proposé dans Réglages', await visible(ess.page, '#bouton-autre-code'));
  await ess.page.fill('#reg-salon', 'Salon essai');
  await ess.page.click('#formulaire-reglages button[type=submit]');
  await attendreEcran(ess.page, 'accueil');
  await saisirSansCarte(ess.page, { nom: 'Anne Essai', email: 'anne@exemple.com' });
  await ess.page.click('#bouton-reglages'); await attendreEcran(ess.page, 'reglages');
  await synchroniser(ess.page);
  const tEssai = () => [...fichiers.values()].find((f) => f.onglets && f.owner === 'essai@exemple.com' && !f.trashed);
  const idTableauEssai = tEssai().id;
  await ess.page.click('[data-retour]:visible'); await attendreEcran(ess.page, 'accueil');
  const texteEssai = await ess.page.textContent('#pastille-essai');
  verifier('Essai en cours : la pastille invite à saisir un code', /^Essai jusqu'au .+ : toucher pour saisir un code$/.test(texteEssai.trim()), texteEssai);
  await ess.page.click('#pastille-essai');
  await attendreEcran(ess.page, 'essai');
  verifier('Essai en cours : écran Essai « en cours », pas « terminé »', (await ess.page.textContent('#essai-titre')) === 'Votre essai est en cours.' && (await ess.page.textContent('#essai-texte')).startsWith('Il se termine le '), await ess.page.textContent('#essai-titre'));
  await ess.page.fill('#champ-code-essai', CODES_TEST.solo.toLowerCase());
  await ess.page.click('#formulaire-code-essai button[type=submit]');
  await attendreEcran(ess.page, 'accueil');
  await ess.page.waitForTimeout(300);
  verifier('Essai → Solo : pastille d\'essai disparue', !(await visible(ess.page, '#pastille-essai')));
  await ess.page.click('#bouton-reglages'); await attendreEcran(ess.page, 'reglages');
  await ess.page.waitForTimeout(300);
  verifier('Essai → Solo : Réglages, code acheté', (await ess.page.textContent('#reg-code')) === CODES_TEST.solo + ' · acheté', await ess.page.textContent('#reg-code'));
  verifier('Solo : « Saisir un autre code » visible, champ replié', (await visible(ess.page, '#bouton-autre-code')) && !(await visible(ess.page, '#formulaire-autre-code')));
  await ess.page.click('#bouton-autre-code');
  verifier('Autre code : même placeholder que l\'écran d\'activation', (await ess.page.getAttribute('#champ-autre-code', 'placeholder')) === (await ess.page.getAttribute('#champ-code', 'placeholder')));
  await ess.page.fill('#champ-autre-code', 'CDS-ZZZZ-ZZZZ');
  await ess.page.click('#bouton-activer-autre-code');
  await ess.page.waitForSelector('#autre-code-erreur:not([hidden])', { timeout: 3000 });
  verifier('Autre code : code inconnu, erreur sous le champ', (await ess.page.textContent('#autre-code-erreur')).startsWith('Code inconnu'));
  await ess.page.fill('#champ-autre-code', CODES_TEST.equipe);
  await ess.page.click('#bouton-activer-autre-code');
  verifier('Solo → Équipe : « Mon équipe » apparaît sans réinstaller', await ess.page.waitForSelector('#bouton-mon-equipe:not([hidden])', { timeout: 5000 }).then(() => true, () => false));
  verifier('Solo → Équipe : message de confirmation', (await ess.page.textContent('#message')).startsWith('Code Équipe activé : vous êtes responsable'), await ess.page.textContent('#message'));
  verifier('Solo → Équipe : Réglages, code masqué et prénom', /^CDE-••••-EQPE · Équipe, vous êtes responsable$/.test(await ess.page.textContent('#reg-code')) && (await visible(ess.page, '#reg-nom-bloc')), await ess.page.textContent('#reg-code'));
  verifier('Responsable : « Saisir un autre code » caché', !(await visible(ess.page, '#reg-autre-code')));
  await ess.page.fill('#reg-nom', 'Anne');
  await ess.page.click('#formulaire-reglages button[type=submit]');
  await ess.page.waitForTimeout(500);
  await synchroniser(ess.page);
  await synchroniser(ess.page);
  const regEssai = Object.fromEntries(tEssai().onglets.get('Réglages').lignes.slice(1).map((l) => [l[0], l[1]]));
  verifier('Solo → Équipe : même tableau, pas de nouveau tableau', tEssai().id === idTableauEssai && [...fichiers.values()].filter((f) => f.onglets && f.owner === 'essai@exemple.com').length === 1);
  verifier('Solo → Équipe : tableau en mode Équipe (Mode, Responsable, Code équipe)', regEssai['Mode'] === 'Équipe' && regEssai['Responsable'] === 'essai@exemple.com' && regEssai['Code équipe'] === empreinteDe(CODES_TEST.equipe), JSON.stringify(regEssai));
  verifier('Solo → Équipe : code masqué dans le tableau', regEssai['Code d\'activation'] === 'CDE-••••-EQPE', regEssai['Code d\'activation']);
  const eqEssai = tEssai().onglets.get('Équipe');
  verifier('Solo → Équipe : onglet Équipe avec le responsable', !!eqEssai && eqEssai.lignes[1][0] === 'essai@exemple.com' && eqEssai.lignes[1][1] === 'Anne' && eqEssai.lignes[1][2] === 'responsable', eqEssai && JSON.stringify(eqEssai.lignes));
  verifier('Solo → Équipe : contact d\'avant conservé (tableau et téléphone)', tEssai().onglets.get('Contacts').lignes.some((l) => l[3] === 'Anne Essai') && (await contactsLocaux(ess.page)).some((c) => c.nom === 'Anne Essai'));
  await ess.page.click('[data-retour]:visible'); await attendreEcran(ess.page, 'accueil');
  await ess.page.waitForTimeout(300);
  verifier('Solo → Équipe : compteurs d\'équipe sur l\'accueil, contact d\'avant compté', (await visible(ess.page, '#compteurs-equipe')) && (await ess.page.textContent('#chiffre-total')) === '1');
  await ess.page.click('#bouton-reglages'); await attendreEcran(ess.page, 'reglages');
  await ess.page.click('#bouton-mon-equipe');
  await attendreEcran(ess.page, 'equipe');
  const membresEssai = await textesAttendus(ess.page, '#liste-membres .contact__nom', 'Anne');
  verifier('Solo → Équipe : Mon équipe liste le responsable', membresEssai === 'Anne', membresEssai);
  await capture(ess, 'e2e-9-solo-vers-equipe');

  // ===== 10. Isolation de la version de test =====
  if (CHEMIN.includes('equipe-test')) {
    const cles = await nico.page.evaluate(() => Object.keys(localStorage));
    verifier('Version de test : clés localStorage préfixées equipeTest_', cles.length > 0 && cles.every((c) => c.startsWith('equipeTest_')), cles.join());
    const sessions = await nico.page.evaluate(() => Object.keys(sessionStorage));
    verifier('Version de test : clés sessionStorage préfixées', sessions.every((c) => c.startsWith('equipeTest_')), sessions.join());
    const bases = await nico.page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name));
    verifier('Version de test : base IndexedDB carnet-equipe-test seule', bases.join() === 'carnet-equipe-test', bases.join());
    verifier('Version de test : bandeau « VERSION DE TEST »', (await visible(nico.page, '#bandeau-test')) && (await nico.page.textContent('#bandeau-test')) === 'VERSION DE TEST');
  } else {
    verifier('Production : pas de bandeau de test', !(await visible(nico.page, '#bandeau-test')));
  }
} catch (e) {
  rouges.push('Arrêt : ' + e.message.split('\n')[0]);
  console.log('ARRÊT', e.stack);
}

const pertinentes = erreursConsole.filter((e) => !/ERR_FAILED|ERR_INTERNET_DISCONNECTED|Failed to load resource|net::/.test(e));
verifier('Aucune erreur dans la console', pertinentes.length === 0, pertinentes.join(' / '));
console.log('\nBilan : ' + verts + ' / ' + (verts + rouges.length) + (rouges.length ? ' (ÉCHEC)' : ' verts'));
rouges.forEach((r) => console.log('  ROUGE ' + r));
await navigateur.close();
serveur.close();
process.exit(rouges.length ? 1 : 0);
