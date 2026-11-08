// Service worker minimal : garde en cache les fichiers de l'appli pour qu'elle s'ouvre sans réseau.
// « Cache d'abord » pour la liste ci-dessous uniquement ; tout le reste (Google, GIS, test/) passe par le réseau.
// À CHAQUE MODIFICATION D'UN FICHIER DE L'APPLI : changer VERSION, sinon les téléphones garderont l'ancienne version.

const VERSION = 'carnet-2026-11-08-3';
const FICHIERS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/css/app.css',
  '/js/app.js',
  '/js/interface.js',
  '/js/accueil.js',
  '/js/nouveau.js',
  '/js/verifier.js',
  '/js/reglages.js',
  '/js/aide.js',
  '/js/relances.js',
  '/js/activation.js',
  '/js/codes.js',
  '/js/connexion.js',
  '/js/drive.js',
  '/js/espace.js',
  '/js/base.js',
  '/js/file.js',
  '/js/image.js',
  '/js/tri.js',
  '/js/prenoms.js',
  '/js/dates.js',
  '/polices/archivo-var-latin.woff2',
  '/polices/plex-mono-400-latin.woff2',
  '/polices/plex-mono-500-latin.woff2',
  '/images/sablier.webp',
  '/images/icone-180.png',
  '/images/icone-192.png',
  '/images/icone-512.png',
  '/images/favicon-32.png'
];

// Installation : met tous les fichiers en cache (en ignorant le cache HTTP), puis prend la main sans attendre.
self.addEventListener('install', (evenement) => {
  evenement.waitUntil(
    caches.open(VERSION)
      .then((cache) => cache.addAll(FICHIERS.map((f) => new Request(f, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

// Activation : supprime les caches des versions précédentes et contrôle les pages ouvertes.
self.addEventListener('activate', (evenement) => {
  evenement.waitUntil(
    caches.keys()
      .then((noms) => Promise.all(noms.filter((n) => n !== VERSION).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

// Requêtes : cache d'abord pour les fichiers de l'appli, réseau seulement pour tout le reste (on ne répond pas).
self.addEventListener('fetch', (evenement) => {
  const requete = evenement.request;
  if (requete.method !== 'GET') return;
  const adresse = new URL(requete.url);
  if (adresse.origin !== self.location.origin || !FICHIERS.includes(adresse.pathname)) return;
  evenement.respondWith(
    caches.match(adresse.pathname).then((reponse) => reponse || fetch(requete))
  );
});
