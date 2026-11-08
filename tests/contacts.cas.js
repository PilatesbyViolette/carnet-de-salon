// Tests de la modification et de la suppression de contacts (js/operations.js), sur un faux tableau Google en mémoire.
// Utilisés par tests/contacts.test.html (navigateur) et par le lanceur en ligne de commande.

import { ajouterOperation, appliquerOperations, envoyerOperations, idPhoto } from '../js/operations.js';

// Faux tableau : lignes A à N (en-tête en ligne 1), corbeille Drive, coupure réseau simulable.
function fauxTableau() {
  const t = {
    lignes: [
      ['Id', 'Date', 'Pris par', 'Nom', 'Entreprise', 'E-mail', 'Téléphone', 'Site', 'Note', 'Photo', 'Statut', 'Relance J+2', 'Relance J+7', 'Texte lu'],
      ['a1', '2026-11-01', 'moi', 'Marie Dupont', 'Ateliers Dupont', 'marie@dupont.fr', '06 11 11 11 11', 'www.dupont.fr', 'gamme pro', 'https://drive.google.com/file/d/PHOTO_A1/view', 'Vérifié', 'Envoyée le 03/11', 'Envoyée le 08/11', 'MARIE DUPONT'],
      ['b2', '2026-11-02', 'moi', 'Jérôme Durand', 'Menuiserie Durand', 'jd@durand.fr', '', '', '', '', 'Vérifié', '', '', ''],
      ['c3', '2026-11-03', 'moi', 'Paul Martin', '', 'paul@martin.fr', '', '', '', '', 'Vérifié', '', '', '']
    ],
    corbeille: [],
    horsLigne: false,
    appels: 0
  };
  const reseau = () => { t.appels++; if (t.horsLigne) throw new Error('Réseau indisponible'); };
  const colonne = (lettre) => lettre.charCodeAt(0) - 65;
  t.api = {
    lireIds: async () => { reseau(); return t.lignes.map((l) => l[0]); },
    ecrirePlage: async (cellules, valeurs) => {
      reseau();
      const m = /^([A-Z])(\d+)(?::([A-Z])\d+)?$/.exec(cellules);
      const ligne = t.lignes[Number(m[2]) - 1];
      valeurs[0].forEach((v, i) => { ligne[colonne(m[1]) + i] = v; });
    },
    supprimerLigne: async (numero) => { reseau(); t.lignes.splice(numero - 1, 1); },
    mettreALaCorbeille: async (id) => { reseau(); if (!t.corbeille.includes(id)) t.corbeille.push(id); }
  };
  return t;
}

// File locale simulée : envoi comme dans espace.envoyerOperationsSiBesoin (retrait de chaque opération réussie).
async function envoyer(t, file) {
  let reste = file.slice();
  try {
    await envoyerOperations(file, t.api, async (op) => { reste = reste.filter((o) => o.cle !== op.cle); });
  } catch (e) { /* hors connexion : le reste attend le prochain passage */ }
  return reste;
}

const CHAMPS_B2 = { note: 'rappeler lundi', nom: 'Jérôme Durand', entreprise: 'Durand & Fils', email: 'jd@durand.fr', tel: '06 22 22 22 22', site: 'www.durand.fr', texte: 'JÉRÔME DURAND' };

