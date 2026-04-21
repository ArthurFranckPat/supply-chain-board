# Plan : Analyse Historique des Stocks

## Contexte
Module d'analyse de l'évolution du stock article par article (WEB API Sage X3, table `STOJOU`, représentation `ZSTOJOU`).

## Phases

### Phase 1 — Reconstitution des stocks (backend)
- **Fichier** : `src/services/stock_history_analyzer.py`
- **Classe** : `StockMovement` (dataclass) + `StockHistoryAnalyzer`
- **Méthode** : `reconstituer_stock(itmref, horizon_days, include_internal, all_pages)`
- **Algorithme** : Tri IPTDAT asc, MVTSEQ asc → itération calcul stock_avant/stock_apres
- **Dépendances** : X3Client.query_all()

### Phase 2 — Statistiques descriptives (backend)
- **Indicateurs** : stock_min, stock_max, stock_moyen, rotation, tendance (régression linéaire)
- **Fichier** : `src/services/stock_history_analyzer.py`
- **Méthode** : `calculer_stats(mouvements) -> StockAnalytics`

### Phase 3 — Graphe d'évolution (UI)
- **Fichiers à créer** :
  - `StockEvolutionPage.tsx` — page principale
  - `StockChart.tsx` — line chart (Recharts)
  - `StockStatsPanel.tsx` — cartes de stats
  - `StockMovementsTable.tsx` — tableau détaillé
- **Route** : `/stock-evolution`

### Phase 4 — Integration API
- **Endpoints** :
  - `GET /api/v1/stock-evolution/{itmref}` → raw + reconstitution
  - `GET /api/v1/stock-evolution/{itmref}/chart` → format chart
  - `POST /api/v1/stock-evolution/analytics` → stats descriptives
- **Fichiers** : `server.py`, `gui_service.py`

### Phase 5 — Tests
- `test_stock_reconstruction.py`
- `test_x3_client.py` (mock httpx)

## Ordre d'implémentation

| Étape | Action | Fichier(s) | Dépendance |
|-------|--------|------------|------------|
| 1 | Dataclass StockMovement + skeleton | `src/services/stock_history_analyzer.py` | - |
| 2 | reconstituer_stock() | `src/services/stock_history_analyzer.py` | X3Client |
| 3 | Caching TTL | `src/services/stock_history_analyzer.py` | Étape 2 |
| 4 | calculer_stats() | `src/services/stock_history_analyzer.py` | Étape 2 |
| 5 | analyser_evolution_stock() dans GuiAppService | `src/app/gui_service.py` | Étapes 2,4 |
| 6 | Endpoints API | `src/api/server.py` | Étape 5 |
| 7 | Méthodes API frontend | `frontend/src/api/client.ts` | Étape 6 |
| 8 | StockEvolutionPage | `frontend/src/views/StockEvolutionPage.tsx` | Étape 7 |
| 9 | StockChart | `frontend/src/views/StockChart.tsx` | Étape 8 |
| 10 | StockStatsPanel + StockMovementsTable | `frontend/src/views/` | Étape 8 |
| 11 | Route dans App.tsx | `frontend/src/App.tsx` | Étapes 8-10 |
| 12 | Tests unitaires | `tests/test_stock_reconstruction.py` | Étapes 2,4 |

## Décisions à valider
1. **Chart library** : Vérifier Recharts vs Plotly dans package.json
2. **TRSTYP mapping** : Documenter (1=entrée, 2=sortie, 4=vente, 5=production...)
3. **Cache** : Dict mémoire TTL court vs Redis
4. **Format date X3** : Confirmer IPTDAT (YYYY-MM-DD ou YYYYMMDD?)

## Actions immédiates
- [ ] Valider décisions ci-dessus
- [ ] Étape 1 : Créer StockMovement dataclass + skeleton
- [ ] Étape 2 : Implémenter reconstituer_stock()

---

## Audit Code — 2026-04-21

