from __future__ import annotations

from typing import Any

from fastapi.testclient import TestClient

from integration_hub.api import create_app


class FakeOrdoClient:
    def __init__(
        self,
        *,
        health_payload: dict[str, Any] | None = None,
        final_run: dict[str, Any] | None = None,
        timeout: bool = False,
    ) -> None:
        self.health_payload = health_payload or {"status": "ok"}
        self.final_run = final_run or {
            "status": "completed",
            "result": {"taux_service": 0.875, "unscheduled_rows": [{"id": "late"}]},
        }
        self.timeout = timeout
        self.loaded_source: str | None = None
        self.schedule_payload: dict[str, Any] | None = None
        self.wait_payload: dict[str, Any] | None = None

    async def health(self) -> dict[str, Any]:
        return self.health_payload

    async def load_data(self, source: str = "data") -> dict[str, Any]:
        self.loaded_source = source
        return {"status": "loaded"}

    async def run_schedule(
        self,
        immediate_components: bool = False,
        blocking_components_mode: str = "blocked",
        demand_horizon_days: int = 15,
    ) -> dict[str, Any]:
        self.schedule_payload = {
            "immediate_components": immediate_components,
            "blocking_components_mode": blocking_components_mode,
            "demand_horizon_days": demand_horizon_days,
        }
        return {"run_id": "run-1"}

    async def wait_for_run(
        self,
        run_id: str,
        poll_interval_seconds: float = 1.0,
        timeout_seconds: int = 120,
    ) -> dict[str, Any]:
        self.wait_payload = {
            "run_id": run_id,
            "poll_interval_seconds": poll_interval_seconds,
            "timeout_seconds": timeout_seconds,
        }
        if self.timeout:
            raise TimeoutError("run timed out")
        return self.final_run


class FakeSuiviClient:
    def __init__(
        self,
        *,
        health_payload: dict[str, Any] | None = None,
        status_payload: dict[str, Any] | None = None,
        error: Exception | None = None,
    ) -> None:
        self.health_payload = health_payload or {"status": "ok", "service": "suivi-commandes"}
        self.status_payload = status_payload or {
            "total_rows": 3,
            "status_counts": {"Retard Prod": 2, "Allocation à faire": 1},
            "rows": [],
            "line_level": [],
        }
        self.error = error
        self.latest_export_folder: str | None = None

    async def health(self) -> dict[str, Any]:
        return self.health_payload

    async def status_from_latest_export(self, folder: str | None = None) -> dict[str, Any]:
        self.latest_export_folder = folder
        if self.error:
            raise self.error
        return self.status_payload


def test_health_reports_downstream_state() -> None:
    ordo = FakeOrdoClient()
    suivi = FakeSuiviClient()

    response = TestClient(create_app(lambda: (ordo, suivi))).get("/health")

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["service"] == "integration-hub"
    assert payload["downstream"]["production-planning"] == {"status": "ok"}
    assert payload["downstream"]["suivi-commandes"]["service"] == "suivi-commandes"


def test_suivi_status_pipeline_delegates_to_suivi() -> None:
    suivi = FakeSuiviClient()

    response = TestClient(create_app(lambda: (FakeOrdoClient(), suivi))).post(
        "/api/v1/pipeline/suivi-status",
        json={"suivi_folder": "/tmp/suivi"},
    )

    assert response.status_code == 200
    assert response.json()["status_counts"] == {"Retard Prod": 2, "Allocation à faire": 1}
    assert suivi.latest_export_folder == "/tmp/suivi"


def test_supply_board_pipeline_builds_summary() -> None:
    ordo = FakeOrdoClient()
    suivi = FakeSuiviClient()

    response = TestClient(create_app(lambda: (ordo, suivi))).post(
        "/api/v1/pipeline/supply-board",
        json={
            "source": "extractions",
            "immediate_components": True,
            "blocking_components_mode": "all",
            "demand_horizon_days": 20,
            "suivi_folder": "/tmp/suivi",
            "poll_interval_seconds": 0.2,
            "timeout_seconds": 30,
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["board_summary"] == {
        "ordo_taux_service": 0.875,
        "ordo_unscheduled": 1,
        "suivi_retard_prod": 2,
        "suivi_allocation_a_faire": 1,
        "suivi_total_rows": 3,
    }
    assert ordo.loaded_source == "extractions"
    assert ordo.schedule_payload == {
        "immediate_components": True,
        "blocking_components_mode": "all",
        "demand_horizon_days": 20,
    }
    assert ordo.wait_payload == {
        "run_id": "run-1",
        "poll_interval_seconds": 0.2,
        "timeout_seconds": 30,
    }
    assert suivi.latest_export_folder == "/tmp/suivi"


def test_supply_board_timeout_returns_504() -> None:
    app = create_app(lambda: (FakeOrdoClient(timeout=True), FakeSuiviClient()))

    response = TestClient(app).post("/api/v1/pipeline/supply-board", json={})

    assert response.status_code == 504
    assert response.json()["detail"] == "run timed out"


def test_suivi_status_downstream_error_returns_502() -> None:
    app = create_app(lambda: (FakeOrdoClient(), FakeSuiviClient(error=RuntimeError("boom"))))

    response = TestClient(app).post("/api/v1/pipeline/suivi-status", json={})

    assert response.status_code == 502
    assert response.json()["detail"] == "suivi-commandes call failed: boom"