// Lance tous les cas ; renvoie [{ nom, attendu, obtenu }].
export async function lancerTests() {
  const resultats = [];
  const verifier = (nom, attendu, obtenu) => resultats.push({ nom, attendu: JSON.stringify(attendu), obtenu: JSON.stringify(obtenu) });

  // Modification en ligne : bonne ligne retrouvée par l'Id, colonnes D à I et N écrites, relances L et M intactes
  {
    const t = fauxTableau();
    const file = ajouterOperation([], { type: 'modifier', id: 'b2', champs: CHAMPS_B2 });
    const reste = await envoyer(t, file);
    verifier('Modification : file vidée', 0, reste.length);
    verifier('Modification : champs écrits', ['Jérôme Durand', 'Durand & Fils', 'jd@durand.fr', '06 22 22 22 22', 'www.durand.fr', 'rappeler lundi'], t.lignes[2].slice(3, 9));
    verifier('Modification : texte lu écrit', 'JÉRÔME DURAND', t.lignes[2][13]);
    verifier('Modification : colonnes Photo, Statut et relances intactes', ['', 'Vérifié', '', ''], t.lignes[2].slice(9, 13));
    verifier('Modification : autres lignes intactes', 'Envoyée le 03/11', t.lignes[1][11]);
    verifier('Modification : aucune ligne ajoutée', 4, t.lignes.length);
  }

  // Modification hors connexion : rien n'est perdu, envoi au retour du réseau, sans doublon si rejouée
  {
    const t = fauxTableau();
    t.horsLigne = true;
    let file = ajouterOperation([], { type: 'modifier', id: 'a1', champs: Object.assign({}, CHAMPS_B2, { nom: 'Marie Dupont-Petit' }) });
    file = await envoyer(t, file);
    verifier('Hors connexion : modification gardée en file', 1, file.length);
    verifier('Hors connexion : tableau inchangé', 'Marie Dupont', t.lignes[1][3]);
    t.horsLigne = false;
    const copie = file.slice();
    file = await envoyer(t, file);
    verifier('Retour du réseau : modification envoyée', 'Marie Dupont-Petit', t.lignes[1][3]);
    verifier('Retour du réseau : relances de la ligne intactes', ['Envoyée le 03/11', 'Envoyée le 08/11'], t.lignes[1].slice(11, 13));
    await envoyer(t, copie); // même opération rejouée (passage interrompu après l'écriture)
    verifier('Modification rejouée : aucun doublon', 4, t.lignes.length);
  }

  // Contact « À vérifier » enregistré depuis sa fiche : colonne Statut passée en « Vérifié », relances intactes
  {
    const t = fauxTableau();
    t.lignes[3][10] = 'À vérifier';
    const op = { type: 'modifier', id: 'c3', champs: Object.assign({}, CHAMPS_B2, { nom: 'Paul Martin', statut: "Vérifié dans l'appli" }) };
    await envoyer(t, ajouterOperation([], op));
    verifier('À vérifier enregistré : statut Vérifié', "Vérifié dans l'appli", t.lignes[3][10]);
    verifier('À vérifier enregistré : relances intactes', ['', ''], t.lignes[3].slice(11, 13));
    verifier('À vérifier enregistré : retiré de la liste À vérifier', [],
      appliquerOperations([{ id: 'c3', statut: 'À vérifier' }], ajouterOperation([], op)).filter((c) => c.statut === 'À vérifier'));
  }

  // Sans statut dans la modification (contact déjà vérifié) : colonne Statut intacte
  {
    const t = fauxTableau();
    await envoyer(t, ajouterOperation([], { type: 'modifier', id: 'b2', champs: CHAMPS_B2 }));
    verifier('Contact déjà vérifié : statut intact', 'Vérifié', t.lignes[2][10]);
  }

  // Deux modifications du même contact avant l'envoi : fusionnées en une seule
  {
    let file = ajouterOperation([], { type: 'modifier', id: 'b2', champs: { nom: 'A', note: 'x' } });
    file = ajouterOperation(file, { type: 'modifier', id: 'b2', champs: { nom: 'B' } });
    verifier('Deux modifications : une seule opération', 1, file.length);
    verifier('Deux modifications : valeurs fusionnées', { nom: 'B', note: 'x' }, file[0].champs);
  }

  // Vue à jour avant l'envoi (accueil, À relancer, À vérifier)
  {
    const vue = appliquerOperations([{ id: 'a1', nom: 'Marie' }, { id: 'b2', nom: 'Jérôme' }],
      ajouterOperation([], { type: 'modifier', id: 'b2', champs: { nom: 'Jérôme Durand' } }));
    verifier('Vue : modification visible tout de suite', ['Marie', 'Jérôme Durand'], vue.map((c) => c.nom));
  }

  // Ligne disparue du tableau (supprimée à la main) : modification ignorée, sans erreur
  {
    const t = fauxTableau();
    const reste = await envoyer(t, ajouterOperation([], { type: 'modifier', id: 'zz', champs: CHAMPS_B2 }));
    verifier('Ligne disparue : opération retirée, tableau intact', [0, 4], [reste.length, t.lignes.length]);
  }

  // ---------- Suppression ----------

  // Suppression en ligne : la ligne retrouvée par son Id disparaît, la photo part à la corbeille, le reste est intact
  {
    const t = fauxTableau();
    const reste = await envoyer(t, ajouterOperation([], { type: 'supprimer', id: 'a1', photoId: 'PHOTO_A1' }));
    verifier('Suppression : file vidée', 0, reste.length);
    verifier('Suppression : ligne retirée, les autres gardées', ['Id', 'b2', 'c3'], t.lignes.map((l) => l[0]));
    verifier('Suppression : photo à la corbeille', ['PHOTO_A1'], t.corbeille);
  }

  // Suppression hors connexion : gardée en file, tableau intact ; au retour du réseau, une seule ligne retirée,
  // même si l'opération est rejouée (aucune autre ligne supprimée par erreur)
  {
    const t = fauxTableau();
    t.horsLigne = true;
    let file = ajouterOperation([], { type: 'supprimer', id: 'b2', photoId: '' });
    file = await envoyer(t, file);
    verifier('Suppression hors connexion : gardée en file', 1, file.length);
    verifier('Suppression hors connexion : tableau intact', 4, t.lignes.length);
    t.horsLigne = false;
    const copie = file.slice();
    file = await envoyer(t, file);
    verifier('Suppression au retour du réseau : ligne retirée', ['Id', 'a1', 'c3'], t.lignes.map((l) => l[0]));
    await envoyer(t, copie); // rejouée : la ligne n'existe plus, rien d'autre ne bouge
    verifier('Suppression rejouée : aucune autre ligne touchée', ['Id', 'a1', 'c3'], t.lignes.map((l) => l[0]));
  }

  // Contact supprimé avant d'avoir été écrit dans le tableau (photo déjà envoyée) : tableau intact, photo à la corbeille
  {
    const t = fauxTableau();
    await envoyer(t, ajouterOperation([], { type: 'supprimer', id: 'jamais-ecrit', photoId: 'PHOTO_X' }));
    verifier('Suppression avant écriture : tableau intact', 4, t.lignes.length);
    verifier('Suppression avant écriture : photo à la corbeille', ['PHOTO_X'], t.corbeille);
  }

  // Modification puis suppression du même contact avant l'envoi : seule la suppression part ; l'inverse est ignoré
  {
    let file = ajouterOperation([], { type: 'modifier', id: 'b2', champs: { nom: 'X' } });
    file = ajouterOperation(file, { type: 'supprimer', id: 'b2', photoId: '' });
    verifier('Modifier puis supprimer : seule la suppression reste', ['supprimer'], file.map((o) => o.type));
    file = ajouterOperation(file, { type: 'modifier', id: 'b2', champs: { nom: 'Y' } });
    verifier('Modifier après suppression : ignoré', ['supprimer'], file.map((o) => o.type));
  }

  // Vue à jour tout de suite : contact supprimé absent des listes et des compteurs
  {
    const vue = appliquerOperations([{ id: 'a1' }, { id: 'b2' }, { id: 'c3' }],
      ajouterOperation([], { type: 'supprimer', id: 'b2', photoId: '' }));
    verifier('Vue : contact supprimé retiré, compteur à jour', ['a1', 'c3'], vue.map((c) => c.id));
  }

  // Identifiant Drive de la photo d'après son lien
  verifier('Lien de photo lu', 'PHOTO_A1', idPhoto('https://drive.google.com/file/d/PHOTO_A1/view?usp=drivesdk'));

  return resultats;
}
