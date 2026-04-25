# Évolution : Gestion de la concurrence avec allocation virtuelle

> **Statut : IMPLÉMENTÉ**
> L'allocation virtuelle est intégrée dans le scheduler. `StockState` gère le stock virtuel.
> `RecursiveChecker` supporte le paramètre `stock_state`. Le scheduler trie les OF par priorité.

## Contexte

**Problème actuel** : La vérification de faisabilité des OF utilise le stock réel (`stock.disponible()`) de manière statique. Chaque OF est vérifié indépendamment sans tenir compte des allocations déjà faites aux autres OF.

**Exemple du problème** :
```
Stock disponible de BDH2216AL : 668 unités

OF F426-09822 (vérifié 1er) → Besoin 288 → ✅ Faisable
OF F426-10101 (vérifié 2e) → Besoin 256 → ✅ Faisable
OF F426-09503 (vérifié 3e) → Besoin 540 → ✅ Faisable

Réalité : 668 < (288 + 256 + 540) = 1084 → Les 3 OF ne peuvent PAS être servis !
```

**Solution** : Implémenter l'allocation virtuelle pour gérer la concurrence entre OF.

---

## Objectifs

1. **Permettre le choix entre 2 approches** :
   - **Approche 1** (actuelle) : Pas d'allocation virtuelle - chaque OF vérifié indépendamment
   - **Approche 2** (nouvelle) : Allocation virtuelle - gestion de la concurrence

2. **Règles de gestion de la concurrence** (déjà définies dans CLAUDE.md) :
   - **Règle 1** : OF avec date de besoin plus tôt = prioritaire
   - **Règle 2** : Si un OF est 100% faisable → il passe avant un OF prioritaire mais non faisable

3. **Retro-compatibilité** : L'approche actuelle doit rester disponible par défaut ou via option

---

## Architecture actuelle

### RecursiveChecker (planning_engine/feasibility/recursive.py)

**Méthode actuelle `_check_stock()`** :
```python
def _check_stock(self, article: str, qte_besoin: int, date_besoin) -> FeasibilityResult:
    stock = self.data_loader.get_stock(article)
    stock_dispo = stock.disponible()  # Toujours le même stock statique

    if stock_dispo < qte_besoin:
        result.feasible = False
        result.add_missing(article, qte_besoin - stock_dispo)

    return result
```

**Problème** : `stock.disponible()` est identique pour tous les OF

### AllocationManager (planning_engine/orders/allocation.py)

**État actuel** :
- Structure de base existe (`StockState`, `AllocationManager`)
- **INCOMPLET** : `_calculate_allocations()` retourne `{}` (TODO)
- **NON UTILISÉ** : Pas intégré avec `RecursiveChecker`

---

## Implémentation

### 1. Modifier `RecursiveChecker` pour supporter le stock virtuel

**Fichier** : `planning_engine/feasibility/recursive.py`

**Changements** :

```python
class RecursiveChecker(BaseChecker):
    def __init__(self, data_loader, use_receptions: bool = False, check_date: Optional = None, stock_state: Optional['StockState'] = None):
        """Initialise le checker récursif.

        Parameters
        ----------
        data_loader : DataLoader
            Loader de données
        use_receptions : bool
            Si True, utilise les réceptions fournisseurs
        check_date : Optional[date]
            Date de vérification (None = aujourd'hui)
        stock_state : Optional[StockState]
            État du stock virtuel pour allocation (None = stock réel)
        """
        super().__init__(data_loader)
        self.use_receptions = use_receptions
        self.check_date = check_date
        self.stock_state = stock_state  # NOUVEAU
```

**Modifier `_check_stock()`** :

```python
def _check_stock(self, article: str, qte_besoin: int, date_besoin) -> FeasibilityResult:
    """Vérifie si le stock est suffisant pour un article.

    Utilise le stock virtuel si stock_state est fourni, sinon le stock réel.
    """
    result = FeasibilityResult()

    # Récupérer le stock (virtuel ou réel)
    if self.stock_state:
        # Utiliser le stock virtuel (allocation activée)
        stock_dispo = self.stock_state.get_available(article)
    else:
        # Utiliser le stock réel (comportement actuel)
        stock = self.data_loader.get_stock(article)
        if stock is None:
            result.feasible = False
            result.add_missing(article, qte_besoin)
            result.add_alert(f"Stock non disponible pour l'article {article}")
            return result

        stock_dispo = stock.disponible()

        # Ajouter les réceptions si activé
        if self.use_receptions:
            receptions = self.data_loader.get_receptions(article)
            for reception in receptions:
                if self.check_date and reception.est_disponible_avant(self.check_date):
                    stock_dispo += reception.quantite_restante
                elif not self.check_date and reception.est_disponible_avant(date_besoin):
                    stock_dispo += reception.quantite_restante

    # Vérifier si le stock est suffisant
    if stock_dispo < qte_besoin:
        result.feasible = False
        result.add_missing(article, qte_besoin - stock_dispo)

    return result
```

