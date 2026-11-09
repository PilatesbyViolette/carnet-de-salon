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
| 6 | 7 nov. | Relances J+2 et J+7, activation par code, essai, outil de codes | Fait, à tester sur téléphone |

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
  - À relancer : rempli à l'étape 6 (voir ci-dessous).
- **Jeton** : demandé dans le geste (Se connecter, Enregistrer, Valider, Synchroniser, pastille), jamais après un `await`. Gardé en mémoire et dans `sessionStorage`, périmé 5 minutes avant expiration. Si l'exposant ne coche pas la case Google Drive sur l'écran Google, un message le lui dit.
- **Erreurs** : toujours affichées dans un bandeau rouge en haut de l'écran (message Google tel quel), jamais seulement dans la console.
- **Captures interrompues** (appli fermée pendant une saisie) : au démarrage suivant, gardées avec le statut « À vérifier » si une photo existe.

### Étape 5 · ce qui a été construit

- `manifest.webmanifest` : « Carnet de salon », « Carnet », `standalone`, couleurs du cahier des charges, icônes 192 et 512 `any maskable`, `lang` `fr`.
- Icônes (`images/`) : sablier du site centré sur fond encre #090D24, sans transparence, dans la zone sûre « maskable ». Fabriquées par `node outils/icones.js` (source `outils/source/sablier.png`).
- `sw.js` : liste explicite des fichiers, « cache d'abord » pour eux seuls, réseau seulement pour tout le reste (Google, GIS, `test/`). `skipWaiting` et `clients.claim` ; bandeau « Nouvelle version disponible, toucher pour recharger ».
- Écran d'aide à l'installation : iPhone (Safari et Chrome) et Android, avec le bouton « Installer l'application » quand Chrome le propose. Affiché à la première ouverture si l'appli n'est pas installée, et accessible depuis Réglages.
- Variante C (manifeste `display: browser` pour iPhone) : seulement si le test iPhone la retient.

### Étape 6 · ce qui a été construit

- **Relances** (`js/relances.js`) : la copie locale des lignes du tableau (relue à chaque synchronisation) donne l'écran « À relancer » : contacts avec e-mail arrivés au délai J+2 sans « Relance J+2 », puis au délai J+7 sans « Relance J+7 ». Délais lus dans Réglages. Tri par date (le plus ancien d'abord), badge J+2 ou J+7, objet affiché. Compteur sur le bouton de l'accueil.
  - « Relancer » : lien `mailto:` avec `?subject=` et `&body=` encodés par `encodeURIComponent`, sauts de ligne `%0D%0A`.
  - « Copier le message » : `navigator.clipboard.writeText`, repli par sélection (`execCommand('copy')`), sinon le message s'affiche sélectionné avec un message d'erreur.
  - Au retour dans l'appli (`visibilitychange`) : « Relance J+2 envoyée à … ? Oui / Plus tard ». Oui note « Envoyée le JJ/MM » en local (le contact quitte la liste aussitôt) ; la file l'écrit dans la colonne L (J+2) ou M (J+7) par `values.update`, ligne retrouvée par Id.
- **Activation** (`js/codes.js`, `js/activation.js`) : écran d'activation avant tout accès (avant même la connexion Google). Bouton principal « Commencer mon essai gratuit de 24 h » (sans code, sans carte bancaire), puis champ « J'ai un code » (achat ou démonstration) et lien « Pas encore de code ? Acheter ». Pour un code : empreinte SHA-256 (`crypto.subtle.digest`) comparée à `js/codes.js`, code gardé dans `localStorage` et dans la clé Réglages « Code d'activation ». Réglages affiche l'essai ou le code et son état.
  - Essai gratuit (décision de Nicolas du 7 novembre : argument commercial, ouvert à tous, en permanence) : il démarre au clic, une seule fois par compte Google. La clé Réglages « Essai commencé le » fait foi (plus de `localStorage`) : à la connexion et à chaque synchronisation, la date déjà présente dans le tableau remplace celle du clic et n'est jamais écrasée, donc une réinstallation ne relance pas l'essai. Essai expiré : « Photographier » et « Saisir sans carte » ouvrent l'écran « Votre essai est terminé » (« Acheter », « J'ai déjà un code ») ; accueil, À vérifier, À relancer et Réglages restent accessibles. Pastille « Essai jusqu'au JJ/MM HH:MM » puis « Essai terminé » sur l'accueil. Un code d'achat ou de démo remplace l'essai.
  - MIF2026 n'existe pas pour l'appli (décision de Nicolas du 7 novembre) : c'est seulement le code promo Stripe, 200 € de réduction au paiement. Saisi dans l'appli, il est refusé comme n'importe quel code inconnu ; aucune empreinte dans `js/codes.js`. L'essai de 24 h ne se lance que par le bouton « Commencer mon essai gratuit de 24 h ».
  - Lien d'achat : constante `LIEN_ACHAT` de `js/app.js` (provisoire, à remplacer par le lien Stripe).
