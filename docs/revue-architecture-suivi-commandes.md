# Revue d'architecture — Module suivi-commandes

**Date :** 2026-04-26  
**Scope :** `apps/suivi-commandes/` + dépendances `packages/erp-data-access/`, `packages/domain-contracts/`

---

## 1. Verdict global

Le module est **techniquement fonctionnel mais architecturalement insuffisant**. Il souffre d'un **design hérité** (`status_logic.py` écrit pour un CSV SUIVCDE manuel) sur lequel on a calqué `erp-data-access` sans refactoriser la couche métier. Résultat : duplication, couplage fort, et inversion de responsabilités.

**Note d'architecture : 3/10** — ça marche, mais chaque évolution est un risque de régression.

---

## 2. Problèmes fondamentaux

### 2.1 Le DataFrame SUIVCDE est un God Object

Le pipeline actuel :

```
DataLoader (objets métier)
    ↓
suivcde_builder → DataFrame (noms colonnes FR, valeurs scalaires)
    ↓
status_logic.py  ← lit "Stock interne 'A'", "Alloué interne 'A'", recalcule
retard_cause.py  ← repars du DataFrame + appelle DataLoader en parallèle
palette_calc.py  ← itère sur rows du DataFrame
retard_charge.py ← itère sur rows du DataFrame + appelle DataLoader
```

**Problème :** On transforme des objets riches (`Stock`, `BesoinClient`) en **tuples plats** pour ensuite ré-assembler l'information en aval. C'est un **anti-pattern de sérialisation prématurée**.

### 2.2 Violation DRY — Le stock est recalculé 3 fois

| Endroit | Calcul | CQ inclus ? |
|---------|--------|-------------|
| `Stock.disponible()` | `physique + CQ - alloué` | ✅ Oui |
| `status_logic.py` | `"Stock interne 'A'" - "Alloué interne 'A'"` (avant fix) | ❌ Non |
| `suivcde_builder.py` | expose `stock_physique` et `stock_alloue` séparément | ❌ Non |
| `retard_cause.py` | `stock.disponible()` | ✅ Oui |

**Problème :** La source de vérité existe (`Stock.disponible()`), mais on la contourne en la "décomposant" dans un DataFrame pour la recalculer en aval.

### 2.3 Responsabilité inversée — suivcde_builder n'a rien à faire dans erp-data-access

`packages/erp-data-access/src/erp_data_access/transformers/suivcde_builder.py` :
- Se trouve dans le package **data-access**
- Mais produit un format **spécifique à l'application suivi-commandes**
- Connaît les détails métier de suivi-commandes (`_is_hard_pegged`, `_is_fabrique`, noms de colonnes SUIVCDE)

**Problème :** `erp-data-access` devrait être une **bibliothèque de données pure**. Le mapping vers le format SUIVCDE est une préoccupation **d'application**, pas d'infrastructure.

### 2.4 status_logic.py viole le SRP à 5 endroits

