# Plan d'approvisionnement — plan détaillé

Date : 2026-09-04. Statut : **plan validé en discussion, non implémenté**.
Demandeur : interface planificateurs de charge ↔ approvisionneurs, absente aujourd'hui.

## 1. Problème

Le module planification donne la charge atelier (heures par poste, semaines/mois à venir)
via `/planification` et `/charge`, mais ne traduit pas le planning en **besoins matières
datés**. Le CBN X3 calcule des suggestions (ORDERS WIPSTA=3, SGAE…), sans distinguer ce qui
est appelé par du ferme vs de la prévision. Les approvisionneurs n'ont donc pas de vue
« pour servir ces commandes/prévisions, il faut acheter/lancer ceci à telle période ».

Ce n'est pas du RCCP (capacité macro — déjà couvert par `/charge`) : c'est un **plan besoins
matières prévisionnel** (MRP simulé, transparent, explosion du planning affiché).

## 2. Décisions verrouillées en discussion

1. **Pas de jalonnement en v1** : besoin daté au jour de livraison client, comme la charge
   actuelle. L'offset (délais, gammes intermédiaires) viendra plus tard.
2. **Entrée par période, pas par référence** : sélecteur de dates (plage libre + presets),
   le tableau liste les composants requis sur la période (~2000+ références : la recherche
   sert à retrouver, pas à naviguer).
3. **Double bucket Ferme | Prévision** : chaque colonne de période affiche les deux
   sous-colonnes. C'est la distinction que le CBN ne fait pas → valeur cœur de la v1.
   Si trop lourd à l'usage : interrupteur d'affichage (ferme / prévision / les deux),
   sans changer le calcul.
