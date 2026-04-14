"""Tests pour les corrections de bugs mineurs LLM."""
import pytest
import shutil
import os
from datetime import date, timedelta
from unittest.mock import MagicMock

from src.agents.llm.context_builder import LLMContextBuilder
from src.agents.llm.mistral_client import MistralLLMClient
from src.agents.llm.response_parser import LLMResponseParser, ParsedLLMDecision


class TestCalculerUrgence:
    """Test que _calculer_urgence utilise current_date, pas date.today()."""

    def test_urgence_utilise_current_date_pas_today(self):
        """_calculer_urgence doit utiliser la date passée en paramètre."""
        builder = LLMContextBuilder(loader=MagicMock())
        current_date = date(2030, 1, 1)
        future_expedition = date(2030, 1, 3)  # dans 2 jours par rapport à current_date

        urgence = builder._calculer_urgence(future_expedition, current_date=current_date)

        assert urgence == "TRÈS ÉLEVÉE"  # delta = 2 jours

    def test_urgence_avec_date_today_par_defaut(self):
        """_calculer_urgence sans current_date doit fonctionner (utilise date.today())."""
        builder = LLMContextBuilder(loader=MagicMock())
        far_future = date(2099, 12, 31)

        urgence = builder._calculer_urgence(far_future)

        assert urgence == "FAIBLE"


class TestMistralTemperature:
    """Test que MistralLLMClient a temperature=0.0 par défaut."""

    def test_temperature_default_zero(self):
        """La température par défaut doit être 0.0 pour le déterminisme."""
        import inspect
        sig = inspect.signature(MistralLLMClient.__init__)
        default_temp = sig.parameters["temperature"].default
        assert default_temp == 0.0, f"temperature par défaut doit être 0.0, got {default_temp}"


class TestValidateDecisionConfidence:
    """Test que validate_decision accepte confidence < 0.5."""

    def test_decision_confidence_0_3_est_valide(self):
        """Une décision avec confidence=0.3 est valide (cas ambigu légitime)."""
        parser = LLMResponseParser()
        decision = ParsedLLMDecision(
            action="REJECT",
            reason="Rupture de stock",
            modified_quantity=None,
            defer_date=None,
            action_required="Contacter fournisseur",
            confidence=0.3,
            metadata={}
        )

        assert parser.validate_decision(decision) is True

    def test_decision_confidence_0_0_est_invalide(self):
        """Une décision avec confidence=0.0 reste invalide (pas de décision)."""
        parser = LLMResponseParser()
        decision = ParsedLLMDecision(
            action="REJECT",
            reason="Rupture de stock",
            modified_quantity=None,
            defer_date=None,
            action_required="Contacter fournisseur",
            confidence=0.0,
            metadata={}
        )

        assert parser.validate_decision(decision) is False


class TestAgentEngineDefaultConfig:
    """Test configuration par défaut du AgentEngine."""

    def test_use_llm_false_par_defaut(self, tmp_path):
        """AgentEngine() sans use_llm doit avoir use_llm=False."""
        src_config = "/Users/arthurbledou/Desktop/Code/ordo v2/config/decisions.yaml"
        config_dir = tmp_path / "config"
        config_dir.mkdir()
        shutil.copy(src_config, config_dir / "decisions.yaml")

        old_cwd = os.getcwd()
        try:
            os.chdir(tmp_path)
            from src.agents.engine import AgentEngine
            engine = AgentEngine()
            assert engine.use_llm is False
        finally:
            os.chdir(old_cwd)


# ---------------------------------------------------------------------------
# Tests Task 2 : Réceptions fournisseurs dans le contexte LLM
# ---------------------------------------------------------------------------

from src.models.reception import Reception


