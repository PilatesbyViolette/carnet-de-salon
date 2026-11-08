// Écran « Rejoindre le carnet de [Entreprise] » (commercial invité, lien ?rejoindre=idDuTableau) :
// connexion Google, puis « Choisir le carnet partagé » (Google Picker), vérification (Mode = Équipe, code reconnu,
// e-mail dans l'onglet Équipe), et l'appli est activée sans code, rattachée au tableau de l'équipe.

import { afficher, enregistrerEcran, message, montrerErreur } from './interface.js';
import * as base from './base.js';
import * as drive from './drive.js';
import * as espace from './espace.js';
import { synchroniser } from './file.js';
import { demanderJeton, jetonValide, jetonActuel, compteConnu } from './connexion.js';
import { devenirCommercial, tableauCommercial } from './activation.js';
import { verifierPourRejoindre, synchroniserEquipe, chargerContexteEquipe } from './equipe.js';
import { lireInvitation } from './equipe-regles.js';
import { chargerPicker, choisirTableau } from './picker.js';
import { doitMontrerAide } from './aide.js';
import { lireLocal, ecrireLocal, retirerLocal } from './stockage.js';

const LOCAL_INVITATION = 'invitation';

// Invitation gardée ({ id, entreprise }), ou null.
export function invitationEnAttente() {
  try { return JSON.parse(lireLocal(LOCAL_INVITATION)); } catch (e) { return null; }
}

// Lit le lien d'invitation dans l'adresse (puis l'efface de la barre d'adresse) ; vrai s'il faut montrer l'écran.
export function capterInvitation() {
  const invitation = lireInvitation(location.search);
  if (invitation) {
    ecrireLocal(LOCAL_INVITATION, JSON.stringify(invitation));
    history.replaceState(history.state, '', location.pathname);
  }
  const attente = invitationEnAttente();
  if (attente && attente.id === tableauCommercial()) { retirerLocal(LOCAL_INVITATION); return false; } // déjà membre
  return !!attente;
}

// Met l'écran à jour : titre, compte connecté, bouton du Picker.
function preparer() {
  const invitation = invitationEnAttente() || {};
  document.getElementById('rejoindre-titre-entreprise').textContent = invitation.entreprise || 'votre équipe';
  const compte = compteConnu();
  document.getElementById('rejoindre-compte').textContent = compte ? 'Connecté avec ' + compte : '';
  document.getElementById('rejoindre-compte').hidden = !compte;
  document.getElementById('bouton-rejoindre-connexion').textContent = compte ? 'Changer de compte Google' : 'Se connecter avec Google';
  document.getElementById('bouton-rejoindre-connexion').className = 'bouton ' + (compte ? 'bouton-discret' : 'bouton-principal');
  document.getElementById('bouton-choisir-carnet').hidden = !compte;
  document.getElementById('rejoindre-etat').hidden = true;
  if (compte && navigator.onLine) chargerPicker().catch(() => { /* réessayé au tap */ });
}

// « Se connecter avec Google » (fenêtre dans le geste), puis e-mail du compte gardé.
function surConnexion() {
  demanderJeton(true)
    .then(() => drive.lireEmailCompte())
    .then((email) => { ecrireLocal('compte', email); preparer(); })
    .catch((e) => montrerErreur(e.message));
}

// « Choisir le carnet partagé » : jeton (dans le geste si périmé), Picker, puis vérification et rattachement.
function surChoisir() {
  const invitation = invitationEnAttente() || {};
  const jeton = jetonValide() ? Promise.resolve(jetonActuel()) : demanderJeton(false);
  jeton
    .then((valeur) => choisirTableau(valeur || jetonActuel(), invitation.id))
    .then((id) => (id ? rejoindre(id, invitation) : null))
    .catch((e) => { document.getElementById('rejoindre-etat').hidden = true; montrerErreur(e.message); });
}

// Vérifie le tableau choisi et rattache l'appli à l'équipe.
async function rejoindre(id, invitation) {
  const enAttente = (await base.tousLesContacts()).filter((c) => c.statut && c.etat !== 'ecrit').length;
  if (enAttente || (await espace.operationsEnAttente()).length || (await espace.relancesEnAttente())) {
    throw new Error('Des contacts de votre carnet actuel ne sont pas encore envoyés vers votre Drive : synchronisez-les (Réglages, Synchroniser maintenant) avant de rejoindre l\'équipe.');
  }
  document.getElementById('rejoindre-etat').hidden = false;
  const info = await verifierPourRejoindre(id);
  // Le carnet précédent (essai, Solo) reste dans le Drive ; le téléphone repart sur celui de l'équipe
  await base.viderBase();
  espace.oublierEspace();
  await devenirCommercial(id, info.empreinte, info.entreprise || invitation.entreprise);
  retirerLocal(LOCAL_INVITATION);
  await espace.preparerEspace();
  await synchroniserEquipe();
  await espace.rafraichirDepuisTableau();
  await chargerContexteEquipe();
  document.getElementById('rejoindre-etat').hidden = true;
  message('Bienvenue dans l\'équipe' + (info.entreprise ? ' ' + info.entreprise : ''));
  afficher(doitMontrerAide() ? 'aide' : 'accueil');
  synchroniser();
}

// « Plus tard » : l'invitation est oubliée sur le téléphone (le lien reçu par e-mail reste valable), l'appli s'ouvre normalement.
function surPlusTard(suite) {
  retirerLocal(LOCAL_INVITATION);
  suite();
}

// Branche l'écran ; suite() ouvre l'écran habituel (activation, connexion ou accueil).
export function initRejoindre(suite) {
  enregistrerEcran('rejoindre', { afficher: preparer });
  document.getElementById('bouton-rejoindre-connexion').addEventListener('click', surConnexion);
  document.getElementById('bouton-choisir-carnet').addEventListener('click', surChoisir);
  document.getElementById('bouton-rejoindre-annuler').addEventListener('click', () => surPlusTard(suite));
}
