# Migration : `commandes_clients.csv` → `besoins_clients.csv`

> **Statut : IMPLÉMENTÉ**
> Le loader lit désormais `Besoins Clients.csv` exclusivement. L'ancien format `commandes_clients.csv` n'est plus supporté.
> Les colonnes ERP actuelles sont documentées dans CLAUDE.md (section Besoins Clients.csv).

## Contexte

**Pourquoi cette migration ?**

Le fichier `besoins_clients.csv` remplace `commandes_clients.csv` avec une structure adaptée pour supporter à terme :
- Les commandes réelles (COMMANDE)
- Les prévisions Export (PREVISION)

Cependant, pour le moment, on migre **uniquement** les commandes réelles existantes, sans intégrer les prévisions.

---

## Analyse des différences

### Colonnes dans `besoins_clients.csv`

```
NOM_CLIENT            (existe)
TYPE_COMMANDE         (NOUVEAU : remplace FLAG_CONTREMARQUE)
NUM_COMMANDE           (existe)
NATURE_BESOIN         (NOUVEAU : pour futur)
ARTICLE                (existe)
OF_CONTREMARQUE        (existe)
DATE_COMMANDE          (NOUVEAU : date de passage)
DATE_EXPEDITION_DEMANDEE (existe)
QTE_COMMANDEE          (existe)
QTE_ALLOUEE            (existe)
QTE_RESTANTE           (existe)
```

### Colonnes manquantes par rapport à `commandes_clients.csv`

| Ancienne colonne | Statut dans besoins_clients.csv |
|------------------|-----------------------------------|
| `LIGNE_COMMANDE` | Absente → **Défaut : 1** |
| `CODE_CLIENT` | Absente → **Extraction depuis NOM_CLIENT** |
| `DESCRIPTION` | Absente → **Chargée depuis articles.csv** |
| `FLAG_CONTREMARQUE` | Remplacé par `TYPE_COMMANDE` |

---

## Implémentation

### 1. Adapter le loader (`src/loaders/csv_loader.py`)

**Modification de `load_commandes_clients()`** :

```python
class CSVLoader:
    # ... code existant ...

    def load_commandes_clients(self) -> list[CommandeClient]:
        """Charge les commandes clients.

        Priority: besoins_clients.csv > commandes_clients.csv (legacy)
        """
        try:
            # Essayer besoins_clients.csv d'abord
            df = self._load_csv("besoins_clients.csv", subdir="dynamique")
        except FileNotFoundError:
            # Fallback sur commandes_clients.csv
            df = self._load_csv("commandes_clients.csv", subdir="dynamique")

        commandes = []

        # Charger les articles pour récupérer les descriptions
        articles_dict = {a.article: a.description for a in self._articles if hasattr(self, '_articles') and self._articles}

        for _, row in df.iterrows():
            # Extraire CODE_CLIENT depuis NOM_CLIENT si absent
            nom_client = row.get("NOM_CLIENT", "")
            if "CODE_CLIENT" not in row or not row.get("CODE_CLIENT"):
                # Format : "ALDES Venticontrol S.A." → "80001"
                # Ou utiliser le nom tel quel
                code_client = self._extract_code_client_from_nom(nom_client)
            else:
                code_client = row.get("CODE_CLIENT", "")

            # Mapper TYPE_COMMANDE vers FLAG_CONTREMARQUE
            type_cmd = row.get("TYPE_COMMANDE", "").upper()
            if type_cmd == "MTS":
                flag_contremarque = 5
            elif type_cmd in ("NOR", "MTO"):
                flag_contremarque = 1
            else:
                flag_contremarque = 1  # Défaut

            # Récupérer la description depuis articles.csv
            article = row.get("ARTICLE", "")
            description = articles_dict.get(article, "")

            cmd = CommandeClient(
                num_commande=row.get("NUM_COMMANDE", ""),
                ligne_commande=1,  # Défaut (pas de colonne)
                code_client=code_client,
                nom_client=nom_client,
                article=article,
                description=description,
                qte_commandee=int(row.get("QTE_COMMANDEE", 0)),
                qte_allouee=int(row.get("QTE_ALLOUEE", 0)),
                qte_restante=int(row.get("QTE_RESTANTE", 0)),
                date_expedition_demandee=_parse_date(row.get("DATE_EXPEDITION_DEMANDEE")),
                flag_contremarque=flag_contremarque,
                of_contremarque=row.get("OF_CONTREMARQUE", ""),
            )
            commandes.append(cmd)

        return commandes

    def _extract_code_client_from_nom(self, nom_client: str) -> str:
        """Extrait le code client depuis le nom.

        Examples :
        - "ALDES Venticontrol S.A." → "80001"
        - "AERECO LEGTECHNIKA Kft" → "À définir"
        """
        # Mapping connu des clients → codes
        clients_codes = {
            "ALDES": "80001",
            "AERECO": "90045",
            "PARTN-AIR": "90046",
            # ... à compléter
        }

        for prefix, code in clients_codes.items():
            if prefix in nom_client:
                return code

        return "UNKNOWN"  # Fallback

    def _parse_date(self, date_str: str) -> date:
        """Parse une date au format JJ/MM/AAAA."""
        if not date_str or date_str == "":
            return None
        return datetime.strptime(date_str, "%d/%m/%Y").date()
```

