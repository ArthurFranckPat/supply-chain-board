# Plan : Analyse Historique des Stocks (Sage X3)

## Contexte
Module d'analyse de l'evolution du stock article par article, en s'appuyant sur les mouvements extraits de la WEB API Sage X3 (table `STOJOU`, representation `ZSTOJOU`).

---

## Phase 1 — Reconstitution des stocks (backend)

### 1.1 Objectif
Pour chaque mouvement (ligne `STOJOU`), calculer :
- **Stock avant** : quantite en stock juste avant ce mouvement
- **Stock apres** : quantite en stock juste apres ce mouvement

### 1.2 Algorithme
```
1. Recuperer tous les mouvements d'un article (via /x3/stock-history, all_pages=true)
2. Trier par date croissante (IPTDAT asc, MVTSEQ asc)
3. Initialiser stock_courant = 0
4. Pour chaque mouvement (du plus ancien au plus recent) :
       stock_avant = stock_courant
       stock_apres = stock_courant + QTYSTU
       stock_courant = stock_apres
       enrichir le mouvement avec {stock_avant, stock_apres}
```

> **Hypothese** : les mouvements sont renvoyes par X3 avec un `MVTSEQ` decroissant dans le temps (99999999 = plus recent). Le tri ascendant par `(IPTDAT, MVTSEQ)` permet de les rejouer dans l'ordre chronologique.

### 1.3 Model de donnee
```python
class StockMovement:
    iptdat: str          # Date du mouvement
    itmref: str          # Code article
    qtystu: float        # Quantite (positive = entree, negative = sortie)
    trstyp: int          # Type de transaction
    vcrnum: str          # Document
    vcrnumori: str       # Origine
    loc: str             # Emplacement
    creusr: str          # Utilisateur
    stock_avant: float   # Stock avant le mouvement
    stock_apres: float   # Stock apres le mouvement
```

### 1.4 Service
Fichier : `production_planning/services/stock_history_analyzer.py`
- `reconstituer_stock(itmref: str) -> list[StockMovement]`
- Caching memoire possible (TTL court) pour eviter de re-interroger X3 a chaque appel.

---

## Phase 2 — Statistiques descriptives (backend)

### 2.1 Indicateurs calcules sur l'historique
| Indicateur | Description |
|---|---|
| **Stock min** | Minimum de `stock_apres` sur la periode |
| **Stock max** | Maximum de `stock_apres` sur la periode |
| **Stock moyen** | Moyenne de `stock_apres` |
| **Rotation** | Somme des sorties (QTYSTU < 0) / stock moyen |
| **Nombre de mouvements** | Total de lignes |
| **Duree moyenne entre mouvements** | Ecart-type ou moyenne des ecarts IPTDAT |
| **Tendance** | Pente d'une regression lineaire sur stock_apres |

### 2.2 API endpoint
```
POST /api/v1/stock-analytics
{
    "itmref": "11035404",
    "horizon_days": 90,
    "include_internal": false
}
```

Retourne :
```json
{
    "article": "11035404",
    "periode": {"debut": "2025-01-01", "fin": "2025-04-21"},
    "mouvements": 42,
    "stock_min": 120.0,
    "stock_max": 2040.0,
    "stock_moyen": 680.5,
    "rotation": 3.2,
    "tendance": "croissante",
    "items": [...]
}
```

---

## Phase 3 — Graphe d'evolution (UI)

### 3.1 Type de graphe
**Line chart** (Plotly ou Recharts) :
- **Axe X** : dates (IPTDAT)
- **Axe Y** : `stock_apres`
- **Tooltip** : detail du mouvement (QTYSTU, VCRNUM, TRSTYP, etc.)

### 3.2 Enrichissements visuels
- **Coloration** des segments selon le signe du mouvement (vert = entree, rouge = sortie)
- **Barres** en fond pour representer les volumes (QTYSTU absolu)
- **Annotations** sur les points extremes (min/max)
- **Fenetre de zoom** pour naviguer dans le temps

### 3.3 Vue UI proposee (board-ui)
Nouvelle page ou section : `/stock-evolution`

```
+----------------------------------------------------------+
|  Article : [11035404    ] [Analyser]                     |
|  Horizon : [45 jours ▼]  [Inclure internes □]           |
+----------------------------------------------------------+
|                                                          |
|   [          Line Chart : Stock dans le temps          ] |
|                                                          |
+----------------------------------------------------------+
|  Stock min : 120  |  Stock max : 2040  |  Moyenne : 680 |
|  Rotation : 3.2   |  Tendance : ↗      |  Mvt : 42     |
+----------------------------------------------------------+
|  [Tableau detaille des mouvements (scrollable)]         |
+----------------------------------------------------------+
```

### 3.4 Composants React a creer
- `StockEvolutionPage.tsx` — page principale
- `StockChart.tsx` — graphe Plotly/Recharts
- `StockStatsPanel.tsx` — cartes de stats
- `StockMovementsTable.tsx` — tableau detaille

---

## Phase 4 — Integration dans l'API production-planning

### 4.1 Endpoints a ajouter dans `server.py`
```
GET  /api/v1/stock-evolution/{itmref}    -> Donnees brutes + reconstitution
GET  /api/v1/stock-evolution/{itmref}/chart -> Format optimise pour le chart
POST /api/v1/stock-evolution/analytics    -> Stats descriptives
```

### 4.2 Wire dans GuiAppService
Ajouter une methode `analyser_evolution_stock(itmref, ...)` qui orchestre :
1. Appel `X3Client`
2. Reconstitution du stock
3. Calcul des stats
4. Formatage de la reponse

---

## Phase 5 — Tests et validation

### 5.1 Tests unitaires
- `test_stock_reconstruction.py` : verifier le calcul stock_avant/apres sur un jeu de mouvements factice
- `test_x3_parser.py` : parser les reponses JSON
- `test_x3_client.py` : mock httpx pour tester les URLs generees

### 5.2 Tests d'integration
- Appel reel sur un article connu (ex: 11035404) avec `all_pages=true`
- Comparaison du stock reconstitue avec le stock actuel (`STOCK.$detail`)

---

## Phase 6 — Livraison

| Etape | Statut |
|---|---|
| Client X3 + Parser | ✅ Fait |
| Reconstitution stock | ⏳ A faire |
| Stats descriptives | ⏳ A faire |
| Graphe UI | ⏳ A faire |
| Tests | ⏳ A faire |
| Documentation API | ⏳ A faire |

---

## Notes techniques

- **Performance** : un article tres mouvemente (ex: 10 000+ lignes) peut etre lent. Prevoir un `count` max et un mode `all_pages` optionnel.
- **Precision** : `QTYSTU` est en unite de stock. Si `QTYPCU` existe dans la representation, l'exposer aussi.
- **TRSTYP** : a documenter dans un mapping (1=entree, 2=sortie, 4=vente, 5=production...). S'inspirer de la table `STKTRS` ou du parametrage X3.
- **Cache** : les mouvements historiques ne changent pas. Un cache Redis/fichier par `(itmref, horizon)` est envisageable.

---

## Prochaine action immediate
Implementer `StockHistoryAnalyzer.reconstituer_stock()` dans `production_planning/services/stock_history_analyzer.py`.
