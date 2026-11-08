/**
 * Carnet de salon · Ventes · Optimisons.ai · L'IA, simplement.
 *
 * Toutes les minutes, demande à Stripe les paiements terminés des liens de paiement Carnet de salon (Solo et Équipe),
 * et pour chaque paiement nouveau : prend le prochain code libre du bon type dans la feuille « Codes »
 * (achat pour le lien Solo, equipe pour le lien Équipe), l'envoie par e-mail au client et le marque vendu.
 * Pas de webhook, pas d'adresse publique : le script interroge Stripe avec une clé en lecture seule.
 *
 * Copie de référence du projet Apps Script « Carnet de salon · Ventes » (à recopier à la main dans l'éditeur).
 * Propriétés du script (Paramètres du projet > Propriétés du script) :
 *   STRIPE_CLE               clé restreinte Stripe, droit « Lecture » sur Checkout Sessions uniquement
 *   LIEN_PAIEMENT_ID         identifiant du lien de paiement Solo (plink_...)
 *   LIEN_PAIEMENT_ID_EQUIPE  identifiant du lien de paiement Équipe (plink_...), facultatif tant qu'il n'existe pas
 *   FEUILLE_ID               identifiant du Google Sheet « Carnet de salon · Codes » (rempli par initialiser())
 *   EXPEDITEUR               nm@optimisons.ai (utilisé seulement s'il existe en alias « Envoyer en tant que » dans Gmail)
 *   COPIE                    kodem71@gmail.com (copie cachée de chaque envoi, et alertes)
 * Codes Équipe : lignes Type = equipe, Statut = libre (CSV produit par node outils/codes.js equipe 10).
 */

const ONGLET_CODES = 'Codes';
const ONGLET_JOURNAL = 'Journal';
const ENTETES_CODES = ['Code', 'Type', 'Statut', 'E-mail client', 'Date', 'Identifiant Stripe', 'Entreprise'];
const LIEN_APPLI = 'https://app.optimisons.ai';
const FENETRE_HEURES = 48; // on relit les paiements des 48 dernières heures (rattrape une panne)

/* ---------- Installation ---------- */

/** À lancer une fois : crée la feuille des codes (si besoin) et le déclencheur toutes les minutes. */
function initialiser() {
  const P = PropertiesService.getScriptProperties();
  if (!P.getProperty('FEUILLE_ID')) {
    const ss = SpreadsheetApp.create('Carnet de salon · Codes');
    const codes = ss.getSheets()[0];
    codes.setName(ONGLET_CODES);
    codes.getRange(1, 1, 1, ENTETES_CODES.length).setValues([ENTETES_CODES]).setFontWeight('bold');
    codes.setFrozenRows(1);
    const journal = ss.insertSheet(ONGLET_JOURNAL);
    journal.getRange(1, 1, 1, 4).setValues([['Date', 'Session Stripe', 'E-mail', 'Résultat']]).setFontWeight('bold');
    journal.setFrozenRows(1);
    P.setProperty('FEUILLE_ID', ss.getId());
    Logger.log('Feuille créée : ' + ss.getUrl());
  }
  const existe = ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'verifierVentes');
  if (!existe) ScriptApp.newTrigger('verifierVentes').timeBased().everyMinutes(1).create();
  Logger.log('Déclencheur actif : verifierVentes toutes les minutes.');
}

/** Coupe l'automatisation (après le salon, ou en cas de souci). */
function arreter() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'verifierVentes')
    .forEach(t => ScriptApp.deleteTrigger(t));
  Logger.log('Déclencheur supprimé.');
}

/** Test sans paiement : envoie le prochain code Solo libre à l'adresse COPIE, sans le marquer vendu. */
function testerEnvoi() {
  testerEnvoiType_('achat');
}

/** Test sans paiement : envoie le prochain code Équipe libre à l'adresse COPIE, sans le marquer vendu. */
function testerEnvoiEquipe() {
  testerEnvoiType_('equipe');
}

function testerEnvoiType_(type) {
  const ligne = prochainCodeLibre_(type);
  if (!ligne) { Logger.log('Aucun code ' + type + ' libre dans la feuille.'); return; }
  envoyerCode_(PropertiesService.getScriptProperties().getProperty('COPIE'), ligne.code, 'Test', type);
  Logger.log('E-mail de test envoyé avec le code ' + ligne.code + ' (le code reste libre).');
}

/* ---------- Traitement des ventes ---------- */

/** Lancée toutes les minutes par le déclencheur. */
function verifierVentes() {
  const verrou = LockService.getScriptLock();
  if (!verrou.tryLock(5000)) return; // un passage est déjà en cours
  try {
    const sessions = sessionsPayees_();
    sessions.forEach(traiterSession_);
  } catch (err) {
    alerterUneFoisParHeure_('Erreur dans le script de vente', String(err));
  } finally {
    verrou.releaseLock();
  }
}