---

### 2. Mettre à jour `CommandeClient` (`src/models/commande_client.py`)

**Ajouter une méthode de parsing adaptée** :

```python
class CommandeClient:
    # ... attributs existants ...

    @classmethod
    def from_besoins_csv_row(cls, row: dict, articles_dict: dict = None) -> "CommandeClient":
        """Crée une CommandeClient depuis besoins_clients.csv.

        Parameters
        ----------
        row : dict
            Ligne CSV parsée
        articles_dict : dict, optional
            Mapping article → description

        Returns
        -------
        CommandeClient
            Instance créée
        """
        # Extraire CODE_CLIENT depuis NOM_CLIENT si absent
        nom_client = row.get("NOM_CLIENT", "")
        if "CODE_CLIENT" not in row or not row.get("CODE_CLIENT"):
            code_client = cls._extract_code_client(nom_client)
        else:
            code_client = row.get("CODE_CLIENT", "")

        # Mapper TYPE_COMMANDE vers FLAG_CONTREMARQUE
        type_cmd = row.get("TYPE_COMMANDE", "").upper()
        if type_cmd == "MTS":
            flag_contremarque = 5
        elif type_cmd in ("NOR", "MTO"):
            flag_contremarque = 1
        else:
            flag_contremarque = 1

        # Récupérer la description
        article = row.get("ARTICLE", "")
        if articles_dict and article in articles_dict:
            description = articles_dict[article]
        else:
            description = ""

        return cls(
            num_commande=row.get("NUM_COMMANDE", ""),
            ligne_commande=1,  # Défaut
            code_client=code_client,
            nom_client=nom_client,
            article=article,
            description=description,
            qte_commandee=_parse_int(row.get("QTE_COMMANDEE", 0)),
            qte_allouee=_parse_int(row.get("QTE_ALLOUEE", 0)),
            qte_restante=_parse_int(row.get("QTE_RESTANTE", 0)),
            date_expedition_demandee=_parse_date(row.get("DATE_EXPEDITION_DEMANDEE")),
            flag_contremarque=flag_contremarque,
            of_contremarque=row.get("OF_CONTREMARQUE", ""),
        )

    @staticmethod
    def _extract_code_client(nom_client: str) -> str:
        """Extrait le code client depuis le nom."""
        clients_codes = {
            "ALDES": "80001",
            "AERECO": "90045",
            "PARTN-AIR": "90046",
            "KROBATH": "90047",
            # ...
        }
        for prefix, code in clients_codes.items():
            if prefix in nom_client:
                return code
        return "UNKNOWN"
```

---

### 3. Adapter `DataLoader` (`src/loaders/data_loader.py`)

**Pas de changement nécessaire** - Il appelle déjà `csv_loader.load_commandes_clients()`.

Mais vérifier que `load_all()` passe bien les articles au loader :

```python
def load_all(self):
    """Charge tous les fichiers CSV en mémoire."""
    (
        self._articles,
        self._nomenclatures,
        self._ofs,
        self._stocks,
        self._receptions,
        self._commandes_clients,
    ) = self.csv_loader.load_all()
```

Si besoin, modifier pour passer les articles au loader :

```python
def load_all(self):
    """Charge tous les fichiers CSV en mémoire."""
    self._articles = self.csv_loader.load_articles()

    # Passer les articles au loader pour les descriptions
    self.csv_loader.articles = self._articles

    (
        self._nomenclatures,
        self._ofs,
        self._stocks,
        self._receptions,
        self._commandes_clients,
    ) = self.csv_loader.load_all()
```