**Branche** : `analyses-historique` (commit `333a307`)
**Revues** : 10 fichiers (backend + frontend)
**Total problèmes** : 13 (2 CRITICAL, 4 HIGH, 5 MEDIUM, 2 LOW)

---

### CRITICAL

**1. Risque d'injection SQL/SData dans X3Client**
- **Fichier** : `apps/ordo-core/src/services/x3_client.py:96`
- **Problème** : Le paramètre `where` est interpolé directement dans l'URL sans sanitization. Un `itmref` contenant une apostrophe (ex: `O'Brien`) casserait la clause SData ou injectorait des prédicats arbitraires.
- **Action** : Valider/échapper les entrées de la clause `where`, notamment `itmref`. Ajouter un allowlist sur `classe` et `representation`.

**2. Double reconstitution du stock dans deux couches distinctes**
- **Fichiers** : `apps/ordo-core/src/api/x3_routes.py:96` + `apps/ordo-core/src/services/stock_history_analyzer.py:107`
- **Problème** : `/x3/stock-history` (POST) et `/api/v1/stock-evolution/{itmref}` (GET) implémentent la même logique de reconstitution indépendamment. Le chemin X3 n'utilise pas le cache, ce qui provoque des requêtes X3 dupliquées.
- **Action** : Faire de `StockHistoryAnalyzer` le chemin unique. Déprécier ou refactorer `/x3/stock-history` pour qu'il délègue à l'analyzer.

---

### HIGH

**3. Endpoint GET avec body `StockEvolutionRequest` (functional bug)**
- **Fichier** : `apps/ordo-core/src/api/server.py:338-347`
- **Problème** : `GET /api/v1/stock-evolution/{itmref}` déclare `payload: StockEvolutionRequest` mais GET n'a pas de body. FastAPI lie `payload` aux query params, qui n'ont pas de defaults query-compatible pour `horizon_days` et `include_internal`.
- **Action** : Utiliser `Query` pour ces paramètres :
  ```python
  def stock_evolution(itmref: str, horizon_days: int = Query(default=45, ge=1, le=365), include_internal: bool = Query(default=False))
  ```
  Appliquer au endpoint `/chart` également.

**4. Régression linéaire non temporelle dans `_calculer_tendance`**
- **Fichier** : `apps/ordo-core/src/services/stock_history_analyzer.py:213-237`
- **Problème** : L'axe X utilise la position ordinale (0, 1, 2...) et non les dates réelles. Deux mouvements le même jour influencent différemment selon l'ordre de tri. Le seuil de 1% de la moyenne stock est arbitraire.
- **Action** : Utiliser les timestamps Unix ou jours depuis epoch comme X pour une régression temporelle correcte. Rendre le seuil configurable.

**5. `StockEvolutionRequest.itmref` non validé pour chaîne vide**
- **Fichier** : `apps/ordo-core/src/api/server.py:104-108`
- **Problème** : Aucun `min_length` ou pattern. Une chaîne vide `""` passe la validation mais pourrait retourner tous les articles (réponse massive ou erreur).
- **Action** : Ajouter `min_length=1` ou un pattern `^[A-Za-z0-9]+$`.

**6. `StockEvolutionRequest` mal typé pour GET dans client TypeScript**
- **Fichier** : `apps/board-ui/src/api/client.ts:215-219`
- **Problème** : `include_internal` est envoyé comme string `'true'` plutôt que boolean dans les query params. FastAPI parse correctement, mais le type TypeScript dit `boolean?` ce qui est trompeur.

---

### MEDIUM

**7. CORS : `allow_origins=["*"]` avec `allow_credentials=True`**
- **Fichier** : `apps/ordo-core/src/api/server.py:117-121`
- **Problème** : Combinaison contradictoire — les navigateurs rejettent `Access-Control-Allow-Credentials: true` avec `Access-Control-Allow-Origin: *`.
- **Action** : Remplacer `allow_origins=["*"]` par les origines explicites du frontend ou une variable de config.

**8. Format de date IPTDAT hardcodé dans X3 route**
- **Fichier** : `apps/ordo-core/src/api/x3_routes.py:55-56`
- **Problème** : Génère `IPTDAT ge @{horizon_date}@` avec format `YYYY-MM-DD`. Si X3 stocke IPTDAT dans un fuseau ou format différent, des enregistrements de bord seraient manqués silencieusement.
- **Action** : Ajouter un commentaire de contrainte ou un test d'intégration sur les dates limites.

**9. `StockChartData.stats` typé `Record<string, unknown>`**
- **Fichier** : `apps/board-ui/src/types/stock-evolution.ts:46`
- **Problème** : Perte de type safety — les consommateurs ne peuvent pas accéder `stats.stock_min` sans cast.
- **Action** : Définir une interface `StockStats` stricte et l'utiliser.

**10. `StockMovementsTable` — clé de tableau par index**
- **Fichier** : `apps/board-ui/src/views/StockMovementsTable.tsx:73`
- **Problème** : `{sorted.map((m, i) => (` — si tri ou doublons (même `iptdat`+`vcrnum`), les clés ne sont pas stables ni uniques.
- **Action** : Clé composite `m.vcrnum + m.iptdat + m.trstyp`.

**11. `StockChart` recalcule `entries` à chaque render sans memo**
- **Fichier** : `apps/board-ui/src/views/StockChart.tsx:53-59`
- **Problème** : `const entries: ChartEntry[] = data.items.map(...)` alloue de nouveaux tableaux à chaque render. Sur des historiques longs (centaines de mouvements), c'est du gaspillage.
- **Action** : Englober dans `useMemo(() => data.items.map(...), [data.items])`.

---

### LOW

**12. `TRSTYP_LABELS` dupliqué dans deux composants**
- **Fichiers** : `StockMovementsTable.tsx:8-15` + `StockChart.tsx:25-31`
- **Problème** : Ajout de TRSTYP 7 (Ajustement) dans un fichier mais pas l'autre crée de l'incohérence.
- **Action** : Extraire vers `constants/stock.ts` ou `types/trstyp.ts`.

**13. Pas de skeleton loader dans `StockEvolutionView`**
- **Fichier** : `apps/board-ui/src/views/StockEvolutionView.tsx`
- **Problème** : Si l'appel API prend 2-3 secondes, l'UI n'affiche rien d'interactif.
- **Action** : Ajouter un `autocomplete` pour les codes article via `feasibility_search_articles`, ou au minimum un skeleton sur la zone chart.

---

## Points positifs

- Algorithme de reconstitution propre et correct — le solde courant cumulatif correspond au comportement attendu sur tous les cas de test.
- `StockHistoryAnalyzer` sépare le calcul pur (`reconstituer_stock_from_raw`) du fetch X3, permettant la testabilité. Le fichier de tests couvre bien les cas principaux.
- L'endpoint `/api/v1/stock-evolution/{itmref}/chart` pré-formatte efficiently les données pour éviter du reshape côté frontend.
- Le cache avec TTL (`_cache_key`, `_get_cached`) est une bonne patterns pour éviter les requêtes X3 répétées.
- Les types TypeScript pour `StockEvolutionResponse` et `StockMovement` sont exhaustifs et correspondent aux dataclasses backend.
- `StockMovementsTable` a une accessibilité correcte : `<th>` sémantiques, colonne triable, HTML valide.

---

## Recommandation

**PROBLÈMES BLOQUANTS** : les 2 CRITICAL + endpoint GET body + CORS doivent être corrigés avant merge.

**Priorité de correction :**
1. `x3_client.py:96` — sanitization where clause
2. `server.py:338-347` — fix GET parameter binding avec `Query`
3. `server.py:117-121` — corriger CORS
4. Choisir un chemin unique pour la reconstitution stock (analyzer vs x3_routes)