/** Une session payée : un code du bon type (achat ou equipe), une seule fois. */
function traiterSession_(session) {
  const id = session.id;
  if (dejaTraitee_(id)) return;
  const type = session.typeCode_ || 'achat';
  const email = (session.customer_details && session.customer_details.email) || '';
  const entreprise = champPerso_(session, 'entreprise') || (session.customer_details && session.customer_details.business_name) || '';
  try {
    const ligne = prochainCodeLibre_(type);
    if (!ligne) {
      alerter_('Plus aucun code ' + type + ' libre', 'Paiement ' + (type === 'equipe' ? 'Équipe' : 'Solo') + ' reçu de ' + email + ' (' + entreprise + '), session ' + id + '.\nEnvoyez-lui un code ' + type + ' à la main, puis ajoutez des codes dans la feuille et marquez celui envoyé comme vendu avec cette session.');
      journal_(id, email, 'ÉCHEC : plus de code ' + type + ' libre, alerte envoyée');
      return;
    }
    marquerVendu_(ligne.rang, email, id, entreprise); // d'abord marquer : jamais deux codes pour un paiement
    envoyerCode_(email, ligne.code, entreprise, type);
    journal_(id, email, 'Code ' + type + ' envoyé : ' + ligne.code);
  } catch (err) {
    alerter_('Erreur à l\'envoi d\'un code', 'Session : ' + id + '\nClient : ' + email + '\nType : ' + type + '\nErreur : ' + err + '\nVérifiez la feuille des codes et envoyez le code à la main si besoin.');
    journal_(id, email, 'ERREUR : ' + err);
  }
}

/* ---------- Stripe ---------- */

/** Sessions Checkout terminées et payées sur la fenêtre récente, pour les liens Solo et Équipe (typeCode_ noté). */
function sessionsPayees_() {
  const P = PropertiesService.getScriptProperties();
  const cle = P.getProperty('STRIPE_CLE');
  const lienSolo = P.getProperty('LIEN_PAIEMENT_ID');
  const lienEquipe = P.getProperty('LIEN_PAIEMENT_ID_EQUIPE');
  if (!cle || !lienSolo) throw new Error('Propriétés STRIPE_CLE ou LIEN_PAIEMENT_ID manquantes');
  let resultat = sessionsDuLien_(cle, lienSolo, 'achat');
  if (lienEquipe) resultat = resultat.concat(sessionsDuLien_(cle, lienEquipe, 'equipe'));
  return resultat;
}

/** Sessions payées d'un lien de paiement, marquées du type de code à envoyer. */
function sessionsDuLien_(cle, lien, type) {
  const depuis = Math.floor(Date.now() / 1000) - FENETRE_HEURES * 3600;
  const resultat = [];
  let apres = '';
  for (let page = 0; page < 10; page++) {
    let url = 'https://api.stripe.com/v1/checkout/sessions?limit=100&status=complete'
      + '&payment_link=' + encodeURIComponent(lien)
      + '&created[gte]=' + depuis;
    if (apres) url += '&starting_after=' + encodeURIComponent(apres);
    const rep = UrlFetchApp.fetch(url, { headers: { Authorization: 'Bearer ' + cle }, muteHttpExceptions: true });
    if (rep.getResponseCode() !== 200) throw new Error('Stripe a répondu ' + rep.getResponseCode() + ' : ' + rep.getContentText().slice(0, 300));
    const corps = JSON.parse(rep.getContentText());
    corps.data.forEach(s => { if (s.payment_status === 'paid') { s.typeCode_ = type; resultat.push(s); } });
    if (!corps.has_more || !corps.data.length) break;
    apres = corps.data[corps.data.length - 1].id;
  }
  return resultat;
}

/** Valeur d'un champ personnalisé du lien de paiement (clé Stripe, ex. « entreprise »). */
function champPerso_(session, cle) {
  const c = (session.custom_fields || []).find(f => f.key === cle);
  return c && c.text && c.text.value ? String(c.text.value) : '';
}

/* ---------- Feuille des codes ---------- */

function feuille_() {
  return SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('FEUILLE_ID'));
}

/** Première ligne du type demandé (achat ou equipe) avec Statut = libre. */
function prochainCodeLibre_(type) {
  const voulu = type || 'achat';
  const sh = feuille_().getSheetByName(ONGLET_CODES);
  const n = sh.getLastRow() - 1;
  if (n < 1) return null;
  const data = sh.getRange(2, 1, n, ENTETES_CODES.length).getValues();
  for (let i = 0; i < data.length; i++) {
    if (data[i][0] && String(data[i][1]).trim() === voulu && String(data[i][2]).trim() === 'libre') {
      return { rang: i + 2, code: String(data[i][0]).trim() };
    }
  }
  return null;
}

