// Base locale IndexedDB « carnet » : tout contact y est écrit avant toute synchronisation (local d'abord).
// Magasins : « contacts » (clé id) et « reglages » (clé cle, valeur valeur).

export const VERIFIE = 'Vérifié dans l\'appli';
export const A_VERIFIER = 'À vérifier';

import { ENV } from './environnement.js';

const NOM_BASE = ENV.nomBase; // « carnet » en production, « carnet-equipe-test » dans la version de test
const VERSION_BASE = 1;
let promesseBase = null;

// Ouvre la base une seule fois et crée les magasins au premier lancement.
function ouvrir() {
  if (!promesseBase) {
    promesseBase = new Promise((ok, ko) => {
      const demande = indexedDB.open(NOM_BASE, VERSION_BASE);
      demande.onupgradeneeded = () => {
        const db = demande.result;
        if (!db.objectStoreNames.contains('contacts')) db.createObjectStore('contacts', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('reglages')) db.createObjectStore('reglages', { keyPath: 'cle' });
      };
      demande.onsuccess = () => ok(demande.result);
      demande.onerror = () => ko(new Error('Base locale inaccessible : ' + (demande.error && demande.error.message)));
    });
  }
  return promesseBase;
}

// Exécute une opération dans une transaction et renvoie son résultat une fois la transaction terminée.
async function operation(magasin, mode, action) {
  const db = await ouvrir();
  return new Promise((ok, ko) => {
    const transaction = db.transaction(magasin, mode);
    let resultat;
    const demande = action(transaction.objectStore(magasin));
    if (demande) demande.onsuccess = () => { resultat = demande.result; };
    transaction.oncomplete = () => ok(resultat);
    transaction.onerror = transaction.onabort = () => ko(new Error('Base locale : ' + (transaction.error && transaction.error.message)));
  });
}

// Ajoute ou remplace un contact.
export function ajouterContact(contact) {
  return operation('contacts', 'readwrite', (m) => m.put(contact));
}

// Lit un contact par son identifiant (undefined s'il n'existe pas).
export function lireContact(id) {
  return operation('contacts', 'readonly', (m) => m.get(id));
}

// Renvoie tous les contacts locaux.
export function tousLesContacts() {
  return operation('contacts', 'readonly', (m) => m.getAll());
}

// Supprime un contact local.
export function supprimerContact(id) {
  return operation('contacts', 'readwrite', (m) => m.delete(id));
}

// Modifie un contact dans une seule transaction (lecture puis écriture) ; renvoie le contact modifié ou null.
export async function majContact(id, modifier) {
  const db = await ouvrir();
  return new Promise((ok, ko) => {
    const transaction = db.transaction('contacts', 'readwrite');
    const magasin = transaction.objectStore('contacts');
    let resultat = null;
    const demande = magasin.get(id);
    demande.onsuccess = () => {
      const contact = demande.result;
      if (!contact) return;
      modifier(contact);
      magasin.put(contact);
      resultat = contact;
    };
    transaction.oncomplete = () => ok(resultat);
    transaction.onerror = transaction.onabort = () => ko(new Error('Base locale : ' + (transaction.error && transaction.error.message)));
  });
}

// Lit un réglage local (valeur par défaut s'il est absent).
export async function lireReglage(cle, defaut) {
  const ligne = await operation('reglages', 'readonly', (m) => m.get(cle));
  return ligne ? ligne.valeur : defaut;
}

// Écrit un réglage local.
export function ecrireReglage(cle, valeur) {
  return operation('reglages', 'readwrite', (m) => m.put({ cle, valeur }));
}

// Supprime un réglage local.
export function supprimerReglage(cle) {
  return operation('reglages', 'readwrite', (m) => m.delete(cle));
}

// Renvoie tous les réglages locaux sous forme d'objet { cle: valeur }.
export async function tousLesReglages() {
  const lignes = await operation('reglages', 'readonly', (m) => m.getAll());
  const reglages = {};
  lignes.forEach((l) => { reglages[l.cle] = l.valeur; });
  return reglages;
}

// Vide entièrement la base (déconnexion).
export async function viderBase() {
  await operation('contacts', 'readwrite', (m) => m.clear());
  await operation('reglages', 'readwrite', (m) => m.clear());
}
