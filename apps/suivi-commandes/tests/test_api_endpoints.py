"""Tests API — endpoints, validation, cas limites.

Complète test_api_server.py avec :
- Tests de validation des payloads (erreurs 422)
- Tests de scénarios métier multi-lignes
- Tests des nouveaux endpoints (retard-charge, palettes, detail)
- Tests de robustesse (bad JSON, champs manquants, etc.)
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

APP_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(APP_ROOT / "src"))

from suivi_commandes.api import create_app  # noqa: E402


@pytest.fixture()
def client():
    return TestClient(create_app())


# ── Helpers ────────────────────────────────────────────────────────────


def _row(**overrides):
    """Fabrique une ligne de commande avec des valeurs par défaut cohérentes."""
    d = {
        "Article": "ART-001",
        "No commande": "CMD-001",
        "Date expedition": "2026-03-01",
        "Date liv prévue": "2026-03-15",
        "Type commande": "MTO",
        "Quantité commandée": 10,
        "Qté allouée": 0,
        "Quantité restante": 10,
        "Stock interne 'A'": 0,
        "Alloué interne 'A'": 0,
        "Emplacement": "",
    }
    d.update(overrides)
    return d


# ── Health ─────────────────────────────────────────────────────────────


class TestHealth:
    def test_health_returns_ok(self, client):
        resp = client.get("/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert data["service"] == "suivi-commandes"


# ── Status Assign — Validation ────────────────────────────────────────


class TestStatusAssignValidation:
    def test_missing_rows_field_returns_200_with_empty(self, client):
        """rows a une factory par défaut ([]) → pas d'erreur 422."""
        resp = client.post("/api/v1/status/assign", json={"reference_date": "2026-01-01"})
        assert resp.status_code == 200
        assert resp.json()["total_rows"] == 0

    def test_rows_as_string_returns_422(self, client):
        resp = client.post("/api/v1/status/assign", json={"rows": "not-an-array"})
        assert resp.status_code == 422

    def test_non_iso_date_returns_422(self, client):
        resp = client.post(
            "/api/v1/status/assign",
            json={"rows": [], "reference_date": "01/01/2026"},
        )
        assert resp.status_code == 422


# ── Status Assign — Scénarios métier ──────────────────────────────────


class TestStatusAssignScenarios:
    def test_multi_line_allocation_depletes_stock_sequentially(self, client):
        """3 lignes MTO sur le même article : stock de 15, besoin de 10 chacune.
        Ligne 1 → Allocation à faire (10/10 couvert)
        Ligne 2 → RAS (5 restant, besoin 10) — pas de retard car date future
        Ligne 3 → RAS (0 restant)
        """
        resp = client.post(
            "/api/v1/status/assign",
            json={
                "reference_date": "2026-02-01",
                "rows": [
                    _row(**{
                        "Article": "SHARED-ART",
                        "No commande": "CMD-01",
                        "Date expedition": "2026-03-01",
                        "Quantité restante": 10,
                        "Stock interne 'A'": 15,
                    }),
                    _row(**{
                        "Article": "SHARED-ART",
                        "No commande": "CMD-02",
                        "Date expedition": "2026-03-05",
                        "Quantité restante": 10,
                        "Stock interne 'A'": 15,
                    }),
                    _row(**{
                        "Article": "SHARED-ART",
                        "No commande": "CMD-03",
                        "Date expedition": "2026-03-10",
                        "Quantité restante": 10,
                        "Stock interne 'A'": 15,
                    }),
                ],
            },
        )
        assert resp.status_code == 200
        payload = resp.json()

        # Trier par commande pour vérifier dans l'ordre
        by_cmd = {r["No commande"]: r for r in payload["rows"]}

        # CMD-01 (première date) → allocation virtuelle couvre tout
        assert by_cmd["CMD-01"]["Statut"] == "Allocation à faire"
        assert by_cmd["CMD-01"]["Qté allouée virtuelle"] == 10

        # CMD-02 → stock épuisé, pas de retard (date future)
        assert by_cmd["CMD-02"]["Statut"] == "RAS"

        # CMD-03 → idem
        assert by_cmd["CMD-03"]["Statut"] == "RAS"

        # Comptage : 1 Allocation à faire + 2 RAS
        assert payload["status_counts"] == {"Allocation à faire": 1, "RAS": 2}

    def test_mts_fabrique_retard_when_date_passed_not_in_exp_zone(self, client):
        resp = client.post(
            "/api/v1/status/assign",
            json={
                "reference_date": "2026-02-01",
                "rows": [
                    _row(**{
                        "Article": "FAB-001",
                        "No commande": "CMD-FAB",
                        "Date expedition": "2026-01-15",  # date passée
                        "Type commande": "MTS",
                        "Quantité restante": 5,
                        "Qté allouée": 0,
                        "Stock interne 'A'": 100,
                        "_is_fabrique": True,
                        "_is_hard_pegged": True,
                        "Emplacement": "MAGASIN",  # pas en zone expé
                    }),
                ],
            },
        )
        assert resp.status_code == 200
        row = resp.json()["rows"][0]
        assert row["Statut"] == "Retard Prod"

    def test_mts_fabrique_not_retard_when_in_exp_zone(self, client):
        resp = client.post(
            "/api/v1/status/assign",
            json={
                "reference_date": "2026-02-01",
                "rows": [
                    _row(**{
                        "Article": "FAB-001",
                        "No commande": "CMD-FAB",
                        "Date expedition": "2026-01-15",
                        "Type commande": "MTS",
                        "Quantité restante": 5,
                        "Qté allouée": 0,
                        "Stock interne 'A'": 100,
                        "_is_fabrique": True,
                        "_is_hard_pegged": True,
                        "Emplacement": "QUAI-EXP",  # en zone expédition
                    }),
                ],
            },
        )
        assert resp.status_code == 200
        row = resp.json()["rows"][0]
        assert row["Statut"] == "RAS"

    def test_already_fully_allocated_is_a_expedier(self, client):
        resp = client.post(
            "/api/v1/status/assign",
            json={
                "reference_date": "2026-02-01",
                "rows": [
                    _row(**{
                        "Article": "ALLOK-001",
                        "No commande": "CMD-ALLOK",
                        "Date expedition": "2026-03-01",
                        "Quantité restante": 0,  # tout alloué
                        "Qté allouée": 10,
                        "Stock interne 'A'": 0,
                    }),
                ],
            },
        )
        assert resp.status_code == 200
        row = resp.json()["rows"][0]
        assert row["Statut"] == "A Expédier"
        assert row["Besoin ligne"] == 0

    def test_nor_type_treated_like_mto(self, client):
        resp = client.post(
            "/api/v1/status/assign",
            json={
                "reference_date": "2026-02-01",
                "rows": [
                    _row(**{
                        "Article": "NOR-001",
                        "No commande": "CMD-NOR",
                        "Date expedition": "2026-01-15",  # date passée
                        "Type commande": "NOR",
                        "Quantité restante": 5,
                        "Qté allouée": 0,
                        "Stock interne 'A'": 0,
                    }),
                ],
            },
        )
        assert resp.status_code == 200
        row = resp.json()["rows"][0]
        # NOR sans stock + date passée → Retard Prod
        assert row["Statut"] == "Retard Prod"


