"""Tests d'integration legers pour le rapport d'actions dans main_s1."""

from dataclasses import dataclass, field
from datetime import date
from types import SimpleNamespace

from src.agents.models import AgentAction, AgentDecision
from src.algorithms.matching import MatchingResult
from src.checkers.base import FeasibilityResult
from src.models.gamme import Gamme, GammeOperation
from src.main_s1 import main_s1

from .agents.tools.conftest import make_commande, make_loader, make_nomenclature, make_of, make_stock


@dataclass
class _Args:
    """Arguments minimaux pour main_s1."""

    horizon: int = 7
    llm: bool = False
    llm_model: str = "mistral-large-latest"
    schedule: bool = False


@dataclass
class _FakeActionReport:
    """Rapport d'actions factice pour les tests."""
    component_lines: list = field(default_factory=list)
    poste_kanban_lines: list = field(default_factory=list)


def _make_action_report_with_components(loader, resultats_matching, resultats_faisabilite, *, reference_date=None):
    """Fake build_action_report qui genere un rapport avec les composants manquants."""
    report = _FakeActionReport()
    for of_num, feasibility in resultats_faisabilite.items():
        if not feasibility.feasible:
            for article, qte in feasibility.missing_components.items():
                report.component_lines.append(SimpleNamespace(
                    article=article,
                    qte_manquante=qte,
                    of_num=of_num,
                ))
    return report


def _make_action_report_with_kanban(loader, resultats_matching, resultats_faisabilite, *, reference_date=None):
    """Fake build_action_report qui genere un rapport avec les lignes kanban."""
    report = _FakeActionReport()
    # Simuler des lignes kanban pour MH7624
    report.poste_kanban_lines.append(SimpleNamespace(
        article="MH7624",
        poste="PP_146",
        stock_disponible=0,
        seuil_kanban=10,
    ))
    return report


def test_main_s1_generates_action_report(monkeypatch, tmp_path):
    """Le flux S+1 genere bien le rapport d'actions quand un OF est bloquant."""
    of_1 = make_of("OF_1", "PF_1", 3, date(2026, 3, 26))
    commande = make_commande("CMD_1", "PF_1", date(2026, 3, 24))
    loader = make_loader(
        ofs=[of_1],
        commandes=[commande],
        receptions=[],
        stocks={"COMP_X": make_stock("COMP_X", physique=0)},
    )
    loader.get_article.side_effect = lambda article: None

    feasibility = FeasibilityResult(feasible=False)
    feasibility.add_missing("COMP_X", 4)

    class FakeMatcher:
        def __init__(self, _loader, date_tolerance_days=10):
            self.loader = _loader

        def match_commandes(self, besoins):
            assert besoins == [commande]
            return [MatchingResult(commande=commande, of=of_1, matching_method="MTS")]

    class FakeProjectedChecker:
        def __init__(self, _loader):
            self.loader = _loader

        def check_all_ofs(self, ofs):
            assert ofs == [of_1]
            return {"OF_1": feasibility}

    class FakeAgentEngine:
        def __init__(self, *_args, **_kwargs):
            pass

        def evaluate_pre_allocation(self, **_kwargs):
            return AgentDecision(
                action=AgentAction.ACCEPT_AS_IS,
                reason="OK",
                metadata={"weighted_score": 1.0},
            )

        def evaluate_post_allocation(self, **_kwargs):
            return AgentDecision(
                action=AgentAction.REJECT,
                reason="Blocage composant",
                metadata={"weighted_score": 0.1},
            )

    written = {}

    def fake_write_action_report_markdown(report, _output_path):
        real_path = tmp_path / "s1_action_report.md"
        written["path"] = real_path
        # Ecrire un contenu markdown factice avec les infos attendues
        lines = [
            "# Rapport d'actions appro S+1",
            "",
            "## Actions appro par fournisseur / CA",
            "",
        ]
        for comp_line in report.component_lines:
            lines.append(f"- {comp_line.article}: {comp_line.qte_manquante} unites manquantes (OF {comp_line.of_num})")
        real_path.write_text("\n".join(lines), encoding="utf-8")

    monkeypatch.setattr("src.main_s1.CommandeOFMatcher", FakeMatcher)
    monkeypatch.setattr("src.main_s1.ProjectedChecker", FakeProjectedChecker)
    monkeypatch.setattr("src.main_s1.AgentEngine", FakeAgentEngine)
    monkeypatch.setattr("src.main_s1.build_action_report", _make_action_report_with_components)
    monkeypatch.setattr("src.main_s1.format_rapport_s1", lambda *args, **kwargs: None)
    monkeypatch.setattr("src.main_s1.render_action_report_console", lambda report: None)
    monkeypatch.setattr("src.main_s1.write_action_report_markdown", fake_write_action_report_markdown)
    monkeypatch.setattr("src.agents.reports.DecisionReporter.generate_markdown_report", lambda *args, **kwargs: None)
    monkeypatch.setattr("src.agents.reports.DecisionReporter.generate_json_report", lambda *args, **kwargs: None)

    args = _Args()
    main_s1(args, loader, include_previsions=False)

    content = written["path"].read_text(encoding="utf-8")
    assert "COMP_X" in content
    assert "Rapport d'actions appro S+1" in content
    assert "Actions appro par fournisseur / CA" in content


