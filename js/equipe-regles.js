// Règles du mode Équipe, sans interface ni appel Google (testables : tests/equipe.test.html).
// Qui a pris un contact, qui peut le modifier, compteurs par commercial, vérification d'un membre, lien d'invitation.

export const MODE_EQUIPE = 'Équipe';
export const CLE_MODE = 'Mode';
export const CLE_RESPONSABLE = 'Responsable';
export const CLE_CODE_EQUIPE = 'Code équipe';
export const ROLE_RESPONSABLE = 'responsable';
export const ROLE_COMMERCIAL = 'commercial';

// Le commercial n'a plus accès au carnet d'équipe (retiré, tableau supprimé, tableau qui n'est pas d'équipe).
export class ErreurEquipe extends Error {}

// E-mail comparable : sans espaces, en minuscules.
export function normaliserEmail(email) {
  return String(email || '').trim().toLowerCase();
}

// Vrai si le texte ressemble à une adresse e-mail.
export function emailValide(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

// Prénom proposé d'après l'e-mail (« julie.martin@… » donne « Julie ») quand personne ne l'a saisi.
export function prenomParDefaut(email) {
  const debut = String(email || '').split('@')[0].split(/[._+-]/)[0] || '';
  return debut ? debut.charAt(0).toUpperCase() + debut.slice(1).toLowerCase() : '';
}

// Lignes de l'onglet Équipe (sans l'en-tête) en membres { email, prenom, role, ajouteLe }.
export function lignesVersMembres(lignes) {
  return (lignes || [])
    .map((l) => ({ email: String(l[0] || '').trim(), prenom: String(l[1] || '').trim(), role: String(l[2] || '').trim().toLowerCase() || ROLE_COMMERCIAL, ajouteLe: String(l[3] || '') }))
    .filter((m) => m.email);
}

// Membre d'après son e-mail, ou null.
export function membreDe(membres, email) {
  const cible = normaliserEmail(email);
  return (membres || []).find((m) => normaliserEmail(m.email) === cible) || null;
}

// Prénom d'un membre (ou '' s'il n'est pas dans l'équipe).
export function prenomDe(membres, email) {
  const m = membreDe(membres, email);
  return m ? m.prenom || prenomParDefaut(m.email) : '';
}

// E-mail de la personne qui a pris le contact : contact local = moi ; sinon colonne « Compte » ; sinon « Pris par »
// (e-mail écrit par la version Solo, ou prénom d'un membre) ; à défaut, le responsable (lignes d'avant l'équipe).
export function proprietaire(c, contexte) {
  if (c.source === 'local') return normaliserEmail(contexte.moi);
  if (c.compte) return normaliserEmail(c.compte);
  const pris = String(c.prisPar || '').trim();
  if (pris.includes('@')) return normaliserEmail(pris);
  const memes = (contexte.membres || []).filter((m) => pris && m.prenom.toLowerCase() === pris.toLowerCase());
  if (memes.length === 1) return normaliserEmail(memes[0].email);
  return normaliserEmail(contexte.responsable);
}

// Vrai si le contact a été pris par moi.
export function estAMoi(c, contexte) {
  return proprietaire(c, contexte) === normaliserEmail(contexte.moi);
}

// Droits : en Solo et pour le responsable, tout ; un commercial, seulement ses contacts.
export function peutModifier(c, contexte) {
  if (contexte.role !== ROLE_COMMERCIAL) return true;
  return estAMoi(c, contexte);
}

// Prénom à afficher pour « Pris par » : celui du membre, sinon ce qui est écrit dans la colonne.
export function prisParAffiche(c, contexte) {
  const email = proprietaire(c, contexte);
  return prenomDe(contexte.membres, email) || (String(c.prisPar || '').includes('@') ? prenomParDefaut(c.prisPar) : c.prisPar || '');
}

// Contacts d'un membre (email) ; email vide : toute l'équipe.
export function filtrerParMembre(contacts, email, contexte) {
  if (!email) return contacts.slice();
  const cible = normaliserEmail(email);
  return contacts.filter((c) => proprietaire(c, contexte) === cible);
}

// Compteurs par membre : [{ email, prenom, jour, total }], dans l'ordre de l'onglet Équipe, puis les personnes qui
// ont des contacts sans être (ou plus être) dans l'équipe.
export function compteursParMembre(contacts, jour, contexte) {
  const parEmail = new Map();
  (contexte.membres || []).forEach((m) => parEmail.set(normaliserEmail(m.email), { email: m.email, prenom: m.prenom || prenomParDefaut(m.email), jour: 0, total: 0 }));
  for (const c of contacts) {
    const email = proprietaire(c, contexte);
    if (!parEmail.has(email)) parEmail.set(email, { email, prenom: prisParAffiche(c, contexte) || prenomParDefaut(email) || 'Sans nom', jour: 0, total: 0 });
    const ligne = parEmail.get(email);
    ligne.total++;
    if (String(c.creeLe).startsWith(jour)) ligne.jour++;
  }
  return [...parEmail.values()];
}

// Vérifie qu'un tableau est bien un carnet d'équipe dont l'e-mail fait partie ; renvoie '' si oui, sinon le message.
// reglages : paires [clé, valeur] de l'onglet Réglages ; empreinteValable(e) : vrai si js/codes.js reconnaît le code.
export function verifierAdhesion(reglages, membres, email, empreinteValable) {
  const valeur = (cle) => { const l = (reglages || []).find((r) => r[0] === cle); return l ? String(l[1] || '').trim() : ''; };
  if (valeur(CLE_MODE) !== MODE_EQUIPE) return 'Ce tableau n\'est pas un carnet d\'équipe. Choisissez le tableau « Carnet de salon · Mes contacts » que votre responsable a partagé avec vous.';
  if (!empreinteValable(valeur(CLE_CODE_EQUIPE))) return 'Le code Équipe de ce carnet n\'est pas reconnu. Demandez à votre responsable de vérifier sa licence.';
  if (!membreDe(membres, email)) return 'Votre adresse ' + email + ' ne fait pas partie de l\'équipe. Demandez à votre responsable de vous inviter avec cette adresse Google.';
  return '';
}

// Lien d'invitation : adresse de l'appli + ?rejoindre=idDuTableau (+ nom de l'entreprise pour l'écran d'accueil).
export function lienInvitation(adresseAppli, idTableau, entreprise) {
  return adresseAppli + '?rejoindre=' + encodeURIComponent(idTableau) + (entreprise ? '&entreprise=' + encodeURIComponent(entreprise) : '');
}

// Paramètres d'un lien d'invitation ({ id, entreprise }), ou null.
export function lireInvitation(recherche) {
  const p = new URLSearchParams(recherche || '');
  const id = (p.get('rejoindre') || '').trim();
  if (!/^[\w-]{10,}$/.test(id)) return null;
  return { id, entreprise: (p.get('entreprise') || '').trim().slice(0, 80) };
}

// E-mail d'invitation (objet et corps), envoyé depuis la messagerie du responsable.
export function messageInvitation({ prenom, entreprise, lien, email, signataire }) {
  const corps = [
    'Bonjour' + (prenom ? ' ' + prenom : '') + ',',
    '',
    'Je vous invite à rejoindre notre carnet de salon' + (entreprise ? ' ' + entreprise : '') + ' : les contacts que vous prendrez sur le stand iront directement dans notre tableau commun, et l\'appli vous dira qui relancer.',
    '',
    '1. Ouvrez ce lien sur votre téléphone : ' + lien,
    '2. Connectez-vous avec votre compte Google' + (email ? ' (' + email + ')' : '') + '.',
    '3. Touchez « Choisir le carnet partagé », sélectionnez « Carnet de salon · Mes contacts », puis « Sélectionner ».',
    '',
    'Pensez ensuite à installer l\'appli sur l\'écran d\'accueil : elle marche même sans réseau.',
    '',
    'Bien cordialement,'
  ];
  if (signataire) corps.push(signataire);
  return { objet: 'Rejoignez notre carnet de salon', corps: corps.join('\n') };
}