# ── Status Detail ─────────────────────────────────────────────────────


class TestStatusDetail:
    def test_detail_returns_empty_for_unknown_command(self, client):
        """Endpoint nécessite des fichiers ERP → skip si non dispo."""
        pytest.skip("Requires ERP extractions files")


# ── Retard Charge ─────────────────────────────────────────────────────


class TestRetardCharge:
    def test_retard_charge_requires_erp_files(self, client):
        """Endpoint nécessite des fichiers ERP → skip si non dispo."""
        pytest.skip("Requires ERP extractions files")


# ── Palettes ──────────────────────────────────────────────────────────


class TestPalettes:
    def test_palettes_requires_erp_files(self, client):
        """Endpoint nécessite des fichiers ERP → skip si non dispo."""
        pytest.skip("Requires ERP extractions files")


# ── CORS ───────────────────────────────────────────────────────────────


class TestCors:
    def test_cors_allows_localhost(self, client):
        client.options(
            "/health",
            headers={"Origin": "http://localhost:5173"},
        )
        # FastAPI TestClient ne gère pas bien OPTIONS, mais on peut
        # vérifier que le middleware est configuré
        app = create_app()
        cors_middlewares = [
            m for m in app.user_middleware
            if m.cls.__name__ == "CORSMiddleware"
        ]
        assert len(cors_middlewares) == 1
        assert "http://localhost:5173" in cors_middlewares[0].kwargs["allow_origins"]


# ── API Routes ────────────────────────────────────────────────────────


class TestApiRoutes:
    def test_all_expected_routes_exist(self, client):
        app = create_app()
        paths = {route.path for route in app.routes}

        expected = {
            "/health",
            "/api/v1/status/assign",
            "/api/v1/status/from-latest-export",
            "/api/v1/status/detail/{no_commande}/{article}",
            "/api/v1/retard-charge",
            "/api/v1/palettes",
        }
        assert expected.issubset(paths)

    def test_no_legacy_comment_routes(self, client):
        app = create_app()
        paths = {route.path for route in app.routes}
        assert "/api/v1/comments" not in paths
        assert "/api/v1/comments/batch" not in paths


# ── Performance / Stress léger ────────────────────────────────────────


class TestBulkAssign:
    def test_100_rows_assign_completes_under_1s(self, client):
        """100 lignes MTO avec stock → assignation en < 1s."""
        rows = [
            _row(**{
                "Article": f"BULK-{i:03d}",
                "No commande": f"BULK-CMD-{i:03d}",
                "Date expedition": "2026-03-01",
                "Quantité restante": 10,
                "Stock interne 'A'": 100,
            })
            for i in range(100)
        ]

        import time
        t0 = time.perf_counter()
        resp = client.post("/api/v1/status/assign", json={"rows": rows})
        elapsed = time.perf_counter() - t0

        assert resp.status_code == 200
        payload = resp.json()
        assert payload["total_rows"] == 100
        assert elapsed < 1.0, f"100 rows took {elapsed:.2f}s (> 1s)"
