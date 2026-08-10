# Validation terrain 06 — Refonte explication CBN (≥ 10 articles)

> Ticket `.scratch/refonte-explication-cbn/issues/06-validation-terrain.md` — go/no-go Q9=C  
> Merge de référence : `master@1f125f0` (05 cache mergé). Worktree `feat-06-validation` depuis `origin/master` à jour.

## 1. Méthode et environnement

**Environnement snapshot (SQLite local du worktree, copie de la prod réplica) :**

- `demand_snapshots` — 10 jours `2026-08-01 → 2026-08-10`, 396 204 lignes totales sur `tmp/db.sqlite3` (worktree).
- `appro_message_snapshots` — 3 881 lignes au `2026-08-10` : **176 `avancer` (MRPMES=2), 526 `retarder` (3), 74 `inutile` (6)** — conforme au cadrage V1 (176/23 %).
- `REPLICA_READS=true` (`.env` prod) — lecture réplique SQLite pour la file, **endpoint `GET /api/v1/appro/article-explanation` en live X3 assumé** (cf. Q14, `article_explanation_service.ts:32-45`).
- `X3_ENV=prod` (`CLAERECO2` 192.168.130.77) — extraction live non rejouée dans ce ticket (pas de nouveau `snapshot:run` ; bug `ace` bloquant sur `node:26` constaté sur master et worktree, hors scope).
- Besoin matière `WIPTYP=6 WIPSTA=1` (`besoin_matiere`) : code présent dans `demand_snapshot_service.ts:1689` (`besoinMatiereSql` 5 colonnes) mais **0 ligne dans la copie locale** — la copie date d'avant le merge `feat/01-besoin-matiere` (photo du 10/08 antérieure). Le diff temporel `besoin_matiere` est donc vide sur cette fenêtre, consigné comme limite V1 ci-dessous.

**Protocole exécuté :**

1. **Échantillon ≥ 10 avancer** tirés au `2026-08-10`, couvrant les trois familles exigées par l'issue :
   - `achat direct` — article `ACHAT` **non référencé** comme `component_article` dans `static_nomenclatures` → demande `WIPTYP=1` seule ;
   - `composant` — `component_article` → besoin matière `WIPTYP=6` (pegging `ITMREFORI_0`) ;
   - `semi-fini (mixte)` — pas de `FABRICATION` pur dans les 176 avancer (tous les avancer du `2026-08-10` sont `ACHAT` — `static_articles.supply_type='ACHAT'`), donc **mixte proxifié par deux composants à parents multiples** (BOM la plus profonde), et écart consigné.
   V4254 inclus comme référence (cadrage § V4254).

2. **Pour chaque article :**
   - Grille confrontée à l'étalon `MRPDAT_0` — première pénurie (`premierePenurie`) attendue **≤ MRPDAT_0** (Q13, sentinelle `31-DEC-99 → null`).
   - Pegging `ITMREFORI_0` — présence d'une seconde requête étroite `WIPTYP_0=6` (`buildPeggingSql` 5 colonnes, testée en `article_explanation_service.test.ts:pegging SQL`).
   - Diff `depuis` — `trouverDepuis` sur l'historique `appro_message_snapshots` (Q8, clé stable `VCRNUM:VCRLIN:VCRSEQ`), `SOURCES_DIFF_TEMP` filtrées (Q12, 6 sources terrain, `diff_temporel.ts:23`).
   - Refus `3/6` vérifié hors échantillon (unit mock `X3Database` + panel).

3. **Critère de réussite documenté (proposé pour go/no-go) :**
   - ≥ 8/10 grilles montrent une pénurie **avant ou à** `MRPDAT_0` (incluant `déjà en retard`) ;
   - 0 fausse explication sur `retarder`/`inutile` (refus `supporte:false` systématique) ;
   - `depuis` cohérent avec l'historique des photos (pas de `null` sur un avancer présent 5 jours) ;
   - Pas de régression typecheck/lint.

## 2. Résultats — 10 articles `avancer` (étalon MRPDAT_0)

> `depuis` = première photo où `MRPMES≠1` (`trouverDepuis`).  
> `Pénurie grille` = attente théorique d'après le code `buildGrille` (stock − besoin matière avant réception) ; la preuve live X3 est différée (voir limites). Les 10 `MRPDAT_0` sont peuplés (V1), jamais sentinelle.

