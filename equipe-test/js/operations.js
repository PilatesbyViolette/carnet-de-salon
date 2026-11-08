// File des modifications et suppressions de contacts : notées sur le téléphone d'abord (hors connexion compris),
// envoyées vers le tableau par la file d'attente. Chaque envoi retrouve la ligne par son Id juste avant d'écrire :
// rejouer une opération ne crée ni doublon ni dégât (ligne déjà supprimée : rien à faire).
// Aucune dépendance à l'interface ni au Drive : les appels Google sont passés en paramètre (testable sans réseau).

// Champs modifiables dans la fiche et colonnes du tableau (les relances L et M ne sont jamais touchées).
export const CHAMPS_MODIFIABLES = ['note', 'nom', 'entreprise', 'email', 'tel', 'site', 'texte'];
const COLONNES_D_A_I = ['nom', 'entreprise', 'email', 'tel', 'site', 'note'];

// Clé unique d'une opération (pour la retirer de la file une fois envoyée).
function nouvelleCle() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// Ajoute une opération à la file et renvoie la nouvelle file. Une suppression remplace tout ce qui attendait pour ce
// contact ; une modification se fusionne avec celle qui attend déjà (nouvelle clé : la version fusionnée sera envoyée).
export function ajouterOperation(file, op) {
  const avecCle = Object.assign({}, op, { cle: nouvelleCle() });
  if (op.type === 'supprimer') return file.filter((o) => o.id !== op.id).concat(avecCle);
  if (file.some((o) => o.id === op.id && o.type === 'supprimer')) return file;
  const i = file.findIndex((o) => o.id === op.id && o.type === 'modifier');
  if (i < 0) return file.concat(avecCle);
  const copie = file.slice();
  copie[i] = Object.assign({}, avecCle, { champs: Object.assign({}, file[i].champs, op.champs) });
  return copie;
}

// Applique les opérations en attente à une liste de contacts (copie) : vue à jour avant même l'envoi.
export function appliquerOperations(contacts, file) {
  let resultat = contacts.map((c) => Object.assign({}, c));
  for (const op of file) {
    if (op.type === 'supprimer') resultat = resultat.filter((c) => c.id !== op.id);
    else resultat.forEach((c) => { if (c.id === op.id) Object.assign(c, op.champs); });
  }
  return resultat;
}

// Numéro de ligne d'un contact d'après la colonne Id (« ligne-N » pour une ligne sans Id) ; 0 s'il a disparu.
export function numeroDeLigne(lignesIds, id) {
  const index = lignesIds.indexOf(id);
  if (index >= 1) return index + 1;
  const m = /^ligne-(\d+)$/.exec(id);
  return m && !lignesIds[Number(m[1]) - 1] ? Number(m[1]) : 0;
}

// Identifiant Drive d'une photo d'après son lien (« .../file/d/ID/view » ou « ...?id=ID ») ; '' si illisible.
export function idPhoto(lien) {
  const m = /\/d\/([\w-]+)/.exec(lien || '') || /[?&]id=([\w-]+)/.exec(lien || '');
  return m ? m[1] : '';
}

// Envoie une opération. api : lireIds(), ecrirePlage(cellules, valeurs), supprimerLigne(numero), mettreALaCorbeille(id).
export async function envoyerOperation(op, api) {
  const numero = numeroDeLigne(await api.lireIds(), op.id);
  if (op.type === 'modifier') {
    if (!numero) return; // ligne disparue du tableau : rien à modifier
    const c = op.champs;
    await api.ecrirePlage('D' + numero + ':I' + numero, [COLONNES_D_A_I.map((k) => c[k] || '')]);
    if (c.statut) await api.ecrirePlage('K' + numero, [[c.statut]]); // « À vérifier » passé en « Vérifié »
    if (Object.prototype.hasOwnProperty.call(c, 'texte')) await api.ecrirePlage('N' + numero, [[c.texte || '']]);
    return;
  }
  if (numero) await api.supprimerLigne(numero);
  if (op.photoId) await api.mettreALaCorbeille(op.photoId);
}

// Envoie toute la file dans l'ordre ; apresChaque(op) est appelé après chaque envoi réussi (pour retirer l'opération).
// Une erreur (réseau, jeton, Google) arrête l'envoi : les opérations restantes partiront au passage suivant.
export async function envoyerOperations(file, api, apresChaque) {
  for (const op of file) {
    await envoyerOperation(op, api);
    await apresChaque(op);
  }
}
