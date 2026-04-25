# Évolution : Intégration des Prévisions Export pour Lisser la Charge de Production

> **Statut : IMPLÉMENTÉ (partiellement)**
> Le modèle `BesoinClient` avec `NatureBesoin` (COMMANDE/PREVISION) et `TypeCommande` (MTS/NOR/MTO) est en place.
> Le fichier `Besoins Clients.csv` unifie commandes et prévisions. La consommation des prévisions est implémentée.
> Le renommage `CommandeOFMatcher` → `BesoinOFMatcher` et les rapport prévision restent à faire.

## Contexte

**Problème identifié** : Les filiales Export passent des commandes NOR importantes qui, si on attend la commande réelle pour produire, créent des charges concentrées et difficiles à absorber.

**Cas motivant** : Prévision mensuelle de 100 pcs
- **Sans prévisions** : Commande de 100 pcs en semaine 3 → Charge concentrée = urgence
- **Avec prévisions** : Split hebdo de 25 pcs/semaine → Charge lissée = absorbable

**Règle métier critique** :
> "Sur un même horizon, en cas de concurrence pour un composant, on priorise les commandes clients."

---

## Architecture proposée

### Concept clé : Unification Commande/Prévision

Créer une classe unique `BesoinClient` qui unifie :
- **Commandes réelles** (STATUT_BESOIN = "COMMANDE")
- **Prévisions Export** (STATUT_BESOIN = "PREVISION")

### Flux de données

```
┌─────────────────────────────────────────────────────────────┐
│               besoins_clients.csv (NOUVEAU)                  │
│  Commandes réelles + Prévisions Export fusionnées           │
│  Colonnes : STATUT_BESOIN, FILIALE, DATE_COMMANDE_PASSÉE   │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
        ┌─────────────────────────────────┐
        │   BesoinClient (NOUVEAU MODÈLE) │
        │   - est_commande() / est_prevision() │
        │   - est_export()                │
        └─────────────────────────────────┘
                         │
                         ▼
        ┌─────────────────────────────────┐
        │  BesoinOFMatcher                │
        │  (ex-CommandeOFMatcher)         │
        │  PRIORITÉ: Commandes > Prévisions│
        └─────────────────────────────────┘
                         │
                         ▼
        ┌─────────────────────────────────┐
        │  AllocationManager             │
        │  Allocation virtuelle +       │
        │  Priorité commandes            │
        └─────────────────────────────────┘
```

---

## Implémentation

### 1. Modèle `BesoinClient` (`src/models/besoin_client.py`)

**Nouveau modèle unifié** :

```python
from enum import Enum

class StatutBesoin(Enum):
    """Statut d'un besoin client."""
    COMMANDE = "COMMANDE"  # Commande réelle (MTS/NOR/MTO)
    PREVISION = "PREVISION"  # Prévision Export

@dataclass
class BesoinClient:
    """Besoin client (commande ou prévision)."""

    statut_besoin: StatutBesoin        # NOUVEAU
    num_commande: str
    ligne_commande: int
    code_client: str
    nom_client: str
    filiale: str                        # NOUVEAU (FR, EXPORT, etc.)
    article: str
    description: str
    qte_commandee: int
    qte_allouee: int
    qte_restante: int
    date_expedition_demandee: date
    date_commande_passee: date         # NOUVEAU (None pour prévision)
    flag_contremarque: int
    of_contremarque: str

    def est_commande(self) -> bool:
        """Vérifie si c'est une commande réelle."""
        return self.statut_besoin == StatutBesoin.COMMANDE

    def est_prevision(self) -> bool:
        """Vérifie si c'est une prévision."""
        return self.statut_besoin == StatutBesoin.PREVISION

    def est_export(self) -> bool:
        """Vérifie si c'est un besoin Export."""
        return self.filiale and self.filiale != "FR"

    @classmethod
    def from_csv_row(cls, row: dict) -> "BesoinClient":
        """Crée un BesoinClient depuis le CSV."""
        statut_str = row.get("STATUT_BESOIN", "COMMANDE").upper()
        statut_besoin = (
            StatutBesoin.COMMANDE if statut_str == "COMMANDE"
            else StatutBesoin.PREVISION
        )

        # Parser DATE_COMMANDE_PASSÉE
        date_cmd_str = row.get("DATE_COMMANDE_PASSÉE", "")
        date_commande = (
            datetime.strptime(date_cmd_str, "%d/%m/%Y").date()
            if date_cmd_str else None
        )

        return cls(
            statut_besoin=statut_besoin,
            num_commande=row.get("NUM_COMMANDE", ""),
            ligne_commande=int(row.get("LIGNE_COMMANDE", 0)),
            code_client=row.get("CODE_CLIENT", ""),
            nom_client=row.get("NOM_CLIENT", ""),
            filiale=row.get("FILIALE", "FR"),
            article=row.get("ARTICLE", ""),
            description=row.get("DESCRIPTION", ""),
            qte_commandee=int(row.get("QTE_COMMANDEE", 0)),
            qte_allouee=int(row.get("QTE_ALLOUEE", 0)),
            qte_restante=int(row.get("QTE_RESTANTE", 0)),
            date_expedition_demandee=_parse_date(row.get("DATE_EXPEDITION_DEMANDEE")),
            date_commande_passee=date_commande,
            flag_contremarque=int(row.get("FLAG_CONTREMARQUE", 1)),
            of_contremarque=row.get("OF_CONTREMARQUE", ""),
        )
```

