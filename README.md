# Carnet de salon

Optimisons.ai · « L'IA, simplement. »

Appli mobile installable (PWA) pour les exposants de salons : photo de la carte de visite, note dictée, enregistrement dans le Google Drive de l'exposant, puis relances J+2 et J+7.

- Adresse : https://app.optimisons.ai
- Hébergement : GitHub Pages, branche `main`, dossier racine. Chaque push sur `main` déploie (une minute environ).
- Fichiers statiques, sans framework ni dépendance à l'exécution. Seul script externe : `https://accounts.google.com/gsi/client`.
- Conception : dossier `docs/` (local, non publié ; le cahier des charges fait foi). Plan de travail : `CONSIGNES.md` (local, non publié).

## Variante de connexion retenue

Test de l'étape 2, selon la règle de décision du document de test de connexion (§ 5).

| Plateforme | Résultat | Décision |
|---|---|---|
| Android, appli installée | A OK (reconnexion en 4 s après fermeture complète, chaîne Drive en 11,7 s), B OK | **A** (fenêtre Google Identity Services) |
| iPhone | Test prévu le 7 novembre au soir | À compléter |

`js/connexion.js` ne contient que la variante A. Si le test iPhone impose B (redirection) ou C (Safari), le code correspondant sera ajouté pour l'iPhone seulement.

## Journal des étapes

| Étape | Date | Contenu | État |
|---|---|---|---|
| 0 | 6 nov. | Dépôt public, `CNAME`, GitHub Pages, HTTPS forcé | Fait |
| 1 | 6 nov. | DNS Infomaniak, compte nm@optimisons.ai, projet Google Cloud, API, écran de consentement, client OAuth ; QR code du flyer (`outils/qrcode/`) | Fait |
| 2 | 6 nov. | Page de test `test/` ; Android testé (A) | iPhone à tester |
| 3 | 6 nov. | Pages du site (autre dépôt), Search Console vérifiée, passage en production et logo | Chez Nicolas |
| 4 | 6 nov. | Appli de capture complète, local d'abord | Fait, à tester sur téléphone |
| 5 | 6 nov. | Manifeste, icônes, service worker, aide à l'installation | Fait, à tester sur téléphone |

### Étape 4 · ce qui a été construit

