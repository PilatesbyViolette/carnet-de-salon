// Écran Accueil : compteurs du jour et du total, pastilles d'état, envois en erreur, derniers contacts.

import { afficher, enregistrerEcran, el, pluriel, montrerErreur, ecranAffiche } from './interface.js';
import * as base from './base.js';
import * as espace from './espace.js';
import { synchroniser, reessayer, dernierEtat } from './file.js';
import { jetonValide, demanderJeton, jetonDansLeGeste, compteConnu } from './connexion.js';
import { jourDuJour, dateCourte } from './dates.js';

// Écrit un texte dans l'élément d'identifiant donné.
function ecrire(id, texte) {
  document.getElementById(id).textContent = texte;
}

// Montre ou cache une pastille, avec son texte.
function pastille(id, visible, texte) {
  const p = document.getElementById(id);
  p.hidden = !visible;
  if (visible && texte) p.querySelector('span').textContent = texte;
}

// Nom à afficher pour un contact.
export function nomAffiche(c) {
  return c.nom || c.entreprise || c.email || 'Contact sans nom';
}

// Élément de liste pour un contact (nom, entreprise, heure, badge d'état).
function elementContact(c) {
  let badge = null;
  if (c.source === 'local' && c.etat !== 'ecrit') badge = el('span', { class: 'badge badge-attente' }, 'En attente');
  else if (c.statut === base.A_VERIFIER) badge = el('span', { class: 'badge badge-verifier' }, 'À vérifier');
  return el('li', { class: 'contact' },
    el('div', { class: 'contact__texte' },
      el('div', { class: 'contact__nom' }, nomAffiche(c)),
      el('div', { class: 'contact__info' }, [c.entreprise && c.nom ? c.entreprise : '', dateCourte(c.creeLe)].filter(Boolean).join(' · '))),
    badge);
}

// Élément pour un envoi en erreur, avec le message Google et le bouton « Réessayer ».
function elementErreur(c) {
  const bouton = el('button', { class: 'bouton bouton-petit', type: 'button' }, 'Réessayer');
  bouton.addEventListener('click', () => {
    const jeton = jetonDansLeGeste().catch((e) => montrerErreur(e.message)); // dans le geste, avant tout await
    reessayer(c.id).then(() => jeton).then(() => synchroniser());
  });
  return el('li', { class: 'erreur-envoi' },
    el('div', {}, el('strong', {}, nomAffiche(c)), el('div', { class: 'erreur-envoi__detail' }, c.derniereErreur || 'Envoi impossible')),
    bouton);
}

// Rafraîchit tout l'accueil à partir de la vue locale (tableau + contacts pas encore écrits).
export async function rafraichirAccueil() {
  const contacts = await espace.vueContacts();
  const jour = jourDuJour();
  ecrire('chiffre-jour', contacts.filter((c) => String(c.creeLe).startsWith(jour)).length);
  ecrire('chiffre-total', contacts.length);

  const locaux = (await base.tousLesContacts()).filter((c) => c.statut);
  const enAttente = locaux.filter((c) => c.etat !== 'ecrit' && c.etat !== 'erreur').length;
  const enErreur = locaux.filter((c) => c.etat === 'erreur');
  pastille('pastille-attente', enAttente > 0, pluriel(enAttente, 'contact') + ' en attente d\'envoi');
  pastille('pastille-envoi', dernierEtat.enCours && enAttente > 0, 'Envoi en cours');
  pastille('pastille-horsligne', !navigator.onLine, 'Hors connexion : vos contacts restent sur le téléphone');
  pastille('pastille-reconnexion', navigator.onLine && !!compteConnu() && !jetonValide(), 'Reconnexion nécessaire : toucher ici');

  const listeErreurs = document.getElementById('liste-erreurs');
  listeErreurs.replaceChildren(...enErreur.map(elementErreur));
  listeErreurs.hidden = enErreur.length === 0;

  const aVerifier = contacts.filter((c) => c.statut === base.A_VERIFIER && c.etat === 'ecrit').length;
  ecrire('compte-a-verifier', aVerifier ? String(aVerifier) : '');

  const derniers = contacts.slice(0, 5);
  document.getElementById('liste-derniers').replaceChildren(...derniers.map(elementContact));
  document.getElementById('aucun-contact').hidden = derniers.length > 0;
}

// Tap sur « Reconnexion nécessaire » : nouveau jeton dans le geste, puis synchronisation.
function surReconnexion() {
  demanderJeton(false).then(() => synchroniser()).catch((e) => montrerErreur(e.message));
}

// Branche les boutons de l'accueil et le rafraîchissement automatique.
export function initAccueil() {
  enregistrerEcran('accueil', { afficher: rafraichirAccueil });
  document.getElementById('pastille-reconnexion').addEventListener('click', surReconnexion);
  document.getElementById('bouton-a-verifier').addEventListener('click', () => afficher('verifier'));
  document.getElementById('bouton-a-relancer').addEventListener('click', () => afficher('relancer'));
  document.getElementById('bouton-reglages').addEventListener('click', () => afficher('reglages'));
  const siAccueil = () => { if (ecranAffiche() === 'accueil') rafraichirAccueil(); };
  ['carnet:sync', 'carnet:contact', 'carnet:jeton', 'online', 'offline'].forEach((evt) => window.addEventListener(evt, siAccueil));
}