---

### 4. Tests à adapter

### `tests/test_matching.py`

**Tests qui pourraient breaker** :

```python
# Avant (basé sur FLAG_CONTREMARDE)
def test_is_mts():
    cmd = CommandeClient(...)
    cmd.flag_contremarque = 5
    assert cmd.is_mts()

# Après (basé sur TYPE_COMMANDE)
def test_is_mts():
    # Le parsing depuis CSV convertit déjà TYPE_COMMANDE → FLAG_CONTREMARQUE
    cmd = CommandeClient.from_besoins_csv_row(row)
    assert cmd.is_mts()  # Doit toujours fonctionner
```

**Tests à vérifier** :

1. `test_init` - Initialisation CommandeOFMatcher
2. `test_match_mts_with_of_link` - Vérifie FLAG_CONTREMARQUE = 5
3. `test_match_mts_without_of_link` - Vérifie FLAG_CONTREMARQUE = 5
4. `test_match_nor_mto` - Vérifie FLAG_CONTREMARQUE = 1
5. `test_of_priority_in_matching` - Vérifie statut_num
6. `test_planned_of_priority_between_ferme_and_suggested` - Vérifie statuts

**Solution** : Les tests doivent continuer de créer des CommandeClient avec `flag_contremarque` explicite, car ils ne passent pas par le CSV.

---

### 5. Gestion des champs manquants

#### DESCRIPTION

**Problème** : `besoins_clients.csv` n'a pas de colonne DESCRIPTION.

**Solution** : Charger depuis `articles.csv` lors du parsing.

#### CODE_CLIENT

**Problème** : `besoins_clients.csv` n'a pas de colonne CODE_CLIENT.

**Solution** : Extraire depuis NOM_CLIENT avec un mapping :

```python
clients_codes = {
    "ALDES": "80001",
    "AERECO": "90045",
    "PARTN-AIR": "90046",
    "KROBATH": "90047",
    "VALLOUREC": "90048",
    "H-E.S.": "90049",
    # ... à compléter selon les données réelles
}
```

#### LIGNE_COMMANDE

**Problème** : `besoins_clients.csv` n'a pas de colonne LIGNE_COMMANDE.

**Solution** : Défaut à 1 (toutes les commandes sont supposées ligne unique).

---

## Fichiers à modifier

1. **`src/loaders/csv_loader.py`**
   - Modifier `load_commandes_clients()`
   - Ajouter `_extract_code_client_from_nom()`
   - Ajouter mapping clients → codes
   - Charger les descriptions depuis articles

2. **`src/models/commande_client.py`**
   - Ajouter `from_besoins_csv_row()` (méthode alternative)
   - Ajouter `_extract_code_client()` (méthode statique)
   - Adapter `_parse_date()` si nécessaire

3. **`tests/test_matching.py`**
   - Vérifier que les tests passent
   - Adapter si nécessaire (probablement pas besoin car les tests créent des objets directement)

4. **`tests/test_allocation_manager.py`**
   - Vérifier que les tests passent

5. **`tests/test_recursive_checker.py`**
   - Vérifier que les tests passent

---

## Stratégie de test

### 1. Tests unitaires du parser

```python
# tests/test_commande_client_parsing.py

def test_parsing_besoins_csv_mts():
    """Test le parsing d'une commande MTS depuis besoins_clients.csv."""
    row = {
        "NOM_CLIENT": "ALDES",
        "TYPE_COMMANDE": "MTS",
        "NUM_COMMANDE": "AR2600799",
        "NATURE_BESOIN": "COMMANDE",
        "ARTICLE": "EFL1345AL",
        "OF_CONTREMARQUE": "F426-06674",
        "DATE_EXPEDITION_DEMANDEE": "04/03/2026",
        "QTE_COMMANDEE": "720",
        "QTE_ALLOUEE": "0",
        "QTE_RESTANTE": "720",
    }

    articles_dict = {"EFL1345AL": "EAR FL1345 AL"}

    cmd = CommandeClient.from_besoins_csv_row(row, articles_dict)

    assert cmd.is_mts()
    assert cmd.flag_contremarque == 5
    assert cmd.qte_restante == 720
    assert cmd.description == "EAR FL1345 AL"
    assert cmd.code_client == "80001"

def test_parsing_besoins_csv_nor():
    """Test le parsing d'une commande NOR depuis besoins_clients.csv."""
    row = {
        "NOM_CLIENT": "AERECO LEGTECHNIKA Kft",
        "TYPE_COMMANDE": "NOR",
        "NUM_COMMANDE": "AR2601108",
        "NATURE_BESOIN": "COMMANDE",
        "ARTICLE": "B6794",
        "OF_CONTREMARQUE": "",
        "DATE_EXPEDITION_DEMANDEE": "18/03/2026",
        "QTE_COMMANDEE": "36",
        "QTE_ALLOUEE": "0",
        "QTE_RESTANTE": "36",
    }

    cmd = CommandeClient.from_besoins_csv_row(row, {})

    assert cmd.is_nor_mto()
    assert cmd.flag_contremarque == 1
```