---

### 2. Compatibilité avec `CommandeClient`

**Option : Remplacement progressif** :

```python
# src/models/commande_client.py

# Option 1 : Alias (simple)
from .besoin_client import BesoinClient as CommandeClient

# Option 2 : Wrapper avec filtrage
class CommandeClient:
    """Wrapper pour compatibilité."""

    @classmethod
    def from_besoin_client(cls, besoin: BesoinClient):
        """Convertit un BesoinClient en CommandeClient."""
        if besoin.est_commande():
            return cls(...)  # Copier les champs
        else:
            raise ValueError("Cannot convert PREVISION to CommandeClient")
```

---

### 3. Loader - Chargement des besoins

**Modification de `CSVLoader`** (`src/loaders/csv_loader.py`) :

```python
class CSVLoader:
    # ... code existant ...

    def load_besoins_clients(self) -> list[BesoinClient]:
        """Charge les besoins clients (commandes + prévisions).

        Priorité : besoins_clients.csv > commandes_clients.csv (legacy)
        """
        try:
            # Essayer besoins_clients.csv d'abord
            df = self._load_csv("besoins_clients.csv", subdir="dynamique")
        except FileNotFoundError:
            # Fallback sur commandes_clients.csv (compatibilité)
            df = self._load_csv("commandes_clients.csv", subdir="dynamique")
            # Ajouter colonnes manquantes pour compatibilité
            df["STATUT_BESOIN"] = "COMMANDE"
            df["FILIALE"] = "FR"
            df["DATE_COMMANDE_PASSÉE"] = None

        besoins = []
        for _, row in df.iterrows():
            besoin = BesoinClient.from_csv_row(row.to_dict())
            besoins.append(besoin)

        return besoins

    # Garder load_commandes_clients() pour compatibilité
    def load_commandes_clients(self) -> list[CommandeClient]:
        """Charge les commandes clients (méthode legacy)."""
        besoins = self.load_besoins_clients()
        return [b for b in besoins if b.est_commande()]
```

**Modification de `DataLoader`** (`src/loaders/data_loader.py`) :