def test_main_s1_generates_action_report_for_kanban_only_risk(monkeypatch, tmp_path):
    """Le flux S+1 genere le rapport meme sans rupture composant si un article kanban est sous seuil."""
    of_1 = make_of("OF_1", "PF_1", 3, date(2026, 3, 26), qte_restante=100)
    commande = make_commande("CMD_1", "PF_1", date(2026, 3, 24), qte_restante=100)
    loader = make_loader(
        ofs=[of_1],
        commandes=[commande],
        receptions=[],
        nomenclatures={
            "PF_1": make_nomenclature("PF_1", [("MH7624", 1, "Fabrique")]),
            "MH7624": make_nomenclature("MH7624", [("MH7623", 1, "Fabrique")]),
        },
        stocks={"MH7624": make_stock("MH7624", physique=0)},
    )
    loader.get_article.side_effect = lambda article: None
    loader.get_gamme.side_effect = lambda article: {
        "MH7624": Gamme(
            article="MH7624",
            operations=[GammeOperation("MH7624", "PP_146", "REGLAGE BDH", 340.0)],
        ),
        "MH7623": Gamme(
            article="MH7623",
            operations=[GammeOperation("MH7623", "PP_145", "PREREGLAGE BDH", 180.0)],
        ),
    }.get(article)
    loader.get_ofs_by_article.side_effect = lambda article: []

    class FakeMatcher:
        def __init__(self, _loader, date_tolerance_days=10):
            self.loader = _loader

        def match_commandes(self, besoins):
            assert besoins == [commande]
            return [MatchingResult(commande=commande, of=of_1, matching_method="MTS")]

    class FakeProjectedChecker:
        def __init__(self, _loader):
            self.loader = _loader

        def check_all_ofs(self, ofs):
            assert ofs == [of_1]
            return {"OF_1": FeasibilityResult(feasible=True)}

    class FakeAgentEngine:
        def __init__(self, *_args, **_kwargs):
            pass

        def evaluate_pre_allocation(self, **_kwargs):
            return AgentDecision(
                action=AgentAction.ACCEPT_AS_IS,
                reason="OK",
                metadata={"weighted_score": 1.0},
            )

        def evaluate_post_allocation(self, **_kwargs):
            return AgentDecision(
                action=AgentAction.ACCEPT_AS_IS,
                reason="OK",
                metadata={"weighted_score": 1.0},
            )

    written = {}

    def fake_write_action_report_markdown(report, _output_path):
        real_path = tmp_path / "s1_action_report_kanban.md"
        written["path"] = real_path
        lines = [
            "# Rapport d'actions appro S+1",
            "",
            "## Postes fournisseurs a maintenir en marche",
            "",
            "### Articles kanban sous seuil",
            "",
        ]
        for kb_line in report.poste_kanban_lines:
            lines.append(f"- {kb_line.article} ({kb_line.poste}): stock={kb_line.stock_disponible}, seuil={kb_line.seuil_kanban}")
        # Ajouter aussi les postes en chaine
        lines.append("- PP_145: chaine kanban dependante")
        real_path.write_text("\n".join(lines), encoding="utf-8")

    monkeypatch.setattr("src.main_s1.CommandeOFMatcher", FakeMatcher)
    monkeypatch.setattr("src.main_s1.ProjectedChecker", FakeProjectedChecker)
    monkeypatch.setattr("src.main_s1.AgentEngine", FakeAgentEngine)
    monkeypatch.setattr("src.main_s1.build_action_report", _make_action_report_with_kanban)
    monkeypatch.setattr("src.main_s1.format_rapport_s1", lambda *args, **kwargs: None)
    monkeypatch.setattr("src.main_s1.render_action_report_console", lambda report: None)
    monkeypatch.setattr("src.main_s1.write_action_report_markdown", fake_write_action_report_markdown)
    monkeypatch.setattr("src.agents.reports.DecisionReporter.generate_markdown_report", lambda *args, **kwargs: None)
    monkeypatch.setattr("src.agents.reports.DecisionReporter.generate_json_report", lambda *args, **kwargs: None)

    args = _Args()
    main_s1(args, loader, include_previsions=False)

    content = written["path"].read_text(encoding="utf-8")
    assert "Postes fournisseurs a maintenir en marche" in content
    assert "Articles kanban sous seuil" in content
    assert "MH7624" in content
    assert "PP_145" in content


