# Tests Unitaires

Ce répertoire contient les tests unitaires pour le système d'ordonnancement.

## Structure des tests

```
tests/
├── __init__.py                      # Initialisation du package
├── conftest.py                      # Configuration pytest et fixtures
├── test_forecast_consumption.py     # Tests pour la consommation des prévisions
├── test_charge_calculator.py        # Tests pour le calcul de charge
└── test_country_filtering.py        # Tests pour le filtrage par pays
```

## Fonctionnalités testées

### 1. Consommation des prévisions (`test_forecast_consumption.py`)

Teste la fonction `consume_forecasts_by_article()` :
- Consommation totale (prévisions entièrement consommées)
- Consommation partielle
- Pas de consommation
- Articles multiples
- Liste vide
- Uniquement des commandes

### 2. Calcul de charge (`test_charge_calculator.py`)

Teste les fonctions du module `charge_calculator.py` :
- `is_valid_poste()` : Validation du pattern PP_xxx
- `get_week_info()` : Calcul des informations de semaine
- `group_by_week()` : Groupement des besoins par semaine
- `calculate_article_charge()` : Calcul récursif de charge
  - Gamme directe
  - Avec nomenclature
  - Filtrage des postes invalides
  - Article sans gamme
- `calculate_weekly_charge_heatmap()` : Calcul de la heatmap complète
- `get_poste_libelle()` : Récupération du libellé d'un poste

### 3. Filtrage par pays (`test_country_filtering.py`)

Teste le filtrage France vs Export :
- `BesoinClient.est_france()` : Identification clients France
- `BesoinClient.est_export()` : Identification clients Export
- `DataLoader.get_commandes_s1()` :
  - France = uniquement commandes (jamais de prévisions)
  - Export = commandes + prévisions (si paramètre activé)
  - Tri par priorité
  - Filtrage des quantités nulles
  - Filtrage par horizon

## Lancer les tests

### Lancer tous les tests
```bash
cd apps/planning-engine
python -m pytest tests/ -v
```

### Lancer un fichier de tests spécifique
```bash
python -m pytest tests/test_forecast_consumption.py -v
python -m pytest tests/test_charge_calculator.py -v
python -m pytest tests/test_country_filtering.py -v
```

### Lancer une classe de tests spécifique
```bash
python -m pytest tests/test_forecast_consumption.py::TestConsumeForecastsByArticle -v
```

### Lancer un test spécifique
```bash
python -m pytest tests/test_forecast_consumption.py::TestConsumeForecastsByArticle::test_consume_total -v
```

### Lancer avec coverage
```bash
python -m pytest tests/ --cov=production_planning --cov-report=html
```

## Fixtures disponibles

Dans `conftest.py` :
- `sample_gamme` : Gamme de test avec 2 opérations (PP_830 et PP_128)
- `sample_nomenclature` : Nomenclature de test avec 2 composants

## Ajouter de nouveaux tests

1. Créer un nouveau fichier dans `tests/` commençant par `test_`
2. Importer les modules nécessaires
3. Créer une classe de tests (optionnel mais recommandé)
4. Créer des méthodes de test commençant par `test_`
5. Utiliser `assert` pour vérifier les résultats

Exemple :
```python
"""Tests pour ma nouvelle fonctionnalité."""

import pytest
from production_planning.mon_module import ma_fonction


class TestMaFonction:
    """Tests pour ma_fonction."""

    def test_cas_normal(self):
        """Test: Cas normal."""
        resultat = ma_fonction(1, 2)
        assert resultat == 3

    def test_cas_limite(self):
        """Test: Cas limite."""
        resultat = ma_fonction(0, 0)
        assert resultat == 0
```