```python
class DataLoader:
    def __init__(self, data_dir: str):
        # ... code existant ...
        # Remplacer _commandes_clients par _besoins_clients
        self._besoins_clients: Optional[list[BesoinClient]] = None

    def load_all(self):
        """Charge tous les fichiers CSV en mémoire."""
        # ...
        self._besoins_clients,  # NOUVEAU
        # ...

    @property
    def besoins_clients(self) -> list[BesoinClient]:
        """Retourne tous les besoins (commandes + prévisions)."""
        if self._besoins_clients is None:
            self.load_all()
        return self._besoins_clients

    @property
    def commandes_clients(self) -> list[CommandeClient]:
        """Retourne uniquement les commandes (compatibilité)."""
        return [b for b in self.besoins_clients if b.est_commande()]

    def get_commandes_s1(self, date_reference, horizon_days: int = 7) -> list[BesoinClient]:
        """Retourne les besoins S+1 (commandes + prévisions)."""
        # ... même logique, mais retourne BesoinClient ...

    def get_previsions_s1_s3(self, date_reference, horizon_days: int = 21) -> list[BesoinClient]:
        """Retourne les prévisions Export pour S+1 à S+3."""
        date_fin = date_reference + timedelta(days=horizon_days)

        previsions = []
        for besoin in self.besoins_clients:
            if not besoin.est_prevision():
                continue
            date_exp = besoin.date_expedition_demandee
            if date_reference <= date_exp <= date_fin and besoin.qte_restante > 0:
                previsions.append(besoin)

        return previsions
```

---

### 4. Matching - Renommage et priorité

**Renommage : `CommandeOFMatcher` → `BesoinOFMatcher`** (`planning_engine/orders/matching.py`) :

```python
class BesoinOFMatcher:
    """Gestionnaire du matching besoin→OF.

    RÈGLE DE PRIORITÉ : Commandes > Prévisions
    """

    def match_besoin(self, besoin: BesoinClient) -> MatchingResult:
        """Match un besoin (commande ou prévision) avec un OF."""
        if besoin.est_prevision():
            return self._match_prevision(besoin)
        elif besoin.is_mts():
            return self._match_mts(besoin)
        elif besoin.is_nor_mto():
            return self._match_nor_mto(besoin)

    def _match_prevision(self, besoin: BesoinClient) -> MatchingResult:
        """Match une prévision Export (priorité secondaire).

        Caractéristiques :
        - Toujours NOR/MTO (pas de OF_CONTREMARQUE)
        - Priorité INFÉRIEURE aux commandes réelles
        - OF SUGGÉRÉ prioritaire (pour stock)
        """
        # 1. Allouer stock disponible
        allocation = self._allocate_stock(besoin)

        # 2. Stock complet → pas d'OF nécessaire
        if allocation.besoin_net == 0:
            return MatchingResult(...)

        # 3. Article ACHAT → pas d'OF
        article = self.data_loader.get_article(besoin.article)
        if article and article.is_achat():
            return MatchingResult(...)

        # 4. Article FABRICATION → chercher OF (SUGGÉRÉ prioritaire)
        of = self._find_of_for_prevision(besoin, allocation.besoin_net)

        if not of:
            return MatchingResult(...)

        # 5. Allouer la quantité sur l'OF
        of_conso = self.of_conso[of.num_of]
        of_conso.allouer(allocation.besoin_net, f"PREV-{besoin.article[:10]}")

        return MatchingResult(...)

    def _find_of_for_prevision(self, besoin, besoin_net) -> Optional[OF]:
        """Trouve un OF pour une prévision.

        Priorité INVERSÉE : SUGGÉRÉ (3) > PLANIFIÉ (2) > AFFERMI (1)
        Les OF affermis sont réservés aux commandes réelles en priorité.
        """
        candidates = []

        for of_conso in self.of_conso.values():
            of = of_conso.of

            if of.article != besoin.article:
                continue
            if not of_conso.est_disponible(besoin_net):
                continue

            ecart_days = abs((of.date_fin - besoin.date_expedition_demandee).days)
            if ecart_days > self.date_tolerance_days:
                continue

            # Priorité INVERSÉE pour prévisions
            if of.statut_num == 3:
                priorite = 0  # Suggéré (prioritaire pour prévisions)
            elif of.statut_num == 2:
                priorite = 1  # Planifié
            else:
                priorite = 2  # Affermi (réservé aux commandes)

            candidates.append((of_conso, ecart_days, priorite))

        if not candidates:
            return None

        # Trier : priorité → date → quantité
        candidates.sort(key=lambda x: (x[2], x[1], -x[0].of.qte_restante))

        return candidates[0][0].of

    def match_besoins(self, besoins: list[BesoinClient]) -> list[MatchingResult]:
        """Match plusieurs besoins avec PRIORITÉ commandes > prévisions.

        Ordre de traitement :
        1. Commandes triées par date d'urgence
        2. Prévisions triées par date
        """
        self.reset()

        # Séparer commandes et prévisions
        commandes = [b for b in besoins if b.est_commande()]
        previsions = [b for b in besoins if b.est_prevision()]

        # Collecter les articles
        articles_nor_mto = {c.article for c in commandes if c.is_nor_mto()}
        articles_prev = {p.article for p in previsions}
        self._initialiser_of_conso(articles=articles_nor_mto | articles_prev)

        # Trier par urgence
        commandes_triees = sorted(commandes, key=lambda c: c.date_expedition_demandee)
        previsions_triees = sorted(previsions, key=lambda p: p.date_expedition_demandee)

        results = []

        # PRIORITÉ 1 : Traiter les COMMANDES
        for commande in commandes_triees:
            result = self.match_besoin(commande)
            results.append(result)

        # PRIORITÉ 2 : Traiter les PRÉVISIONS
        for prevision in previsions_triees:
            result = self.match_besoin(prevision)
            results.append(result)

        return results

    # Méthodes legacy pour compatibilité
    def match_commande(self, commande: CommandeClient) -> MatchingResult:
        """Match une commande (méthode legacy)."""
        # Wrapper vers match_besoin()
        besoin = BesoinClient(
            statut_besoin=StatutBesoin.COMMANDE,
            # ... copier les champs ...
        )
        return self.match_besoin(besoin)

    def match_commandes(self, commandes: list[CommandeClient]) -> list[MatchingResult]:
        """Match plusieurs commandes (méthode legacy)."""
        # Wrapper vers match_besoins()
        besoins = [BesoinClient(...) for cmd in commandes]
        return self.match_besoins(besoins)
```

