"""Tests pour ComponentAnalyzer."""

from unittest.mock import MagicMock
from src.agents.scheduling.component_analyzer import ComponentAnalyzer


def _make_nomenclature(components):
    nom = MagicMock()
    nom.composants = [MagicMock(article_composant=c) for c in components]
    return nom


def test_jaccard_identical():
    loader = MagicMock()
    loader.get_nomenclature.side_effect = lambda a: _make_nomenclature(["C1", "C2", "C3"])
    analyzer = ComponentAnalyzer(loader)
    assert analyzer.jaccard_similarity("ART1", "ART2") == 1.0


def test_jaccard_no_overlap():
    loader = MagicMock()
    def nom(a):
        if a == "ART1":
            return _make_nomenclature(["C1", "C2"])
        return _make_nomenclature(["C3", "C4"])
    loader.get_nomenclature.side_effect = nom
    analyzer = ComponentAnalyzer(loader)
    assert analyzer.jaccard_similarity("ART1", "ART2") == 0.0


def test_jaccard_partial_overlap():
    loader = MagicMock()
    def nom(a):
        if a == "ART1":
            return _make_nomenclature(["C1", "C2", "C3"])
        return _make_nomenclature(["C2", "C3", "C4"])
    loader.get_nomenclature.side_effect = nom
    analyzer = ComponentAnalyzer(loader)
    # intersection=2, union=4 → 0.5
    assert analyzer.jaccard_similarity("ART1", "ART2") == 0.5


def test_overlap_score_with_scheduled_articles():
    loader = MagicMock()
    def nom(a):
        return _make_nomenclature({"ART1": ["C1","C2"], "ART2": ["C1","C3"], "ART3": ["C4","C5"]}[a])
    loader.get_nomenclature.side_effect = nom
    analyzer = ComponentAnalyzer(loader)
    # ART3 vs {ART1, ART2} → 0.0 overlap
    score = analyzer.overlap_score("ART3", scheduled_articles=["ART1", "ART2"])
    assert score == 0.0
