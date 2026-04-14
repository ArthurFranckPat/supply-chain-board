"""Tests pour les flags CLI --llm et les OFs concurrents."""
import pytest
import subprocess
import sys
import os
from datetime import date
from argparse import Namespace
from unittest.mock import MagicMock, patch


class TestLLMCLIFlags:
    """Test que les flags --llm et --llm-model sont parsés correctement."""

    def test_main_accepte_flag_llm(self):
        """main.py doit accepter --llm dans le help."""
        result = subprocess.run(
            [sys.executable, "-m", "src.main", "--help"],
            capture_output=True, text=True,
            cwd="/Users/arthurbledou/Desktop/Code/ordo v2"
        )
        assert "--llm" in result.stdout

    def test_main_accepte_flag_llm_model(self):
        """main.py doit accepter --llm-model dans le help."""
        result = subprocess.run(
            [sys.executable, "-m", "src.main", "--help"],
            capture_output=True, text=True,
            cwd="/Users/arthurbledou/Desktop/Code/ordo v2"
        )
        assert "--llm-model" in result.stdout

    def test_decision_engine_accepte_use_llm_true_avec_loader(self):
        """AgentEngine doit pouvoir être créé avec use_llm=True, llm_client, et loader."""
        import shutil
        import tempfile
        with patch.dict(os.environ, {"MISTRAL_API_KEY": "fake-key-for-test"}):
            with patch("src.agents.llm.mistral_client.Mistral"):
                from src.agents.llm.mistral_client import MistralLLMClient
                from src.agents.engine import AgentEngine

                with tempfile.TemporaryDirectory() as tmp_dir:
                    config_dir = os.path.join(tmp_dir, "config")
                    os.makedirs(config_dir)
                    shutil.copy(
                        "/Users/arthurbledou/Desktop/Code/ordo v2/config/decisions.yaml",
                        os.path.join(config_dir, "decisions.yaml")
                    )
                    old_cwd = os.getcwd()
                    try:
                        os.chdir(tmp_dir)
                        llm_client = MistralLLMClient(model="mistral-large-latest")
                        engine = AgentEngine(
                            "config/decisions.yaml",
                            use_llm=True,
                            llm_client=llm_client,
                            loader=MagicMock()
                        )
                        assert engine.use_llm is True
                        assert engine.llm_rule is not None
                    finally:
                        os.chdir(old_cwd)


# ---------------------------------------------------------------------------
# Tests Task 5 : OFs concurrents dans le contexte LLM
# ---------------------------------------------------------------------------


class TestCompetingOFsInPrompt:
    """Test que les OFs concurrents apparaissent dans le contexte LLM."""

    def test_context_builder_accepte_competing_ofs(self):
        """LLMContextBuilder.build_context() doit accepter competing_ofs."""
        import inspect
        from src.agents.llm.context_builder import LLMContextBuilder
        sig = inspect.signature(LLMContextBuilder.build_context)
        assert "competing_ofs" in sig.parameters

    def test_prompt_inclut_section_concurrence(self):
        """Le prompt doit inclure les OFs concurrents quand competing_ofs_summary est présent."""
        from src.agents.llm.prompt_builder import LLMPromptBuilder

        builder = LLMPromptBuilder()
        context = {
            "of_info": {
                "num_of": "F001", "article": "ART001", "quantite": 100,
                "date_fin": "2026-03-30", "statut": "Ferme"
            },
            "commande_info": None,
            "composants": [],
            "composants_critiques": [],
            "situation_globale": {
                "faisabilite": "faisable_avec_conditions",
                "raison_blocage": "Composants en contrôle qualité",
                "conditions_deblocage": ["Débloquer COMP01"],
                "delai_estime": "2-3 jours"
            },
            "competing_ofs_summary": {
                "nb_competing": 2,
                "of_plus_urgent": "F002",
                "date_plus_urgent": "2026-03-28"
            }
        }

        prompt = builder.build_decision_prompt(context)

        assert "concurrent" in prompt.lower() or "concurrence" in prompt.lower() or "F002" in prompt

    def test_llm_analysis_context_a_competing_ofs_summary(self):
        """LLMAnalysisContext doit avoir le champ competing_ofs_summary."""
        from src.agents.llm.models import LLMAnalysisContext, OFInfo, SituationGlobale, CompetingOFsSummary

        context = LLMAnalysisContext(
            of_info=OFInfo(
                num_of="F001", article="ART001", description="Test",
                quantite=100, date_fin=date(2026, 4, 1), statut="Ferme"
            ),
            commande_info=None,
            composants=[],
            composants_critiques=[],
            situation_globale=SituationGlobale(
                faisabilite="faisable", raison_blocage=None
            ),
            competing_ofs_summary=CompetingOFsSummary(
                nb_competing=3,
                of_plus_urgent="F999",
                date_plus_urgent=date(2026, 3, 25)
            )
        )

        assert context.competing_ofs_summary.nb_competing == 3
        assert context.competing_ofs_summary.of_plus_urgent == "F999"