4. **Ferme vs prévision (deux mécanismes, §4.1)** : double bucket sur un seul calcul
   (question : *d'où vient mon besoin ?*) + bascule globale « Fermes seulement »
   recalculée sans les prévisions (question : *de quoi ai-je besoin si je ne crois que
   le carnet ?*). Lot 3 : la bascule devient un réglage par article via l'horizon de
   demande X3 (`FOH_0`).
5. **Sélecteur de granularité** jour / semaine / mois, avec garde-fou en
   **plafond de 14 périodes** (double bucket = 2 colonnes par période) : jour ≤ 3 semaines,
   semaine ≤ 3 mois, mois ≤ 12 mois. Hors plafond → option désactivée avec explication
   (jamais de correction silencieuse) ; changement de fenêtre → repli sur la maille la
   plus fine permise, signalé.
6. **Règle d'explosion** : acheté = feuille, on s'arrête ; sous-ensemble fabriqué =
   on descend jusqu'à 3-4 niveaux, feuilles achetées remontées avec chemin d'origine.
7. **Netting v1 minimal** : brut (ferme / prévision) − stock dispo − en-cours non déclaré
   (comme `/charge` ; sans effet sur les achetés, cohérent sur les SE) = reste à couvrir.
   Réceptions PORDERQ et OF fils : lot 2, comme le jalonnement.
8. **Accès (D5, acté)** : l'onglet `PLANIFICATION` devient un menu déroulant sur le modèle
   Ordonnancement/Logistique → `Charge` (existants, heures × postes) +
   `Approvisionnement` (nouveau, quantités × références). Route : `/approvisionnement`
   (singulier).
9. **Honnêteté du libellé** : la v1 répond « voici mon besoin », pas « voici ce qu'il faut
   commander » (lot 2). Le libellé de page doit le refléter, rappelé dans l'en-tête avec
   « besoins datés à la date de demande client — sans décalage de délai » et la règle
   FIFO (une prévision consomme le stock avant un ferme ultérieur, sauf bascule).

## 3. État de l'existant (socle à réutiliser, ne pas réinventer)

- `app/domain/charge_explosion.ts` — `explodeCharge` (PF depth 0 + fabriqués jusqu'à
  `maxDepth = 4`, `path` complet racine→parent, garde anti-cycle, `source` PF/commande
  portée jusqu'aux feuilles), `netCharge` (brut − stock strict+CQ FIFO, `reste` après
  en-cours). **À généraliser** : option `includePurchased` (aujourd'hui les appelants
  filtrent `if (!isManufactured(e)) continue` — `load_payload_loader.ts:270`,
  `order_planning_controller.ts:406`).
- `app/services/load_payload_loader.ts` — `fetchChargeInputs` (OF, lignes de demande,
  référentiel, nomenclature via caches SWR `boardDataset`), `chargeHorizon`,
  `chargeBucketRange`, snapshots pinnés agrégat↔détail. **Réutiliser** : mêmes entrées,
  mêmes buckets, même pattern de cache/pinning.
- `app/services/board_dataset.ts` — `getDemandAndReception` / `getOrderLinesForLoad`
  (demande ORDERS WIPTYP=1 : commandes + prévisions), `getStock`, `getReferential`.
- `app/services/static_sync_service.ts` — `readNomenclatures()` (avec `componentType`
  ACHETE/FABRIQUE, `consumptionNature` FORFAIT/PROPORTIONNEL, filtre catégories `Z*`),
  `readArticles()` (`supplyType`, `reorderDelay` — utile pour le jalonnement v2).
- `app/domain/rupture_engine.ts` — descente SE jusqu'à 6 niveaux, règles
  MFGMAT/fantômes/allocations (`missingDetail.fabricated/depth`). Référence sémantique
  pour la v2, pas de dépendance directe en v1.
- `app/domain/shortages.ts` — `resolveCoveringReception` + verdicts
  couvert/à risque/retard/sans couverture/sous-ensemble. Réutilisable tel quel en v2
  pour la colonne « couvert par réceptions ».
- `app/repositories/suggestion_repository.ts` — suggestions CBN temps réel (WIPSTA=3),
  affermissement `FIRMSUGG`/`ZSOAPFIRM`. Base de la comparaison besoin-vs-CBN (v2).
- Front : `inertia-react/pages/scheduler/load.tsx` + `lib/load/*` (bascule brut/net/reste,
  mailles mois/semaine), `components/load/*`. La page appro réutilise les patterns
  (toolbar, sheet de détail), pas les composants de charge poste.

## 4. Conception v1

### 4.1 Moteur : `app/domain/material_plan.ts` (nouveau, pur, testable)

- Mode **quantité** dans `charge_explosion.ts` (en plus du mode heures, sans y toucher) :
  - UN besoin **par article**, pas par opération de gamme — `netCharge` consomme le pool
    de stock une fois par raw, donc un article bi-poste consommerait 2× son besoin
    physique (vérifié : 0 article multi-postes en base locale au 04/09/2026, latent
    uniquement, mais la migration `1783200000000_static_gammes_allow_multi_op` a ouvert
    le cas) ;
  - composants **achetés inclus** (paramètre d'explosion, pas filtre en amont — le filtre
    `isManufactured` de `load_payload_loader.ts:271` devient un paramètre du mode heures) ;
  - plus d'exigence de gamme (`hasChargeRoute`) en mode quantité : émission « sans poste »
    pour les achetés / sans gamme, sinon les feuilles achetées ne sortent jamais du moteur ;
  - `path` + `ChargeSource` conservés à l'identique.
- **Test de non-régression verrouillant l'égalité des heures `/charge` avant/après.**
  Non négociable : condition pour toucher à ce fichier.
- Règle d'arrêt : `componentType === 'ACHETE'` → feuille (pas de descente) ;
  `FABRIQUE` → descente jusqu'à `maxDepth`. Fantômes AFANT : aplatis comme le moteur
  ruptures (règle 2 rupture-engine) ou traités en v1 comme fabriqués simples — trancher
  à l'implémentation, cas rare côté appro.
- Double bucket vs bascule (deux mécanismes distincts, pas deux affichages) :
  - **double bucket** = UN seul calcul (prévisions incluses dans le netting FIFO),
    ventilé par nature d'origine. Question : *d'où vient mon besoin ?*
  - **bascule « Fermes seulement »** = un calcul DIFFÉRENT, prévisions retirées
    AVANT explosion. Question : *de quoi ai-je besoin si je ne crois que le carnet ?*
  Les deux livrés au lot 1, nommés distinctement. (Lot 3 : la bascule devient un
  réglage par article via l'horizon de demande X3 `ITMFACILIT.FOH_0`/`FOHUOT_0`,
  appliqué **au niveau PF avant explosion** — la prévision vit sur le PF, sinon un
  même composant serait inclus/exclu selon l'appelant. Vérifier le codage de
  `FOHUOT_0` sur données réelles avant implémentation.)
- `netMaterial(needs, stockByArticle)` — FIFO par article comme `netCharge`, mais en
  **deux colonnes étanches** : le stock couvre d'abord le ferme (priorité ferme), le
  reliquat couvre la prévision. Sortie par article × bucket : `{ brutFerme, brutPrevi,
  netFerme, netPrevi, stockUtilise }`, avec `resteFerme/netFerme` = chiffres actionnables
  court terme. En-cours atelier : exclu en v1 (sens atelier, pas achat).
- Drill-down : conserver `path` + `source` sur chaque besoin (déjà portés par
  `ChargeRaw`) → détail « appelé par » (PF, n° commande/prévision, qté) sans requête
  supplémentaire.

### 4.2 Entrées (loader : `app/services/material_plan_loader.ts`)

Mêmes sources que `fetchChargeInputs`, réutilisées via `boardDataset` :
demande (commandes + prévisions), nomenclature statique **complète** (sans filtre
`isManufactured`), stock strict+CQ des articles explosés (`getStock`, comme
`computeChargeStock`). Cache SWR + snapshot pinné sur le même pattern que la charge
(version dans la clé, TTL 12 h, `PINNED_INPUTS_KEPT = 5`) pour que le détail d'une
cellule retombe exactement sur le tableau.

### 4.3 Endpoint

- `GET /api/v1/planning/material-plan?from=&to=&gran=&fermesSeulement=` →
  `{ buckets[], rows[] }`, `rows[] = { article, description, supplyType, brutFerme[],
  brutPrevi[], netFerme[], netPrevi[], stock, resteFerme, restePrevi }`.
- `GET /api/v1/planning/material-plan/detail?article=&from=&to=` → lignes « appelé par ».
- Garde-fou horizon/granularité par **plafond de 14 périodes** (double bucket = 2 colonnes
  par période) : jour ≤ 3 semaines (≤ 15 j ouvrés), semaine ≤ 3 mois (≤ 13 sem), mois
  ≤ 12 mois. Hors plafond → sélecteur désactivé avec explication (jamais de correction
  silencieuse) ; changement de fenêtre → repli sur la maille la plus fine permise, signalé.
  La maille jour est nouvelle (`/charge` n'a que semaine/mois) mais gratuite : les besoins
  sont déjà datés au jour. Réutiliser/étendre `chargeBucketRange` au jour.

### 4.4 Page `inertia-react/pages/approvisionnement.tsx`

- Toolbar : presets (2 semaines, mois en cours, mois prochain, 3 mois, 6 mois) + plage
  libre, sélecteur jour/semaine/mois contraint (§2, point 5), bascule **Tout / Fermes seulement**,
  recherche article, filtres supplyType (défaut : **acheté**), famille, niveau BOM,
  « seulement les manques » (reste > 0), tri par net décroissant.
- Tableau : une ligne par composant (totaux ligne : stock, brut, net, reste), en-têtes
  groupés par période avec sous-colonnes Ferme (plein) | Prév. (teinte atténuée) ;
  clic ligne → sheet détail « appelé par » (commandes, clients, PF, chaîne BOM complète,
  via snapshot figé comme `pinChargeInputs` pour ne jamais diverger de la ligne).
- En-tête : rappels explicites (daté date client sans décalage ; « voici mon besoin » ;
  règle FIFO ferme/prévision).
- Miroir de types serveur↔client comme `load/types.ts` (`LoadLine` → `MaterialLine`).
- Régénérer le manifeste de routes (`npm run routes:gen`) — seule cause historique de
  CI rouge. Relever le temps de factory au lot 1 pour calibrer le TTL (34 k liens,
  ~3 000 lignes × 28 colonnes max).

### 4.5 Tests ciblés (convention repo : un fichier, grep précis)

- `tests/unit/material_plan.test.ts` : explosion mixte acheté/fabriqué (arrêt sur
  acheté, descente 3-4 sur fabriqué), FORFAIT vs PROPORTIONNEL, priorité ferme sur
  stock, clôture (prévision avant clôture ignorée, après conservée), anti-cycle.
- Vérif manuelle : cohérence avec `/charge` sur le périmètre fabriqué (mêmes entrées
  → mêmes bruts fabriqués), puis `npm run typecheck` + `npx eslint` sur fichiers touchés
  (gate obligatoire avant commit, cf. CLAUDE.md). Jamais de suite complète en local.

## 5. Découpage en lots

### Lot 0 — assainir + généraliser le moteur (préalable)

- `static_sync_service.ts` : `reorder_delay` **nullable** — aujourd'hui
  `Number(r.PRPLTI_0) || 14` rend indistinguables « délai X3 = 14 » et « délai inconnu ».
  Sans conséquence pour la charge, disqualifiant dès que la date de commande aura de
  la valeur (lot 4) : conserver la valeur X3 telle quelle + badge « délai non renseigné »
  côté écran. Faire maintenant pour ne pas resynchroniser deux fois (+ migration).
- Mode quantité dans `charge_explosion.ts` (§4.1) + test de non-régression heures `/charge`.

### Lot 1 — la page (v1 « voici mon besoin »)

Moteur, loader, endpoints (§4.2–4.3), page `/approvisionnement` (§4.4), menu déroulant
Planification, `routes:gen`, relevé perf factory. Gate : `typecheck` + `lint`, tests
ciblés uniquement (jamais la suite complète).

### Lot 2 — la couverture (v1 → « voici ce qu'il faut commander »)

Déduire PO en cours (`reception_repository`, `resolveCoveringReception`) et OF lancés
(`ofSupply` / `allocateSeCoveringOfs`). La cellule devient besoin − stock − en route.

### Lot 3 — horizon de demande par article

Synchroniser `FOH_0`/`FOHUOT_0` (`itmfacilit.ts`, une colonne au sync) vers
`static_articles`, appliquer au niveau PF avant explosion (§4.1). La bascule globale du
lot 1 devient un réglage par article.

### Lot 4 — décalage par délai

Offset en jours ouvrés (`promise_engine.dispoDate` + `working_calendar`, latence
fournisseur observée `supplier_latency_repository`). Le bucket bascule de « date de
besoin » à « date de commande ». Badge délais non renseignés (lot 0).

Volontairement hors lots : lots éco / stocks de sécu (paramétrés articles, à consommer
plus tard), interrupteur d'affichage ferme/prévision si le double bucket s'avère lourd,
comparaison besoin-vs-CBN puis affermissement depuis la page.

## 6. Ordre d'implémentation

1. Lot 0 (sync nullable + mode quantité + tests, dont non-régression `/charge`).
2. Lot 1 (loader + endpoints + page + menu + `routes:gen` + perf).
3. Typecheck + lint, commit, push, surveillance CI (workflow obligatoire CLAUDE.md).
4. Lots 2–4 après validation métier de la v1.

Chiffres de référence (réplique locale, 04/09/2026, vérifiés) : 34 081 liens BOM dont
31 737 achetés (93 %) ; 2 657 composants achetés distincts ; 12 882 articles dont
6 556 ACHAT ; 2 472 articles achat à `reorder_delay = 14` (valeur ou défaut,
indistinguables — cf. lot 0) ; 0 article multi-postes.
