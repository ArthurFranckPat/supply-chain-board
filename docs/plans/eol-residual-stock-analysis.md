# Module EOL Residual Stock Analysis (API + tests)

## Summary
Construire un module backend qui calcule les composants residuels lies a des familles en fin de vie, avec support multi-familles, unicite dans le perimetre selectionne uniquement, et valorisation selon mode de stock choisi.

## Implementation Changes

1. Nouveau service metier EOL
- Creer un service dedie (ex: `EolResidualsService`) dans `apps/planning-engine/production_planning/feasibility/eol_residuals.py`.
- Entrees: `familles[]` (`FAMILLE_PRODUIT`) + `prefixes[]` (union), `bom_depth_mode` (`level1|full`), `stock_mode`.
- Cible PF: articles de type fabrication selectionnes par famille/prefixe.
- Extraction composants: support `ACHAT + FABRICATION`.
- Unicite multi-familles: composant unique si utilise par au moins un PF cible et par aucun PF hors perimetre cible.
- Stock/valorisation:
  - mode `physical`: `stock_physique`
  - mode `net_releaseable`: `stock_physique + stock_bloque - stock_alloue`
  - valorisation = `stock_qty * PMP`
  - `PMP` manquant: valeur 0 + alerte.
- Resultat: `summary` (totaux qty/value, nb composants uniques, nb PF cibles) + lignes detaillees par composant + `warnings`.

2. Contrats de donnees et parsing
- Etendre le modele Article pour supporter `famille_produit` et `pmp` optionnels (non bloquant si colonne absente).
- Parser Articles: lecture tolerante de `FAMILLE_PRODUIT` et future colonne `PMP`.

3. Exposition API planning-engine
- Ajouter endpoint POST dans `apps/planning-engine/production_planning/api/server.py`, ex: `/api/v1/eol-residuals/analyze`.
- Ajouter facade dans `apps/planning-engine/production_planning/app/gui_service.py` (verif data chargee, appel service, serialisation standard).

## Public API / Interface Additions

1. Request
- `familles: string[]`
- `prefixes: string[]`
- `bom_depth_mode: "level1" | "full"` (defaut `full`)
- `stock_mode: "physical" | "net_releaseable"` (choix utilisateur)
- `component_types: "achat_fabrication"` (valeur par defaut correspondant au choix metier)

2. Response
- `summary`: `target_pf_count`, `unique_component_count`, `total_stock_qty`, `total_value`
- `components[]`: `component_code`, `description`, `component_type`, `used_by_target_pf_count`, `stock_qty`, `pmp`, `value`
- `warnings[]`: selecteurs sans match, PMP manquants, etc.

## Test Plan

1. Unit tests service
- Multi-familles: composant partage entre 2 familles ciblees reste unique au perimetre.
- Exclusion: composant aussi utilise par PF hors perimetre => non unique.
- `bom_depth_mode`: difference `level1` vs `full`.
- `stock_mode`: validation des 2 formules.
- PMP manquant => valeur 0 + warning.

2. API contract tests
- 200 avec payload valide et reponse structuree.
- 400 si `familles` et `prefixes` vides.
- 404/400 coherent si donnees non chargees ou parametres invalides.

## Assumptions
- `FAMILLE_PRODUIT` sera disponible (ou ajoute) dans `Articles.csv`.
- `PMP` sera une colonne future de `Articles.csv`; en attendant, comportement tolerant (0 + alerte).
- Perimetre livraison de cette iteration: backend API + tests uniquement (pas d ecran UI).
