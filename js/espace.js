// Espace de l'exposant dans son Drive : tableau « Mes contacts », dossier des photos, onglet Réglages.
// Garde aussi en local une copie des lignes du tableau (compteurs, « À vérifier », relances).

import * as base from './base.js';
import * as drive from './drive.js';
import { compteConnu } from './connexion.js';
import { CLE_CODE, CLE_ESSAI } from './activation.js';

// Réglages par défaut, repris du prototype (REGLAGES_DEFAUT) avec Votre nom, les délais et le code d'activation.
export const REGLAGES_DEFAUT = [
  ['Votre entreprise', ''],
  ['Nom du salon', ''],
  ['Votre nom', ''],
  ['Votre signature', ''],
  ['Objet J+2', 'Suite à notre échange au {salon}'],
  ['Message J+2', 'Bonjour {prenom},\n\nMerci pour votre passage sur le stand {exposant} au {salon}, c\'était un plaisir d\'échanger avec vous.\n\n[À PERSONNALISER AVANT ENVOI. Votre note : {note}]\n\nJe reste à votre disposition pour en reparler.\n\nBien cordialement,\n{signature}'],
  ['Objet J+7', 'Notre échange au {salon}'],
  ['Message J+7', 'Bonjour {prenom},\n\nJe me permets de revenir vers vous après le {salon}. Avez-vous eu le temps d\'y repenser ? Je vous propose d\'en parler quelques minutes, au moment qui vous arrange.\n\n[À PERSONNALISER AVANT ENVOI. Votre note : {note}]\n\nBien cordialement,\n{signature}'],
  ['Délai J+2', '2'],
  ['Délai J+7', '7'],
  ['Code d\'activation', '']
];

// Les clés internes (identifiants, cache) commencent par « _ » et ne vont jamais dans l'onglet Réglages.
const estInterne = (cle) => cle.startsWith('_');

let espaceVerifie = false;
const ids = { tableau: null, dossier: null };

// Identifiant du tableau (après preparerEspace).
export function idTableau() { return ids.tableau; }

// Identifiant du dossier des photos (après preparerEspace).
export function idDossier() { return ids.dossier; }

// Adresse du tableau à ouvrir dans Google Sheets.
export async function lienTableau() {
  const id = ids.tableau || await base.lireReglage('_idTableau', '');
  return id ? 'https://docs.google.com/spreadsheets/d/' + id + '/edit' : '';
}

// Valeur d'un réglage local, avec la valeur par défaut du prototype.
export async function reglage(cle) {
  const ligne = REGLAGES_DEFAUT.find((l) => l[0] === cle);
  return base.lireReglage(cle, ligne ? ligne[1] : '');
}

// Nom inscrit dans la colonne « Pris par » : Votre nom, sinon l'e-mail du compte.
export async function prisPar() {
  return (await reglage('Votre nom')) || compteConnu();
}

// Retrouve (id gardé, puis recherche par nom) ou crée le tableau et le dossier ; une vérification par session.
export async function preparerEspace() {
  if (espaceVerifie) return;
  ids.tableau = await retrouverOuCreer('_idTableau', drive.NOM_TABLEAU, drive.TYPE_TABLEAU, creerTableauInitial);
  ids.dossier = await retrouverOuCreer('_idDossier', drive.NOM_DOSSIER, drive.TYPE_DOSSIER, drive.creerDossier);
  espaceVerifie = true;
}

// Cherche un fichier de l'espace et le crée s'il n'existe plus ; garde son id en local.
async function retrouverOuCreer(cle, nom, type, creer) {
  let id = await base.lireReglage(cle, '');
  if (id && !(await drive.fichierExiste(id))) id = '';
  if (!id) id = await drive.chercherFichier(nom, type);
  if (!id) id = await creer();
  await base.ecrireReglage(cle, id);
  return id;
}