---

### 5. Allocation - Priorité dans la concurrence

**Modification de `AllocationManager`** (`planning_engine/orders/allocation.py`) :

```python
class AllocationManager:
    """Gestionnaire de l'allocation avec priorité commande > prévision."""

    def allocate_stock_for_besoins(
        self,
        besoins: list[BesoinClient],
        ofs: list[OF]
    ) -> dict[str, AllocationResult]:
        """Alloue le stock aux OF avec PRIORITÉ commandes > prévisions."""
        initial_stock = self._get_initial_stock()
        stock_state = StockState(initial_stock)

        # Séparer les OF FERMES avec allocations
        of_with_allocations = set()
        for of in ofs:
            if of.statut_num == 1:
                allocations = self.data_loader.get_allocations_of(of.num_of)
                if allocations:
                    of_with_allocations.add(of.num_of)

        ofs_for_allocation = [of for of in ofs if of.num_of not in of_with_allocations]

        # Trier avec PRIORITÉ commande > prévision
        sorted_ofs = self._sort_ofs_by_priority_with_besoins(
            ofs_for_allocation,
            besoins,
            stock_state
        )

        # Allouer
        results = {}

        # 1. OF FERMES avec allocations (pas de virtuel)
        for of in ofs:
            if of.num_of in of_with_allocations:
                result = self.checker.check_of(of)
                results[of.num_of] = AllocationResult(...)

        # 2. OF PLANIFIÉS et SUGGÉRÉS (avec virtuel)
        for of in sorted_ofs:
            result = self._allocate_of(of, stock_state)
            results[of.num_of] = result

        return results

    def _sort_ofs_by_priority_with_besoins(
        self,
        ofs: list[OF],
        besoins: list[BesoinClient],
        stock_state: StockState
    ) -> list[OF]:
        """Trie les OF par priorité : date + faisabilité + TYPE BESOIN."""

        # Mapping OF → Besoins
        of_besoins = self._map_ofs_to_besoins(ofs, besoins)

        # Vérifier faisabilité
        of_status = []
        for of in ofs:
            result = self.checker.check_of(of)
            of_status.append((of, result, of_besoins.get(of.num_of, [])))

        def priority_key(item):
            of, result, besoins_associes = item

            # PRIORITÉ 1 : Type de besoin (COMMANDE > PREVISION)
            has_commande = any(b.est_commande() for b in besoins_associes)
            type_priorite = 0 if has_commande else 1

            # PRIORITÉ 2 : Date de besoin
            date_key = of.date_fin

            # PRIORITÉ 3 : Faisabilité
            feasible_key = not result.feasible

            return (type_priorite, date_key, feasible_key)

        of_status.sort(key=priority_key)

        return [of for of, _, _ in of_status]

    def _map_ofs_to_besoins(
        self,
        ofs: list[OF],
        besoins: list[BesoinClient]
    ) -> dict[str, list[BesoinClient]]:
        """Crée un mapping OF → Besoins associés."""
        mapping = defaultdict(list)

        for of in ofs:
            for besoin in besoins:
                if of.article == besoin.article:
                    mapping[of.num_of].append(besoin)

        return dict(mapping)
```

