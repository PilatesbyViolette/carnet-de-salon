// Génère le QR code du flyer vers la page produit, en SVG et en PNG haute définition.
// Usage : node outils/qrcode.js   (hors site, jamais chargé par l'appli)
const QRCode = require('qrcode');
const path = require('path');

const ADRESSE = 'https://optimisons.ai/carnet-de-salon';
const DOSSIER = path.join(__dirname, 'qrcode');
const OPTIONS = {
  errorCorrectionLevel: 'H', // résiste aux reflets et à un petit logo posé dessus
  margin: 4,                 // marge blanche réglementaire de 4 modules
  color: { dark: '#090D24', light: '#FFFFFF' } // encre de la charte sur fond blanc
};

// Écrit le fichier SVG (vectoriel, pour l'imprimeur).
async function ecrireSvg() {
  const fichier = path.join(DOSSIER, 'qrcode-carnet-de-salon.svg');
  await QRCode.toFile(fichier, ADRESSE, { ...OPTIONS, type: 'svg' });
  console.log('SVG écrit :', fichier);
}

// Écrit le fichier PNG de 2000 px de côté (environ 17 cm à 300 dpi).
async function ecrirePng() {
  const fichier = path.join(DOSSIER, 'qrcode-carnet-de-salon.png');
  await QRCode.toFile(fichier, ADRESSE, { ...OPTIONS, type: 'png', width: 2000 });
  console.log('PNG écrit :', fichier);
}

// Point d'entrée : crée le dossier puis les deux fichiers.
async function principal() {
  require('fs').mkdirSync(DOSSIER, { recursive: true });
  await ecrireSvg();
  await ecrirePng();
  console.log('Adresse encodée :', ADRESSE);
}

principal().catch((erreur) => { console.error('Erreur :', erreur.message); process.exit(1); });