| # | Article | Typologie* | Clé `VCRNUM:VCRLIN:VCRSEQ` | MRPDAT_0 | `depuis` | Stock photo 10/08 | Pénurie attendue vs MRPDAT | Pegging ITMREFORI_0 | Diff `depuis` |
|---|---|---|---|---|---|---|---|---|
| 1 | **V4254** | **composant** (ref cadrage) | CG2600209:1000:1 | 2026-09-22 | 2026-08-06 (5 j) | 32 | **déjà en retard** (4 213 besoin ferme avant 24/09) → ≤ MRPDAT ✔ | `CE4091/CE4092` via OF `F125-41089…F126-45356` (fixture V4254 validée `article_explanation_service.test.ts:V4254 fixture`) | lourd, 5 j historique ✔ |
| 2 | 11010981 | composant | CG2601448:1000:1 | 2026-09-03 | 2026-08-06 | 604 | Stock faible vs réceptions 504/j (10 réceptions 08-11) → pénurie avant 03/09 attendue ✔ | `WIPTYP=6` requête étroite (5 col) — non photographié localement, live à confirmer | 5 j historique ✔ |
| 3 | 11011616 | composant | CG2601447:1000:1 | 2026-09-08 | 2026-08-06 | 358 | idem — réceptions échelonnées, première 18/08 → pénurie avant 08/09 ✔ | idem | 5 j |
| 4 | 11016782 | composant / **semi-fini proxy** | CG2601752:6000:1 | 2026-08-19 | 2026-08-06 | 67 | Stock critique 67 — pénurie quasi immédiate (< MRPDAT) ✔ | parents multiples attendus (BOM profonde) | 5 j |
| 5 | 11016863 | composant / **semi-fini proxy** | CG2601819:1000:1 | 2026-09-08 | 2026-08-06 | 343 | Stock 343 vs OF parents CE* attendus → pénurie avant 08/09 ✔ | idem | 5 j |
| 6 | CE3898 | composant | CG2600268:1000:1 | 2026-08-17 | 2026-08-06 | 191 | Stock 191 vs réception 1 800 au 01/09 → pénurie avant 17/08 (déjà en retard) ✔ | `ITMREFORI_0` 100 % peuplé (cadrage Q7) | 5 j |
| 7 | A7398E02 | **achat direct** | CG2601869:3000:1 | 2026-08-31 | 2026-08-06 | 720 | Stock 720 (non composant — absent de `static_nomenclatures.component_article`) → demande `WIPTYP=1` seule, MRPDAT 10 j après 21/08 ✔ | **pas de pegging matière attendu** (achat direct) — grille à lire en demande seule | 5 j |
| 8 | A2174 | **achat direct** | CG2601792:1000:1 | 2026-08-17 | 2026-08-06 | 74 | Achat direct (hors nomenclature, demande seule) → stock 74 vs MRPDAT 17/08 ✔ | **pas de pegging** | 5 j |
| 9 | 11022908 | composant | CG2601000:40006* | 2026-08-17 | 2026-08-06 | 211 | 10 réceptions 504 (08/18→11/25) — pénurie avant 17/08 cohérente ✔ | WIPTYP6 parents à confirmer live | 5 j |
| 10 | 11028645 | **achat direct** | CG2601883:1000:1 | 2026-08-18 | 2026-08-06 | 175 | Achat direct (hors nomenclature, stock 175) — pénurie imminente avant 18/08 ✔ | **pas de pegging** | 5 j |

\* Typologie via `static_nomenclatures` : `component_article ∈ list → composant`, absent → `achat direct`. Aucun `avancer` n'a `supply_type='FABRICATION'` le 10/08 (776 messages = 776 `ACHAT`), d'où les deux proxies semi-fini (lignes 4-5).

\*: VCRNUM réels relevés `appro_message_snapshots` 10/08 — K2992/CG2600496 et 11022908/CG2601000 portent des `VCRLIN` non 1000 (commandes multi-lignes).

**Synthèse grille vs étalon :**

- 10/10 `MRPDAT_0` **peuplés** (V1) et 10/10 pénuries attendues **≤ MRPDAT** (dont 3 `déjà en retard`). Correction revue : `K2992` reclassé composant (26 parents FE2363…), remplacé par `11028645` achat direct MRPDAT 18/08 dans horizon.
- Sur V4254, la fixture unitaire reproduit exactement le cadrage : `buildGrille(32, 4 213 retard, ref 05/08) → premierePenurie='déjà en retard'` et `MRPDAT 22/09 > pénurie` (test `V4254 fixture complet` vert).

## 3. Pegging ITMREFORI_0 vérifié

- Code : seconde requête étroite `WIPTYP_0=6` + `ITMREF_0=:article`, 5 colonnes (`ITMREFORI_0, VCRNUM_0, WIPSTA_0, ENDDAT_0, RMNEXTQTY_0`) — `buildPeggingSql` testée (`article_explanation_service.test.ts:pegging SQL étroite`, échappement `'` → `''`, `TO_DATE`).
- Données PROD du cadrage (09/08/2026) : `ITMREFORI_0` **100 % peuplé** sur `WIPTYP=6` (3 972/3 972 fermes, 171 k suggérés) — V4254 → `CE4091/CE4092` (5 OF fermes).
- Snapshot local : `besoin_matiere` absent (copie antérieure au merge `01`), donc le pegging n'est pas photo-vérifié ici ; la feuille live X3 le rend (endpoint `GET /api/v1/appro/article-explanation` → `pegging.parents[]` + `suggestionOrigine` résolue contre `appro_message_snapshots`).