---

### 6. Rapports - Distinction visuelle

**Modification de `RapportS1`** (`planning_engine/reports/rapport_s1.py (supprimé)`) :

```python
def format_rapport_s1(
    resultats_matching: list[MatchingResult],
    resultats_faisabilite: dict,
):
    """Affiche le rapport S+1 avec distinction commande/prévision."""

    table = Table(title="📋 Validation S+1 - Besoins Clients")

    # Colonnes avec TYPE de besoin
    table.add_column("Type", style="bold yellow", width=10)  # NOUVEAU
    table.add_column("Commande", style="cyan")
    # ... autres colonnes ...

    for resultat in resultats_matching:
        besoin = resultat.commande

        # TYPE de besoin
        if besoin.est_prevision():
            type_str = "🔮 PREV"
        elif besoin.is_mts():
            type_str = "🏭 MTS"
        else:
            type_str = "📦 NOR"

        # ... affichage ...

    # Résumé avec distinction
    _afficher_resume_avec_previsions(resultats_matching, resultats_faisabilite)


def _afficher_resume_avec_previsions(resultats, resultats_faisabilite):
    """Affiche le résumé avec KPIs séparés."""

    commandes = [r for r in resultats if r.commande.est_commande()]
    previsions = [r for r in resultats if r.commande.est_prevision()]

    # Commandes
    console.print(f"[bold cyan]Commandes réelles:[/bold cyan] {len(commandes)}")
    console.print(f"   🏭 MTS : {sum(1 for r in commandes if r.commande.is_mts())}")
    console.print(f"   📦 NOR/MTO : {sum(1 for r in commandes if r.commande.is_nor_mto())}")

    # Prévisions
    console.print(f"\n[bold yellow]Prévisions Export:[/bold yellow] {len(previsions)}")
    console.print(f"   🔮 Prévisions : {len(previsions)}")

    # Faisabilité
    # ... affichage faisabilité ...
```

---

## Structure du fichier CSV

### `besoins_clients.csv` (nouveau format)

```csv
NUM_COMMANDE;LIGNE_COMMANDE;CODE_CLIENT;NOM_CLIENT;FILIALE;ARTICLE;DESCRIPTION;QTE_COMMANDEE;QTE_ALLOUEE;QTE_RESTANTE;DATE_EXPEDITION_DEMANDEE;DATE_COMMANDE_PASSÉE;FLAG_CONTREMARQUE;OF_CONTREMARQUE;STATUT_BESOIN
AR2600799;3000;80001;ALDES;FR;EFL1345AL;EAR 162132;720;0;720;04/03/2026;15/02/2026;5;F426-06674;COMMANDE
PREV-EXP-001;0;90045;AEROHOUSE Ltd;EXPORT;EAR2019GM;EAR 2019;100;0;100;15/03/2026;;1;;PREVISION
PREV-EXP-002;0;90045;AEROHOUSE Ltd;EXPORT;EAR2019GM;EAR 2019;100;0;100;22/03/2026;;1;;PREVISION
AR2600929;1000;90045;AEROHOUSE Ltd;FR;EMM716HU;EMM 716;2160;0;2160;25/03/2026;10/03/2026;1;;COMMANDE
```

**Colonnes ajoutées** :
- `STATUT_BESOIN` : "COMMANDE" ou "PREVISION"
- `FILIALE` : Code filiale ("FR", "EXPORT", etc.)
- `DATE_COMMANDE_PASSÉE` : Date de passage commande (vide pour prévision)

