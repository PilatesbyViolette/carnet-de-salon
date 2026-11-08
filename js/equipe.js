// Mode Équipe : préparation du tableau partagé (responsable), vérification du membre (commercial) à chaque
// synchronisation, contexte des droits pour les écrans, et écran « Mon équipe » (liste, invitation, retrait).
// Tableau « Carnet de salon · Mes contacts » du responsable : onglet Réglages (Mode = Équipe, Responsable,
// Code équipe = empreinte SHA-256 du code), onglet Équipe (E-mail, Prénom, Rôle, Ajouté le), colonne O « Compte ».

import * as base from './base.js';
import * as drive from './drive.js';
import * as espace from './espace.js';
import { compteConnu, jetonDansLeGeste } from './connexion.js';
import { roleEquipe, empreinteCodeEquipe, empreinteEquipeValable } from './activation.js';
import { afficher, enregistrerEcran, el, message, montrerErreur, confirmer, copierTexte, lienMailto } from './interface.js';
import { dateIso, dateCourte } from './dates.js';
import { ENV } from './environnement.js';
import * as R from './equipe-regles.js';

let contexte = { role: '', moi: '', responsable: '', membres: [] };

// Contexte des droits (rôle, e-mail du compte, responsable, membres) : lecture immédiate pour les écrans.
export function contexteEquipe() {
  return contexte;
}

// Vrai en mode Équipe (responsable ou commercial).
export function enEquipe() {
  return !!roleEquipe();
}

// Recharge le contexte depuis la base locale (après une synchronisation, une invitation, au démarrage).
export async function chargerContexteEquipe() {
  const role = roleEquipe();
  const moi = compteConnu();
  contexte = {
    role, moi,
    responsable: (await base.lireReglage(R.CLE_RESPONSABLE, '')) || (role === R.ROLE_RESPONSABLE ? moi : ''),
    membres: role ? await base.lireReglage('_equipe', []) : []
  };
  return contexte;
}

// Synchronisation (appelée par la file après preparerEspace) : responsable, tableau mis en mode Équipe et membres
// relus ; commercial, appartenance vérifiée (ErreurEquipe sinon : il retombe sur l'écran d'activation).
export async function synchroniserEquipe() {
  const role = roleEquipe();
  if (!role) return;
  if (role === R.ROLE_RESPONSABLE) await preparerEquipeResponsable();
  else await verifierCommercial();
  await chargerContexteEquipe();
  window.dispatchEvent(new CustomEvent('carnet:equipe'));
}

// Responsable : clés Réglages du mode Équipe, onglet Équipe et colonne Compte (une fois par tableau), membres relus,
// prénom du responsable (« Votre prénom » des Réglages) recopié dans l'onglet Équipe.
async function preparerEquipeResponsable() {
  const id = espace.idTableau();
  const moi = compteConnu();
  const voulu = { [R.CLE_MODE]: R.MODE_EQUIPE, [R.CLE_RESPONSABLE]: moi, [R.CLE_CODE_EQUIPE]: empreinteCodeEquipe() };
  let change = false;
  for (const [cle, valeur] of Object.entries(voulu)) {
    if (valeur && (await base.lireReglage(cle, '')) !== valeur) { await base.ecrireReglage(cle, valeur); change = true; }
  }
  if (change) await base.ecrireReglage('_activationAEnvoyer', true);
  const prenomReglages = String(await espace.reglage('Votre nom')).trim();
  if ((await base.lireReglage('_equipePrete', '')) !== id) {
    if (!(await drive.titresOnglets(id)).includes(drive.ONGLET_EQUIPE)) {
      await drive.ajouterOnglet(id, drive.ONGLET_EQUIPE, [drive.ENTETES_EQUIPE,
        [moi, prenomReglages || R.prenomParDefaut(moi), R.ROLE_RESPONSABLE, dateIso(new Date())]]);
    }
    const o1 = await drive.lirePlage(id, 'Contacts', 'O1');
    if (!(o1[0] && o1[0][0])) await drive.ecrirePlage(id, 'Contacts', 'O1', [['Compte']]);
    await base.ecrireReglage('_equipePrete', id);
  }
  let lignes = await drive.lirePlage(id, drive.ONGLET_EQUIPE, 'A2:D');
  const rang = () => lignes.findIndex((l) => R.normaliserEmail(l[0]) === R.normaliserEmail(moi));
  if (rang() < 0) { // ligne du responsable effacée à la main : remise
    await drive.ajouterLigneOnglet(id, drive.ONGLET_EQUIPE, [moi, prenomReglages || R.prenomParDefaut(moi), R.ROLE_RESPONSABLE, dateIso(new Date())]);
    lignes = await drive.lirePlage(id, drive.ONGLET_EQUIPE, 'A2:D');
  }
  const i = rang();
  if (i >= 0 && prenomReglages && String(lignes[i][1] || '') !== prenomReglages) {
    await drive.ecrirePlage(id, drive.ONGLET_EQUIPE, 'B' + (i + 2), [[prenomReglages]]);
    lignes[i][1] = prenomReglages;
  }
  await base.ecrireReglage('_equipe', R.lignesVersMembres(lignes));
}

