# Revue externe — lots 0 et 1 du plan d'approvisionnement

_Revue par l'agent Claude Code, 04/09/2026, sur `etat-avant-pull` @ `bc45aedd`.
Vérifications faites contre X3 PROD (site AE1) via MCP Sage-X3, et contre la
réplique SQLite locale. Chaque constat est rejouable — les requêtes sont données._

## Gates — au vert

`npm run typecheck` ✓ · `npx eslint` sur les 5 fichiers touchés ✓
`--files="charge_explosion"` 22 tests ✓ (14 avant) · `material_plan` 9 ✓ · `material_buckets` 6 ✓

## Ce qui est bien fait — à ne pas défaire

- **Marcheur partagé** plutôt que drapeaux dans `explodeCharge`. Meilleur que ce que
  le plan prévoyait. Parité `/charge` vérifiée à la lecture : `depth + 1 > maxDepth`
  ⟺ `depth >= maxDepth`, filtre `hasChargeRoute` remonté en amont équivalent,
  émission par opération de gamme intacte.
- **Double-comptage multi-poste évité** : le mode quantité émet une fois par article.
  C'était le vrai piège de `netCharge` (qui consomme le pool de stock une fois par
  raw) — cf. `tests/domain/charge_explosion.test.ts:169`.
- Les deux sites `isManufactured` centralisés dans `collectBom`.
- Plafond 14 appliqué **serveur (400) et client** (option désactivée + explication).
- En-tête portant les deux mentions obligatoires (date client, priorité ferme).
- « Reste » employé au sens du 3e cran, pas comme synonyme de net.
- Propriété `netFerme == calcul ferme-seul` : tient.

---

## 🔴 1. Fantômes AFANT — le stock du fantôme est perdu

**Fichiers** : `app/domain/charge_explosion.ts` (`isPassThrough` dans `walkExplosion`),
`app/services/material_plan_loader.ts` (`computeMaterialStock`).

`isPassThrough` n'émet jamais le fantôme. Ne pas en faire une ligne du tableau est
juste — un fantôme n'est pas commandable. Mais comme il n'est jamais émis, il n'entre
pas dans `explodedArticles`, donc `getStock` ne le demande jamais, donc **son stock
n'existe pas pour le calcul**. Ses enfants sont explosés à pleine quantité.

**Vérifié sur PROD** — 6 des 17 fantômes parents de nomenclature portent du stock :

```sql
SELECT ITMREF_0, SUM(QTYSTU_0) AS QTE FROM STOCK
WHERE STOFCY_0 = 'AE1' AND ITMREF_0 IN ('11085385','11988AL','A1230R','A4188L01',
 'A4188L02','A6712R02','CE3105','CE3247','D6515','E1578','E4272','E7855','J2723',
 'K5926','TA7398E01','TA7398E02','TA7399')
GROUP BY ITMREF_0
```

| Article | Stock AE1 |
|---|---|
| CE3105 | 743 |
| 11988AL | 580 |
| A4188L01 | 500 |
| E7855 | 138,48 |
| J2723 | 78 |
| 11085385 | 60 |

11988AL descend en 1:1 sur 11011988 → **jusqu'à 580 unités commandées en trop**.
A4188L01 → A7752L01, 500 de trop.

**La règle est déjà arrêtée dans ce projet** et implémentée dans `rupture_engine` :
*stock net d'abord, descente du reliquat*. Le plan renvoyait l'arbitrage « à trancher
à l'implémentation, cas rare côté appro » — rare en volume, mais la règle existait.

**Correctif** : consommer le stock du fantôme avant de descendre le reliquat, et
inclure les fantômes dans la liste des articles dont on lit le stock, sans en faire
des lignes du tableau.

## 🔴 2. La clôture / horizon de demande n'est pas implémentée

Zéro occurrence de `fence` dans `app/`, `inertia-react/`, `start/`.

C'est la **décision n°4 du plan** (§2.4), présente dans §4.1 (`params.fenceIso`, avec
le bon raisonnement : exclusion AVANT explosion) et dans la signature d'endpoint §4.3
(`&fence=`). `parseParams` (`material_plan_loader.ts`) ne la lit pas.

Soit elle est abandonnée pour le lot 1 — le dire explicitement — soit elle manque.
C'est la distinction ferme/prévision désignée par le demandeur comme le cœur de la
valeur face au CBN.

⚠️ **Si elle revient : le §2.4 du plan la spécifie à l'envers.** « clôture = +∞ →
tout inclus » est faux : à +∞, *tout* est avant la clôture, donc *toutes* les
prévisions sont ignorées. Pour neutraliser le filtre, la clôture va dans le passé.

