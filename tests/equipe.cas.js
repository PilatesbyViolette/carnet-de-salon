// Tests des règles du mode Équipe (js/equipe-regles.js) : qui a pris un contact, droits, compteurs, vérification
// d'un membre, lien et e-mail d'invitation. Utilisés par tests/equipe.test.html (navigateur) et en ligne de commande
// (node --input-type=module -e "import('./tests/equipe.cas.js').then(...)").

import * as R from '../js/equipe-regles.js';

export async function lancerTests() {
  const resultats = [];
  const verifier = (nom, attendu, obtenu) => resultats.push({ nom, attendu: JSON.stringify(attendu), obtenu: JSON.stringify(obtenu) });

  const membres = R.lignesVersMembres([
    ['nicolas@exemple.com', 'Nicolas', 'responsable', '2026-11-09T08:00:00+01:00'],
    ['julie.martin@exemple.com', 'Julie', 'commercial', '2026-11-09T08:05:00+01:00'],
    ['Paul@Exemple.com', '', 'commercial', ''],
    ['', 'ligne vide', '', '']
  ]);
  const ctxResp = { role: 'responsable', moi: 'nicolas@exemple.com', responsable: 'nicolas@exemple.com', membres };
  const ctxJulie = { role: 'commercial', moi: 'julie.martin@exemple.com', responsable: 'nicolas@exemple.com', membres };
  const ctxSolo = { role: '', moi: 'nicolas@exemple.com', responsable: '', membres: [] };

  verifier('Onglet Équipe : lignes vides ignorées', 3, membres.length);
  verifier('Prénom absent : tiré de l\'e-mail', 'Paul', R.prenomDe(membres, 'paul@exemple.com'));
  verifier('E-mail comparé sans casse', 'Julie', R.prenomDe(membres, ' JULIE.MARTIN@exemple.com '));
  verifier('Prénom par défaut d\'un e-mail composé', 'Julie', R.prenomParDefaut('julie.martin@exemple.com'));

  const deJulie = { id: 'a', compte: 'julie.martin@exemple.com', prisPar: 'Julie', source: 'tableau' };
  const deNicolas = { id: 'b', compte: 'nicolas@exemple.com', prisPar: 'Nicolas', source: 'tableau' };
  const ancienSolo = { id: 'c', compte: '', prisPar: 'nicolas@exemple.com', source: 'tableau' };
  const sansCompte = { id: 'd', compte: '', prisPar: 'Julie', source: 'tableau' };
  const inconnu = { id: 'e', compte: '', prisPar: '', source: 'tableau' };
  const local = { id: 'f', source: 'local' };

  verifier('Propriétaire : colonne Compte', 'julie.martin@exemple.com', R.proprietaire(deJulie, ctxResp));
  verifier('Propriétaire : ligne Solo (e-mail dans Pris par)', 'nicolas@exemple.com', R.proprietaire(ancienSolo, ctxJulie));
  verifier('Propriétaire : prénom d\'un membre sans colonne Compte', 'julie.martin@exemple.com', R.proprietaire(sansCompte, ctxResp));
  verifier('Propriétaire : rien d\'écrit, le responsable', 'nicolas@exemple.com', R.proprietaire(inconnu, ctxJulie));
  verifier('Propriétaire : contact pas encore envoyé, moi', 'julie.martin@exemple.com', R.proprietaire(local, ctxJulie));

  verifier('Droits : le commercial modifie ses contacts', true, R.peutModifier(deJulie, ctxJulie));
  verifier('Droits : le commercial ne modifie pas ceux du responsable', false, R.peutModifier(deNicolas, ctxJulie));
  verifier('Droits : le commercial ne modifie pas les anciennes lignes Solo', false, R.peutModifier(ancienSolo, ctxJulie));
  verifier('Droits : le responsable modifie tout', true, R.peutModifier(deJulie, ctxResp));
  verifier('Droits : en Solo, tout', true, R.peutModifier(deJulie, ctxSolo));

  verifier('Pris par affiché : prénom du membre', 'Julie', R.prisParAffiche(deJulie, ctxResp));
  verifier('Pris par affiché : ligne Solo, prénom tiré de l\'e-mail', 'Nicolas', R.prisParAffiche(ancienSolo, ctxResp));

  const contacts = [
    Object.assign({ creeLe: '2026-11-09T10:00:00+01:00' }, deJulie),
    Object.assign({ creeLe: '2026-11-08T10:00:00+01:00' }, deJulie, { id: 'a2' }),
    Object.assign({ creeLe: '2026-11-09T11:00:00+01:00' }, deNicolas),
    Object.assign({ creeLe: '2026-11-09T12:00:00+01:00', compte: 'ancien@exemple.com', prisPar: 'Marc' }, { id: 'g', source: 'tableau' })
  ];
  const compteurs = R.compteursParMembre(contacts, '2026-11-09', ctxResp);
  verifier('Compteurs par membre (ordre de l\'onglet, puis anciens membres)',
    [['Nicolas', 1, 1], ['Julie', 1, 2], ['Paul', 0, 0], ['Marc', 1, 1]],
    compteurs.map((m) => [m.prenom, m.jour, m.total]));
  verifier('Filtre par membre', ['a', 'a2'], R.filtrerParMembre(contacts, 'JULIE.martin@exemple.com', ctxResp).map((c) => c.id));
  verifier('Filtre « Toute l\'équipe »', 4, R.filtrerParMembre(contacts, '', ctxResp).length);

  const valable = (e) => e === 'empreinte-ok';
  const reglagesEquipe = [['Mode', 'Équipe'], ['Responsable', 'nicolas@exemple.com'], ['Code équipe', 'empreinte-ok']];
  verifier('Rejoindre : membre accepté', '', R.verifierAdhesion(reglagesEquipe, membres, 'Julie.Martin@exemple.com', valable));
  verifier('Rejoindre : tableau Solo refusé', true, R.verifierAdhesion([['Mode', '']], membres, 'julie.martin@exemple.com', valable).includes('pas un carnet d\'équipe'));
  verifier('Rejoindre : code inconnu refusé', true, R.verifierAdhesion([['Mode', 'Équipe'], ['Code équipe', 'autre']], membres, 'julie.martin@exemple.com', valable).includes('pas reconnu'));
  verifier('Rejoindre : e-mail absent refusé', true, R.verifierAdhesion(reglagesEquipe, membres, 'intrus@exemple.com', valable).includes('intrus@exemple.com ne fait pas partie'));

  const lien = R.lienInvitation('https://app.optimisons.ai/equipe-test/', '1AbC_dEf-123456789', 'Ateliers Dupont & Fils');
  verifier('Lien d\'invitation (test)', 'https://app.optimisons.ai/equipe-test/?rejoindre=1AbC_dEf-123456789&entreprise=Ateliers%20Dupont%20%26%20Fils', lien);
  verifier('Lien d\'invitation relu', { id: '1AbC_dEf-123456789', entreprise: 'Ateliers Dupont & Fils' }, R.lireInvitation(new URL(lien).search));
  verifier('Lien d\'invitation abîmé ignoré', null, R.lireInvitation('?rejoindre=<script>'));
  verifier('E-mail valide', [true, false, false], ['a@b.fr', 'a@b', 'a b@c.fr'].map(R.emailValide));

  const m = R.messageInvitation({ prenom: 'Julie', entreprise: 'Ateliers Dupont', lien, email: 'julie.martin@exemple.com', signataire: 'Nicolas' });
  verifier('Invitation : objet', 'Rejoignez notre carnet de salon', m.objet);
  verifier('Invitation : lien et trois étapes', [true, true, true, true],
    [m.corps.includes(lien), m.corps.includes('1. '), m.corps.includes('2. '), m.corps.includes('3. ')]);
  verifier('Invitation : jamais de tiret cadratin', false, new RegExp('\\u2014').test(m.corps));
  verifier('Invitation : se termine par la signature', 'Bien cordialement,\nNicolas', m.corps.split('\n').slice(-2).join('\n'));

  verifier('Autre code : proposé en essai, Solo ou démonstration', true, R.peutSaisirAutreCode(''));
  verifier('Autre code : caché pour le responsable', false, R.peutSaisirAutreCode(R.ROLE_RESPONSABLE));
  verifier('Autre code : caché pour le commercial invité', false, R.peutSaisirAutreCode(R.ROLE_COMMERCIAL));

  return resultats;
}