// Lit Réglages et Équipe d'un tableau d'équipe ; accès refusé ou onglet absent : ErreurEquipe.
async function lireTableauEquipe(id) {
  try {
    const reglages = await drive.lireReglagesTableau(id);
    const membres = R.lignesVersMembres(await drive.lirePlage(id, drive.ONGLET_EQUIPE, 'A2:D'));
    const valeur = (cle) => { const l = reglages.find((r) => r[0] === cle); return l ? String(l[1] || '').trim() : ''; };
    return { reglages, membres, valeur };
  } catch (e) {
    if ([400, 403, 404].includes(e.statut)) throw new R.ErreurEquipe('Ce carnet d\'équipe n\'est pas accessible avec votre compte Google (partage retiré, tableau supprimé ou ce n\'est pas un carnet d\'équipe).');
    throw e;
  }
}

// Commercial : toujours membre d'une équipe valable ? Sinon ErreurEquipe. Partage aussi son dossier de photos avec le
// responsable (lecture seule), pour que les liens « Photo » du tableau s'ouvrent chez lui.
async function verifierCommercial() {
  const t = await lireTableauEquipe(espace.idTableau());
  const motif = R.verifierAdhesion(t.reglages, t.membres, compteConnu(), empreinteEquipeValable);
  if (motif) throw new R.ErreurEquipe(motif);
  await base.ecrireReglage('_equipe', t.membres);
  const responsable = t.valeur(R.CLE_RESPONSABLE);
  await base.ecrireReglage(R.CLE_RESPONSABLE, responsable);
  if (responsable && espace.idDossier() && (await base.lireReglage('_dossierPartageAvec', '')) !== responsable) {
    try {
      await drive.partager(espace.idDossier(), responsable, 'reader');
      await base.ecrireReglage('_dossierPartageAvec', responsable);
    } catch (e) { /* non bloquant : le responsable ouvrira la photo plus tard */ }
  }
}

// Rejoindre : le tableau choisi est-il un carnet d'équipe dont ce compte fait partie ? Renvoie { empreinte, entreprise }
// ou lève une erreur lisible.
export async function verifierPourRejoindre(id) {
  const t = await lireTableauEquipe(id);
  const motif = R.verifierAdhesion(t.reglages, t.membres, compteConnu(), empreinteEquipeValable);
  if (motif) throw new R.ErreurEquipe(motif);
  return { empreinte: t.valeur(R.CLE_CODE_EQUIPE), entreprise: t.valeur('Votre entreprise') };
}

// ---------- Invitation et retrait (responsable, en ligne) ----------

// Invite un commercial : partage du tableau (écriture) et du dossier des photos (lecture), ligne dans l'onglet Équipe ;
// renvoie le lien d'invitation et le lien mailto: prêt à envoyer depuis la messagerie du responsable.
export async function inviter(emailSaisi, prenomSaisi) {
  if (!navigator.onLine) throw new Error('Pas de réseau : l\'invitation demande une connexion.');
  const email = String(emailSaisi || '').trim();
  if (!R.emailValide(email)) throw new Error('Saisissez l\'adresse Google du commercial (par exemple prenom@gmail.com ou son adresse professionnelle Google).');
  const prenom = String(prenomSaisi || '').trim() || R.prenomParDefaut(email);
  await espace.preparerEspace();
  await preparerEquipeResponsable();
  if (R.membreDe(await base.lireReglage('_equipe', []), email)) throw new Error(prenom + ' (' + email + ') fait déjà partie de l\'équipe.');
  const id = espace.idTableau();
  await drive.partager(id, email, 'writer');
  let avertissement = '';
  try { await drive.partager(espace.idDossier(), email, 'reader'); } catch (e) { avertissement = 'Dossier des photos non partagé : ' + e.message; }
  await drive.ajouterLigneOnglet(id, drive.ONGLET_EQUIPE, [email, prenom, R.ROLE_COMMERCIAL, dateIso(new Date())]);
  await preparerEquipeResponsable();
  await chargerContexteEquipe();
  const entreprise = await espace.reglage('Votre entreprise');
  const lien = R.lienInvitation(ENV.adresseAppli, id, entreprise);
  const signataire = R.prenomDe(contexte.membres, compteConnu());
  const m = R.messageInvitation({ prenom, entreprise, lien, email, signataire });
  return { email, prenom, lien, mailto: lienMailto(email, m.objet, m.corps), avertissement };
}