---

### 2. Implémenter `_calculate_allocations()` dans `AllocationManager`

**Fichier** : `planning_engine/orders/allocation.py`

**Objectif** : Calculer les quantités à allouer pour chaque composant ACHAT d'un OF

```python
def _calculate_allocations(self, of: OF, stock_state: StockState) -> dict[str, int]:
    """Calcule les allocations pour un OF.

    Parcourt la nomenclature de l'OF et calcule les besoins en composants ACHAT.

    Parameters
    ----------
    of : OF
        OF à traiter
    stock_state : StockState
        État du stock

    Returns
    -------
    dict[str, int]
        Allocations par article (article → quantité allouée)
    """
    allocations = {}

    # Récupérer la nomenclature
    nomenclature = self.data_loader.get_nomenclature(of.article)

    if not nomenclature:
        return allocations

    # Parcourir les composants
    for composant in nomenclature.composants:
        if composant.is_achete():
            # Calculer le besoin pour ce composant
            besoin = int(composant.qte_lien * of.qte_restante)

            # Vérifier le stock disponible
            stock_dispo = stock_state.get_available(composant.article_composant)

            # Allouer la quantité nécessaire (limitée au stock dispo)
            qte_allouee = min(besoin, stock_dispo)

            if qte_allouee > 0:
                allocations[composant.article_composant] = qte_allouee

    return allocations
```

---

### 3. Intégrer `RecursiveChecker` dans `AllocationManager`

**Fichier** : `planning_engine/orders/allocation.py`

**Changements dans `_allocate_of()`** :

```python
def _allocate_of(self, of: OF, stock_state: StockState) -> AllocationResult:
    """Alloue le stock à un OF."""
    # Créer un checker avec stock_state
    from ..checkers.recursive import RecursiveChecker

    # Créer un checker temporaire avec le stock_state
    checker = RecursiveChecker(
        self.data_loader,
        use_receptions=getattr(self.checker, 'use_receptions', False),
        check_date=getattr(self.checker, 'check_date', None),
        stock_state=stock_state  # ← Utiliser le stock virtuel
    )

    # Vérifier la faisabilité avec le stock restant
    result = checker.check_of(of)

    if result.feasible:
        # Calculer les allocations
        allocations = self._calculate_allocations(of, stock_state)

        if allocations:
            # Allouer virtuellement
            stock_state.allocate(of.num_of, allocations)

            return AllocationResult(
                of_num=of.num_of,
                status=AllocationStatus.FEASIBLE,
                feasibility_result=result,
                allocated_quantity=allocations,
            )
        else:
            # OF faisable mais pas d'allocations nécessaires
            return AllocationResult(
                of_num=of.num_of,
                status=AllocationStatus.FEASIBLE,
                feasibility_result=result,
                allocated_quantity={},
            )
    else:
        return AllocationResult(
            of_num=of.num_of,
            status=AllocationStatus.NOT_FEASIBLE,
            feasibility_result=result,
            allocated_quantity=None,
        )
```

---

### 4. Ajouter paramètre CLI

**Fichier** : `src/main.py`

**Ajouter l'argument** :

```python
parser.add_argument(
    "--no-virtual-allocation",
    action="store_true",
    help="Désactive l'allocation virtuelle (vérification indépendante des OF)",
)
```

**Modifier la logique de gestion de la concurrence** :

```python
# Gestion de la concurrence
allocation_results = None
if not args.no_allocation:
    if args.no_virtual_allocation:
        # Approche 1 : Pas d'allocation virtuelle (actuel)
        console.print("[bold cyan]📦 Vérification sans allocation virtuelle...[/bold cyan]")

        # Utiliser ProjectedChecker directement (pas de StockState)
        allocation_results = {
            of.num_of: AllocationResult(
                of_num=of.num_of,
                status=AllocationStatus.FEASIBLE if projected_results[of.num_of].feasible else AllocationStatus.NOT_FEASIBLE,
                feasibility_result=projected_results[of.num_of],
                allocated_quantity={},
            )
            for of in ofs
        }
    else:
        # Approche 2 : Allocation virtuelle (défaut)
        console.print("[bold cyan]📦 Gestion de la concurrence avec allocation virtuelle...[/bold cyan]")

        # Créer un RecursiveChecker avec réceptions (si configuré)
        recursive_checker = RecursiveChecker(
            loader,
            use_receptions=True,  # Utiliser les réceptions
            check_date=date.today()  # Date du jour
        )

        allocation_manager = AllocationManager(loader, recursive_checker)
        allocation_results = allocation_manager.allocate_stock(ofs)

    alloc_feasible = sum(1 for r in allocation_results.values() if r.status.value == "feasible")
    console.print(f"✅ Terminé: {alloc_feasible}/{len(ofs)} OF alloués")
    console.print()
```

