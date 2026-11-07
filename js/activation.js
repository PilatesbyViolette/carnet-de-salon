// Activation par code : empreinte SHA-256 du code saisi comparée à js/codes.js, écrans « Activation » et « Essai terminé ».
// Code gardé dans localStorage et dans la clé Réglages « Code d'activation ». Essai : début gardé dans localStorage
// et dans la clé Réglages « Essai commencé le » ; la plus ancienne des deux dates fait foi (pas de remise à zéro).

import { CODES } from './codes.js';
import * as base from './base.js';
import { enregistrerEcran, montrerErreur } from './interface.js';
import { dateIso, dateCourte, plusAncienne } from './dates.js';

export const CLE_CODE = 'Code d\'activation';
export const CLE_ESSAI = 'Essai commencé le';
const LOCAL_CODE = 'activation';
const LOCAL_ESSAI = 'essaiCommenceLe';
const HEURE_MS = 60 * 60 * 1000;

let etat = null;       // { code, type, libelle, fin (ms ou null) }
let minuterie = null;  // fin de l'essai
let suite = () => {};  // écran à ouvrir après une activation réussie

// Lit une valeur de localStorage (null si absente ou stockage indisponible).
function lireLocal(cle) {
  try { return localStorage.getItem(cle); } catch (e) { return null; }
}

// Écrit une valeur dans localStorage (sans effet si le stockage est indisponible).
function ecrireLocal(cle, valeur) {
  try { localStorage.setItem(cle, valeur); } catch (e) { /* stockage indisponible */ }
}

// Code mis en majuscules, sans espaces ni tirets (même règle que outils/codes.js).
export function normaliserCode(saisie) {
  return String(saisie || '').toUpperCase().replace(/[\s-]+/g, '');
}

// Empreinte SHA-256 hexadécimale d'un texte.
export async function empreinte(texte) {
  const octets = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texte));
  return [...new Uint8Array(octets)].map((o) => o.toString(16).padStart(2, '0')).join('');
}

// Code de js/codes.js correspondant à une empreinte, ou null.
function trouverCode(valeur) {
  return CODES.find((c) => c.empreinte === valeur) || null;
}

// Prévient l'interface que l'activation a changé (accueil, réglages).
function signaler() {
  window.dispatchEvent(new CustomEvent('carnet:activation'));
}

// Début de l'essai : le plus ancien entre localStorage et Réglages (maintenant s'il n'y en a pas), recopié des deux côtés.
async function debutEssai() {
  const enBase = await base.lireReglage(CLE_ESSAI, '');
  const debut = plusAncienne(lireLocal(LOCAL_ESSAI), enBase) || dateIso(new Date());
  ecrireLocal(LOCAL_ESSAI, debut);
  if (debut !== enBase) {
    await base.ecrireReglage(CLE_ESSAI, debut);
    await base.ecrireReglage('_activationAEnvoyer', true);
  }
  return debut;
}

// Recopie le code dans les Réglages locaux (envoyés au tableau par la file) s'il n'y est pas.
async function recopierCode(code) {
  if ((await base.lireReglage(CLE_CODE, '')) === code) return;
  await base.ecrireReglage(CLE_CODE, code);
  await base.ecrireReglage('_activationAEnvoyer', true);
}

// Prévient l'interface à la fin de l'essai (pastille de l'accueil, capture bloquée).
function programmerFin() {
  clearTimeout(minuterie);
  if (etat && etat.fin && etat.fin > Date.now()) minuterie = setTimeout(signaler, etat.fin - Date.now() + 500);
}

// Charge l'activation gardée (un code retiré de js/codes.js n'est plus valable) et la recopie dans les Réglages.
export async function chargerActivation() {
  let memo = null;
  try { memo = JSON.parse(lireLocal(LOCAL_CODE)); } catch (e) { memo = null; }
  const code = memo && trouverCode(memo.empreinte);
  etat = code ? { code: memo.code, type: code.type, libelle: code.libelle, fin: null } : null;
  if (!etat) return null;
  await recopierCode(etat.code);
  if (code.type === 'essai') etat.fin = Date.parse(await debutEssai()) + code.dureeHeures * HEURE_MS;
  programmerFin();
  return etat;
}

// Vrai si un code valable a été saisi.
export function estActive() {
  return !!etat;
}

// Vrai si l'essai est terminé (capture bloquée, consultation et relances possibles).
export function essaiTermine() {
  return !!etat && etat.fin != null && Date.now() >= etat.fin;
}

// Vrai si la capture de nouveaux contacts est permise.
export function captureAutorisee() {
  return estActive() && !essaiTermine();
}

// Fin de l'essai en millisecondes, ou null (pas d'essai).
export function finEssai() {
  return etat ? etat.fin : null;
}

// Description pour l'écran Réglages : code, type et fin de l'essai.
export function descriptionActivation() {
  if (!etat) return 'aucun';
  if (etat.type === 'achat') return etat.code + ' · acheté';
  if (etat.type === 'demo') return etat.code + ' · démonstration';
  return etat.code + (essaiTermine() ? ' · essai terminé' : ' · essai jusqu\'au ' + dateCourte(etat.fin));
}

// Active un code saisi : empreinte, comparaison, mémorisation ; lève une erreur lisible sinon.
export async function activer(saisie) {
  const normal = normaliserCode(saisie);
  if (!normal) throw new Error('Saisissez votre code d\'activation.');
  const valeur = await empreinte(normal);
  const code = trouverCode(valeur);
  if (!code) throw new Error('Code inconnu. Vérifiez chaque caractère (les codes CDS ne contiennent ni O, ni 0, ni I, ni 1).');
  ecrireLocal(LOCAL_CODE, JSON.stringify({ code: String(saisie).trim().toUpperCase().replace(/\s+/g, ''), empreinte: valeur }));
  await chargerActivation();
  signaler();
  if (essaiTermine()) throw new Error('Cet essai est déjà terminé. Achetez un code pour continuer à capturer.');
}

// Formulaire de code (écran Activation ou Essai terminé) : erreur sous le champ, sinon écran suivant.
function brancherFormulaire(idFormulaire, idChamp, idErreur) {
  const erreur = document.getElementById(idErreur);
  document.getElementById(idFormulaire).addEventListener('submit', (evenement) => {
    evenement.preventDefault();
    erreur.hidden = true;
    activer(document.getElementById(idChamp).value)
      .then(() => { document.getElementById(idChamp).value = ''; suite(); })
      .catch((e) => { erreur.textContent = e.message; erreur.hidden = false; });
  });
}

// Branche les deux écrans ; apresActivation ouvre l'écran suivant ; relit l'essai après chaque synchronisation.
export function initActivation(apresActivation) {
  suite = apresActivation;
  const vider = (id) => () => { document.getElementById(id).hidden = true; };
  enregistrerEcran('activation', { afficher: vider('activation-erreur') });
  enregistrerEcran('essai', { afficher: vider('essai-erreur') });
  brancherFormulaire('formulaire-activation', 'champ-code', 'activation-erreur');
  brancherFormulaire('formulaire-code-essai', 'champ-code-essai', 'essai-erreur');
  window.addEventListener('carnet:sync', (e) => {
    if (e.detail.fini) chargerActivation().then(signaler).catch((err) => montrerErreur('Activation : ' + err.message));
  });
}