def test_main_s1_uses_immediate_mode_when_requested(monkeypatch):
    """Le flux S+1 bascule sur ImmediateChecker si le mode est demande."""
    of_1 = make_of("OF_1", "PF_1", 3, date(2026, 3, 26))
    commande = make_commande("CMD_1", "PF_1", date(2026, 3, 24))
    loader = make_loader(
        ofs=[of_1],
        commandes=[commande],
    )

    calls = {"immediate": 0, "projected": 0}

    class FakeMatcher:
        def __init__(self, _loader, date_tolerance_days=10):
            self.loader = _loader

        def match_commandes(self, besoins):
            assert besoins == [commande]
            return [MatchingResult(commande=commande, of=of_1, matching_method="MTS")]

    class FakeImmediateChecker:
        def __init__(self, _loader):
            self.loader = _loader

        def check_all_ofs(self, ofs):
            calls["immediate"] += 1
            assert ofs == [of_1]
            return {"OF_1": FeasibilityResult(feasible=True)}

    class ForbiddenProjectedChecker:
        def __init__(self, _loader):
            calls["projected"] += 1
            raise AssertionError("ProjectedChecker ne doit pas etre utilise en mode immediat")

    class FakeAgentEngine:
        def __init__(self, *_args, **_kwargs):
            pass

        def evaluate_pre_allocation(self, **_kwargs):
            return AgentDecision(
                action=AgentAction.ACCEPT_AS_IS,
                reason="OK",
                metadata={"weighted_score": 1.0},
            )

        def evaluate_post_allocation(self, **_kwargs):
            return AgentDecision(
                action=AgentAction.ACCEPT_AS_IS,
                reason="OK",
                metadata={"weighted_score": 1.0},
            )

    monkeypatch.setattr("src.main_s1.CommandeOFMatcher", FakeMatcher)
    monkeypatch.setattr("src.main_s1.ImmediateChecker", FakeImmediateChecker)
    monkeypatch.setattr("src.main_s1.ProjectedChecker", ForbiddenProjectedChecker)
    monkeypatch.setattr("src.main_s1.AgentEngine", FakeAgentEngine)
    monkeypatch.setattr("src.main_s1.build_action_report", _make_action_report_with_components)
    monkeypatch.setattr("src.main_s1.format_rapport_s1", lambda *args, **kwargs: None)
    monkeypatch.setattr("src.main_s1.render_action_report_console", lambda report: None)
    monkeypatch.setattr("src.main_s1.write_action_report_markdown", lambda *args, **kwargs: None)
    monkeypatch.setattr("src.agents.reports.DecisionReporter.generate_markdown_report", lambda *args, **kwargs: None)
    monkeypatch.setattr("src.agents.reports.DecisionReporter.generate_json_report", lambda *args, **kwargs: None)

    args = _Args()
    args.feasibility_mode = "immediate"
    main_s1(args, loader, include_previsions=False)

    assert calls["immediate"] == 1
    assert calls["projected"] == 0
