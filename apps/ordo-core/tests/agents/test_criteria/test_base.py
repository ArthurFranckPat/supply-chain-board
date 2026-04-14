"""Tests de l'interface BaseCriterion."""

import pytest
from src.agents.criteria.base import BaseCriterion
from src.agents.models import AgentContext, AgentAction
from src.models.of import OF


def test_base_criterion_has_required_attributes():
    """Test que BaseCriterion a les attributs requis."""
    assert hasattr(BaseCriterion, 'CRITERION_ID')
    assert hasattr(BaseCriterion, 'CRITERION_NAME')
    assert hasattr(BaseCriterion, 'DESCRIPTION')
    assert hasattr(BaseCriterion, 'score')
    assert hasattr(BaseCriterion, 'suggest_action')
    assert hasattr(BaseCriterion, 'is_applicable')


def test_base_criterion_is_abstract():
    """Test que BaseCriterion ne peut pas être instanciée directement."""
    with pytest.raises(TypeError):
        BaseCriterion({})


def test_concrete_criterion_implementation():
    """Test l'implémentation d'un critère concret."""

    class DummyCriterion(BaseCriterion):
        CRITERION_ID = "dummy"
        CRITERION_NAME = "Dummy"
        DESCRIPTION = "Dummy criterion for testing"

        def score(self, context):
            return 0.5

        def suggest_action(self, context, score):
            return None

    of = OF(
        num_of="F123",
        article="TEST",
        description="Test article",
        statut_num=1,
        statut_texte="Ferme",
        date_fin=None,
        qte_a_fabriquer=100,
        qte_fabriquee=0,
        qte_restante=100
    )
    context = AgentContext(of=of)

    criterion = DummyCriterion({})
    assert criterion.CRITERION_ID == "dummy"
    assert criterion.score(context) == 0.5
    assert criterion.is_applicable(context) is True
