from datetime import date, datetime, timezone

from suivi_commandes.application.report_service import (
    ChargeItem,
    ReportPayload,
    ReportRow,
    ReportSections,
)
from suivi_commandes.domain.services.action_recommender import Action
from suivi_commandes.infrastructure.adapters.reportlab_renderer import ReportlabRenderer


def test_render_smoke_empty_payload():
    payload = ReportPayload(
        generated_at=datetime.now(timezone.utc),
        reference_date=date(2024, 1, 15),
        folder=None,
        totals={"a_expedier": 0, "allocation_a_faire": 0, "retard_prod": 0},
        sections=ReportSections(
            a_expedier=[],
            allocation_a_faire=[],
            retard_prod_groups={},
        ),
        charge_retard=[],
    )
    renderer = ReportlabRenderer()
    pdf = renderer.render(payload)
    assert isinstance(pdf, bytes)
    assert pdf.startswith(b"%PDF")
    assert len(pdf) > 100


def test_render_with_content():
    row = ReportRow(
        num_commande="C001",
        article="A001",
        designation="Article test",
        nom_client="Client X",
        type_commande="MTO",
        date_expedition=date(2024, 1, 10),
        date_liv_prevue=None,
        qte_commandee=10.0,
        qte_allouee=0.0,
        qte_restante=5.0,
        besoin_net=5.0,
        qte_allouee_virtuelle=0.0,
        emplacement="QUAI-01",
        hum="HUM01",
        zone_expedition=True,
        alerte_cq_statut=False,
        jours_retard=5,
        actions=[Action("Confirmer chargement", "info")],
        cause_type=None,
        cause_message=None,
        composants_manquants=None,
    )
    payload = ReportPayload(
        generated_at=datetime.now(timezone.utc),
        reference_date=date(2024, 1, 15),
        folder="test-data",
        totals={"a_expedier": 1, "allocation_a_faire": 0, "retard_prod": 0},
        sections=ReportSections(
            a_expedier=[row],
            allocation_a_faire=[],
            retard_prod_groups={},
        ),
        charge_retard=[ChargeItem(poste="P1", libelle="Poste A", heures=12.5)],
    )
    renderer = ReportlabRenderer()
    pdf = renderer.render(payload)
    assert pdf.startswith(b"%PDF")
    assert len(pdf) > 500
