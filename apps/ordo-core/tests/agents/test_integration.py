"""Tests d'integration de la couche decision metier."""

import json
import os

import pytest
from datetime import date, timedelta
from types import SimpleNamespace

from src.agents.engine import AgentEngine
from src.algorithms.allocation import AllocationManager
from src.checkers.recursive import RecursiveChecker
from src.models.of import OF
from src.models.stock import Stock
from src.models.nomenclature import Nomenclature, NomenclatureEntry, TypeArticle
from src.models.allocation import OFAllocation


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_nomenclature(parent, components):
    """Cree une nomenclature simple. components: list of (code, qte, TypeArticle)."""
    return Nomenclature(
        article=parent,
        designation=f"DESC_{parent}",
        composants=[
            NomenclatureEntry(
                article_parent=parent,
                designation_parent=f"DESC_{parent}",
                niveau=10,
                article_composant=code,
                designation_composant=f"DESC_{code}",
                qte_lien=qte,
                type_article=type_article,
            )
            for code, qte, type_article in components
        ],
    )


def _make_loader(stocks=None, nomenclatures=None, allocations=None):
    """Cree un SimpleNamespace imitant DataLoader."""
    stocks = stocks or {}
    nomenclatures = nomenclatures or {}
    allocations = allocations or {}

    return SimpleNamespace(
        commandes_clients=[],
        ofs=[],
        stocks=stocks,
        nomenclatures=nomenclatures,
        get_article=lambda article: None,
        get_nomenclature=lambda article: nomenclatures.get(article),
        get_stock=lambda article: stocks.get(article),
        get_allocations_of=lambda num_doc: allocations.get(num_doc, []),
        get_ofs_by_article=lambda article, statut=None, date_besoin=None: [],
        get_receptions=lambda article: [],
    )


@pytest.fixture
def full_system_with_decision():
    """Setup un systeme complet avec AgentEngine."""
    stocks = {
        "COMP_A": Stock("COMP_A", stock_physique=200, stock_alloue=0, stock_bloque=0),
    }
    nomenclatures = {
        "TEST_ART": _make_nomenclature("TEST_ART", [
            ("COMP_A", 1.0, TypeArticle.ACHETE),
        ]),
        "TEST": _make_nomenclature("TEST", [
            ("COMP_A", 1.0, TypeArticle.ACHETE),
        ]),
    }

    loader = _make_loader(stocks=stocks, nomenclatures=nomenclatures)

    checker = RecursiveChecker(loader, use_receptions=False)
    decision_engine = AgentEngine("config/decisions.yaml")

    allocation_manager = AllocationManager(
        data_loader=loader,
        checker=checker,
        decision_engine=decision_engine
    )

    return allocation_manager


def test_pre_allocation_accept_partial(full_system_with_decision):
    """Test le flux complet d'acceptation partielle."""

    # Creer un OF de test
    of = OF(
        num_of="F-TEST-001",
        article="TEST_ART",
        description="Test OF",
        statut_num=3,
        statut_texte="Suggere",
        date_fin=date.today() + timedelta(days=10),
        qte_a_fabriquer=147,
        qte_fabriquee=0,
        qte_restante=147
    )

    # Lancer l'allocation
    results = full_system_with_decision.allocate_stock([of])

    # Verifier les resultats
    assert "F-TEST-001" in results
    result = results["F-TEST-001"]

    # Verifier qu'une decision a ete prise
    assert result.decision is not None

    # Verifier les metadonnees
    assert "weighted_score" in result.decision.metadata
    assert "criteria_scores" in result.decision.metadata


def test_decision_persistence_integration(tmp_path):
    """Test que les decisions sont persistees quand la persistance est activee."""
    from src.agents.persistence import DecisionPersistence

    stocks = {
        "COMP_A": Stock("COMP_A", stock_physique=200, stock_alloue=0, stock_bloque=0),
    }
    nomenclatures = {
        "TEST": _make_nomenclature("TEST", [
            ("COMP_A", 1.0, TypeArticle.ACHETE),
        ]),
    }

    loader = _make_loader(stocks=stocks, nomenclatures=nomenclatures)
    checker = RecursiveChecker(loader, use_receptions=False)

    # Activer la persistance avec un fichier temporaire
    history_path = str(tmp_path / "decisions_history.json")

    decision_engine = AgentEngine("config/decisions.yaml", persistence_enabled=True)
    # Redefinir le chemin de persistance vers le temp directory
    decision_engine.persistence = DecisionPersistence(
        file_path=history_path,
        max_entries=10000,
    )

    allocation_manager = AllocationManager(
        data_loader=loader,
        checker=checker,
        decision_engine=decision_engine
    )

    # Lancer une allocation
    of = OF(
        num_of="F-TEST-002",
        article="TEST",
        description="Test OF",
        statut_num=3,
        statut_texte="Suggere",
        date_fin=date.today(),
        qte_a_fabriquer=100,
        qte_fabriquee=0,
        qte_restante=100
    )
    allocation_manager.allocate_stock([of])

    # Verifier que le fichier d'historique existe
    assert os.path.exists(history_path)

    # Verifier le contenu
    with open(history_path, "r") as f:
        history = json.load(f)

    # Verifier qu'on a notre decision
    assert any(entry.get("of_num") == "F-TEST-002" for entry in history)


def test_report_generation(full_system_with_decision, tmp_path):
    """Test la generation de rapports."""
    from src.agents.reports import DecisionReporter
    import os

    # Lancer une allocation
    of = OF(
        num_of="F-TEST-003",
        article="TEST",
        description="Test OF",
        statut_num=3,
        statut_texte="Suggere",
        date_fin=date.today(),
        qte_a_fabriquer=100,
        qte_fabriquee=0,
        qte_restante=100
    )
    results = full_system_with_decision.allocate_stock([of])

    # Generer les rapports
    reporter = DecisionReporter()

    md_path = str(tmp_path / "report.md")
    json_path = str(tmp_path / "report.json")

    reporter.generate_markdown_report(results, md_path)
    reporter.generate_json_report(results, json_path)

    # Verifier que les fichiers existent
    assert os.path.exists(md_path)
    assert os.path.exists(json_path)
