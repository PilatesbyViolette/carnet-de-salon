// Préparation de la photo de carte sur le téléphone, avant tout envoi :
// orientation corrigée, 1 600 px au plus, niveaux de gris et contraste renforcé (boucle sur les pixels), JPEG 0,85.
// Pas de ctx.filter (non pris en charge par Safari).

const COTE_MAX = 1600;
const QUALITE = 0.85;

// Charge l'image dans le bon sens : createImageBitmap avec l'orientation EXIF, sinon une balise img (qui l'applique aussi).
async function chargerImage(fichier) {
  if (window.createImageBitmap) {
    try { return await createImageBitmap(fichier, { imageOrientation: 'from-image' }); } catch (e) { /* repli ci-dessous */ }
  }
  const adresse = URL.createObjectURL(fichier);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = adresse;
    await img.decode();
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(adresse), 1000);
  }
}

// Passe l'image en niveaux de gris puis étire les niveaux (1 % des pixels les plus sombres en noir, 1 % des plus clairs en blanc).
function grisEtContraste(donnees) {
  const p = donnees.data;
  const histogramme = new Array(256).fill(0);
  for (let i = 0; i < p.length; i += 4) {
    const gris = Math.round(0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2]);
    p[i] = gris;
    histogramme[gris]++;
  }
  const seuil = (p.length / 4) * 0.01;
  let bas = 0, haut = 255, cumul = 0;
  while (bas < 255 && (cumul += histogramme[bas]) < seuil) bas++;
  cumul = 0;
  while (haut > 0 && (cumul += histogramme[haut]) < seuil) haut--;
  const etendue = Math.max(haut - bas, 1);
  for (let i = 0; i < p.length; i += 4) {
    const v = Math.min(255, Math.max(0, Math.round((p[i] - bas) * 255 / etendue)));
    p[i] = p[i + 1] = p[i + 2] = v;
  }
}

// Transforme le fichier de l'appareil photo en JPEG prêt pour la lecture ; renvoie un Blob.
export async function preparerPhoto(fichier) {
  const source = await chargerImage(fichier);
  const largeur = source.width, hauteur = source.height;
  const echelle = Math.min(1, COTE_MAX / Math.max(largeur, hauteur));
  const toile = document.createElement('canvas');
  toile.width = Math.round(largeur * echelle);
  toile.height = Math.round(hauteur * echelle);
  const ctx = toile.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, toile.width, toile.height);
  if (source.close) source.close();
  const donnees = ctx.getImageData(0, 0, toile.width, toile.height);
  grisEtContraste(donnees);
  ctx.putImageData(donnees, 0, 0);
  const blob = await new Promise((ok) => toile.toBlob(ok, 'image/jpeg', QUALITE));
  if (!blob) throw new Error('Conversion de la photo impossible');
  return blob;
}
