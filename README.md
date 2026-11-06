# Carnet de salon

Optimisons.ai · « L'IA, simplement. »

Appli mobile installable (PWA) pour les exposants de salons : photo de la carte de visite, note dictée, enregistrement dans le Google Drive de l'exposant, puis relances J+2 et J+7.

- Adresse : https://app.optimisons.ai
- Hébergement : GitHub Pages, branche `main`, dossier racine. Chaque push sur `main` déploie.
- Fichiers statiques, sans framework ni dépendance à l'exécution.
- Conception : dossier `docs/` (le cahier des charges fait foi).
- Plan de travail : `CONSIGNES.md`.

## Variante de connexion retenue

Test de l'étape 2, selon la règle de décision du document de test de connexion (§ 5).

| Plateforme | Résultat | Décision |
|---|---|---|
| Android, appli installée | A OK (reconnexion en 4 s après fermeture complète, chaîne Drive en 11,7 s), B OK | **A** (fenêtre Google Identity Services) |
| iPhone | Test prévu le 7 novembre au soir | À compléter |