## 🔴 3. Quantités affichées sans unité d'achat

**Fichiers** : `MaterialRow` (`material_plan_loader.ts`), `inertia-react/lib/appro/types.ts`,
`inertia-react/pages/approvisionnement.tsx`, `app/services/static_sync_service.ts:359-363`.

Aucune unité dans le shape de ligne ni à l'écran. Le sync écrit toujours
`unitStock: null, unitPurchase: null, purchaseToStockRatio: 1` **en dur** — la table
`static_articles` n'a pas les colonnes.

**Vérifié sur PROD** — 118 articles actifs ont `PUU_0 <> STU_0`, dont **44 sont des
composants de nomenclature**, et ce sont les plus consommés du référentiel :

```sql
SELECT ITMREF_0, STU_0, PUU_0, PUUSTUCOE_0 FROM ITMMASTER
WHERE ITMSTA_0 = 1 AND PUU_0 IS NOT NULL AND PUU_0 <> STU_0 AND ROWNUM <= 200
```

| Composant | Stock | Achat | Coef | Nomenclatures qui le consomment |
|---|---|---|---|---|
| E7768 | UN | RL | **1000** | **332** |
| E7720 | UN | RL | **3500** | 139 |
| E7717 | UN | RL | **10000** | 77 |
| E7188 | UN | RL | **5180** | 46 |

L'écran affichera « 47 000 » là où il faut commander 47 rouleaux.

**Correctif minimal** : mention « quantités en unité de stock » dans l'en-tête.
**Correctif propre** : synchroniser `STU_0` / `PUU_0` / `PUUSTUCOE_0` et porter
l'unité sur la ligne.

---

## 🟠 4. Clé de cache du stock instable

`computeMaterialStock(explodedArticles)` → `boardDataset.getStock`, dont la clé est
`md5(liste d'articles triée)` (`board_dataset.ts:484`). La liste dépend de la fenêtre,
et la page a un sélecteur de plage libre → **clé neuve à chaque changement de fenêtre**,
donc relecture X3 complète sur ~2 600 articles, sur un appel superlinéaire. Le cache de
payload (`payload:material:${from}:${to}:${gran}`, TTL 2 min) ne rattrape rien : il est
lui aussi indexé sur la fenêtre.

C'est un mode de défaillance déjà rencontré 4 fois dans ce repo (clé instable = SWR mort).

**Correctif** : lire le stock sur un périmètre **indépendant de la fenêtre** (union des
articles atteignables, ou horizon canonique) et découper localement.

## 🟠 5. Deux chemins de calcul là où le pinning en promet un

`loadMaterialPayloadData` recopie explosion + netting en ligne ; `explodeAndNet` existe
et n'est appelé que par `loadMaterialDetailData`. Équivalents aujourd'hui — mais toute
la raison d'être du snapshot pinné est qu'il n'y ait qu'un chemin.
**Correctif** : appeler `explodeAndNet` des deux côtés.

## 🟠 6. Compteur de troncature sur-compte

`onDepthCut` compte les enfants `componentType === 'FABRIQUE'`, alors que la descente
est coupée par `isPurchased` (le `supplyType` de l'article) — deux notions différentes
de « fabriqué » dans le même pipeline.

Mesuré sur la réplique : **224 liens** sont `componentType` FABRIQUE avec un article
`supply_type` ACHAT. Ils seraient feuilles de toute façon, mais gonflent `truncated`
et le marqueur ⚠.

```sql
-- réplique locale
SELECT COUNT(*) FROM static_nomenclatures n JOIN static_articles a
ON a.code = n.component_article
WHERE n.component_type='FABRIQUE' AND a.supply_type='ACHAT';
```

Diagnostic seulement, aucune quantité fausse. Choisir une seule définition.

## 🟠 7. `round2` à chaque accumulation

`row.brutFerme[idx] = round2(row.brutFerme[idx] + n.brutQty)` arrondit à chaque ajout.
Sur E7768 (332 nomenclatures parentes) la dérive devient visible. Arrondir une fois,
à la fin.

---

## Ordre suggéré

1, 3 puis 2 avant de montrer l'écran à un approvisionneur : le stock fantôme fausse
les quantités, l'absence d'unité peut faire commander mille fois trop, la clôture
manque à l'appel du plan. 4 avant d'ouvrir à plusieurs utilisateurs. 5, 6, 7 ensuite.

Le lot 0 est mieux fait que ce que le plan prévoyait — la base est saine.
