# Tests

Ce projet utilise [Japa](https://v2.japa.dev) via AdonisJS. Le point d'entrée est `bin/test.ts` ; la commande métier est `node ace test`.

## Lancer tous les tests

```bash
node ace test
```

## Lancer une suite

```bash
node ace test unit
node ace test functional
```

## Lancer un fichier de tests

```bash
node ace test --files=forecast-consumption.test.ts
```

Le nom du fichier peut être donné avec ou sans extension.

## Lancer un groupe de tests

Un groupe correspond à l'appel `test.group('...', () => {})`.

```bash
node ace test --groups="consumeForecasts"
```

## Lancer un test précis par son titre

```bash
node ace test --tests="orders consume forecasts completely"
```

## Filtrer par tag

```bash
node ace test --tags="@critical"
```

## Combiner les filtres

Les filtres peuvent être combinés :

```bash
node ace test --files=rupture-engine.test.ts --groups="rupture-engine"
```

## Afficher le détail des tests exécutés

```bash
node ace test --files=rupture-engine.test.ts --reporters=spec
```

## Exemples fréquents

```bash
# Domaine
node ace test --files=analyse-rupture.test.ts
node ace test --files=analyse-rupture-bug.test.ts
node ace test --files=rupture-engine.test.ts
node ace test --files=feasibility-contract.test.ts
node ace test --files=feasibility-diagnostics.test.ts
node ace test --files=of-conso.test.ts
node ace test --files=matching-edge-cases.test.ts
node ace test --files=availability.test.ts
node ace test --files=stock-state.test.ts
node ace test --files=planning_board.test.ts
node ace test --files=planning-board-feasibility.test.ts
node ace test --files=recursive-checker.test.ts
node ace test --files=allocation.test.ts
node ace test --files=allocation-manager.test.ts
node ace test --files=country-filtering.test.ts
node ace test --files=rules.test.ts

# Controller / fonctionnel
node ace test --files=planning_board_controller.test.ts
node ace test functional --files=planning_board_overrides.test.ts
```

## Conventions

- Les tests unitaires et d'intégration du domaine sont dans `tests/domain/`.
- Les tests fonctionnels (HTTP, controllers) sont dans `tests/functional/`.
- Les helpers de fabrication de données (`makeFlow`, `makeArticle`, etc.) restent dans le fichier de test sauf s'ils sont partagés par plus de deux fichiers.
- Ajouter un test ciblé est préférable à lancer toute la suite lors d'un développement itératif.