- **Base locale** (`js/base.js`) : IndexedDB `carnet`, magasins `contacts` (clé `id`) et `reglages` (clé, valeur). Champs d'un contact : `id`, `creeLe`, `note`, `nom`, `entreprise`, `email`, `tel`, `site`, `photo` (Blob JPEG), `photoId`, `photoLien`, `texte`, `statut`, `etat` (`local`, `photo_envoyee`, `lu`, `ecrit`, `erreur`), `essais`, `derniereErreur`, `relanceJ2`, `relanceJ7`. Les clés internes des réglages commencent par `_` (identifiants du tableau et du dossier, copie des lignes du tableau) et ne vont jamais dans l'onglet Réglages.
- **Photo** (`js/image.js`) : orientation corrigée (`createImageBitmap` avec `imageOrientation: 'from-image'`, sinon balise img), 1 600 px au plus, niveaux de gris et étirement du contraste (1 % des pixels les plus sombres en noir, 1 % des plus clairs en blanc) par boucle sur les pixels, JPEG 0,85. Pas de `ctx.filter`.
- **Tri** (`js/tri.js`) : port sans changement de logique du prototype. Vérifié : résultats identiques au prototype Apps Script sur les six cas ; `tests/tri.test.html` donne 31 / 31 verts.
- **File d'attente** (`js/file.js`) : pour chaque contact non écrit, envoi de la photo, puis lecture OCR et tri (seuls les champs vides sont remplis), puis écriture de la ligne quand le contact est enregistré. Avant l'écriture, lecture de la colonne Id (pas de doublon) ; après, relecture, puis suppression de la photo locale. Déclencheurs : ouverture, retour du réseau, après chaque enregistrement, toutes les 60 s s'il reste du travail. Un seul passage à la fois. Trois échecs Google consécutifs : état `erreur`, affiché sur l'accueil avec le message et « Réessayer ». Les coupures de réseau et les jetons périmés ne comptent pas comme des échecs.
- **Espace Drive** (`js/espace.js`, fichier ajouté à la structure prévue) : tableau « Carnet de salon · Mes contacts » et dossier « Carnet de salon · Photos des cartes », retrouvés par l'id gardé, puis par leur nom, sinon créés. Réglages par défaut repris du prototype, plus `Votre nom`, `Délai J+2`, `Délai J+7`, `Code d'activation`.
- **Écrans** (un fichier par écran : `accueil.js`, `nouveau.js`, `verifier.js`, `reglages.js`, `aide.js` ; outils communs dans `interface.js`, dates dans `dates.js`) :
  - Nouveau contact : la photo réduite s'affiche tout de suite, le contact est créé en base avant la lecture, la Note a le focus, les champs vides sont en corail et pré-remplis par la lecture sans écraser la saisie. L'e-mail et le téléphone dictés dans la Note complètent les champs vides (comme le prototype). Statut « Vérifié dans l'appli » si la carte a été lue avant Enregistrer, sinon « À vérifier ». « Annuler » ou le bouton retour du téléphone supprime la capture non enregistrée.
  - Accueil : compteurs du jour et du total (tableau et contacts locaux), pastilles « N contacts en attente d'envoi », « Hors connexion », « Reconnexion nécessaire » (au tap, nouveau jeton), envois en erreur, cinq derniers contacts.
  - À vérifier : liste, fiche modifiable avec le texte lu et le lien vers la photo, « Valider » met à jour la ligne trouvée par Id.
  - Réglages : tous les champs du § 5.4 (dont les deux modèles de relance), compte connecté, lien vers le tableau, « Synchroniser maintenant », déconnexion (refusée s'il reste des contacts non envoyés, second tap pour confirmer).
  - À relancer : écran réservé, rempli à l'étape 6.
- **Jeton** : demandé dans le geste (Se connecter, Enregistrer, Valider, Synchroniser, pastille), jamais après un `await`. Gardé en mémoire et dans `sessionStorage`, périmé 5 minutes avant expiration. Si l'exposant ne coche pas la case Google Drive sur l'écran Google, un message le lui dit.
- **Erreurs** : toujours affichées dans un bandeau rouge en haut de l'écran (message Google tel quel), jamais seulement dans la console.
- **Captures interrompues** (appli fermée pendant une saisie) : au démarrage suivant, gardées avec le statut « À vérifier » si une photo existe.

### Étape 5 · ce qui a été construit

- `manifest.webmanifest` : « Carnet de salon », « Carnet », `standalone`, couleurs du cahier des charges, icônes 192 et 512 `any maskable`, `lang` `fr`.
- Icônes (`images/`) : sablier du site centré sur fond encre #090D24, sans transparence, dans la zone sûre « maskable ». Fabriquées par `node outils/icones.js` (source `outils/source/sablier.png`).
- `sw.js` : liste explicite des fichiers, « cache d'abord » pour eux seuls, réseau seulement pour tout le reste (Google, GIS, `test/`). `skipWaiting` et `clients.claim` ; bandeau « Nouvelle version disponible, toucher pour recharger ».
- Écran d'aide à l'installation : iPhone (Safari et Chrome) et Android, avec le bouton « Installer l'application » quand Chrome le propose. Affiché à la première ouverture si l'appli n'est pas installée, et accessible depuis Réglages.
- Variante C (manifeste `display: browser` pour iPhone) : seulement si le test iPhone la retient.

### Vérifié sur ordinateur (Chrome, serveur local sur le port 8080)

Tests du tri 31 / 31 ; saisie sans carte enregistrée en base locale avec e-mail et téléphone tirés de la note ; compteurs et pastilles justes ; photo réduite à 1 600 px, en niveaux de gris, affichée tout de suite ; « Annuler » supprime la capture ; service worker actif avec 27 fichiers en cache ; l'appli s'ouvre serveur arrêté et montre l'accueil avec les contacts locaux ; aucune erreur dans la console. La chaîne Google réelle (connexion, envoi, OCR, écriture) reste à vérifier par Nicolas sur téléphone.

## À faire par Nicolas (mains ou téléphones)

1. Test de connexion iPhone (`https://app.optimisons.ai/test/`), puis me renvoyer la grille.
2. Tests de sortie des étapes 4 et 5 sur les deux téléphones (voir ci-dessous).

## Entretien

- **À chaque modification d'un fichier de l'appli : changer `VERSION` dans `sw.js`**, sinon les téléphones gardent l'ancienne version en cache.
- Tout nouveau fichier de l'appli doit être ajouté à la liste `FICHIERS` de `sw.js`.
- QR code du flyer : `node outils/qrcode.js` ; icônes : `node outils/icones.js` (après `npm install` dans `outils/`).
- Tests du tri : https://app.optimisons.ai/tests/tri.test.html (doivent rester verts).
