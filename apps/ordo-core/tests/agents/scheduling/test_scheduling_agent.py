"""Tests pour SchedulingAgent."""

from unittest.mock import MagicMock, patch
from datetime import date
from src.agents.scheduling.scheduling_agent import SchedulingAgent
from src.agents.scheduling.models import SchedulingConfig, SchedulingResult


def test_plan_schedule_returns_result():
    """plan_schedule() retourne un SchedulingResult même sans LLM."""
    loader = MagicMock()
    loader.commandes_clients = []
    loader.get_gammes.return_value = []
    loader.get_nomenclature.return_value = None

    agent = SchedulingAgent(loader=loader, config=SchedulingConfig(), llm_client=None)
    result = agent.plan_schedule(
        s1_feasible_ofs=[],
        feasibility_results={},
        reference_date=date(2026, 3, 23)
    )
    assert isinstance(result, SchedulingResult)


def test_plan_schedule_detects_stockouts():
    """Les composants en rupture sont identifiés depuis les résultats S+1."""
    loader = MagicMock()
    loader.commandes_clients = []
    loader.get_gammes.return_value = []

    feas_result = MagicMock()
    feas_result.feasible = False
    feas_result.missing_components = {"COMP01": 50}

    agent = SchedulingAgent(loader=loader, config=SchedulingConfig(), llm_client=None)
    result = agent.plan_schedule(
        s1_feasible_ofs=[],
        feasibility_results={"F001": feas_result},
        reference_date=date(2026, 3, 23)
    )
    assert "COMP01" in result.stockout_components


def test_prompt_builder_includes_gap_info():
    """Le prompt LLM inclut les postes en gap et les candidats."""
    from src.agents.scheduling.prompt_builder import SchedulingPromptBuilder
    builder = SchedulingPromptBuilder()
    prompt = builder.build_prompt(
        gaps={"PP_830": 12.5},
        candidates=[{"of": "F001", "commande": "C1", "heures": 7.0, "score": 0.75}],
        stockout_components=["COMP01"]
    )
    assert "PP_830" in prompt
    assert "12.5" in prompt
    assert "COMP01" in prompt
