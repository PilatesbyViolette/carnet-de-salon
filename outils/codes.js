// Générateur de codes d'activation (hors site, jamais servi par l'appli).
//   node outils/codes.js achat 20   20 codes CDS-XXXX-XXXX : lignes d'empreintes et CSV
//   node outils/codes.js demo 1     code(s) de démonstration, sans fin
//   node outils/codes.js test       code d'essai d'une minute (à retirer avant la recette)
//   node outils/codes.js equipe 10  10 codes Équipe CDE-XXXX-XXXX : lignes d'empreintes à l'écran, codes en clair
//                                   seulement dans outils/codes_equipe_a_importer.csv (Code, Type, Statut ; ignoré par Git)
// L'essai gratuit de 24 h se lance par son bouton, sans code. MIF2026 (200 € de réduction chez Stripe) n'est pas reconnu par l'appli.
// Les codes en clair ne sortent qu'à l'écran et dans outils/sortie/ (ignoré par Git) : ne jamais les committer.
// Seules les empreintes SHA-256 vont dans js/codes.js (le dépôt est public).

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sans O, 0, I, 1
const SORTIE = path.join(__dirname, 'sortie');
const ENTETE_CSV = ['Code', 'Type', 'Statut', 'E-mail client', 'Date', 'Identifiant Stripe', 'Entreprise'];
const LIBELLES = { achat: 'achat', demo: 'démo', equipe: 'équipe' };
const PREFIXES = { equipe: 'CDE' }; // les autres types : CDS
const CSV_EQUIPE = path.join(__dirname, 'codes_equipe_a_importer.csv');

// Même règle que l'appli (js/activation.js) : majuscules, sans espaces ni tirets.
function normaliser(code) {
  return String(code).toUpperCase().replace(/[\s-]+/g, '');
}

// Empreinte SHA-256 hexadécimale du code normalisé.
function empreinte(code) {
  return crypto.createHash('sha256').update(normaliser(code), 'utf8').digest('hex');
}

// Quatre caractères tirés au hasard (crypto.randomInt) dans l'alphabet.
function bloc() {
  let texte = '';
  for (let i = 0; i < 4; i++) texte += ALPHABET[crypto.randomInt(ALPHABET.length)];
  return texte;
}

// Liste de n codes PREFIXE-XXXX-XXXX tous différents (CDS par défaut, CDE pour l'Équipe).
function codesUniques(n, prefixe = 'CDS') {
  const codes = new Set();
  while (codes.size < n) codes.add(prefixe + '-' + bloc() + '-' + bloc());
  return [...codes];
}

// Lot de codes Équipe : empreintes à l'écran (pour js/codes.js), codes en clair ajoutés au CSV à importer
// dans la feuille « Carnet de salon · Codes » (colonnes Code, Type, Statut), jamais affichés.
function lotEquipe(n) {
  const codes = codesUniques(n, PREFIXES.equipe);
  const date = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  console.log('  // Équipe, sans fin (' + n + ' codes du ' + date + ')');
  console.log(codes.map((c) => ligneCodes(c, 'equipe', null, LIBELLES.equipe)).join('\n'));
  const neuf = !fs.existsSync(CSV_EQUIPE);
  const lignes = codes.map((c) => [c, 'equipe', 'libre'].join(',')).join('\n') + '\n';
  fs.appendFileSync(CSV_EQUIPE, (neuf ? 'Code,Type,Statut\n' : '') + lignes);
  console.log('\n// ' + n + ' codes en clair ajoutés à ' + CSV_EQUIPE + ' (fichier local, jamais commité)');
}

// Ligne de js/codes.js pour un code.
function ligneCodes(code, type, dureeHeures, libelle) {
  return '  { empreinte: \'' + empreinte(code) + '\', type: \'' + type + '\', dureeHeures: ' +
    (dureeHeures == null ? 'null' : dureeHeures) + ', libelle: \'' + libelle.replace(/'/g, '\\\'') + '\' },';
}

// CSV des codes (Type donné, Statut « libre »), prêt à importer dans le tableau de vente.
function csv(codes, type) {
  return [ENTETE_CSV.join(',')].concat(codes.map((c) => [c, type, 'libre', '', '', '', ''].join(','))).join('\n') + '\n';
}

// Écrit un fichier dans outils/sortie/ et renvoie son chemin.
function ecrireSortie(nom, contenu) {
  fs.mkdirSync(SORTIE, { recursive: true });
  const fichier = path.join(SORTIE, nom);
  fs.writeFileSync(fichier, contenu);
  return fichier;
}

// Affiche les lignes d'empreintes, les codes en clair et le CSV d'un lot tiré au hasard.
function lot(type, n, dureeHeures, libelle) {
  const codes = codesUniques(n);
  const lignes = codes.map((c) => ligneCodes(c, type, dureeHeures, libelle));
  const horodatage = new Date().toISOString().replace(/[:.]/g, '-');
  const fichier = ecrireSortie(type + '-' + horodatage + '.csv', csv(codes, type));
  console.log('// Lignes à coller dans js/codes.js (' + n + ' ' + type + ')');
  console.log(lignes.join('\n'));
  console.log('\n// CODES EN CLAIR, à garder en privé (CSV aussi écrit dans ' + fichier + ')');
  console.log(csv(codes, type));
}

// Point d'entrée : lit la commande et ses arguments.
function principal(args) {
  const [commande, nombre] = args;
  if (commande === 'achat' || commande === 'demo') return lot(commande, Number(nombre) || 1, null, LIBELLES[commande]);
  if (commande === 'test') return lot('essai', 1, 1 / 60, 'test, à retirer avant la recette');
  if (commande === 'equipe') return lotEquipe(Number(nombre) || 1);
  console.log('Usage :\n  node outils/codes.js achat 20\n  node outils/codes.js demo 1\n  node outils/codes.js test\n  node outils/codes.js equipe 10');
  process.exitCode = 1;
}

try {
  principal(process.argv.slice(2));
} catch (erreur) {
  console.error('Erreur :', erreur.message);
  process.exit(1);
}
