"""Tests pour le calcul récursif de charge."""

from unittest.mock import MagicMock
from datetime import date, timedelta

def test_recursive_charge_with_fabricated_components():
    """Vérifie que la charge inclut les composants fabriqués."""
    from src.agents.organization.charge_calculator import ChargeCalculator

    loader = MagicMock()

    # Mock des gammes
    # Gamme de A (fabriqué sur PP153) : 100 unités/h
    gamme_a = MagicMock()
    gamme_a.operations = [
        MagicMock(poste_charge="PP_153", cadence=100.0)
    ]

    # Gamme de B (fabriqué sur PP830, utilise A comme composant) : 50 unités/h
    gamme_b = MagicMock()
    gamme_b.operations = [
        MagicMock(poste_charge="PP_830", cadence=50.0)
    ]

    def mock_get_gamme(article):
        if article == "ARTICLE_A":
            return gamme_a
        elif article == "ARTICLE_B":
            return gamme_b
        return None

    loader.get_gamme = mock_get_gamme

    # Mock de la nomenclature
    # Article B contient ARTICLE_A comme composant fabriqué
    from src.models.nomenclature import Nomenclature, NomenclatureEntry, TypeArticle

    nom_a = MagicMock()
    nom_a.composants = []

    nom_b = MagicMock()
    entry_a = MagicMock()
    entry_a.article_composant = "ARTICLE_A"
    entry_a.qte_lien = 1.0
    entry_a.type_article = TypeArticle.FABRIQUE
    entry_a.is_fabrique.return_value = True
    nom_b.composants = [entry_a]

    def mock_get_nomenclature(article):
        if article == "ARTICLE_A":
            return nom_a
        elif article == "ARTICLE_B":
            return nom_b
        return None

    loader.get_nomenclature = mock_get_nomenclature

    calculator = ChargeCalculator(loader)

    # OF pour ARTICLE_B : 200 unités
    of_b = MagicMock()
    of_b.article = "ARTICLE_B"
    of_b.qte_restante = 200

    # Calcul récursif pour PP830
    # Devrait inclure:
    # - Charge directe de B sur PP830 : 200 / 50 = 4h
    # - Charge de A (composant de B) sur PP153 : 200 / 100 = 2h
    # Mais A n'est PAS fabriqué sur PP830, donc ne compte pas pour PP830
    charge_pp830 = calculator.calculate_of_charge_recursive(of_b, "PP_830")
    assert abs(charge_pp830 - 4.0) < 0.01  # 4h seulement (charge directe de B)

    # Calcul récursif pour PP153
    # Devrait inclure:
    # - Charge directe de B sur PP153 : 0h (B n'est pas fabriqué sur PP153)
    # - Charge de A (composant de B) sur PP153 : 200 / 100 = 2h
    charge_pp153 = calculator.calculate_of_charge_recursive(of_b, "PP_153")
    assert abs(charge_pp153 - 2.0) < 0.01  # 2h (charge de A)


def test_recursive_charge_cycle_detection():
    """Vérifie que les cycles dans les nomenclatures sont gérés."""
    from src.agents.organization.charge_calculator import ChargeCalculator
    from src.models.nomenclature import Nomenclature, NomenclatureEntry, TypeArticle

    loader = MagicMock()

    # Gamme simple
    gamme = MagicMock()
    gamme.operations = [
        MagicMock(poste_charge="PP_830", cadence=100.0)
    ]
    loader.get_gamme = lambda a: gamme if a == "ARTICLE_A" else None

    # Nomenclature avec cycle : A contient B, B contient A
    nom_a = MagicMock()
    entry_b_a = MagicMock()
    entry_b_a.article_composant = "ARTICLE_B"
    entry_b_a.qte_lien = 1.0
    entry_b_a.type_article = TypeArticle.FABRIQUE
    entry_b_a.is_fabrique.return_value = True
    nom_a.composants = [entry_b_a]

    nom_b = MagicMock()
    entry_a_b = MagicMock()
    entry_a_b.article_composant = "ARTICLE_A"
    entry_a_b.qte_lien = 1.0
    entry_a_b.type_article = TypeArticle.FABRIQUE
    entry_a_b.is_fabrique.return_value = True
    nom_b.composants = [entry_a_b]

    def mock_get_nomenclature(article):
        if article == "ARTICLE_A":
            return nom_a
        elif article == "ARTICLE_B":
            return nom_b
        return None

    loader.get_nomenclature = mock_get_nomenclature

    calculator = ChargeCalculator(loader)

    # OF pour ARTICLE_A : 100 unités
    of_a = MagicMock()
    of_a.article = "ARTICLE_A"
    of_a.qte_restante = 100

    # Ne doit pas boucler infiniment
    charge = calculator.calculate_of_charge_recursive(of_a, "PP_830")
    # La charge directe est 1h (100/100), et les composants ne devraient pas être comptés deux fois
    assert charge > 0  # Au moins la charge directe


def test_horizon_charge_with_recursion():
    """Teste le calcul d'horizon avec récursivité."""
    from src.agents.organization.charge_calculator import ChargeCalculator

    loader = MagicMock()

    # Mock simple avec gammes
    gamme_a = MagicMock()
    gamme_a.operations = [
        MagicMock(poste_charge="PP_153", cadence=100.0)
    ]

    def mock_get_gamme(article):
        return gamme_a
    loader.get_gamme = mock_get_gamme
    loader.get_nomenclature = lambda a: None  # Pas de nomenclature

    calculator = ChargeCalculator(loader)
    charges = calculator._calculate_article_charge_recursive("ARTICLE_A", 100.0, "PP_153")

    assert abs(charges - 1.0) < 0.01  # 100 unités / 100 cadence = 1h
