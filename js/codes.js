// Codes d'activation : empreintes SHA-256 seulement, jamais de code en clair (le dépôt est public).
// Lignes produites par node outils/codes.js ; le code est mis en majuscules, sans espaces ni tirets, avant le calcul.
// type : achat ou demo (dureeHeures null : sans fin), essai (fin après dureeHeures, réservé au code de test).
// L'essai gratuit de 24 h se lance par son bouton, sans code. MIF2026 (200 € de réduction chez Stripe) n'est pas reconnu par l'appli.
// Retirer une ligne révoque le code ; changer alors VERSION dans sw.js.

export const CODES = [
  // Code de test d'une minute : À RETIRER AVANT LA RECETTE
  { empreinte: '57f6234528fe6aef0a23047229ea3de7216dde0bb6b8493e7ab7dc6a830c2fad', type: 'essai', dureeHeures: 0.016666666666666666, libelle: 'test, à retirer avant la recette' },
  // Démonstration, sans fin
  { empreinte: '38c8629f18fe29e6001647da16b5fec832f937a0172b2cb0b75d6bc084adcd7d', type: 'demo', dureeHeures: null, libelle: 'démo' },
  // Achats, sans fin (20 codes du 7 novembre 2026)
  { empreinte: 'b34c1ff4763334239f9ca6b500ab1ab9166d5365c5cef4358fa84b7112c989dd', type: 'achat', dureeHeures: null, libelle: 'achat' },
  { empreinte: '78ccc0498f4009554aa1145bc409d1af078b591f1b6e363bb9a224d54819dc0e', type: 'achat', dureeHeures: null, libelle: 'achat' },
  { empreinte: 'fe7b1b64a88c74f983f15ccec57e6ba8ecbd7ca07478331a091d1103f8a3ff9e', type: 'achat', dureeHeures: null, libelle: 'achat' },
  { empreinte: '46ac4e35494142248c578b3f6915a0417a33df210323a910169980638185aced', type: 'achat', dureeHeures: null, libelle: 'achat' },
  { empreinte: '64ea090cd90c69686cc39b76f2aa0efbf66dd79bdd2224c3c8a0d8a584f8e381', type: 'achat', dureeHeures: null, libelle: 'achat' },
  { empreinte: '935822f9468662b1aeee52a1c778ede5d0d04ccdd97e675419556346af93e23d', type: 'achat', dureeHeures: null, libelle: 'achat' },
  { empreinte: 'cfe53c46d57a761e55aa05b0cd9b8ac3a146eaa0b60b6017f10e47951ecbbf70', type: 'achat', dureeHeures: null, libelle: 'achat' },
  { empreinte: '985ceac5901ebb518588e22d44449357dac6ae2a0efcf853ab0e1bf2b23a19fd', type: 'achat', dureeHeures: null, libelle: 'achat' },
  { empreinte: '64ffc8e83b7e965aea2f1fcf283e8a94b18cdffa9be2a8434a747009a37a5020', type: 'achat', dureeHeures: null, libelle: 'achat' },
  { empreinte: 'f640fe6a4d406755814752c8cb8c1aae77842167de7f4481978c60132375a34f', type: 'achat', dureeHeures: null, libelle: 'achat' },
  { empreinte: 'bca641aba1fe0640399606f45c49a6d20894968afaba16a7b24cfe89b93e8e55', type: 'achat', dureeHeures: null, libelle: 'achat' },
  { empreinte: 'c7e14eeeb332df4e8e42c0643ec8b6a791c422848f3ec2187dc9e828bb3713cc', type: 'achat', dureeHeures: null, libelle: 'achat' },
  { empreinte: '3142dc516b5cffc28d4c8bfed1cf66dedf8ef3cb9254a58d6049cc6b0cc2140c', type: 'achat', dureeHeures: null, libelle: 'achat' },
  { empreinte: 'c337e26f39732cbaa9b156a0990a66a59894ca327a012c576a035b116be716ee', type: 'achat', dureeHeures: null, libelle: 'achat' },
  { empreinte: '0300a6e0a8e0a2151af76153f7793fd4a9ef1a2f50871fe5e4459660dd859a79', type: 'achat', dureeHeures: null, libelle: 'achat' },
  { empreinte: '53c9d774b9da03610cfb79ef7d25732346347d7a8c7d4b1444fd31fe96251c3e', type: 'achat', dureeHeures: null, libelle: 'achat' },
  { empreinte: '9445620844747eac4dad4c950deced2b78e942241212cb999ff33156e5d02e8c', type: 'achat', dureeHeures: null, libelle: 'achat' },
  { empreinte: 'cd80ac619b5c435b9a05b1e81030725a16ac04c8979650ab413b8912e3651508', type: 'achat', dureeHeures: null, libelle: 'achat' },
  { empreinte: 'ffe66da004e1562f11fd6aefb4990c6c1591b8505bbf8ab776cadc637ffe4001', type: 'achat', dureeHeures: null, libelle: 'achat' },
  { empreinte: '5bdfa059c8ad6c1f0e586598fce691fc74ac3652062f331abbe3e7d1f609c0de', type: 'achat', dureeHeures: null, libelle: 'achat' }
];
