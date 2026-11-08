// Tri du texte lu sur une carte de visite.
// Port des fonctions sansAccent_, majuscule_, nettoyer_ et extraireChamps_ du prototype Apps Script
// (docs/claude_carnet_de_salon_prototype_Code.gs). Testé par tests/tri.test.html.
// Tâche 15 (C1) : nom plus tolérant (apostrophe typographique, ponctuation en fin de ligne, lettres accentuées
// hors français, prénom courant reconnu même quand le domaine de l'e-mail reprend le nom de la personne).
// Nom rendu dans l'ordre « Prénom Nom », même si la carte porte « DURAND Jérôme » ou « Durand Jérôme ».

import { estPrenom } from './prenoms.js';

export const MESSAGERIES_PERSO = ['gmail', 'googlemail', 'yahoo', 'hotmail', 'outlook', 'live', 'icloud', 'me',
  'orange', 'wanadoo', 'free', 'sfr', 'laposte', 'bbox', 'aol', 'gmx', 'protonmail', 'proton', 'msn', 'neuf'];

// Met en minuscules et retire les accents.
export function sansAccent(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// Met une majuscule au début de chaque mot (après espace, tiret ou apostrophe).
export function majuscule(s) {
  return s.toLowerCase().replace(/(^|[\s\-'])([a-zà-ÿ])/g, (m, a, b) => a + b.toUpperCase());
}

// Répare les e-mails mal lus ou dictés : « arobase », « (at) », espaces autour de @ et du point, « point ».
export function nettoyer(t) {
  return String(t || '')
    .replace(/\s*(\(at\)|\[at\]|\barobase\b|\barrobase\b)\s*/gi, '@')
    .replace(/([\w.\-]+)\s+@\s*([\w\-]+)/g, '$1@$2')
    .replace(/([\w.\-]+)@\s+([\w\-]+)/g, '$1@$2')
    .replace(/(@[\w\-]+)\s*\.\s*([a-z]{2,6})\b/gi, '$1.$2')
    .replace(/(@[\w\-]+)(\s+point\s+[\w\-]+)+/gi, m => m.replace(/\s+point\s+/gi, '.'))
    .replace(/([\w.\-]+)\s+point\s+([\w\-]+@)/gi, '$1.$2');
}

// « DURAND Jérôme » ou « Durand Jérôme » -> « Jérôme DURAND » / « Jérôme Durand » : prénom devant, nom de famille après.
function remettreEnOrdre(nom) {
  const mots = String(nom || '').split(/\s+/).filter(Boolean);
  if (mots.length < 2) return nom;
  const dernier = mots[mots.length - 1];
  const capitales = (m) => m.length > 1 && m === m.toUpperCase() && m !== m.toLowerCase();
  // Dernier mot prénom connu et premier mot non : on inverse
  if (estPrenom(dernier) && !estPrenom(mots[0])) return [dernier].concat(mots.slice(0, -1)).join(' ');
  // Un seul mot en capitales, placé en tête, devant des mots en minuscules : c'est le nom de famille
  const enCapitales = mots.filter(capitales);
  if (enCapitales.length === 1 && capitales(mots[0]) && !capitales(dernier)) return mots.slice(1).concat(mots[0]).join(' ');
  return nom;
}

// Extrait nom, entreprise, e-mail, téléphone et site du texte de la carte (et de la note dictée).
export function extraireChamps(texteCarte, note) {
  const carte = nettoyer(texteCarte);
  const tout = carte + '\n' + nettoyer(note);

  const mEmail = tout.match(/[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}/i);
  const email = mEmail ? mEmail[0].toLowerCase().replace(/[.]+$/, '') : '';

  const mTel = tout.match(/(?:\+33\s?(?:\(0\)\s?)?|0)[1-9](?:[\s.\-]?\d{2}){4}/);
  let tel = '';
  if (mTel) {
    tel = mTel[0].replace(/[^\d+]/g, '').replace(/^\+330?/, '0').replace(/(\d{2})(?=\d)/g, '$1 ');
  }

  const domaine = email ? email.split('@')[1] : '';
  const racine = domaine ? domaine.split('.')[0] : '';
  const perso = MESSAGERIES_PERSO.indexOf(racine) >= 0;

  const mSite = tout.match(/(?:https?:\/\/)?www\.[a-z0-9\-]+(?:\.[a-z0-9\-]+)+/i);
  const site = mSite ? mSite[0].toLowerCase() : (domaine && !perso ? 'www.' + domaine : '');

  // Lignes nettoyées : apostrophe typographique remise droite, ponctuation de début et de fin retirée (« Marc Lambert, »).
  const lignes = carte.split(/\n+|\s[|•·]\s/)
    .map(l => l.replace(/[’‘ʼ]/g, '\'').trim().replace(/^[,;:\-–]+\s*|\s*[,;:\-–]+$/g, '').trim())
    .filter(Boolean);
  const exclus = /(@|www\.|http|\d|\b(rue|avenue|bd|boulevard|chemin|place|cedex|t[ée]l|tel|mob|mobile|fax|mail|e-mail|portable)\b)/i;
  const motsSociete = /\b(SAS|SASU|SARL|EURL|SA|SCOP|SCI|GROUPE?|FRANCE|STUDIO|ATELIERS?|MAISON|MANUFACTURE|EDITIONS?|COMPAGNIE|CIE)\b/i;
  const generiques = /^(contact|info|infos|bonjour|hello|commercial|vente|ventes|admin|service|accueil|sales|direction|compta)$/;

  const local = email ? email.split('@')[0] : '';
  const morceaux = local.split(/[._\-]+/).map(sansAccent).filter(m => m.length > 1);

  // Nom : la ligne qui ressemble le plus à un prénom + nom, de préférence cohérente avec l'e-mail
  let nom = '';
  let meilleur = 0;
  lignes.forEach(l => {
    const mots = l.split(/\s+/);
    if (mots.length < 2 || mots.length > 4 || l.length > 40 || exclus.test(l)) return;
    if (!mots.every(m => /^\p{L}[\p{L}'\-.]*$/u.test(m))) return;
    const motsN = mots.map(sansAccent);
    let s = 0;
    // Premier ou dernier mot reconnu comme prénom courant (« Jean-Marc Durand », « DURAND Jérôme »)
    if (estPrenom(mots[0]) || estPrenom(mots[mots.length - 1])) s += 3;
    if (morceaux.length && morceaux.some(m => motsN.some(w => w === m || (m.length > 2 && (w.startsWith(m) || m.startsWith(w)))))) s += 3;
    if (mots.every(m => /^\p{Lu}/u.test(m))) s += 1;
    if (l === l.toUpperCase()) s -= 1;
    if (motsSociete.test(l)) s -= 2;
    const ligneN = motsN.join('').replace(/[^a-z0-9]/g, '');
    const racineDom = sansAccent(racine).replace(/[^a-z0-9]/g, '');
    if (racineDom.length > 2 && !perso && (ligneN.indexOf(racineDom) >= 0 || racineDom.indexOf(ligneN) >= 0)) s -= 3;
    if (s > meilleur) { meilleur = s; nom = l; }
  });
  // Repli : nom collé à la fonction ou à l'e-mail par la lecture (« Nicolas Menargues Consultant formateur en IA ») ;
  // on garde le prénom connu en début de ligne et le mot qui le suit.
  if (!nom) {
    lignes.some(l => {
      const mots = l.split(/\s+/);
      if (mots.length < 3 || !estPrenom(mots[0]) || !/^\p{Lu}/u.test(mots[0])) return false;
      if (!/^\p{Lu}[\p{L}'\-.]*$/u.test(mots[1]) || motsSociete.test(mots[1])) return false;
      nom = mots[0] + ' ' + mots[1];
      return true;
    });
  }
  if (!nom && morceaux.length >= 2 && !generiques.test(morceaux[0])) {
    nom = morceaux.slice(0, 2).join(' ');
  }
  nom = remettreEnOrdre(nom);
  if (nom && (nom === nom.toLowerCase() || nom.split(/\s+/).some(w => w.length > 1 && w === w.toUpperCase()))) nom = majuscule(nom);

  // Entreprise : forme juridique, sinon ligne proche du domaine, sinon ligne en capitales, sinon le domaine
  let entreprise = '';
  const racineN = sansAccent(racine).replace(/[^a-z0-9]/g, '');
  const forme = lignes.find(l => /\b(SAS|SASU|SARL|EURL|SA|SCOP|SCI)\b/.test(l) && !/@|www/i.test(l));
  if (forme) entreprise = forme;
  if (!entreprise && racineN.length > 2 && !perso) {
    const proche = lignes.find(l => {
      const n = sansAccent(l).replace(/[^a-z0-9]/g, '');
      return l !== nom && n.length > 2 && !/@|www/i.test(l) && (n.indexOf(racineN) >= 0 || racineN.indexOf(n) >= 0);
    });
    if (proche) entreprise = proche;
  }
  if (!entreprise) {
    const caps = lignes.find(l => l.length >= 3 && l.length < 40 && l === l.toUpperCase() &&
      /[A-Z]{3,}/.test(l) && !exclus.test(l) && sansAccent(l) !== sansAccent(nom));
    if (caps) entreprise = caps;
  }
  if (!entreprise && racine && !perso) entreprise = majuscule(racine.replace(/-/g, ' '));

  return { nom, entreprise, email, tel, site };
}
