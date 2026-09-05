# Plan d'approvisionnement — plan détaillé

_Rédigé le 04/09/2026. Branche : `etat-avant-pull`. Statut : **cadré, non implémenté**._

_Révision 2 — fusion avec le plan de l'agent muse spark (`.muse/plan-approvisionnements.md`),
après revue et vérification de ses références au code. Ce qui en vient est signalé `[muse]`._

## 1. Le besoin

Fournir le chaînon manquant entre le planificateur de charge et l'approvisionneur :
un **plan de besoins daté, traçable, exprimé en quantités par référence**.

> Compte tenu du carnet ferme + des prévisions sur la fenêtre choisie, de quelles
> références ai-je besoin, en quelle quantité, dans quel bucket — et pour quelle
> commande ?

Ce n'est **pas** du RCCP (capacité) : c'est un plan directeur d'approvisionnement.
Deux populations : composants **achetés** (besoin d'achat) et **sous-ensembles
fabriqués** (besoin de lancement), descendus dans la nomenclature.

## 2. Décisions actées

| # | Décision | Statut |
|---|---|---|
| D1 | **Aucun décalage de délai.** Besoin daté à la date demandée par le client, comme `/charge`. Industriellement faux, assumé, et **écrit dans l'en-tête de la page**. | Acté |
| D2 | **Le pivot est la période, pas la référence.** Sélecteur de fenêtre → la table complète des composants concernés, lue d'un bloc. La référence n'est le pivot que du drill-down. | Acté |
| D3 | **Sélecteur de maille** jour / semaine / mois, contraint par le nombre de périodes produites (§5). | Acté |
| D4 | **Double bucket ferme / prévision** : deux sous-colonnes par période. Si trop lourd à l'usage, on ajoutera un interrupteur d'affichage **sans changer le calcul** `[muse]`. | Acté |
| D5 | **Bascule brut / net / reste**, même grammaire que `/charge`. C'est elle qui règle le sort de l'en-cours (§6.3). | Acté |
| D6 | **Accès** : l'onglet « Planification » devient un menu déroulant → « Charge » + « Approvisionnement ». | Acté |
| D7 | **Horizon de demande** : lot 3, branché sur `ITMFACILIT.FOH_0` (§8). Pas de clôture globale ressaisie à la main. | Acté |
| D8 | **Décalage par délai** : lot 4. | Acté |
| D9 | **Profondeur 4**, comme `/charge` — mais **troncature marquée à l'écran** (§7.4). Tranché faute d'arbitrage : « trois ou quatre niveaux, on corrigera plus tard ». | Tranché, révisable |

## 3. État des lieux — ce qui existe déjà

Le moteur d'explosion demandé **existe** dans le module `/charge`. Il est projeté
sur le mauvais axe : heures par poste au lieu de quantités par référence.

| Brique | Emplacement | État |
|---|---|---|
| Demande fermes + prévisions | `order_line_repository.ts:211` — `ORDERS WIPTYP=1, WIPSTA IN (1,3)`, reste à livrer > 0 | ✅ |
| Explosion BOM depth 4, anti-cycle, `path` complet | `charge_explosion.ts` → `explodeCharge()` | ✅ |
| Traçabilité d'origine jusqu'au niveau 4 | `ChargeSource` | ✅ rare et précieux |
| Netting stock strict + CQ, FIFO par article | `netCharge()` | ✅ à adapter (§6.2) |
| Déduction de l'en-cours non déclaré | `buildEncoursByArticle()` (`load_payload_loader.ts`) | ✅ devient le cran « reste » |
| Nomenclature complète en SQLite, achetés compris | `static_nomenclatures` — 34 081 liens | ✅ |
| `componentType` ACHETE/FABRIQUE, `consumptionNature` FORFAIT/PROPORTIONNEL, filtre `Z*` | `static_sync_service.readNomenclatures()` `[muse]` | ✅ |
| Entrées + buckets + snapshot pinné | `fetchChargeInputs`, `chargeHorizon`, `chargeBucketRange`, `pinChargeInputs` | ✅ à réutiliser |
| Sources cachées SWR | `board_dataset.ts` — `getOrderLinesForLoad`, `getStock`, `getReferential` `[muse]` | ✅ |
| Couverture réceptions + verdicts | `shortages.ts:212` `resolveCoveringReception` + verdicts couvert/à risque/retard `[muse]` | ✅ lot 2, tel quel |
| Descente SE, fantômes, allocations | `rupture_engine.ts` (`FABRICATED_DESCENT_CAP = 6`) `[muse]` | Référence sémantique, pas de dépendance v1 |
| Suggestions CBN temps réel (WIPSTA=3) | `suggestion_repository.ts` `[muse]` | ✅ lot 5 (comparaison) |
| Délais par article | `static_articles.reorder_delay` | ⚠️ pollué (§7.3) |
| Patterns front (toolbar, sheet détail, miroir de types) | `pages/scheduler/load.tsx` + `lib/load/*` | ✅ patterns, pas les composants |

## 4. Les verrous à lever

1. **93 % de la nomenclature est jetée**, sur **deux sites d'appel** :
   - `app/services/load_payload_loader.ts:271`
   - `app/controllers/order_planning_controller.ts:406` `[muse]` — *raté dans la
     révision 1. `/programme` est concerné au même titre que `/charge` : le lot 0
     touche deux pages vivantes, pas une.*

   Sur 34 081 liens BOM, **31 737 sont des composants achetés** — exactement la
   population de l'approvisionneur.

2. **Pas de gamme = pas de besoin.** `charge_explosion.ts:196` (`hasChargeRoute`)
   et `:168` (boucle gamme). Logique quand l'unité est l'heure, absurde quand
   l'unité est la pièce : un composant acheté n'a jamais de gamme. Il faut une
   émission « sans poste » `[muse]`.

3. **Le mode quantité ne doit pas rouler sur la boucle gamme.** `explodeCharge`
   émet un `ChargeRaw` **par opération**, et `netCharge` consomme le pool de stock
   **une fois par raw**.

   Preuve dans le test existant `tests/domain/charge_explosion.test.ts:169`
   (« article multi-poste : une ligne de charge par poste ») : un article à deux
   postes émet deux raws portant chacun `qty = 10` pour un besoin physique de 10.
   Branché tel quel sur des quantités, **le stock serait consommé 20**.

   Inoffensif aujourd'hui — **0 article multi-op dans la réplique locale** — mais
   c'est un comportement *verrouillé par un test*, donc il ne disparaîtra pas seul.
   Le mode quantité émet **un besoin par article**.

4. **Aucun décalage de délai** — assumé (D1), mais à documenter dans le moteur pour
   que personne ne le prenne pour un oubli.

5. **La couverture s'arrête au stock** : ni PO en cours, ni OF lancés. Lot 2.

## 5. Maille et fenêtre — la règle

Le critère n'est ni la fenêtre ni la maille isolément, c'est le **nombre de
périodes produites** — raisonner en durée laisse passer « 3 mois au jour » (65
périodes, 130 colonnes avec le double bucket). **Plafond : 14 périodes**, soit 28
colonnes de données.

| Maille | Fenêtre max | Périodes | Colonnes |
|---|---|---|---|
| Jour | 3 semaines | ≤ 15 jours ouvrés | 30 |
| Semaine | 3 mois | ≤ 13 semaines | 26 |
| Mois | 12 mois | ≤ 12 mois | 24 |

- Combinaison hors plafond → **bouton désactivé, pas corrigé en silence**, avec
  l'explication au survol. Un écran qui change le choix de l'utilisateur sans le
  dire est plus déroutant qu'un bouton grisé. Côté API : **400 explicite**, jamais
  de tableau dégénéré `[muse]`.
- Changement de **fenêtre** → la maille se replie sur la plus fine encore permise,
  avec un liseré signalant le changement.

La maille **jour** est nouvelle (`/charge` n'a que semaine/mois) — techniquement
gratuite, les besoins sont déjà datés au jour (`ENDDAT_0`). Elle expose crûment la
convention D1 : les dates client se massent, on verra des pics secs et des jours
vides. Fidèle à la donnée. `chargeBucketRange` est à étendre au jour `[muse]`.

## 6. Le calcul

### 6.1 Explosion — `explodeMaterialNeeds` `[muse]`

- Enveloppe autour d'`explodeCharge` en **mode quantité** : un besoin par article,
  composants achetés inclus, sans exigence de gamme, émission « sans poste ».
- **Règle d'arrêt** `[muse]` : `componentType === 'ACHETE'` → feuille, pas de
  descente. `FABRIQUE` → descente jusqu'à `maxDepth = 4`.
- `path` et `ChargeSource` conservés intacts → drill-down « appelé par » sans
  requête supplémentaire.
- Fantômes AFANT : traités comme fabriqués simples en v1, à revoir si le cas se
  présente (rare côté appro) `[muse]`.

### 6.2 Netting — priorité ferme `[muse]`

Le stock couvre **d'abord le ferme** (FIFO par date au sein du ferme), le reliquat
couvre la prévision (FIFO par date au sein de la prévision).

C'est meilleur que le FIFO par date global de `netCharge`, pour une raison
précise : **`netFerme` devient exactement ce que donnerait un calcul ferme-seul**.
La révision 1 prévoyait pour ça une bascule « Fermes seulement » qui relançait un
second calcul — **elle disparaît, le netting la rend gratuite**. Un contrôle en
moins à l'écran, une question de moins à se poser.

> **Divergence assumée avec `/charge`.** `netCharge` nette en FIFO par date, sans
> priorité de nature. Le même composant affichera donc un net différent sur les
> deux écrans. C'est le bon comportement ici — mais il doit être **écrit dans
> l'en-tête**, pas laissé en silence : la cohérence charge ↔ appro est un des
> arguments qui justifient de construire cet écran.

### 6.3 Bascule brut / net / reste — même grammaire que `/charge`

| Cran | Définition | Effet |
|---|---|---|
| **Brut** | besoin explosé, aucune déduction | ventilé ferme / prévision par nature d'origine |
| **Net** | brut − stock (strict + CQ), priorité ferme | le chiffre de référence |
| **Reste** | net − en-cours de fabrication non déclaré | ne bouge que les lignes fabriquées |

C'est ce cran qui tranche la question de l'en-cours, **sans avoir à l'arbitrer**.
Le plan muse l'excluait de la v1 (« sens atelier, pas achat ») : l'argument vaut
pour les feuilles achetées — qui n'ont de toute façon aucun en-cours, donc le cran
ne les déplace pas — mais pas pour les sous-ensembles fabriqués, qui sont la moitié
du périmètre. Les exclure surestimait le besoin SE, sur exactement la population où
il compte (cas AR2602603 documenté dans `load_payload_loader.ts` : 640 demandés,
390 déjà sorties de l'opération 10 de F326-02020).

Le cran donne les deux lectures et n'en impose aucune. Pool réutilisé tel quel :
`buildEncoursByArticle()`.

## 7. Points de rigueur

### 7.1 Filet de non-régression — condition d'entrée du lot 0

`tests/domain/charge_explosion.test.ts` existe déjà : **242 lignes, 14 tests**,
netting FIFO et passe en-cours compris. Le lot 0 s'y adosse.

Une vérification manuelle de cohérence avec `/charge` ne suffit pas : on modifie
`explodeCharge`, qui alimente **`/charge` et `/programme`**. Le test de
non-régression sur les heures est la **condition d'entrée**, pas la conclusion.

### 7.2 Troncature de nomenclature — visible

Avec `maxDepth = 4` et l'arrêt sur acheté, un composant acheté situé au niveau 5
d'un produit profond **n'apparaît jamais**. Pour un plan d'appro, un manque
invisible est le pire défaut possible.

→ Compter les branches coupées et **marquer les lignes concernées à l'écran**.
`rupture_engine` descend à 6 : si le marqueur se déclenche souvent, on alignera.

### 7.3 Dette `reorder_delay` — à assainir au lot 0

`static_sync_service` écrit `delay = Number(r.PRPLTI_0) || 14` → **2 472 articles
achat à 14 jours**, sans distinguer la valeur X3 du défaut.

Sans conséquence pour la charge. Disqualifiant pour le lot 4, dont toute la valeur
est la date de commande. `stock_valuation_repository.ts:626` a déjà tranché dans le
bon sens : *« Un délai de réappro inconnu et un délai nul ne se pilotent pas pareil »*.

→ `reorder_delay` **nullable**, valeur X3 conservée telle quelle, repli décidé par
le consommateur, badge « délai non renseigné » à l'écran. Fait au lot 0 pour ne pas
resynchroniser deux fois.

### 7.4 Manifeste de routes

`npm run routes:gen` après ajout de route — **seule cause historique de CI rouge**.

## 8. Horizon de demande (lot 3)

Champ X3 réel, déjà cartographié : `ITMFACILIT.FOH_0` + son unité `FOHUOT_0`
(`app/models/x3/itmfacilit.ts:78`). Non synchronisé vers `static_articles` — **une
colonne à ajouter au sync**, pas un chantier.

Pas de clôture globale saisie à la main : l'utilisateur l'a **déjà paramétrée par
article** dans l'ERP. Une date unique à l'écran serait un réglage à ressaisir, puis
à refaire au lot suivant.

Deux points de conception à acter maintenant :

- **L'horizon qui s'applique est celui du produit fini, pas celui du composant.**
  La prévision vit sur le PF : la décision « je garde ou je jette » se prend au
  **niveau 0, avant explosion** — jamais après, pour ne pas fausser le netting
  `[muse]`. Sinon un même composant serait tantôt inclus tantôt exclu selon le PF.
- Le codage de `FOHUOT_0` (jour / semaine / mois) est **à vérifier sur la donnée
  réelle**, pas à supposer.

## 9. La page

**Route** `GET /approvisionnement` → `ApprovisionnementController.index`.

**Accès** — l'onglet `PLANIFICATION` (`masthead.tsx:55`), aujourd'hui lien nu vers
`/charge`, devient un menu déroulant sur le modèle d'« Ordonnancement » :

```
Planification ▾
  ├─ Charge                 /charge              (heures × postes)
  └─ Approvisionnement      /approvisionnement   (quantités × références)
```

Deux lectures de la **même explosion** sous le même chapeau.

**Toolbar** — presets de fenêtre (2 semaines, mois en cours, mois prochain, 3 mois,
6 mois) + plage libre ; maille contrainte (§5) ; bascule brut/net/reste ; filtres
acheté/fabriqué (défaut : **acheté**), famille, recherche ; **« seulement les
manques »** (reste > 0) `[muse]` ; tri par net décroissant.

**Table** — lignes = composants, en-têtes groupés par période :

```
                                                      │      S36      │      S37      │
Composant │ Désignation │ Type │ Stock │ Brut │ Net    │ Ferme │ Prév. │ Ferme │ Prév. │
```

Ferme en plein, prévision en teinte atténuée : la hiérarchie de lecture doit dire
sans légende lequel des deux engage.

**Drill-down** — clic sur une ligne → sheet « appelé par » : commandes, clients,
produits finis, chaîne BOM. Ce que le CBN ne sait pas dire. Snapshot pinné
(`pinChargeInputs`) pour que le détail ne puisse pas diverger de la ligne.

**En-tête** — deux mentions explicites, non négociables :
« Besoins datés à la date de demande client — sans décalage de délai » (D1) et
« Stock affecté au ferme en priorité — lecture différente de /charge » (§6.2).

## 10. Périmètre v1 — à dire honnêtement

La v1 nette du **stock** et, au cran « reste », de l'en-cours non déclaré. Elle ne
déduit **ni les commandes d'achat en cours, ni les OF lancés**.

Elle répond « **voici mon besoin** », pas encore « voici ce qu'il faut commander ».
Le libellé de la page doit le refléter.

## 11. Découpage

### Lot 0 — généraliser le moteur

- `charge_explosion.ts` : mode **quantité** (un besoin par article, achetés inclus,
  sans exigence de gamme, arrêt sur acheté) — `path` et `ChargeSource` intacts.
- Neutraliser le filtre `isManufactured` aux **deux** sites (§4.1) : il devient un
  paramètre du mode heures, pas une propriété des loaders.
- `static_sync_service` : `reorder_delay` nullable + migration (§7.3).
- **Test de non-régression verrouillant les heures `/charge` et `/programme`** —
  condition d'entrée (§7.1).
- Gate : `npm run typecheck` + `npm run lint`. Tests ciblés
  (`--files="charge_explosion"`), jamais la suite complète.

### Lot 1 — moteur appro + page

- `app/domain/material_plan.ts` `[muse]` — pur, testable : `explodeMaterialNeeds`
  + `netMaterial` (priorité ferme, trois crans), comptage des troncatures.
- `app/services/material_plan_loader.ts` `[muse]` — mêmes sources que
  `fetchChargeInputs`, nomenclature complète, snapshot pinné (TTL 12 h,
  `PINNED_INPUTS_KEPT = 5`).
- Endpoints `[muse]` : `GET /api/v1/planning/material-plan?from=&to=&gran=` et
  `.../material-plan/detail?article=&from=&to=`. Validation stricte fenêtre ×
  maille → 400 explicite.
- Page + toolbar + table + sheet. Miroir de types serveur ↔ client sur le modèle
  de `lib/load/types.ts`.
- `tests/domain/material_plan.test.ts` : explosion mixte (arrêt sur acheté,
  descente sur fabriqué), FORFAIT vs PROPORTIONNEL, **priorité ferme sur stock**,
  anti-cycle, troncature comptée, trois crans.
  _(`tests/domain/`, pas `tests/unit/` : c'est un moteur de domaine — les deux sont
  dans la suite `unit`, mais la convention du repo place les moteurs purs là.)_
- `npm run routes:gen`.

### Lot 2 — la couverture

PO en cours via `resolveCoveringReception` + verdicts de `shortages.ts` `[muse]`,
OF fils couvrant les SE. La cellule devient besoin − stock − en route = **à
commander**. C'est ce lot qui rend l'écran actionnable.

### Lot 3 — horizon de demande

`FOH_0` / `FOHUOT_0` synchronisés, appliqués **au niveau PF avant explosion** (§8).

### Lot 4 — décalage par délai

Offset en jours ouvrés (`promise_engine` + `working_calendar`, `fabricationDaysFromHours`).
Le bucket bascule de « date de besoin » à « date de commande ». Badge sur les
délais non renseignés (§7.3).

### Lot 5 — comparaison au CBN `[muse]`

Besoin calculé vs suggestions SGAE (`suggestion_repository`). Les écarts sont soit
un bug chez nous, soit un paramétrage discutable dans X3 — instructif dans les deux
cas. Puis affermissement direct depuis la page.

## 12. Ce que ça apporte face au CBN

- **Le CBN rend un verdict, pas un plan** — des suggestions article par article,
  pas une grille lisible en réunion sur une fenêtre choisie.
- **Aucune traçabilité descendante** — il ne dit pas *pour quelle commande client*
  ce composant est appelé. On porte `ChargeSource` jusqu'au niveau 4.
- **Prévisions non isolables** — on ne peut pas lui demander « sans les prévisions ».
  Ici la nature est portée sur chaque besoin, et le netting priorité-ferme donne la
  réponse ferme-seule sans second calcul.
- **Cohérence charge ↔ appro** — même explosion, mêmes entrées, même snapshot figé.

## 13. Chiffres de référence (réplique locale, 04/09/2026)

- 34 081 liens de nomenclature — **31 737 achetés (93 %)**, 2 344 fabriqués
- 2 657 composants achetés distincts · 482 fabriqués distincts · 2 485 parents
- 12 882 articles · 6 556 en `supply_type = ACHAT`
- 2 907 lignes de gamme · **0 article multi-opérations**
- 2 472 articles achat à `reorder_delay = 14` (valeur ou défaut, indistinguables)
