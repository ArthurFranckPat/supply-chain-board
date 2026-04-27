from datetime import date

import pytest

from suivi_commandes.domain.models import (
    CauseType,
    Emplacement,
    OrderLine,
    RetardCause,
    Status,
    TypeCommande,
)
from suivi_commandes.domain.services.action_recommender import (
    Action,
    recommend_actions,
)


def _line(**kwargs):
    defaults = dict(
        num_commande="CMD-001",
        article="ART-001",
        designation="Test",
        nom_client="Client",
        type_commande=TypeCommande.MTO,
        date_expedition=date(2024, 1, 15),
        qte_commandee=10.0,
        qte_allouee=0.0,
        qte_restante=10.0,
    )
    defaults.update(kwargs)
    return OrderLine(**defaults)


class TestAExpedier:
    def test_en_zone_expedition(self):
        line = _line(emplacements=[Emplacement("QUAI-A01", hum="HUM01")])
        acts = recommend_actions(
            Status.A_EXPEDIER,
            line,
            None,
            has_cq_alert=False,
            in_zone_expedition=True,
        )
        assert acts == [
            Action("Confirmer chargement", "info"),
            Action("Préparer BL", "info"),
        ]

    def test_hors_zone_expedition(self):
        line = _line(emplacements=[Emplacement("STOCK-B01")])
        acts = recommend_actions(
            Status.A_EXPEDIER,
            line,
            None,
            has_cq_alert=False,
            in_zone_expedition=False,
        )
        assert acts == [Action("Déplacer en zone d'expédition", "warning")]

    def test_sans_emplacement(self):
        line = _line(emplacements=[])
        acts = recommend_actions(
            Status.A_EXPEDIER,
            line,
            None,
            has_cq_alert=False,
            in_zone_expedition=False,
        )
        assert acts == [Action("Déplacer en zone d'expédition", "warning")]


class TestAllocationAFaire:
    def test_sans_cq_alert(self):
        line = _line(qte_restante=5.0, qte_allouee=2.0)
        acts = recommend_actions(
            Status.ALLOCATION_A_FAIRE,
            line,
            None,
            has_cq_alert=False,
            in_zone_expedition=False,
        )
        assert len(acts) == 1
        assert acts[0].label == "Allouer 3 unités à la commande CMD-001"
        assert acts[0].severity == "info"

    def test_avec_cq_alert(self):
        line = _line()
        acts = recommend_actions(
            Status.ALLOCATION_A_FAIRE,
            line,
            None,
            has_cq_alert=True,
            in_zone_expedition=False,
        )
        assert acts == [Action("Libérer la CQ avant allocation", "warning")]


class TestRetardProd:
    def test_stock_disponible_non_alloue(self):
        cause = RetardCause(
            type_cause=CauseType.STOCK_DISPONIBLE_NON_ALLOUE,
            message="Stock dispo",
        )
        acts = recommend_actions(
            Status.RETARD_PROD,
            _line(),
            cause,
            has_cq_alert=False,
            in_zone_expedition=False,
        )
        assert acts == [Action("Allouer immédiatement le stock", "warning")]

    def test_aucun_of_planifie(self):
        cause = RetardCause(
            type_cause=CauseType.AUCUN_OF_PLANIFIE,
            message="Aucun OF",
        )
        acts = recommend_actions(
            Status.RETARD_PROD,
            _line(),
            cause,
            has_cq_alert=False,
            in_zone_expedition=False,
        )
        assert acts == [Action("Créer un OF / escalader ordonnancement", "critical")]

    def test_rupture_composants(self):
        cause = RetardCause(
            type_cause=CauseType.RUPTURE_COMPOSANTS,
            composants={"COMP-001": 2.0, "COMP-002": 5.5},
        )
        acts = recommend_actions(
            Status.RETARD_PROD,
            _line(),
            cause,
            has_cq_alert=False,
            in_zone_expedition=False,
        )
        assert len(acts) == 2
        assert acts[0].severity == "critical"
        assert "COMP-001 (x2)" in acts[0].label
        assert "COMP-002 (x5.5)" in acts[0].label
        assert acts[1] == Action("Vérifier prochain arrivage", "warning")

    def test_rupture_composants_vide(self):
        cause = RetardCause(
            type_cause=CauseType.RUPTURE_COMPOSANTS,
            composants={},
        )
        acts = recommend_actions(
            Status.RETARD_PROD,
            _line(),
            cause,
            has_cq_alert=False,
            in_zone_expedition=False,
        )
        assert acts == [Action("Vérifier prochain arrivage", "warning")]

    def test_attente_reception_fournisseur(self):
        cause = RetardCause(
            type_cause=CauseType.ATTENTE_RECEPTION_FOURNISSEUR,
        )
        acts = recommend_actions(
            Status.RETARD_PROD,
            _line(),
            cause,
            has_cq_alert=False,
            in_zone_expedition=False,
        )
        assert acts == [
            Action("Confirmer date de réception", "warning"),
            Action("Suivre transitaire", "info"),
        ]

    def test_inconnue(self):
        cause = RetardCause(type_cause=CauseType.INCONNUE)
        acts = recommend_actions(
            Status.RETARD_PROD,
            _line(),
            cause,
            has_cq_alert=False,
            in_zone_expedition=False,
        )
        assert acts == [Action("À investiguer manuellement", "info")]

    def test_cause_none(self):
        acts = recommend_actions(
            Status.RETARD_PROD,
            _line(),
            None,
            has_cq_alert=False,
            in_zone_expedition=False,
        )
        assert acts == [Action("À investiguer manuellement", "info")]


class TestRas:
    def test_ras_retourne_vide(self):
        acts = recommend_actions(
            Status.RAS,
            _line(),
            None,
            has_cq_alert=False,
            in_zone_expedition=False,
        )
        assert acts == []


class TestCouvertureCombinatoire:
    """Vérifie que chaque CauseType produit au moins une action."""

    @pytest.mark.parametrize("ct", list(CauseType))
    def test_chaque_cause_type_retard_a_une_action(self, ct):
        cause = RetardCause(type_cause=ct, composants={"C1": 1.0} if ct == CauseType.RUPTURE_COMPOSANTS else {})
        acts = recommend_actions(
            Status.RETARD_PROD,
            _line(),
            cause,
            has_cq_alert=False,
            in_zone_expedition=False,
        )
        assert len(acts) >= 1
