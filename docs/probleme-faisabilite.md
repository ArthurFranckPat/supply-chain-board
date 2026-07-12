# Problème faisabilité composants — Analyse et correctifs

## Résumé

Le bouton "Faisabilité" du board retournait `feasible: false` pour des OF qui ont pourtant du stock (confirmé par `ofMaterials` et le panneau détail). L'incohérence entre le board (bordure rouge) et le panneau (composants ✅) empêche l'utilisation de la fonctionnalité.

## Causes racine (4 bugs distincts)

### 1. Mode d'allocation : `'sequential'` par défaut

`evaluateSequentialFeasibility` avait un défaut `mode: 'sequential'`. Sans paramètre `mode` explicite, la simulation concurrente consommait le stock entre OFs et bloquait les OF planifiés/suggérés.

**Correctif** : défaut passé à `'immediate'` (`stock-state.ts:80`). Chaque OF est vérifié indépendamment.

### 2. BOM récursive dans `checkFeasibility`

`checkFeasibility` descendait dans les sous-ensembles FABRIQUE de la nomenclature et vérifiait récursivement leurs composants achetés. Pour un OF avec sous-ensembles ayant leurs propres OF de couverture, cette récursion était incorrecte — les sous-ensembles avec OF ne devraient pas être ré-explosés.

**Correctif** : ajout de `hasSupplyFlowFor(flows, article)` (`feasibility.ts:115`). Si un flux supply existe pour un article fabriqué, il a son propre OF → la récursion est ignorée. Sans flux supply → la récursion a lieu (vrai trou détecté).

### 3. Stock des composants BOM non chargé

`boardFeasibility` chargeait le stock (`boardDataset.getStock()`) uniquement pour les articles des OF + demandes + réceptions + composants ACHETE de premier niveau. Les composants ACHETE des sous-ensembles fabriqués (niveaux 2+) n'étaient PAS inclus → `availableAt` retournait 0 → l'OF était bloqué.

Premier correctif (insuffisant) : expansion récursive limitée aux composants `componentType === 'ACHETE'`. Problème : un sous-ensemble FABRIQUE sans OF n'est jamais ajouté à `articleSet`, donc ses enfants ACHETE non plus.

**Correctif final** : expansion récursive de `articleSet` à **tous** les composants BOM (ACHETE + FABRIQUE), pas seulement ACHETE (`planning_board_controller.ts:656-668`). La boucle while ajoute itérativement tous les descendants à tous les niveaux.

### 4. Disparition de `+ m.allocated` dans `ofMaterials`

Pendant la refactor de `ofMaterials`, la formule `available + m.allocated >= needed` a été simplifiée en `available >= needed`, supprimant la prise en compte des allocations ERP déjà effectuées par X3.

**Correctif** : rétablissement de `+ m.allocated` (`planning_board_controller.ts:761`).

## Fichiers modifiés

| Fichier                                                | Modification                                    |
| ------------------------------------------------------ | ----------------------------------------------- |
| `app/domain/stock-state.ts:80`                         | Défaut `mode: 'immediate'`                      |
| `app/domain/feasibility.ts:85-100`                     | Skip récursion FABRIQUE avec `hasSupplyFlowFor` |
| `app/domain/feasibility.ts:115-117`                    | Nouvelle fonction `hasSupplyFlowFor`            |
| `app/controllers/planning_board_controller.ts:656-668` | Expansion récursive tous composants BOM         |
| `app/controllers/planning_board_controller.ts:761`     | Rétablissement `+ m.allocated`                  |
| `resources/views/board.edge`                           | Debug console pour OFs cibles                   |

## Prérequis

- `node ace serve` doit être redémarré APRÈS les modifications du code source
- Hard refresh navigateur (`Cmd+Shift+R`)
- Cliquer "Faisabilité" en mode **Immédiat** (défaut)

## Test de vérification

```js
// Dans console navigateur, après clic "Faisabilité"
console.log('feasResults:', feasResults?.ofFeasibility?.['F426-31579'])
console.log('matCache:', matCache['F426-31579'])
```

## Si le problème persiste

Vérifier :

1. Que le serveur a bienété redémarré avec le code à jour (pas de cache de compilation)
2. Que `boardDataset` n'a pas de cache périmé : ajouter `?refresh=1` à l'URL
3. Que les flux stock (`boardDataset.getStock`) contiennent bien les articles composants concernés