Le fichier fait :
1. **Parsing / normalisation** de DataFrame (`to_numeric`, `get_series`, `build_line_keys`)
2. **Agrégation géométrique** (regroupement des sous-lignes d'emplacement)
3. **Allocation virtuelle séquentielle** (algo métier de consommation de stock)
4. **Calcul de statut** (règles métier MTS/MTO/NOR)
5. **Mapping inverse** (re-projeter les statuts sur le DataFrame original)

**Problème :** C'est 5 modules en 1 fichier de 180 lignes. Aucune abstraction, aucune interface.

### 2.5 Couplage concret — aucune abstraction métier

`status_logic.py` dépend de :
- `"Stock interne 'A'"` (nom de colonne CSV)
- `"Alloué interne 'A'"` (nom de colonne CSV)
- `"Date expedition"` (nom de colonne CSV)
- `"Type commande"` (valeurs `MTS`/`MTO`/`NOR` en string)
- `"Emplacement"` + regex `QUAI|SM|EXP|S9C|S3C`

**Problème :** Ce module ne peut **pas être testé unitairement** sans un DataFrame complet. Il est couplé au format d'export ERP/SUIVCDE.

### 2.6 L'API renvoie un couple (DataFrame, DataLoader) — smell bidirectionnel

```python
def load_data_with_loader(extractions_dir):
    loader = DataLoader.from_extractions(extractions_dir)
    df = build_suivcde_dataframe(loader)
    return df, loader   # ← pourquoi les deux ???
```

`api.py` appelle `_compute_payload(df, loader)` où `df` est transformé par `status_logic.py` puis `retard_cause.py` a besoin de `loader` pour enrichir.

**Problème :** Si `status_logic` avait travaillé sur des objets métier, `retard_cause` n'aurait pas besoin d'un second accès aux données brutes.

### 2.7 palette_calculator.py et retard_charge.py itèrent sur des rows dict-like

```python
for _, row in scope.iterrows():
    article = str(row.get("Article", ""))
    qte = float(row.get("Quantité restante", 0))
```

**Problème :** On manipule des `Series` pandas comme des DTOs. Pas de typage, pas d'autocomplétion, pas de validation. Un renommage de colonne casse tout silencieusement.

### 2.8 retard_cause.py mélange deux niveaux d'abstraction

Il reçoit un DataFrame (niveau présentation/export) mais a besoin d'interroger :
- `loader.get_stock()` (niveau data-access)
- `loader.get_nomenclature()` (niveau data-access)
- `loader.get_of_by_num()` (niveau data-access)

**Problème :** Le module devrait recevoir un **objet commande enrichi** (avec sa BOM, son OF, son stock déjà résolus), pas un DataFrame + un loader.

---

## 3. Analyse par fichier

| Fichier | Responsabilité affichée | Responsabilité réelle | SRP | Note |
|---------|------------------------|----------------------|-----|------|
| `status_logic.py` | Assigner un statut | Parser + agréger + allouer + statuer + mapper | ❌ | 4 fonctions en 1 |
| `retard_cause.py` | Analyser la cause de retard | Parser un DataFrame + interroger l'ERP + descendre une BOM | ❌ | Couplage data |
| `api.py` | Exposer une API HTTP | Orchestrer un pipeline de transformations DataFrame | ⚠️ | God method `_compute_payload` |
| `suivcde_builder.py` | Transformer des données | Créer un format spécifique à une app dans un pkg générique | ❌ | Mauvais niveau |
| `data_loader.py` | Charger des données | Importer et appeler le builder | ✅ | Correct mais superflu |
| `palette_calculator.py` | Calculer des palettes | Parser un DataFrame + interroger l'ERP + calculer | ❌ | Même problème |
| `retard_charge.py` | Calculer la charge | Parser un DataFrame + interroger l'ERP + calculer | ❌ | Même problème |

---

## 4. Ce qu'il faut faire — Plan de refactoring

### Étape 1 : Extraire le domaine "Suivi de commandes"

Créer `apps/suivi-commandes/src/suivi_commandes/domain/` avec :

```
domain/
  order_line.py      # LigneCommande (article, qte, date_exp, type, stock, ...)
  stock_assessment.py  # Évaluation du stock (utilise Stock.disponible())
  status.py          # Énumération des statuts + règles
  allocation.py      # Algorithme d'allocation virtuelle
  cause_analyzer.py  # Analyse de la cause de retard (reçoit un OrderLine enrichi)
```

### Étape 2 : Déplacer suivcde_builder hors d'erp-data-access

`suivcde_builder.py` devient `apps/suivi-commandes/src/suivi_commandes/adapters/erp_mapper.py`.

Son rôle : transformer `DataReader` → `list[LigneCommande]` (objets métier), **pas** un DataFrame.

### Étape 3 : Refactoriser status_logic.py

**Supprimer** le travail sur DataFrame. Remplacer par :

```python
def assign_statuses(lines: list[LigneCommande], today: date) -> list[LigneCommande]:
    # 1. Allocation virtuelle sur les objets LigneCommande
    # 2. Application des règles métier pures
    # 3. Retour des objets enrichis
```

Les règles pures (`Date expedition < today` → `Retard Prod`) deviennent des fonctions testables unitairement sans pandas.

### Étape 4 : Refactoriser retard_cause.py

```python
def analyze_cause(line: LigneCommande, loader: DataReader) -> str:
    # Le loader sert à enrichir la ligne (résoudre l'OF, la BOM)
    # Mais l'entrée est un objet métier typé, pas un DataFrame row
```

### Étape 5 : L'API ne manipule plus de DataFrame en interne

```python
@api.post("/api/v1/status/from-latest-export")
def assign_from_latest_export(payload: SuiviLatestExportRequest) -> SuiviAssignResponse:
    loader = DataLoader.from_extractions(folder)
    lines = erp_mapper.to_order_lines(loader)        # ← objets métier
    lines = status_service.assign(lines, today)       # ← règles pures
    lines = cause_service.enrich(lines, loader)       # ← enrichissement
    return SuiviAssignResponse(
        rows=[line.to_dict() for line in lines],       # ← sérialisation à la fin
        ...
    )
```

### Étape 6 : Tests

Chaque règle métier testée **sans pandas**, **sans DataLoader réel** :
```python
def test_mts_achete_avec_stock_alloue_nest_pas_retard():
    line = LigneCommande(
        article="A2183", qte_restante=10,
        stock=Stock(physique=0, sous_cq=100, alloue=0),
        type=TypeCommande.MTS, is_fabrique=False,
        date_expedition=date(2026,1,10)
    )
    result = assign_status(line, today=date(2026,1,20))
    assert result.statut == Statut.ALLOCATION_A_FAIRE
```

---

## 5. Principes à respecter

| Principe | État actuel | Cible |
|----------|-------------|-------|
| **SRP** | 1 fichier = 5 responsabilités | 1 classe/fichier = 1 responsabilité |
| **DRY** | Stock calculé 3+ fois | `Stock.disponible()` = seule source |
| **DIP** | `status_logic` dépend de noms de colonnes CSV | `status_logic` dépend d'objets métier |
| **ISP** | `DataReader` composite imposé | `status_logic` reçoit `LigneCommande[]` |
| **OCP** | Modifier `status_logic` pour chaque nouvelle colonne | Étendre `LigneCommande` sans toucher les règles |

---

## 6. Résumé pour A2183/AR2601220

Le bug "Attente réception fournisseur" alors que le stock existe est un **symptôme**, pas la cause. La cause est l'architecture :

1. `suivcde_builder` n'exposait pas le stock sous CQ
2. `status_logic` recalculait le stock à la main avec des colonnes partielles
3. `retard_cause` accusait le fournisseur sans vérifier

Avec le refactoring proposé, un seul objet `Stock` traverse la couche métier. Une seule méthode `disponible()` calcule. Un seul test valide.
