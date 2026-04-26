from __future__ import annotations

import sys
from pathlib import Path

from fastapi.testclient import TestClient


APP_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(APP_ROOT))
sys.path.insert(0, str(APP_ROOT / "src"))

from api_server import app, create_app  # noqa: E402


def test_health_endpoint_returns_service_identity() -> None:
    client = TestClient(app)

    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "suivi-commandes"}


def test_assign_status_endpoint_assigns_status_for_minimal_order_row() -> None:
    client = TestClient(app)

    response = client.post(
        "/api/v1/status/assign",
        json={
            "reference_date": "2026-01-01",
            "rows": [
                {
                    "Article": "A-001",
                    "No commande": "CMD-001",
                    "Date expedition": "2026-01-10",
                    "Date liv prévue": "2026-01-15",
                    "Qté allouée": 0,
                    "Quantité restante": 1,
                    "Stock interne 'A'": 0,
                    "Alloué interne 'A'": 0,
                    "Emplacement": "",
                }
            ],
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["total_rows"] == 1
    assert payload["status_counts"] == {"RAS": 1}
    assert payload["rows"][0]["Statut"] == "RAS"
    assert payload["line_level"][0]["Article"] == "A-001"


def test_assign_status_endpoint_accepts_empty_rows() -> None:
    client = TestClient(app)

    response = client.post("/api/v1/status/assign", json={"rows": []})

    assert response.status_code == 200
    assert response.json() == {
        "total_rows": 0,
        "status_counts": {},
        "rows": [],
        "line_level": [],
    }


def test_mts_purchase_with_stock_is_not_retard_prod() -> None:
    """MTS acheté avec stock disponible mais date dépassée :
    le stock couvre le besoin → ce n'est PAS un retard fournisseur."""
    client = TestClient(app)

    response = client.post(
        "/api/v1/status/assign",
        json={
            "reference_date": "2026-01-20",
            "rows": [
                {
                    "Article": "A2183",
                    "No commande": "AR2601220",
                    "Date expedition": "2026-01-10",
                    "Date liv prévue": "2026-01-15",
                    "Type commande": "MTS",
                    "Qté allouée": 0,
                    "Quantité restante": 10,
                    "Stock interne 'A'": 100,
                    "Alloué interne 'A'": 0,
                    "Emplacement": "STOCK-A",
                }
            ],
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["rows"][0]["Statut"] == "Allocation à faire"


def test_a_expedier_exposes_cq_marker_when_allocation_to_ship_relies_on_qc_stock() -> None:
    client = TestClient(app)

    response = client.post(
        "/api/v1/status/assign",
        json={
            "reference_date": "2026-01-15",
            "rows": [
                {
                    "Article": "A-CQ-SHIP",
                    "No commande": "CMD-CQ-SHIP",
                    "Date expedition": "2026-01-20",
                    "Type commande": "MTS",
                    "Qté allouée": 4,
                    "Quantité restante": 4,
                    "Stock interne 'A'": 1,
                    "Stock sous CQ": 3,
                    "Alloué interne 'A'": 0,
                    "Emplacement": "STOCK-A",
                }
            ],
        },
    )

    assert response.status_code == 200
    row = response.json()["rows"][0]
    assert row["Statut"] == "A Expédier"
    assert row["Marqueur CQ"] == "*"
    assert row["_alerte_cq_statut"] is True


def test_assign_status_exposes_cq_marker_when_virtual_allocation_uses_qc_stock() -> None:
    client = TestClient(app)

    response = client.post(
        "/api/v1/status/assign",
        json={
            "reference_date": "2026-01-15",
            "rows": [
                {
                    "Article": "A-CQ-1",
                    "No commande": "CMD-CQ-1",
                    "Date expedition": "2026-01-20",
                    "Type commande": "MTO",
                    "Qté allouée": 0,
                    "Quantité restante": 10,
                    "Stock interne 'A'": 5,
                    "Stock sous CQ": 5,
                    "Alloué interne 'A'": 0,
                    "Emplacement": "STOCK-A",
                }
            ],
        },
    )

    assert response.status_code == 200
    row = response.json()["rows"][0]
    assert row["Statut"] == "Allocation à faire"
    assert row["Marqueur CQ"] == "*"
    assert row["_allocation_virtuelle_avec_cq"] is True
    assert row["_qte_allouee_virtuelle_stricte"] == 5
    assert row["_qte_allouee_virtuelle_cq"] == 5


def test_mts_fabrique_exposes_a_expedier_with_cq_marker_when_allocated_to_order() -> None:
    client = TestClient(app)

    response = client.post(
        "/api/v1/status/assign",
        json={
            "reference_date": "2026-01-15",
            "rows": [
                {
                    "Article": "BDH2239AL",
                    "No commande": "AR2601626",
                    "Date expedition": "2026-01-20",
                    "Type commande": "MTS",
                    "Qté allouée": 6,
                    "Quantité restante": 6,
                    "Stock interne 'A'": 2,
                    "Stock sous CQ": 4,
                    "Alloué interne 'A'": 0,
                    "_is_fabrique": True,
                    "_is_hard_pegged": True,
                    "Emplacement": "STOCK-A",
                }
            ],
        },
    )

    assert response.status_code == 200
    row = response.json()["rows"][0]
    assert row["Statut"] == "A Expédier"
    assert row["Marqueur CQ"] == "*"
    assert row["_allocation_virtuelle_avec_cq"] is False
    assert row["_alerte_cq_statut"] is True


def test_mts_fabrique_not_allocated_to_order_does_not_expose_cq_marker() -> None:
    client = TestClient(app)

    response = client.post(
        "/api/v1/status/assign",
        json={
            "reference_date": "2026-04-26",
            "rows": [
                {
                    "Article": "BDH2237AL",
                    "No commande": "AR2601840",
                    "Date expedition": "2026-05-07",
                    "Type commande": "MTS",
                    "Qté allouée": 0,
                    "Quantité restante": 384,
                    "Stock interne 'A'": 41,
                    "Stock sous CQ": 384,
                    "Alloué interne 'A'": 0,
                    "_is_fabrique": True,
                    "_is_hard_pegged": False,
                    "Emplacement": "STOCK-A",
                }
            ],
        },
    )

    assert response.status_code == 200
    row = response.json()["rows"][0]
    assert row["Statut"] == "RAS"
    assert row["Marqueur CQ"] == ""
    assert row["_alerte_cq_statut"] is False


def test_api_surface_no_longer_exposes_comment_routes() -> None:
    paths = {route.path for route in create_app().routes}

    assert "/api/v1/comments" not in paths
    assert "/api/v1/comments/batch" not in paths
    assert "/api/v1/comments/{no_commande}/{article}" not in paths
