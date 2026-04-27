from datetime import date
from unittest.mock import MagicMock, patch

from suivi_commandes.domain.models import (
    CauseType,
    OrderLine,
    RetardCause,
    Status,
    TypeCommande,
)
from suivi_commandes.domain.services.status_assigner import StatusAssignment
from suivi_commandes.application.report_service import ReportService


def _assignment(**kwargs):
    defaults = dict(
        line=OrderLine(num_commande="C001", article="A001", qte_restante=10.0, qte_allouee=0.0, type_commande=TypeCommande.MTO),
        status=Status.RAS,
        besoin_net=10.0,
        qte_allouee_virtuelle=0.0,
        alerte_cq_statut=False,
        cause=None,
    )
    defaults.update(kwargs)
    return StatusAssignment(**defaults)


@patch("suivi_commandes.application.report_service.StatusService.get_enriched_assignments")
@patch("suivi_commandes.application.report_service.RetardService.compute")
def test_build_payload_filters_ras(mock_charge, mock_status):
    mock_status.return_value = [
        _assignment(
            status=Status.A_EXPEDIER,
            line=OrderLine(num_commande="C1", article="A1", qte_restante=0.0, qte_allouee=0.0),
        ),
        _assignment(status=Status.RAS),
        _assignment(
            status=Status.RETARD_PROD,
            cause=RetardCause(type_cause=CauseType.AUCUN_OF_PLANIFIE, message="Aucun OF"),
        ),
    ]
    mock_charge.return_value = MagicMock(items=[], total_heures=0.0)

    payload = ReportService.build_payload(folder="test", reference_date="2024-01-15")

    assert payload.totals == {
        "a_expedier": 1,
        "allocation_a_faire": 0,
        "retard_prod": 1,
    }
    assert len(payload.sections.a_expedier) == 1
    assert len(payload.sections.retard_prod_groups) == 1
    assert payload.sections.retard_prod_groups["aucun_of_planifie"][0].cause_type == "aucun_of_planifie"
    assert payload.charge_retard == []


@patch("suivi_commandes.application.report_service.StatusService.get_enriched_assignments")
@patch("suivi_commandes.application.report_service.RetardService.compute")
def test_build_payload_sorts_by_date_expedition(mock_charge, mock_status):
    mock_status.return_value = [
        _assignment(
            status=Status.A_EXPEDIER,
            line=OrderLine(num_commande="C2", article="A2", qte_restante=0.0, date_expedition=date(2024, 1, 20)),
        ),
        _assignment(
            status=Status.A_EXPEDIER,
            line=OrderLine(num_commande="C1", article="A1", qte_restante=0.0, date_expedition=date(2024, 1, 10)),
        ),
    ]
    mock_charge.return_value = MagicMock(items=[], total_heures=0.0)

    payload = ReportService.build_payload(reference_date="2024-01-15")
    nums = [r.num_commande for r in payload.sections.a_expedier]
    assert nums == ["C1", "C2"]


@patch("suivi_commandes.application.report_service.StatusService.get_enriched_assignments")
@patch("suivi_commandes.application.report_service.RetardService.compute")
def test_build_payload_allocation_with_cq(mock_charge, mock_status):
    mock_status.return_value = [
        _assignment(
            status=Status.ALLOCATION_A_FAIRE,
            line=OrderLine(num_commande="C1", article="A1", qte_restante=5.0, qte_allouee=0.0),
            alerte_cq_statut=True,
        ),
    ]
    mock_charge.return_value = MagicMock(items=[], total_heures=0.0)

    payload = ReportService.build_payload(reference_date="2024-01-15")
    assert payload.totals["allocation_a_faire"] == 1
    row = payload.sections.allocation_a_faire[0]
    assert any("CQ" in a.label for a in row.actions)


@patch("suivi_commandes.application.report_service.StatusService.get_enriched_assignments")
@patch("suivi_commandes.application.report_service.RetardService.compute")
def test_build_payload_retard_rupture_composants(mock_charge, mock_status):
    mock_status.return_value = [
        _assignment(
            status=Status.RETARD_PROD,
            line=OrderLine(num_commande="C1", article="A1", qte_restante=10.0),
            cause=RetardCause(
                type_cause=CauseType.RUPTURE_COMPOSANTS,
                composants={"COMP-001": 2.5},
            ),
        ),
    ]
    mock_charge.return_value = MagicMock(items=[], total_heures=0.0)

    payload = ReportService.build_payload(reference_date="2024-01-15")
    groups = payload.sections.retard_prod_groups
    assert "rupture_composants" in groups
    row = groups["rupture_composants"][0]
    assert row.composants_manquants == "COMP-001 (x2.5)"
    assert any("Relancer" in a.label for a in row.actions)


@patch("suivi_commandes.application.report_service.StatusService.get_enriched_assignments")
@patch("suivi_commandes.application.report_service.RetardService.compute")
def test_build_payload_charge_retard(mock_charge, mock_status):
    mock_status.return_value = []
    mock_charge.return_value = MagicMock(
        items=[MagicMock(poste="P1", libelle="Poste 1", heures=12.5)],
        total_heures=12.5,
    )

    payload = ReportService.build_payload(reference_date="2024-01-15")
    assert len(payload.charge_retard) == 1
    assert payload.charge_retard[0].heures == 12.5