/** Vrai si la session Stripe figure déjà dans la feuille. */
function dejaTraitee_(id) {
  const sh = feuille_().getSheetByName(ONGLET_CODES);
  const n = sh.getLastRow() - 1;
  if (n < 1) return false;
  return sh.getRange(2, 6, n, 1).getValues().some(r => r[0] === id);
}

function marquerVendu_(rang, email, id, entreprise) {
  feuille_().getSheetByName(ONGLET_CODES).getRange(rang, 3, 1, 5).setValues([['vendu', email, new Date(), id, entreprise]]);
  SpreadsheetApp.flush();
}

function journal_(id, email, resultat) {
  try { feuille_().getSheetByName(ONGLET_JOURNAL).appendRow([new Date(), id, email, resultat]); } catch (e) { /* jamais bloquant */ }
}

/* ---------- E-mails ---------- */

/** Lignes de l'e-mail du code : Solo (achat) ou Équipe (mode d'emploi du responsable). */
function lignesEmail_(code, entreprise, type) {
  const fin = [
    '',
    'Une question ? Répondez à cet e-mail ou appelez-moi au 06 21 68 58 87.',
    '',
    'Bons salons !',
    'Nicolas Menargues',
    'Optimisons.ai · L\'IA, simplement.'
  ];
  if (type === 'equipe') {
    return [
      'Bonjour,',
      '',
      'Merci pour votre achat de Carnet de salon Équipe' + (entreprise ? ' pour ' + entreprise : '') + ' !',
      '',
      'Votre code d\'activation : ' + code,
      '',
      'Vous êtes le responsable de l\'équipe. Pour commencer :',
      '1. Ouvrez ' + LIEN_APPLI + ' sur votre téléphone.',
      '2. Saisissez votre code, puis connectez votre compte Google.',
      '3. Dans Réglages, renseignez votre entreprise, le nom du salon et votre prénom.',
      '4. Réglages > Mon équipe > Inviter un commercial : saisissez son e-mail Google et son prénom, puis envoyez-lui le lien par e-mail.',
      '',
      'Vos commerciaux n\'ont pas de code à saisir : ils ouvrent le lien, se connectent avec leur compte Google et choisissent le carnet partagé. Tous les contacts arrivent dans votre tableau, avec le prénom de celui qui a rencontré chaque contact. Le nombre d\'utilisateurs est illimité.',
      'Vous utilisiez déjà l\'essai ou une licence Solo ? Saisissez simplement ce code dans l\'appli : vos contacts sont conservés.',
      'Votre facture vous est envoyée séparément par Stripe.'
    ].concat(fin);
  }
  return [
    'Bonjour,',
    '',
    'Merci pour votre achat de Carnet de salon' + (entreprise ? ' pour ' + entreprise : '') + ' !',
    '',
    'Votre code d\'activation : ' + code,
    '',
    'Pour commencer :',
    '1. Ouvrez ' + LIEN_APPLI + ' sur votre téléphone.',
    '2. Connectez votre compte Google.',
    '3. Saisissez votre code.',
    '',
    'Vous utilisiez déjà l\'essai ? Saisissez simplement ce code dans l\'appli : vos contacts sont conservés.',
    'Votre facture vous est envoyée séparément par Stripe.'
  ].concat(fin);
}

/** E-mail du code au client, copie cachée à Nicolas. */
function envoyerCode_(email, code, entreprise, type) {
  if (!email) throw new Error('E-mail client absent de la session Stripe');
  const P = PropertiesService.getScriptProperties();
  const options = { name: 'Optimisons.ai' };
  if (P.getProperty('COPIE')) options.bcc = P.getProperty('COPIE');
  const expediteur = P.getProperty('EXPEDITEUR');
  if (expediteur) {
    options.replyTo = expediteur;
    if (GmailApp.getAliases().indexOf(expediteur) >= 0) options.from = expediteur;
  }

  const lignes = lignesEmail_(code, entreprise, type);
  const texte = lignes.join('\n');
  options.htmlBody = lignes
    .map(l => l.replace(/&/g, '&amp;').replace(/</g, '&lt;'))
    .map(l => l.indexOf('Votre code d\'activation') === 0
      ? 'Votre code d\'activation : <b style="font-size:18px;letter-spacing:1px">' + code + '</b>'
      : l)
    .join('<br>');

  const objet = type === 'equipe' ? 'Votre code Carnet de salon Équipe' : 'Votre code Carnet de salon';
  GmailApp.sendEmail(email, objet, texte, options);
}

function alerter_(sujet, texte) {
  const dest = PropertiesService.getScriptProperties().getProperty('COPIE') || Session.getEffectiveUser().getEmail();
  GmailApp.sendEmail(dest, '[Carnet de salon] ' + sujet, texte);
}

/** Évite de recevoir une alerte par minute si Stripe est indisponible. */
function alerterUneFoisParHeure_(sujet, texte) {
  const cache = CacheService.getScriptCache();
  if (cache.get('alerte')) return;
  cache.put('alerte', '1', 3600);
  alerter_(sujet, texte);
}