// Crée le tableau avec les réglages locaux s'il y en a (essai compris), sinon ceux par défaut.
async function creerTableauInitial() {
  const locaux = await base.tousLesReglages();
  const lignes = REGLAGES_DEFAUT.map(([cle, defaut]) => [cle, locaux[cle] !== undefined ? locaux[cle] : defaut]);
  if (locaux[CLE_ESSAI]) lignes.push([CLE_ESSAI, locaux[CLE_ESSAI]]);
  await base.ecrireReglage('_reglagesAEnvoyer', false);
  await base.ecrireReglage('_activationAEnvoyer', false);
  return drive.creerTableau(lignes);
}

// Oublie l'espace vérifié (après une déconnexion).
export function oublierEspace() {
  espaceVerifie = false;
  ids.tableau = ids.dossier = null;
}

// Enregistre des réglages en local et les marque à envoyer vers l'onglet Réglages.
export async function enregistrerReglages(valeurs) {
  for (const [cle, valeur] of Object.entries(valeurs)) await base.ecrireReglage(cle, valeur);
  await base.ecrireReglage('_reglagesAEnvoyer', true);
}

// Envoie les réglages locaux (tous, ou seulement ceux de l'activation) vers l'onglet Réglages, en gardant
// les clés du tableau que l'appli ne connaît pas ; une date « Essai commencé le » déjà dans le tableau fait foi.
export async function envoyerReglagesSiBesoin() {
  const tout = await base.lireReglage('_reglagesAEnvoyer', false);
  if (!tout && !(await base.lireReglage('_activationAEnvoyer', false))) return;
  const distants = await drive.lireReglagesTableau(ids.tableau);
  const fusion = new Map(distants.filter((l) => l[0]).map((l) => [l[0], l[1] || '']));
  const locaux = await base.tousLesReglages();
  const cles = tout ? Object.keys(locaux).filter((cle) => !estInterne(cle)) : [CLE_CODE, CLE_ESSAI].filter((cle) => locaux[cle]);
  cles.forEach((cle) => fusion.set(cle, String(locaux[cle])));
  const essaiDistant = distants.filter((l) => l[0] === CLE_ESSAI).map((l) => l[1])[0];
  if (essaiDistant) { fusion.set(CLE_ESSAI, essaiDistant); await base.ecrireReglage(CLE_ESSAI, essaiDistant); }
  const lignes = [['Réglage', 'Valeur']].concat([...fusion.entries()]);
  await drive.ecrirePlage(ids.tableau, 'Réglages', 'A1:B' + lignes.length, lignes);
  await base.ecrireReglage('_reglagesAEnvoyer', false);
  await base.ecrireReglage('_activationAEnvoyer', false);
}

// Relit le tableau : copie locale des lignes de contacts et des réglages (« Essai commencé le » du tableau fait foi).
export async function rafraichirDepuisTableau() {
  const lignes = await drive.lireLignes(ids.tableau);
  await base.ecrireReglage('_lignes', lignes.map(ligneVersContact));
  const enAttente = await base.lireReglage('_reglagesAEnvoyer', false);
  const activationEnAttente = await base.lireReglage('_activationAEnvoyer', false);
  for (const [cle, valeur] of await drive.lireReglagesTableau(ids.tableau)) {
    if (!cle || estInterne(cle)) continue;
    if (cle === CLE_ESSAI) { if (valeur) await base.ecrireReglage(cle, valeur); }
    else if (!enAttente && !(cle === CLE_CODE && activationEnAttente)) await base.ecrireReglage(cle, valeur || '');
  }
}

// Lignes du tableau (copie locale), avec les relances notées mais pas encore écrites dans le tableau.
export async function lignesAvecRelances() {
  const lignes = await base.lireReglage('_lignes', []);
  const attente = await base.lireReglage('_relancesAEnvoyer', []);
  attente.forEach((r) => { const c = lignes.find((l) => l.id === r.id); if (c) c[r.champ] = r.texte; });
  return lignes;
}

// Note une relance envoyée (local d'abord) ; elle part vers le tableau au prochain passage de la file.
export async function noterRelance(id, type, texte) {
  const attente = await base.lireReglage('_relancesAEnvoyer', []);
  const j2 = type === 'J+2';
  attente.push({ id, champ: j2 ? 'relanceJ2' : 'relanceJ7', colonne: j2 ? 'L' : 'M', texte });
  await base.ecrireReglage('_relancesAEnvoyer', attente);
}

