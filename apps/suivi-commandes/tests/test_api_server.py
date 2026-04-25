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


def test_api_surface_no_longer_exposes_comment_routes() -> None:
    paths = {route.path for route in create_app().routes}

    assert "/api/v1/comments" not in paths
    assert "/api/v1/comments/batch" not in paths
    assert "/api/v1/comments/{no_commande}/{article}" not in paths