class TestReceptionsInContext:
    """Test que les réceptions fournisseurs apparaissent dans le contexte LLM."""

    def _make_loader_with_reception(self, article: str, qte: int, jours: int):
        """Crée un loader mock avec une réception planifiée."""
        loader = MagicMock()
        reception = Reception(
            num_commande="CMD001",
            article=article,
            code_fournisseur="FOUR01",
            quantite_restante=qte,
            date_reception_prevue=date.today() + timedelta(days=jours)
        )
        loader.get_receptions.return_value = [reception]
        loader.get_stock.return_value = MagicMock(
            stock_physique=0, stock_alloue=0, stock_bloque=0
        )
        return loader

    def test_composant_analyse_a_champ_receptions_imminentes(self):
        """ComposantAnalyse doit avoir le champ receptions_imminentes."""
        from src.agents.llm.models import ComposantAnalyse
        comp = ComposantAnalyse(
            article="A001",
            niveau=5,
            type_article="Acheté",
            quantite_requise=100,
            stock_physique=0,
            stock_alloue_total=0,
            stock_alloue_cet_of=0,
            stock_bloque=0,
            stock_disponible=0,
            stock_net_pour_of=0,
            situation="rupture",
            ratio_couverture=0.0,
            receptions_imminentes=80,
            date_reception_prochaine=date.today() + timedelta(days=3)
        )
        assert comp.receptions_imminentes == 80
        assert comp.date_reception_prochaine is not None

    def test_situation_globale_faisable_apres_reception(self):
        """_analyser_situation_globale retourne faisable_apres_reception si réceptions couvrent le manque."""
        from src.agents.llm.models import ComposantAnalyse, ComposantCritique
        from src.agents.llm.context_builder import LLMContextBuilder

        comp = ComposantAnalyse(
            article="A001",
            niveau=5,
            type_article="Acheté",
            quantite_requise=100,
            stock_physique=0,
            stock_alloue_total=0,
            stock_alloue_cet_of=0,
            stock_bloque=0,
            stock_disponible=0,
            stock_net_pour_of=0,
            situation="rupture",
            ratio_couverture=0.0,
            receptions_imminentes=120,
            date_reception_prochaine=date.today() + timedelta(days=2)
        )
        comp_critique = ComposantCritique(
            article="A001",
            niveau=5,
            type_probleme="rupture",
            gravite="critique",
            description="Rupture mais réception imminente",
            action_suggeree="attendre_reception",
            details={"receptions_imminentes": 120, "date_reception": date.today() + timedelta(days=2)}
        )

        builder = LLMContextBuilder(loader=MagicMock())
        of_mock = MagicMock()
        of_mock.date_fin = date.today() + timedelta(days=7)

        situation = builder._analyser_situation_globale(
            [comp], [comp_critique], of_mock, current_date=date.today()
        )

        assert situation.faisabilite == "faisable_apres_reception"

        # NOTE : A l'étape 2 (verify tests fail), ce test échouera avec AttributeError
        # (champ receptions_imminentes inexistant) — c'est normal, le test est rouge.
        # Il passera après Task 2 Step 3 (ajout du champ).

    def test_prompt_inclut_colonne_reception(self):
        """Le prompt généré doit inclure les informations de réception."""
        from src.agents.llm.prompt_builder import LLMPromptBuilder

        builder = LLMPromptBuilder()
        context = {
            "of_info": {
                "num_of": "F001",
                "article": "ART001",
                "quantite": 100,
                "date_fin": "2026-03-30",
                "statut": "Ferme"
            },
            "commande_info": None,
            "composants": [{
                "article": "COMP01",
                "niveau": 5,
                "type_article": "Acheté",
                "quantite_requise": 100,
                "stock_physique": 0,
                "stock_alloue_total": 0,
                "stock_alloue_cet_of": 0,
                "stock_bloque": 0,
                "stock_disponible": 0,
                "stock_net_pour_of": 0,
                "situation": "rupture",
                "ratio_couverture": 0.0,
                "receptions_imminentes": 120,
                "date_reception_prochaine": "2026-03-25"
            }],
            "composants_critiques": [],
            "situation_globale": {
                "faisabilite": "faisable_apres_reception",
                "raison_blocage": None,
                "conditions_deblocage": [],
                "delai_estime": "2 jours"
            }
        }

        prompt = builder.build_decision_prompt(context)

        # Le prompt doit mentionner la réception (quantité ou date)
        assert "120" in prompt or "2026-03-25" in prompt or "Récept" in prompt


# ---------------------------------------------------------------------------
# Tests Task 3 : Pré-filtre LLM
# ---------------------------------------------------------------------------

