// Fabrique les icônes de l'appli : sablier Optimisons.ai centré sur fond encre #090D24, sans transparence.
// Usage : node outils/icones.js   (hors site ; source : outils/source/sablier.png, reprise du site)
const sharp = require('sharp');
const path = require('path');

const SOURCE = path.join(__dirname, 'source', 'sablier.png');
const DOSSIER = path.join(__dirname, '..', 'images');
const FOND = '#090D24';
// Hauteur du sablier en part de l'icône : 56 % reste dans la zone sûre des icônes « maskable » (cercle de 80 %).
const ICONES = [
  { fichier: 'icone-512.png', taille: 512, part: 0.56 },
  { fichier: 'icone-192.png', taille: 192, part: 0.56 },
  { fichier: 'icone-180.png', taille: 180, part: 0.62 },
  { fichier: 'favicon-32.png', taille: 32, part: 0.78 }
];

// Crée une icône carrée de la taille demandée.
async function fabriquer({ fichier, taille, part }) {
  const sablier = await sharp(SOURCE).resize({ height: Math.round(taille * part) }).toBuffer();
  await sharp({ create: { width: taille, height: taille, channels: 3, background: FOND } })
    .composite([{ input: sablier, gravity: 'center' }])
    .flatten({ background: FOND })
    .png()
    .toFile(path.join(DOSSIER, fichier));
  console.log('Icône écrite :', fichier);
}

// Point d'entrée : fabrique toutes les icônes.
async function principal() {
  for (const icone of ICONES) await fabriquer(icone);
}

principal().catch((erreur) => { console.error('Erreur :', erreur.message); process.exit(1); });