### 2. Tests d'intégration

```python
# tests/test_migration_besoins_csv.py

def test_load_besoins_clients():
    """Test le chargement du fichier besoins_clients.csv."""
    loader = DataLoader("data")
    loader.load_all()

    # Vérifier que les commandes sont chargées
    assert len(loader.commandes_clients) > 0

    # Vérifier qu'on a des descriptions
    cmd = loader.commandes_clients[0]
    assert cmd.description is not None

def test_matching_with_new_format():
    """Test que le matching fonctionne avec le nouveau format."""
    loader = DataLoader("data")
    loader.load_all()

    matcher = CommandeOFMatcher(loader)
    commandes = loader.get_commandes_s1(date.today(), 7)

    results = matcher.match_commandes(commandes)

    # Vérifier que les résultats sont cohérents
    assert len(results) > 0
    for res in results:
        assert res.commande is not None
```

---

## Validation

### Avant migration

```bash
# Tester que les tests passent avec l'ancien format
python -m pytest tests/ -v

# Vérifier le nombre de commandes chargées
python -c "from src.loaders import DataLoader; l = DataLoader('data'); l.load_all(); print(f'Commandes: {len(l.commandes_clients)}')"
```

### Après migration

```bash
# Tester que les tests passent toujours
python -m pytest tests/ -v

# Vérifier que les commandes sont chargées
python -c "from src.loaders import DataLoader; l = DataLoader('data'); l.load_all(); print(f'Commandes: {len(l.commandes_clients)}')"

# Vérifier que les descriptions sont présentes
python -c "from src.loaders import DataLoader; l = DataLoader('data'); l.load_all(); print(f'Description 1ère: {l.commandes_clients[0].description}')"
```

---

## Risques et atténuations

### Risque 1 : CODE_CLIENT manquant

**Atténuation** : Mapping depuis NOM_CLIENT avec fallback "UNKNOWN".

**Validation** : Vérifier que les commandes ont un code_client valide.

### Risque 2 : DESCRIPTION manquante

**Atténuation** : Chargement depuis articles.csv.

**Validation** : Vérifier que toutes les descriptions sont chargées.

### Risque 3 : LIGNE_COMMANDE manquant

**Atténuation** : Défaut à 1 (toutes les commandes sont supposées ligne unique).

**Impact** : Minime car ce champ n'est pas utilisé dans la logique métier.

### Risque 4 : Types de commandes vides

**Observation** : 1,677 lignes avec TYPE_COMMANDE vide dans les données.

**Atténuation** : Par défaut NOR/MTO (flag = 1).

**Validation** : Vérifier que le traitement de ces commandes est correct.

---

## Avantages de l'approche

✅ **Non-breaking** : Fallback sur commandes_clients.csv si besoins_clients.csv absent
✅ **Rétrocompatible** : La structure de CommandeClient ne change pas
✅ **Testable** : Les tests existants ne sont pas impactés (ils créent des objets directement)
✅ **Progressif** : Facile d'ajouter les prévisions plus tard
✅ **Robuste** : Gère les champs manquants avec des valeurs par défaut

---

## Résumé des modifications

| Fichier | Modification | Impact |
|---------|------------|--------|
| `src/loaders/csv_loader.py` | Adapter `load_commandes_clients()` pour lire besoins_clients.csv | Moyen |
| `src/models/commande_client.py` | Ajouter `from_besoins_csv_row()` | Faible |
| `tests/test_matching.py` | Vérifier que les tests passent | Faible |
| `tests/test_allocation_manager.py` | Vérifier que les tests passent | Faible |
| `tests/test_recursive_checker.py` | Vérifier que les tests passent | Faible |

**Impact total** : Faible à moyen - principalement dans le loader, le reste du code est inchangé.
