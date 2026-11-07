// Activation : essai gratuit de 24 h sans code (une seule fois par compte Google), ou code d'achat ou de démonstration.
// Essai gratuit : la clé Réglages « Essai commencé le » fait foi ; celle du tableau l'emporte à la synchronisation,
// donc une réinstallation ne relance pas l'essai. Code : empreinte SHA-256 comparée à js/codes.js, gardé dans
// localStorage et dans la clé Réglages « Code d'activation ». Écrans « Activation » et « Votre essai est terminé ».

import { CODES } from './codes.js';
import * as base from './base.js';
import { enregistrerEcran, montrerErreur } from './interface.js';
import { dateIso, dateCourte } from './dates.js';

export const CLE_CODE = 'Code d\'activation';
export const CLE_ESSAI = 'Essai commencé le';
export const DUREE_ESSAI_HEURES = 24;
const LOCAL_ACTIVATION = 'activation'; // { essai: true } ou { code, empreinte }
const LOCAL_DEBUT_TEST = 'debutCodeTest';
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

// Forme affichée d'un code : CDS-XXXX-XXXX quelle que soit la saisie.
function codeAffiche(normal) {
  return /^CDS[A-Z0-9]{8}$/.test(normal) ? normal.replace(/^CDS(.{4})(.{4})$/, 'CDS-$1-$2') : normal;
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

// Activation gardée sur le téléphone, ou null.
function lireActivation() {
  try { return JSON.parse(lireLocal(LOCAL_ACTIVATION)); } catch (e) { return null; }
}

// Début de l'essai gratuit : clé Réglages « Essai commencé le », créée maintenant si absente puis envoyée au tableau.
async function debutEssaiGratuit() {
  const debut = await base.lireReglage(CLE_ESSAI, '');
  if (debut) return debut;
  const maintenant = dateIso(new Date());
  await base.ecrireReglage(CLE_ESSAI, maintenant);
  await base.ecrireReglage('_activationAEnvoyer', true);
  return maintenant;
}

// Début du code de test : gardé sur le téléphone seulement, il ne touche pas à l'essai gratuit du compte.
function debutCodeTest() {
  const debut = lireLocal(LOCAL_DEBUT_TEST) || dateIso(new Date());
  ecrireLocal(LOCAL_DEBUT_TEST, debut);
  return debut;
}

// Recopie le code dans les Réglages locaux (envoyés au tableau par la file) s'il n'y est pas.
async function recopierCode(code) {
  if ((await base.lireReglage(CLE_CODE, '')) === code) return;
  await base.ecrireReglage(CLE_CODE, code);
  await base.ecrireReglage('_activationAEnvoyer', true);
}

// État d'un code gardé (un code retiré de js/codes.js n'est plus valable) ; null sinon.
async function etatCode(memo) {
  const code = memo && trouverCode(memo.empreinte);
  if (!code) return null;
  await recopierCode(memo.code);
  const fin = code.type === 'essai' ? Date.parse(debutCodeTest()) + code.dureeHeures * HEURE_MS : null;
  return { code: memo.code, type: code.type, libelle: code.libelle, fin };
}

// Prévient l'interface à la fin de l'essai (pastille de l'accueil, capture bloquée).
function programmerFin() {
  clearTimeout(minuterie);
  if (etat && etat.fin && etat.fin > Date.now()) minuterie = setTimeout(signaler, etat.fin - Date.now() + 500);
}

// Charge l'activation gardée : essai gratuit, code, ou rien.
export async function chargerActivation() {
  const memo = lireActivation();
  if (memo && memo.essai) {
    const fin = Date.parse(await debutEssaiGratuit()) + DUREE_ESSAI_HEURES * HEURE_MS;
    etat = { code: '', type: 'essai', libelle: 'essai gratuit', fin };
  } else {
    etat = await etatCode(memo);
  }
  programmerFin();
  return etat;
}

// Vrai si l'essai a commencé ou si un code valable a été saisi.
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

// Description pour l'écran Réglages : essai gratuit et sa fin, ou code et son type.
export function descriptionActivation() {
  if (!etat) return 'aucun';
  if (etat.type === 'achat') return etat.code + ' · acheté';
  if (etat.type === 'demo') return etat.code + ' · démonstration';
  const nom = etat.code ? etat.code + ' · essai' : 'Essai gratuit';
  return nom + (essaiTermine() ? ' terminé' : ' jusqu\'au ' + dateCourte(etat.fin));
}

// « Commencer mon essai gratuit de 24 h » : l'essai démarre maintenant, sauf s'il a déjà commencé pour ce compte.
export async function commencerEssai() {
  ecrireLocal(LOCAL_ACTIVATION, JSON.stringify({ essai: true }));
  await chargerActivation();
  signaler();
}

// Active un code saisi (achat, démonstration ou test) ; lève une erreur lisible sinon.
export async function activer(saisie) {
  const normal = normaliserCode(saisie);
  if (!normal) throw new Error('Saisissez votre code d\'activation.');
  const valeur = await empreinte(normal);
  if (!trouverCode(valeur)) throw new Error('Code inconnu. Vérifiez chaque caractère (les codes CDS ne contiennent ni O, ni 0, ni I, ni 1).');
  ecrireLocal(LOCAL_ACTIVATION, JSON.stringify({ code: codeAffiche(normal), empreinte: valeur }));
  await chargerActivation();
  signaler();
  if (essaiTermine()) throw new Error('Ce code d\'essai est déjà terminé. Achetez un code pour continuer à capturer.');
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
  document.getElementById('bouton-essai-gratuit').addEventListener('click', () => {
    commencerEssai().then(suite).catch((e) => montrerErreur('Essai : ' + e.message));
  });
  window.addEventListener('carnet:sync', (e) => {
    if (e.detail.fini) chargerActivation().then(signaler).catch((err) => montrerErreur('Activation : ' + err.message));
  });
}
