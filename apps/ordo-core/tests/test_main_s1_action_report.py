"""Tests d'intégration légers pour le rapport d'actions dans main_s1."""

from dataclasses import dataclass
from datetime import date

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


def test_main_s1_generates_action_report(monkeypatch, tmp_path):
    """Le flux S+1 génère bien le rapport d'actions quand un OF est bloquant."""
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
        from src.reports import write_action_report_markdown as real_writer
        real_writer(report, str(real_path))

    monkeypatch.setattr("src.main_s1.CommandeOFMatcher", FakeMatcher)
    monkeypatch.setattr("src.main_s1.ProjectedChecker", FakeProjectedChecker)
    monkeypatch.setattr("src.main_s1.AgentEngine", FakeAgentEngine)
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
    """Le flux S+1 génère le rapport même sans rupture composant si un article kanban est sous seuil."""
    of_1 = make_of("OF_1", "PF_1", 3, date(2026, 3, 26), qte_restante=100)
    commande = make_commande("CMD_1", "PF_1", date(2026, 3, 24), qte_restante=100)
    loader = make_loader(
        ofs=[of_1],
        commandes=[commande],
        receptions=[],
        nomenclatures={
            "PF_1": make_nomenclature("PF_1", [("MH7624", 1, "Fabriqué")]),
            "MH7624": make_nomenclature("MH7624", [("MH7623", 1, "Fabriqué")]),
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
        from src.reports import write_action_report_markdown as real_writer
        real_writer(report, str(real_path))

    monkeypatch.setattr("src.main_s1.CommandeOFMatcher", FakeMatcher)
    monkeypatch.setattr("src.main_s1.ProjectedChecker", FakeProjectedChecker)
    monkeypatch.setattr("src.main_s1.AgentEngine", FakeAgentEngine)
    monkeypatch.setattr("src.main_s1.format_rapport_s1", lambda *args, **kwargs: None)
    monkeypatch.setattr("src.main_s1.render_action_report_console", lambda report: None)
    monkeypatch.setattr("src.main_s1.write_action_report_markdown", fake_write_action_report_markdown)
    monkeypatch.setattr("src.agents.reports.DecisionReporter.generate_markdown_report", lambda *args, **kwargs: None)
    monkeypatch.setattr("src.agents.reports.DecisionReporter.generate_json_report", lambda *args, **kwargs: None)

    args = _Args()
    main_s1(args, loader, include_previsions=False)

    content = written["path"].read_text(encoding="utf-8")
    assert "Postes fournisseurs à maintenir en marche" in content
    assert "Articles kanban sous seuil" in content
    assert "MH7624" in content
    assert "PP_145" in content


def test_main_s1_uses_immediate_mode_when_requested(monkeypatch):
    """Le flux S+1 bascule sur ImmediateChecker si le mode est demandé."""
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
            raise AssertionError("ProjectedChecker ne doit pas être utilisé en mode immédiat")

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