// Retire un commercial : partages du tableau et du dossier supprimés, ligne de l'onglet Équipe supprimée.
// Ses contacts restent dans le tableau.
export async function retirer(membre) {
  if (!navigator.onLine) throw new Error('Pas de réseau : le retrait demande une connexion.');
  await espace.preparerEspace();
  const id = espace.idTableau();
  await drive.retirerPartage(id, membre.email);
  try { await drive.retirerPartage(espace.idDossier(), membre.email); } catch (e) { /* dossier : non bloquant */ }
  const colonne = await drive.lirePlage(id, drive.ONGLET_EQUIPE, 'A:A');
  const index = colonne.findIndex((l) => R.normaliserEmail(l[0]) === R.normaliserEmail(membre.email));
  if (index >= 1) await drive.supprimerLigne(id, await drive.idOnglet(id, drive.ONGLET_EQUIPE), index + 1);
  await preparerEquipeResponsable();
  await chargerContexteEquipe();
}

// ---------- Écran « Mon équipe » ----------

// Ligne d'un membre : prénom, e-mail, rôle ; « Retirer » pour un commercial.
function elementMembre(m) {
  const responsable = m.role === R.ROLE_RESPONSABLE;
  return el('li', { class: 'membre' },
    el('div', { class: 'contact__texte' },
      el('div', { class: 'contact__nom' }, m.prenom || R.prenomParDefaut(m.email)),
      el('div', { class: 'contact__info' }, [m.email, responsable ? 'responsable' : 'commercial', m.ajouteLe ? 'ajouté le ' + dateCourte(m.ajouteLe).slice(0, 5) : ''].filter(Boolean).join(' · '))),
    responsable ? null : el('button', { class: 'bouton bouton-petit bouton-discret', type: 'button', onclick: () => surRetirer(m) }, 'Retirer'));
}

// Remplit la liste des membres.
async function afficherMembres() {
  await chargerContexteEquipe();
  document.getElementById('liste-membres').replaceChildren(...contexte.membres.map(elementMembre));
  document.getElementById('aucun-membre').hidden = contexte.membres.length > 0;
}

// À l'affichage : liste locale, formulaire replié.
function afficherEcran() {
  document.getElementById('formulaire-invitation').hidden = true;
  document.getElementById('bouton-inviter').hidden = false;
  document.getElementById('invitation-prete').hidden = true;
  afficherMembres().catch((e) => montrerErreur('Équipe : ' + e.message));
}

// « Inviter » : jeton redemandé dans le geste si besoin, puis partage et lien prêt à envoyer.
function surInviter(evenement) {
  evenement.preventDefault();
  const email = document.getElementById('invite-email').value;
  const prenom = document.getElementById('invite-prenom').value;
  const bouton = document.getElementById('bouton-envoyer-invitation');
  bouton.disabled = true;
  jetonDansLeGeste()
    .then(() => inviter(email, prenom))
    .then((r) => {
      document.getElementById('invite-email').value = '';
      document.getElementById('invite-prenom').value = '';
      document.getElementById('formulaire-invitation').hidden = true;
      document.getElementById('bouton-inviter').hidden = false;
      document.getElementById('invitation-texte').textContent = r.prenom + ' a accès au carnet. Envoyez-lui le lien pour rejoindre l\'équipe :';
      document.getElementById('invitation-lien').textContent = r.lien;
      document.getElementById('invitation-mailto').href = r.mailto;
      document.getElementById('invitation-copier').onclick = () => copierTexte(r.lien).then((ok) => (ok ? message('Lien copié') : montrerErreur('Copie impossible : sélectionnez le lien à la main.')));
      document.getElementById('invitation-prete').hidden = false;
      if (r.avertissement) montrerErreur(r.avertissement);
      afficherMembres();
    })
    .catch((e) => montrerErreur('Invitation impossible : ' + e.message))
    .finally(() => { bouton.disabled = false; });
}

// « Retirer » : confirmation, puis retrait (jeton redemandé dans le geste si besoin).
function surRetirer(m) {
  const jeton = jetonDansLeGeste().catch(() => {});
  const nom = m.prenom || m.email;
  confirmer('Retirer ' + nom + ' de l\'équipe ? ' + nom + ' n\'aura plus accès au tableau. Ses contacts restent dans le tableau.', 'Retirer')
    .then((oui) => {
      if (!oui) return null;
      return jeton.then(() => retirer(m)).then(() => { message(nom + ' retiré(e) de l\'équipe'); return afficherMembres(); });
    })
    .catch((e) => montrerErreur('Retrait impossible : ' + e.message));
}

// Branche l'écran « Mon équipe ».
export function initEquipe() {
  enregistrerEcran('equipe', { afficher: afficherEcran });
  document.getElementById('bouton-mon-equipe').addEventListener('click', () => afficher('equipe'));
  document.getElementById('bouton-inviter').addEventListener('click', () => {
    document.getElementById('bouton-inviter').hidden = true;
    document.getElementById('formulaire-invitation').hidden = false;
    document.getElementById('invitation-prete').hidden = true;
    document.getElementById('invite-email').focus();
  });
  document.getElementById('formulaire-invitation').addEventListener('submit', surInviter);
  document.getElementById('invitation-mailto').addEventListener('click', () => message('Votre messagerie s\'ouvre avec l\'invitation prête'));
}