---

## Fichiers à modifier/créer

### Nouveaux fichiers

1. **`src/models/besoin_client.py`** - Modèle unifié BesoinClient
2. **`src/models/statut_besoin.py`** - Enum StatutBesoin

### Fichiers modifiés

1. **`src/loaders/csv_loader.py`** - Ajouter `load_besoins_clients()`
2. **`src/loaders/data_loader.py`** - Remplacer `_commandes_clients` par `_besoins_clients`
3. **`planning_engine/orders/matching.py`** - Renommer en `BesoinOFMatcher`, ajouter gestion prévisions
4. **`planning_engine/orders/allocation.py`** - Intégrer priorité commande > prévision
5. **`planning_engine/reports/rapport_s1.py (supprimé)`** - Distinction visuelle commande/prévision

### Fichiers de compatibilité

- **`src/models/commande_client.py`** - Alias/wrapper pour compatibilité ascendante

---

## Stratégie de déploiement

### Phase 1 : Modèle et compatibilité
- Créer `BesoinClient` avec méthodes `est_commande()`, `est_prevision()`
- Garder `CommandeClient` comme alias
- Tests unitaires

### Phase 2 : Loader
- Ajouter `load_besoins_clients()` avec fallback sur `commandes_clients.csv`
- Propriétés `besoins_clients` et `commandes_clients`
- Tests d'intégration

### Phase 3 : Matching
- Renommer `CommandeOFMatcher` → `BesoinOFMatcher`
- Ajouter `_match_prevision()` et `_find_of_for_prevision()`
- Implémenter priorité commande > prévision
- Tests matching

### Phase 4 : Allocation
- Modifier tri pour intégrer priorité commande > prévision
- Mapping OF → Besoins
- Tests allocation

### Phase 5 : Rapports
- Distinction visuelle (🔮 PREV vs 📦 NOR)
- KPIs séparés
- Tests visuels

---

## Validation

### Tests unitaires

```python
# tests/test_besoin_client.py

def test_besoin_commande():
    """Test création d'un besoin COMMANDE."""
    besoin = BesoinClient(
        statut_besoin=StatutBesoin.COMMANDE,
        num_commande="AR2600799",
        filiale="FR",
        # ...
    )
    assert besoin.est_commande()
    assert not besoin.est_prevision()
    assert not besoin.est_export()

def test_besoin_prevision():
    """Test création d'un besoin PREVISION."""
    besoin = BesoinClient(
        statut_besoin=StatutBesoin.PREVISION,
        num_commande="",
        filiale="EXPORT",
        # ...
    )
    assert besoin.est_prevision()
    assert not besoin.est_commande()
    assert besoin.est_export()
```

### Tests d'intégration

```python
# tests/test_matching_previsions.py

def test_priorite_commande_vs_prevision():
    """Test que les commandes sont traitées avant les prévisions."""
    matcher = BesoinOFMatcher(loader)

    commande = BesoinClient(..., statut_besoin=StatutBesoin.COMMANDE, ...)
    prevision = BesoinClient(..., statut_besoin=StatutBesoin.PREVISION, ...)

    resultats = matcher.match_besoins([commande, prevision])

    # Vérifier l'ordre
    assert resultats[0].commande.est_commande()
    assert resultats[1].commande.est_prevision()
```

---

## Avantages de l'approche

✅ **Non-breaking** : Compatible avec l'existant via alias/wrappers
✅ **Extensible** : Facile d'ajouter d'autres types de besoins
✅ **Explicite** : Distinction claire commande/prévision dans le code
✅ **Flexible** : Priorité gérée à tous les niveaux
✅ **Lisible** : Code auto-documenté sur la gestion des priorités

---

## Résultats attendus

### Avant

```
Semaine 3 : Commande 100 pcs
→ Charge concentrée : 100 pcs en urgence
→ Difficile à absorber
```

### Après

```
Semaines 1-2 : Prévisions 25+25 = 50 pcs (production anticipée)
Semaine 3 : Prévision 25 + Reste commande 25 = 50 pcs
→ Charge lissée : 50 pcs par semaine
→ Facilement absorbable
```