// Nombre de relances notées pas encore écrites dans le tableau.
export async function relancesEnAttente() {
  return (await base.lireReglage('_relancesAEnvoyer', [])).length;
}

// Écrit les relances notées dans leur colonne (ligne retrouvée par Id) ; une ligne disparue est ignorée.
export async function envoyerRelancesSiBesoin() {
  const attente = await base.lireReglage('_relancesAEnvoyer', []);
  if (!attente.length) return;
  const lignesIds = await drive.lireIds(ids.tableau);
  for (const r of attente) {
    const numero = numeroDeLigne(lignesIds, r.id);
    if (numero) await drive.ecrirePlage(ids.tableau, 'Contacts', r.colonne + numero, [[r.texte]]);
  }
  const envoyee = (r) => attente.some((a) => a.id === r.id && a.champ === r.champ);
  await base.ecrireReglage('_relancesAEnvoyer', (await base.lireReglage('_relancesAEnvoyer', [])).filter((r) => !envoyee(r)));
}

// Numéro de ligne d'un contact d'après la colonne Id (« ligne-N » pour une ligne sans Id) ; 0 s'il a disparu.
function numeroDeLigne(lignesIds, id) {
  const index = lignesIds.indexOf(id);
  if (index >= 1) return index + 1;
  const m = /^ligne-(\d+)$/.exec(id);
  return m && !lignesIds[Number(m[1]) - 1] ? Number(m[1]) : 0;
}

// Transforme une ligne du tableau (colonnes A à N) en objet contact.
function ligneVersContact(l, index) {
  const v = (i) => l[i] || '';
  return {
    id: v(0) || 'ligne-' + (index + 2), creeLe: v(1), prisPar: v(2), nom: v(3), entreprise: v(4), email: v(5),
    tel: v(6), site: v(7), note: v(8), photoLien: v(9), statut: v(10), relanceJ2: v(11), relanceJ7: v(12),
    texte: v(13), etat: 'ecrit', source: 'tableau'
  };
}

// Ligne du tableau (colonnes A à N) pour un contact local.
export function contactVersLigne(c, nomPrisPar) {
  return [c.id, c.creeLe, nomPrisPar, c.nom || '', c.entreprise || '', c.email || '', c.tel || '', c.site || '',
    c.note || '', c.photoLien || '', c.statut, c.relanceJ2 || '', c.relanceJ7 || '', c.texte || ''];
}

// Vue d'ensemble : lignes du tableau + contacts locaux pas encore écrits, du plus récent au plus ancien.
export async function vueContacts() {
  const lignes = await base.lireReglage('_lignes', []);
  const locaux = await base.tousLesContacts();
  const parId = new Map(lignes.map((l) => [l.id, l]));
  locaux.forEach((c) => {
    if (!c.statut) return; // capture en cours, pas encore enregistrée
    if (c.etat !== 'ecrit' || !parId.has(c.id)) {
      const copie = Object.assign({}, c, { source: 'local' });
      delete copie.photo;
      parId.set(c.id, copie);
    }
  });
  return [...parId.values()].sort((a, b) => String(b.creeLe).localeCompare(String(a.creeLe)));
}

// Valide un contact « À vérifier » : met à jour sa ligne (trouvée par id) et passe le statut à « Vérifié dans l'appli ».
export async function validerContact(contact, champs) {
  await preparerEspace();
  const lignesIds = await drive.lireIds(ids.tableau);
  const index = lignesIds.indexOf(contact.id);
  if (index < 1) throw new Error('Ce contact n\'est plus dans le tableau (ligne supprimée ?)');
  const numero = index + 1;
  await drive.ecrirePlage(ids.tableau, 'Contacts', 'D' + numero + ':K' + numero, [[
    champs.nom, champs.entreprise, champs.email, champs.tel, champs.site, champs.note, contact.photoLien || '', base.VERIFIE
  ]]);
  await base.majContact(contact.id, (c) => { Object.assign(c, champs); c.statut = base.VERIFIE; });
  await rafraichirDepuisTableau();
}
