// Environnement de l'appli : production (racine du site) ou version de test (dossier equipe-test/).
// La version de test remplace ce seul fichier pour s'isoler des données de la production (même domaine) :
// autre base IndexedDB, préfixe des clés localStorage et sessionStorage, pas de service worker, bandeau « VERSION DE TEST ».

export const ENV = {
  test: false,
  nomBase: 'carnet',
  prefixe: '',
  serviceWorker: true,
  // Adresse de l'appli (liens d'invitation des commerciaux)
  adresseAppli: 'https://app.optimisons.ai/'
};
