// Environnement de la VERSION DE TEST Équipe (dossier equipe-test/ de main), isolée de la production (même domaine) :
// base IndexedDB carnet-equipe-test, préfixe equipeTest_ pour localStorage et sessionStorage, pas de service worker,
// bandeau « VERSION DE TEST », liens d'invitation vers /equipe-test/. Copie de la branche equipe : seul ce fichier diffère.

export const ENV = {
  test: true,
  nomBase: 'carnet-equipe-test',
  prefixe: 'equipeTest_',
  serviceWorker: false,
  adresseAppli: 'https://app.optimisons.ai/equipe-test/'
};
