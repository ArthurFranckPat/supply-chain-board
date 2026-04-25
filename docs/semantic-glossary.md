# Glossaire Sémantique

Ce projet sépare les noms techniques stables des libellés métier visibles.

## Règles

- UI en français métier : `Pilotage`, `Ordonnancement`, `Faisabilité`, `Capacités`, `Rapports`, `Paramètres`.
- Code backend en bounded contexts anglais : `orders`, `feasibility`, `planning`, `scheduling`.
- Contrats publics existants conservés quand ils sont déjà consommés : `/api/v1/runs/schedule`, `run_schedule`, `SchedulerResult`.
- Éviter les libellés hybrides dans l'interface : ne pas afficher `Scheduler`, `Home`, `Reports`, `Settings`.
- Employer `calcul d'ordonnancement` pour parler d'un run métier côté UI.

## Mapping

| Concept | Libellé UI | Nom technique accepté |
| --- | --- | --- |
| Vue d'accueil | Pilotage | `home`, `PilotageView` |
| Calcul planning | Ordonnancement | `schedule`, `scheduling`, `run_schedule` |
| Vérification composant/capacité | Faisabilité | `feasibility` |
| Paramétrage capacité/calendrier | Capacités | `capacity`, `planning` |
| Suivi des commandes client | Commandes | `order-tracking`, `suivi-commandes` |
| Stock fin de vie | Stock EOL | `eol-residuals` |
| Fabrication depuis stock EOL | Fabricabilité | `residual-fabrication` |