from src.agents.models import AgentAction


class TestPreFiltreOff:
    """Test que le pré-filtre évite les appels LLM inutiles."""

    def _make_context_faisable(self):
        from src.agents.llm.models import (
            LLMAnalysisContext, OFInfo, SituationGlobale
        )
        return LLMAnalysisContext(
            of_info=OFInfo(
                num_of="F001", article="ART001", description="Test",
                quantite=100, date_fin=date(2026, 4, 1), statut="Ferme"
            ),
            commande_info=None,
            composants=[],
            composants_critiques=[],
            situation_globale=SituationGlobale(
                faisabilite="faisable",
                raison_blocage=None,
                conditions_deblocage=[],
                delai_estime=None
            )
        )

    def _make_context_non_faisable_hard(self):
        from src.agents.llm.models import (
            LLMAnalysisContext, OFInfo, SituationGlobale, ComposantCritique, ComposantAnalyse
        )
        comp = ComposantAnalyse(
            article="COMP01", niveau=5, type_article="Acheté",
            quantite_requise=100, stock_physique=0, stock_alloue_total=0,
            stock_alloue_cet_of=0, stock_bloque=0, stock_disponible=0,
            stock_net_pour_of=0, situation="rupture", ratio_couverture=0.0,
            receptions_imminentes=0, date_reception_prochaine=None
        )
        return LLMAnalysisContext(
            of_info=OFInfo(
                num_of="F002", article="ART002", description="Test",
                quantite=100, date_fin=date(2026, 4, 1), statut="Ferme"
            ),
            commande_info=None,
            composants=[comp],
            composants_critiques=[
                ComposantCritique(
                    article="COMP01", niveau=5, type_probleme="rupture",
                    gravite="critique", description="Rupture sèche",
                    action_suggeree="approvisionner", details={}
                )
            ],
            situation_globale=SituationGlobale(
                faisabilite="non_faisable",
                raison_blocage="Rupture sans perspective",
                conditions_deblocage=[],
                delai_estime=None
            )
        )

    def test_prefiltre_faisable_retourne_accept_sans_llm(self):
        """Si situation = faisable, retourner ACCEPT_AS_IS sans appeler le LLM."""
        from src.agents.llm.llm_decision_rule import LLMDecisionAgent
        llm_client = MagicMock()
        rule = LLMDecisionAgent(llm_client=llm_client)
        context = self._make_context_faisable()

        result = rule._apply_prefilter(context)

        assert result is not None
        assert result.action == AgentAction.ACCEPT_AS_IS
        llm_client.call_llm_with_retry.assert_not_called()

    def test_prefiltre_rupture_franche_retourne_reject_sans_llm(self):
        """Si situation = non_faisable sans bloqué ni réception, retourner REJECT sans LLM."""
        from src.agents.llm.llm_decision_rule import LLMDecisionAgent
        llm_client = MagicMock()
        rule = LLMDecisionAgent(llm_client=llm_client)
        context = self._make_context_non_faisable_hard()

        result = rule._apply_prefilter(context)

        assert result is not None
        assert result.action == AgentAction.REJECT

    def test_prefiltre_retourne_none_pour_cas_ambigu(self):
        """Si situation = faisable_avec_conditions, retourner None (appeler le LLM)."""
        from src.agents.llm.models import LLMAnalysisContext, OFInfo, SituationGlobale
        from src.agents.llm.llm_decision_rule import LLMDecisionAgent

        context = LLMAnalysisContext(
            of_info=OFInfo(
                num_of="F003", article="ART003", description="Test",
                quantite=100, date_fin=date(2026, 4, 1), statut="Ferme"
            ),
            commande_info=None,
            composants=[],
            composants_critiques=[],
            situation_globale=SituationGlobale(
                faisabilite="faisable_avec_conditions",
                raison_blocage="Stock en contrôle qualité",
                conditions_deblocage=["Débloquer COMP01"],
                delai_estime="2-3 jours"
            )
        )
        llm_client = MagicMock()
        rule = LLMDecisionAgent(llm_client=llm_client)

        result = rule._apply_prefilter(context)

        assert result is None  # Doit aller au LLM
