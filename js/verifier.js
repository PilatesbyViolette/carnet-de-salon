// Écran « À vérifier » : contacts écrits avec le statut « À vérifier » (enregistrés avant la lecture de la carte).
// Un tap ouvre les champs ; « Valider » met à jour la ligne du tableau et passe le statut à « Vérifié dans l'appli ».

import { enregistrerEcran, el, message, montrerErreur } from './interface.js';
import * as base from './base.js';
import * as espace from './espace.js';
import { jetonDansLeGeste } from './connexion.js';
import { dateCourte } from './dates.js';
import { nomAffiche } from './accueil.js';

const CHAMPS = ['nom', 'entreprise', 'email', 'tel', 'site', 'note'];
let enCours = null; // contact ouvert

// Champ de la fiche d'après son nom.
function champ(nom) {
  return document.getElementById('verif-' + nom);
}

// Affiche la liste des contacts à vérifier.
async function afficherListe() {
  enCours = null;
  document.getElementById('fiche-verifier').hidden = true;
  document.getElementById('liste-verifier-bloc').hidden = false;
  const contacts = (await espace.vueContacts()).filter((c) => c.statut === base.A_VERIFIER && c.etat === 'ecrit');
  document.getElementById('liste-verifier').replaceChildren(...contacts.map((c) =>
    el('li', {},
      el('button', { class: 'contact contact-bouton', type: 'button', onclick: () => ouvrirFiche(c) },
        el('div', { class: 'contact__texte' },
          el('div', { class: 'contact__nom' }, nomAffiche(c)),
          el('div', { class: 'contact__info' }, [c.entreprise, dateCourte(c.creeLe)].filter(Boolean).join(' · '))),
        el('span', { class: 'badge badge-verifier' }, 'Vérifier')))));
  document.getElementById('aucun-a-verifier').hidden = contacts.length > 0;
}

// Ouvre la fiche d'un contact : champs modifiables, texte lu sur la carte, lien vers la photo.
function ouvrirFiche(c) {
  enCours = c;
  CHAMPS.forEach((k) => { champ(k).value = c[k] || ''; });
  document.getElementById('verif-texte').textContent = c.texte || '(aucun texte lu)';
  const lien = document.getElementById('verif-photo');
  lien.hidden = !c.photoLien;
  if (c.photoLien) lien.href = c.photoLien;
  document.getElementById('liste-verifier-bloc').hidden = true;
  document.getElementById('fiche-verifier').hidden = false;
  window.scrollTo(0, 0);
}

// Valider : jeton redemandé dans le geste si besoin, puis mise à jour de la ligne dans le tableau.
function surValider(evenement) {
  evenement.preventDefault();
  if (!enCours) return;
  if (!navigator.onLine) { montrerErreur('Pas de réseau : la validation demande une connexion.'); return; }
  const contact = enCours;
  const champs = {};
  CHAMPS.forEach((k) => { champs[k] = champ(k).value.trim(); });
  jetonDansLeGeste()
    .then(() => espace.validerContact(contact, champs))
    .then(() => { message('Contact vérifié'); afficherListe(); })
    .catch((e) => montrerErreur('Validation impossible : ' + e.message));
}

// Branche l'écran.
export function initVerifier() {
  enregistrerEcran('verifier', { afficher: afficherListe });
  document.getElementById('formulaire-verifier').addEventListener('submit', surValider);
  document.getElementById('bouton-retour-liste').addEventListener('click', afficherListe);
}
