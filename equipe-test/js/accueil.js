// Écran Accueil : compteurs du jour et du total, pastilles d'état, envois en erreur, derniers contacts.

import { afficher, enregistrerEcran, el, pluriel, montrerErreur, ecranAffiche } from './interface.js';import * as base from './base.js';
import * as espace from './espace.js';
import { synchroniser, reessayer, dernierEtat } from './file.js';
import { jetonValide, demanderJeton, jetonDansLeGeste, compteConnu } from './connexion.js';
import { jourDuJour, dateCourte } from './dates.js';
import { contactsARelancer } from './relances.js';
import { finEssai, essaiTermine } from './activation.js';
import { nomAffiche, elementContact } from './contacts.js';
import { contexteEquipe } from './equipe.js';
import { compteursParMembre, estAMoi, ROLE_RESPONSABLE, ROLE_COMMERCIAL } from './equipe-regles.js';

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

// Nom à afficher et ligne de contact (tap = fiche) : communs avec « Tous les contacts ».
export { nomAffiche } from './contacts.js';

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

// Pastille de l'essai : date de fin, ou « Essai terminé » (toucher ouvre l'écran d'achat).
function pastilleEssai() {
  const fin = finEssai();
  const p = document.getElementById('pastille-essai');
  p.hidden = fin == null;
  if (fin == null) return;
  const termine = essaiTermine();
  p.classList.toggle('pastille-alerte', termine);
  p.classList.toggle('pastille-bouton', termine);
  p.querySelector('span').textContent = termine ? 'Essai terminé : toucher pour acheter' : 'Essai jusqu\'au ' + dateCourte(fin);
}

// Rafraîchit tout l'accueil à partir de la vue locale (tableau + contacts pas encore écrits).
// Compteurs par commercial (responsable) : prénom, contacts du jour, total.
function afficherCompteursEquipe(tous, jour) {
  const ctx = contexteEquipe();
  const liste = document.getElementById('compteurs-equipe');
  liste.hidden = ctx.role !== ROLE_RESPONSABLE;
  if (liste.hidden) return;
  liste.replaceChildren(...compteursParMembre(tous, jour, ctx).map((m) =>
    el('li', { class: 'compteur-membre' },
      el('span', { class: 'compteur-membre__nom' }, m.prenom),
      el('span', { class: 'compteur-membre__chiffres' }, m.jour + ' aujourd\'hui · ' + m.total + ' au total'))));
}

export async function rafraichirAccueil() {
  const tous = await espace.vueContacts();
  const ctx = contexteEquipe();
  // Commercial : ses contacts ; responsable : toute l'équipe (avec le détail par commercial)
  const contacts = ctx.role === ROLE_COMMERCIAL ? tous.filter((c) => estAMoi(c, ctx)) : tous;
  const jour = jourDuJour();
  ecrire('chiffre-jour', contacts.filter((c) => String(c.creeLe).startsWith(jour)).length);
  ecrire('chiffre-total', contacts.length);
  ecrire('libelle-total', ctx.role === ROLE_RESPONSABLE ? 'au total, toute l\'équipe' : 'au total');
  afficherCompteursEquipe(tous, jour);

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

  const miensAVerifier = ctx.role === ROLE_RESPONSABLE ? tous.filter((c) => estAMoi(c, ctx)) : contacts;
  const aVerifier = miensAVerifier.filter((c) => c.statut === base.A_VERIFIER && c.etat === 'ecrit').length;
  ecrire('compte-a-verifier', aVerifier ? String(aVerifier) : '');
  const aRelancer = (await contactsARelancer()).length;
  ecrire('compte-a-relancer', aRelancer ? String(aRelancer) : '');
  pastilleEssai();

  const derniers = contacts.slice(0, 5);
  document.getElementById('liste-derniers').replaceChildren(...derniers.map(elementContact));
  document.getElementById('aucun-contact').hidden = derniers.length > 0;
  document.getElementById('bouton-tous-contacts').hidden = derniers.length === 0;
}

// Tap sur « Reconnexion nécessaire » : nouveau jeton dans le geste, puis synchronisation.
function surReconnexion() {
  demanderJeton(false).then(() => synchroniser()).catch((e) => montrerErreur(e.message));
}

// Branche les boutons de l'accueil et le rafraîchissement automatique.
export function initAccueil() {
  enregistrerEcran('accueil', { afficher: rafraichirAccueil });
  document.getElementById('pastille-reconnexion').addEventListener('click', surReconnexion);
  document.getElementById('pastille-essai').addEventListener('click', () => { if (essaiTermine()) afficher('essai'); });
  document.getElementById('bouton-a-verifier').addEventListener('click', () => afficher('verifier'));
  document.getElementById('bouton-a-relancer').addEventListener('click', () => afficher('relancer'));
  document.getElementById('bouton-reglages').addEventListener('click', () => afficher('reglages'));
  const siAccueil = () => { if (ecranAffiche() === 'accueil') rafraichirAccueil(); };
  ['carnet:sync', 'carnet:contact', 'carnet:contacts', 'carnet:jeton', 'carnet:activation', 'carnet:equipe', 'online', 'offline'].forEach((evt) => window.addEventListener(evt, siAccueil));
}