- **Outil de codes** (`outils/codes.js`, Node, hors site, sans dépendance) : `achat 20`, `demo 1`, `test`. Codes `CDS-XXXX-XXXX` (alphabet sans O, 0, I, 1, `crypto.randomInt`). Codes en clair et CSV (Code, Type, Statut, E-mail client, Date, Identifiant Stripe, Entreprise) seulement à l'écran et dans `outils/sortie/`, ignoré par Git. Plus de commande `essai` : l'essai gratuit n'a pas de code.
- **Codes en place** dans `js/codes.js` (empreintes seules) : 1 code de test d'une minute (**à retirer avant la recette**, puis changer `VERSION`), 1 code démo sans fin, 20 codes d'achat. Les codes en clair ont été remis à Nicolas hors du dépôt.

#### Choix tranchés à l'étape 6 (Nicolas absent)

1. **Fonction de remplissage** : introuvable dans le code (seule la liste des variables existait). Écrite dans `js/relances.js` : `{prenom}` = premier mot du Nom, `{entreprise}` et `{note}` du contact, `{salon}` = Nom du salon, `{exposant}` = Votre entreprise, `{signature}` = Votre signature (sinon Votre nom). Sans prénom, « Bonjour {prenom}, » devient « Bonjour, ». Une variable inconnue reste telle quelle.
2. **Ordre des relances** : une seule ligne par contact. J+7 n'apparaît qu'une fois J+2 notée ; un contact jamais relancé reste en J+2 même après 7 jours. Jours comptés en jours de calendrier.
3. **« Copier le message »** copie le corps seul (l'objet est affiché sur la carte). Il compte aussi comme relance ouverte : la question vient au retour dans l'appli.
4. **« Oui » n'ouvre pas la fenêtre Google** : la relance est notée en local et part à la prochaine synchronisation (tout de suite si le jeton est valide). Déconnexion refusée tant qu'une relance notée n'est pas écrite.
5. **Normalisation des codes** : majuscules, sans espaces **et sans tirets** (plus simple à taper sur téléphone). L'outil applique la même règle avant le calcul.
6. **Code de test d'une minute** : son début est gardé sur le téléphone seulement (`localStorage`). Il ne touche pas à l'essai gratuit du compte, pour que Nicolas puisse voir la minute s'écouler même après avoir consommé son propre essai.
7. **Révocation** : retirer une ligne de `js/codes.js` invalide le code au prochain lancement (l'empreinte gardée n'est plus reconnue). Changer `VERSION` dans `sw.js`.
8. **Limite assumée** : la vérification se fait dans le navigateur. Une personne qui modifie le stockage du téléphone, ou efface la clé « Essai commencé le » de son tableau, peut la contourner ; c'est une protection de principe, suffisante pour ce produit.

### Vérifié sur ordinateur (Chrome, serveur local sur le port 8080)

Étape 6, Chromium sans tête (Playwright), 57 vérifications vertes, avec un faux Google Sheets en mémoire pour la synchronisation : écran d'activation au premier lancement (bouton d'essai gratuit, champ « J'ai un code », lien Acheter), code faux refusé, MIF2026 refusé comme code inconnu (aussi sur l'écran d'essai terminé) sans démarrer d'essai, ancien MIF2026 gardé sur un téléphone plus reconnu, essai lancé par le bouton, clé « Essai commencé le » posée sans `localStorage` ; réinstallation : la date du tableau (30 h plus tôt) remplace celle du clic, n'est pas écrasée, essai terminé et capture bloquée ; nouveau compte : essai de 24 h et date écrite dans l'onglet Réglages ; code d'achat qui débloque et recopié dans Réglages ; code de test qui expire en une minute réelle sans toucher l'essai du compte, bloque « Photographier » et « Saisir sans carte » sans bloquer À relancer ni À vérifier ; code démo (tapé sans tiret) ; liste à relancer lue dans le tableau, triée avec badges, `mailto:` (objet, corps, accents, `&`, `%0D%0A`, aucun `+`), « Bonjour, » sans prénom, modèle J+7 ; copie ; question au retour, Oui (« Envoyée le JJ/MM » écrit en L2) et Plus tard ; tri 31 / 31 ; aucune erreur console. Le vrai Google reste à vérifier sur téléphone.

Étapes 4 et 5 :

Tests du tri 31 / 31 ; saisie sans carte enregistrée en base locale avec e-mail et téléphone tirés de la note ; compteurs et pastilles justes ; photo réduite à 1 600 px, en niveaux de gris, affichée tout de suite ; « Annuler » supprime la capture ; service worker actif avec 27 fichiers en cache ; l'appli s'ouvre serveur arrêté et montre l'accueil avec les contacts locaux ; aucune erreur dans la console. La chaîne Google réelle (connexion, envoi, OCR, écriture) reste à vérifier par Nicolas sur téléphone.

## Version Équipe (branche `equipe`, 9 novembre)

Deux licences, même appli : Solo (690 €, 1 utilisateur) et Équipe (990 €, utilisateurs illimités).

- **Codes Équipe** `CDE-XXXX-XXXX` : `node outils/codes.js equipe 10` ; empreintes dans `js/codes.js` (type `equipe`), codes en clair seulement dans `outils/codes_equipe_a_importer.csv` (ignoré par Git), à importer dans la feuille « Carnet de salon · Codes ».
- **Responsable** : saisit le code Équipe ; son tableau devient le carnet de l'équipe. Onglet Réglages : `Mode` = `Équipe`, `Responsable` = son e-mail, `Code équipe` = empreinte SHA-256 (le code n'est jamais écrit en clair ; « Code d'activation » est masqué). Onglet `Équipe` : E-mail, Prénom, Rôle, Ajouté le. Colonne O « Compte » des contacts : e-mail de la personne qui a pris le contact (droits et filtres).
- **Inviter** (Réglages > Mon équipe) : partage du tableau en écriture et du dossier des photos en lecture (`sendNotificationEmail=false`), ligne dans l'onglet Équipe, lien `?rejoindre=idDuTableau&entreprise=…` à envoyer par e-mail (mailto) ou à copier. **Retirer** : partages et ligne supprimés, avec confirmation ; ses contacts restent.
- **Rejoindre** (commercial) : connexion Google, puis Google Picker (`js/picker.js`, clé `CLE_PICKER`, `setAppId`, filtré sur le tableau) qui donne l'accès `drive.file` au seul tableau choisi. Vérifications : `Mode` = `Équipe`, `Code équipe` reconnu dans `js/codes.js`, e-mail dans l'onglet Équipe. Pas de code ; vérifié à chaque synchronisation, retour à l'écran d'activation s'il est retiré. Ses photos vont dans un dossier de son propre Drive, partagé en lecture avec le responsable.
- **Pris par** (prénom), relances par commercial (« Toute l'équipe » pour le responsable), compteurs par commercial sur l'accueil du responsable, filtre « Pris par » dans Tous les contacts. Droits : un commercial modifie et supprime ses contacts seulement ; le responsable, tout.
- **Réglages** : ceux du responsable valent pour l'équipe (lecture seule chez les commerciaux) ; la signature d'un commercial reste sur son téléphone.
- **Isolation** : `js/environnement.js` (base IndexedDB, préfixe de stockage, service worker, adresse des liens) ; tout le stockage du navigateur passe par `js/stockage.js`.
- **Vente** : `ventes/Code.gs` (copie de référence du projet Apps Script) gère `LIEN_PAIEMENT_ID_EQUIPE` et envoie un code `equipe` avec le mode d'emploi du responsable.
- **Changer de code** : Réglages, « Saisir un autre code » (essai, Solo ou démonstration) et pastille d'essai de l'accueil : essai → Solo ou Équipe, Solo → Équipe, sans vider le téléphone ni changer de tableau. Caché pour le responsable et pour le commercial invité.
- **Tests** : `tests/equipe.test.html` (règles) ; `tests/activation.test.html` (changements de code, navigateur) ; `node tests/equipe.e2e.mjs` (bout en bout avec un faux Google, dont essai → Solo → Équipe ; codes de test ajoutés par le serveur du test seulement).

## À faire par Nicolas (mains ou téléphones)

1. Test de connexion iPhone (`https://app.optimisons.ai/test/`), puis me renvoyer la grille.
2. Tests de sortie des étapes 4 et 5 sur les deux téléphones.
3. Tests de sortie de l'étape 6 : relance ouverte dans Gmail, Outlook et Mail d'Apple ; « Envoyée le JJ/MM » écrit dans le tableau ; « Commencer mon essai gratuit » ; essai pas relancé après réinstallation ; MIF2026 refusé comme code inconnu ; code faux refusé ; code de test expiré qui bloque la capture ; bouton Acheter ; code d'achat qui débloque.
4. Avant la recette : retirer la ligne du code de test de `js/codes.js`, changer `VERSION` dans `sw.js` ; remplacer `LIEN_ACHAT` par le lien Stripe (avec `?prefilled_promo_code=MIF2026`).

## Entretien

- **À chaque modification d'un fichier de l'appli : changer `VERSION` dans `sw.js`**, sinon les téléphones gardent l'ancienne version en cache.
- Tout nouveau fichier de l'appli doit être ajouté à la liste `FICHIERS` de `sw.js`.
- QR code du flyer : `node outils/qrcode.js` ; icônes : `node outils/icones.js` (après `npm install` dans `outils/`).
- Codes d'activation : `node outils/codes.js` (sans `npm install`). **Ne jamais committer un code d'achat ou de démo en clair** : seules les empreintes vont dans `js/codes.js`.
- Tests du tri : https://app.optimisons.ai/tests/tri.test.html (doivent rester verts).