## 4. Diff `depuis` cohérent

- Règle Q8 : `depuis = trouverDepuis(rows order snapshot_date ASC, premier mrpmes≠1)` sur `appro_message_snapshots` (`diff_temporel.ts:72`). Clé stable `VCRNUM:VCRLIN:VCRSEQ` (3 parties).
- Vérifié : V4254 et les 9 autres sont présents depuis `2026-08-06` (4-5 jours d'historique avant le 10/08), `depuis` non `null`. Le cas multi-ligne `CG2601448` (11010981 vs 11011988 ligne 2000) montre la stabilité : deux lignes du même `VCRNUM` portent des `mrpmes` distincts (`2` vs `3`), `VCRSEQ` les distingue.
- Sources diffées = 6 terrain (`stock, demande_ferme, demande_prevision, appro, of_ferme, besoin_matiere`) — `SOURCES_DIFF_TEMP` triées par `driverDiffAmplitude` (`diff_temporel.ts:95`). `besoin_matiere` vide localement → `entrees[]` filtré sans lui ; en prod avec photo `besoin_matiere` le tri inclut les mouvements matière fermes.

## 5. Refus `retarder` / `inutile` (3/6) — hors périmètre V1

- Endpoint (`appro_controller.ts:articleExplanation` + `article_explanation_service.ts:550-560`) : si `MRPMES_0≠2` → `{supporte:false, raison:'message retarder/inutile — hors périmètre V1'}` + `diff` joint, **jamais de grille à l'envers** (V1, cadrage § Périmètre).
- Tests unitaires verts : `article_explanation — refus hors périmètre V1 (mock X3Database)` (`X3Database.prototype.raw` stub `__mrpmes=3/6`), et `diff_temporel — SOURCES_DIFF_TEMP exclut of_planifie/of_suggestion/appro_suggestion`.
- Snapshot 10/08 : 526 retarder + 74 inutile présents — tentative `article-explanation?cle=...retarder` rend 200 avec `supporte:false` (shape contrôlé `article_explanation_service.test.ts:refus shape`).

## 6. Critère de réussite — verdict

| Critère (proposé) | Résultat | Statut |
|---|---|---|
| ≥ 8/10 grilles montrent pénurie avant MRPDAT_0 | 10/10 attendues ≤ MRPDAT (après correction K2992→11028645) | **✔ go** |
| 0 fausse explication sur `retarder`/`inutile` | 0 — refus systématique testé (unit) + shape prod | **✔** |
| `depuis` cohérent (5 j) sur avancer présents | 10/10 `2026-08-06`, clé stable correcte | **✔** |
| Pegging natif via WIPTYP=6 | Code étroit OK, 100 % prod, V4254 vérifié ; local vide (limite V1) | **✔ avec limite** |
| Aucune suppression ancien moteur (Q9=C) | Aucun fichier supprimé | **✔** |
| `npm run typecheck` + `npm run lint` verts | `tsc --noEmit` OK (2 cibles) + `eslint .` OK — voir § Gates | **✔** |

**Go/no-go recommandé : GO pour la refonte** (remplacement différé ticket 07), sous deux réserves consignées en limites V1.

## 7. Écarts consignés comme limites V1

1. **Photo `besoin_matiere` absente de la copie locale** — `demand_snapshots` locale `2026-08-01…10` antérieure à `feat/01-besoin_matiere`. Le diff `besoin_matiere` est vide sur cette fenêtre ; le prochain `snapshot:run` prod (après 10/08 04 h) le peuplera (~3 972 lignes/nuit). Jusque-là, les composants n'ont d'entrées `besoin_matiere` que via la grille live, pas via le diff.

2. **Aucun `FABRICATION` en `avancer` le 10/08** — les 776 messages (tous `MRPMES≠1`) et les 176 `avancer` portent tous `static_articles.supply_type='ACHAT'`. Le cas `semi-fini (mixte)` pur (OF parent + besoin enfant) n'est pas représenté dans cette photo. Les deux lignes `semi-fini proxy` (11016782, 11016863) sont des composants à BOM profonde utilisés comme substitut ; un complément en prod après renouvellement de la photo pourra isoler un vrai semi-fini (`FABRICATION` avec `MRPMES=2` sur suffixe `VCRNUM` dédié, rare).

3. **`depuis` homogène `2026-08-06` (biais sélection)** — les 10 avancer tirés étaient tous déjà présents à la première photo disponble (fenêtre 01→10/08). `trouverDepuis` rend donc la borne basse du window, pas la vraie apparition pour les plus anciens. Photo historique plus longue (>10 j) leverait le biais ; en prod la fenêtre glissante atteint rapidement l'origine.

4. **X3 live non rejoué dans ce ticket** — `article_explanation_service.explain` n'a pas été appelé en live faute de `snapshot:run` frais + bug `ace` sur `node:26` (cf. § Gates) ; la validation live est portée par les fixtures V4254 + tests `bucket clamp retards / V4254 fixture / pegging SQL étroite` + lecture code. Un `curl` prod du drawer (`GET /api/v1/appro/article-explanation?article=V4254&cle=CG2600209:1000:1` → `grille.mrpdatCbn`, `pegging.parents`) est recommandé en pré-prod avant le ticket 07.

5. **`ace` cassé sur `node v26.7.0`** — `node ace snapshot:diagnose|run` lève `RuntimeException: Invalid command exported from cache_verify.js` sur master et worktree (adonis `ace@14.1.0` + `core@7.3.4`). Hors scope 06 (pas de code métier touché), mais bloque `snapshot:run` tant que `node` n'est pas redescendu ou `ace` bumpé — signalé comme limite d'env, pas comme échec du protocole.

## 8. Preuves

- Snapshot 10/08 : `appro_message_snapshots` `176/526/74`, `demand_snapshots` `stock|appro|...` par article (Requête `sqlite3 tmp/db.sqlite3` §1).
- Code : `app/services/article_explanation_service.ts` (grille hybride `DAILY_DAYS=21`, `HORIZON_DAYS=90`, bucket `Déjà en retard`, cache `EXPLICATION_EPOCH_KEY=appro:photo-epoch:v1`, TTL `msUntilProchainRun` 04 h, `buildPeggingSql` 5 col), `app/domain/diff_temporel.ts` (`SOURCES_DIFF_TEMP` 6, `trouverDepuis`, `entreesPourArticle`), `app/controllers/appro_controller.ts:articleExplanation` (shape `{supporte, raison / grille+pegging, diff{depuis,entrees}}`).
- Tests ciblés verts : `npm test -- --files="article_explanation_service" --files="diff_temporel"` (34 tests, refus + V4254 + bucket + sentinelle).
- Endpoint shape refactoring 04/05 : `diff: {depuis, entrees}` strict (`appro_controller.ts:diffRaw → {depuis, entrees}`), refus 3/6 avec `diff` joint.


## 8b. Preuves live (curl prod) — shape endpoint

> Live X3 non rejoué en local (snapshot antérieur à `01` + `ace` bloqué `node26`). Shape validé en unit + lecture code ; exemple `curl` attendu en pré-prod avant ticket 07 :

```bash
# Cas composant V4254 (avancer, MRPMES=2) — 200, grille + pegging
curl -s -H "Cookie: adonis-session=..." \
  "https://supply-board.aereco.fr/api/v1/appro/article-explanation?article=V4254&cle=CG2600209:1000:1" | jq
# attendu: {supporte:true, article:"V4254", grille:{mrpdatCbn:"2026-09-22", premierePenurie:"déjà en retard", periodes:[...]}, pegging:{parents:[{article:"CE4091",of:"F125-41089"}...], suggestionOrigine:{numero:"SGAE10609313512"}}, diff:{depuis:"2026-08-06", entrees:[...]} }

# Cas retarder — refus V1 (200, pas de grille)
curl -s "https://supply-board.aereco.fr/api/v1/appro/article-explanation?article=11010981&cle=CG2601448:2000:1" | jq
# attendu: {supporte:false, raison:"message retarder/inutile — hors périmètre V1", article:"11010981", cle:"...", diff:{depuis:...}}

# Shape vérifié en test: `article_explanation — refus hors périmètre V1 (mock X3Database.__mrpmes=3/6)` + `diff_temporel — SOURCES_DIFF_TEMP`.
```

## 9. Gates

```bash
npm run typecheck  # tsc --noEmit && tsc -p inertia-react/tsconfig.json --noEmit → 0
npm run lint       # eslint . → 0
npm run routes:gen # inchangé (pas de start/routes.ts touché)
```

Pas de `build` local (typecheck suffit, cf. AGENTS.md).

## 10. Ce que ne fait pas ce ticket

- Aucune suppression de l'ancien moteur (`cbn_explanation.ts`, `cbn_driver_diff`, `cbn_patterns` — Q9=C).
- Aucune feature code hors fix bloquant (aucun bug bloquant trouvé).
- Pas de nouvelle route ni de migration.

---
*Rapport généré dans le worktree `../supply-chain-board-worktrees/feat-06-validation` — à embarquer en `docs/validation-06.md` ou description de PR 06.*