---

## Utilisation

### Approche 1 : Sans allocation virtuelle (actuel)

```bash
python -m src.main --data-dir data --s1 --no-virtual-allocation
```

**Comportement** :
- Chaque OF vérifié indépendamment
- Stock disponible identique pour tous
- Pas d'interaction entre OF

### Approche 2 : Avec allocation virtuelle (défaut)

```bash
python -m src.main --data-dir data --s1
```

**Comportement** :
- OF triés par date de besoin + faisabilité
- Stock virtuel décrémenté au fur et à mesure
- Un OF devient "non faisable" si stock insuffisant

---

## Cas de test

### Test 1 : Concurrence simple

```
Stock BDH2216AL : 668 unités

OF F126-43177 (21/03) → Besoin 16 → ✅ Faisable
OF F426-10101 (25/03) → Besoin 256 → ✅ Faisable
OF F426-09822 (25/03) → Besoin 288 → ✅ Faisable
OF F426-09503 (30/03) → Besoin 540 → ❌ Non faisable (reste 108)
```

**Attendu** :
- Sans allocation virtuelle : Les 4 OF semblent faisables
- Avec allocation virtuelle : F426-09503 est non faisable (stock épuisé)

### Test 2 : Règle de faisabilité

```
Stock : 20 unités

OF A (13/03) → Besoin 30 → Non faisable
OF B (15/03) → Besoin 20 → ✅ Faisable
```

**Attendu** :
- Sans allocation virtuelle : OF A prioritaire (date), OF B après
- Avec allocation virtuelle : OF B prioritaire (faisable), OF A non faisable

---

## Fichiers à modifier

1. **`planning_engine/feasibility/recursive.py`**
   - Ajouter paramètre `stock_state` au constructeur
   - Modifier `_check_stock()` pour utiliser `stock_state` si fourni

2. **`planning_engine/orders/allocation.py`**
   - Implémenter `_calculate_allocations()` complètement
   - Modifier `_allocate_of()` pour utiliser `RecursiveChecker` avec `stock_state`

3. **`src/main.py`**
   - Ajouter argument `--no-virtual-allocation`
   - Modifier la logique de gestion de la concurrence

---

## Validation

### Tests unitaires

1. **Test vérification avec stock réel**
   ```python
   checker = RecursiveChecker(loader, stock_state=None)
   result = checker.check_of(of)
   assert result.feasible == expected
   ```

2. **Test vérification avec stock virtuel**
   ```python
   stock_state = StockState(initial_stock={'BDH2216AL': 668})
   checker = RecursiveChecker(loader, stock_state=stock_state)
   result = checker.check_of(of)
   ```

3. **Test allocation multiple OF**
   ```python
   allocation_manager = AllocationManager(loader, checker)
   results = allocation_manager.allocate_stock(ofs)
   assert results[of1].status == AllocationStatus.FEASIBLE
   assert results[of2].status == AllocationStatus.NOT_FEASIBLE
   ```

### Tests d'intégration

```bash
# Test S+1 sans allocation virtuelle
python -m src.main --data-dir data --s1 --no-virtual-allocation

# Test S+1 avec allocation virtuelle
python -m src.main --data-dir data --s1

# Comparer les résultats
```

---

## Impact attendu

**Sans allocation virtuelle** (actuel) :
- OF FERMES faisables : 5/5
- OF SUGGÉRÉS faisables : beaucoup plus
- **Risque** : Sur-estimation de la capacité

**Avec allocation virtuelle** (nouveau) :
- OF FERMES servis : 5/5 (priorité)
- OF SUGGÉRÉS servis : uniquement si stock dispo
- **Avantage** : Vision réaliste de la capacité

---

## Documentation à mettre à jour

1. **CLAUDE.md** :
   - Section "Gestion de la concurrence composants"
   - Ajouter exemples avec allocation virtuelle

2. **README.md** (si existe) :
   - Ajouter section "Modes de vérification"
   - Documenter le paramètre `--no-virtual-allocation`
