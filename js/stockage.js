// Stockage du navigateur (localStorage et sessionStorage) avec le préfixe de l'environnement
// (vide en production). Un stockage indisponible ne bloque jamais l'appli.

import { ENV } from './environnement.js';

const cle = (nom) => ENV.prefixe + nom;

// Lit une valeur de localStorage (null si absente ou stockage indisponible).
export function lireLocal(nom) {
  try { return localStorage.getItem(cle(nom)); } catch (e) { return null; }
}

// Écrit une valeur dans localStorage (sans effet si le stockage est indisponible).
export function ecrireLocal(nom, valeur) {
  try { localStorage.setItem(cle(nom), valeur); } catch (e) { /* stockage indisponible */ }
}

// Retire une valeur de localStorage.
export function retirerLocal(nom) {
  try { localStorage.removeItem(cle(nom)); } catch (e) { /* stockage indisponible */ }
}

// Lit une valeur de sessionStorage (null si absente ou stockage indisponible).
export function lireSession(nom) {
  try { return sessionStorage.getItem(cle(nom)); } catch (e) { return null; }
}

// Écrit une valeur dans sessionStorage.
export function ecrireSession(nom, valeur) {
  try { sessionStorage.setItem(cle(nom), valeur); } catch (e) { /* stockage indisponible */ }
}

// Retire une valeur de sessionStorage.
export function retirerSession(nom) {
  try { sessionStorage.removeItem(cle(nom)); } catch (e) { /* stockage indisponible */ }
}
