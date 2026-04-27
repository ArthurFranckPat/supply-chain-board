from datetime import date, datetime, timezone
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from suivi_commandes.api import create_app


@pytest.fixture
def client():
    return TestClient(create_app())


def _fake_payload():
    from suivi_commandes.application.report_service import (
        ChargeItem,
        ReportPayload,
        ReportRow,
        ReportSections,
    )
    from suivi_commandes.domain.services.action_recommender import Action

    return ReportPayload(
        generated_at=datetime.now(timezone.utc),
        reference_date=date(2024, 1, 15),
        folder="test",
        totals={"a_expedier": 1, "allocation_a_faire": 0, "retard_prod": 0},
        sections=ReportSections(
            a_expedier=[
                ReportRow(
                    num_commande="C1",
                    article="A1",
                    designation="D1",
                    nom_client="Client",
                    type_commande="MTO",
                    date_expedition=date(2024, 1, 10),
                    date_liv_prevue=None,
                    qte_commandee=10.0,
                    qte_allouee=0.0,
                    qte_restante=0.0,
                    besoin_net=0.0,
                    qte_allouee_virtuelle=0.0,
                    emplacement="QUAI",
                    hum=None,
                    zone_expedition=True,
                    alerte_cq_statut=False,
                    jours_retard=None,
                    actions=[Action("Confirmer chargement", "info")],
                    cause_type=None,
                    cause_message=None,
                    composants_manquants=None,
                )
            ],
            allocation_a_faire=[],
            retard_prod_groups={},
        ),
        charge_retard=[ChargeItem(poste="P1", libelle="Poste", heures=5.0)],
    )


@patch("suivi_commandes.api.ReportService.build_payload")
def test_report_json(mock_build, client):
    mock_build.return_value = _fake_payload()
    resp = client.post("/api/v1/reports/suivi-commandes", json={"format": "json"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["totals"]["a_expedier"] == 1
    assert len(data["sections"]["a_expedier"]) == 1
    assert data["sections"]["a_expedier"][0]["actions"][0]["label"] == "Confirmer chargement"


@patch("suivi_commandes.api.ReportlabRenderer.render")
@patch("suivi_commandes.api.ReportService.build_payload")
def test_report_pdf(mock_build, mock_render, client):
    mock_build.return_value = _fake_payload()
    mock_render.return_value = b"%PDF-1.4 fake"
    resp = client.post("/api/v1/reports/suivi-commandes", json={"format": "pdf"})
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/pdf"
    assert resp.content.startswith(b"%PDF")
    assert "suivi-commandes-2024-01-15.pdf" in resp.headers["content-disposition"]


@patch("suivi_commandes.api.ReportService.build_payload")
def test_report_folder_not_found(mock_build, client):
    mock_build.side_effect = FileNotFoundError("Dossier inconnu")
    resp = client.post("/api/v1/reports/suivi-commandes", json={"folder": "bad", "format": "json"})
    assert resp.status_code == 422
    assert "Dossier inconnu" in resp.json()["detail"]
