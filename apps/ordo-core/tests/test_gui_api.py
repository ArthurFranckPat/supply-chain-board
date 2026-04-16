"""Contract tests for the local GUI API."""

import time

from fastapi.testclient import TestClient

from src.app.gui_service import GuiAppService
from src.api.server import create_app


class _StubGuiService:
    def __init__(self):
        self.runs = {
            "run-1": {
                "run_id": "run-1",
                "status": "completed",
                "result": {"summary": {"matched_ofs": 2}},
            }
        }

    def get_config(self):
        return {
            "sources": [{"id": "extractions"}],
            "feasibility_modes": [{"id": "projected"}],
        }

    def load_data(self, source="extractions", data_dir=None, extractions_dir=None):
        return {
            "source": source,
            "extractions_dir": extractions_dir,
            "counts": {"ofs": 12},
        }

    def run_s1(self, horizon=7, include_previsions=False, feasibility_mode="projected"):
        return {
            "run_id": "run-1",
            "status": "completed",
            "result": {
                "summary": {
                    "horizon_days": horizon,
                    "include_previsions": include_previsions,
                    "feasibility_mode": feasibility_mode,
                }
            },
        }

    def get_run(self, run_id):
        return self.runs.get(run_id)

    def get_latest_report(self, report_type):
        return {"type": report_type, "exists": True, "content": "# report"}

    def list_reports(self):
        return [{"name": "s1_action_report.md", "category": "actions"}]


def _make_client():
    return TestClient(create_app(_StubGuiService()))


def test_gui_api_core_endpoints():
    client = _make_client()

    assert client.get("/health").json() == {"status": "ok"}

    config = client.get("/config")
    assert config.status_code == 200
    assert {item["id"] for item in config.json()["sources"]} == {"extractions"}

    loaded = client.post("/data/load", json={"source": "extractions"}).json()
    assert loaded["source"] == "extractions"

    run = client.post("/runs/s1", json={"horizon": 10, "include_previsions": True}).json()
    assert run["status"] == "completed"
    assert run["result"]["summary"]["horizon_days"] == 10
    assert run["result"]["summary"]["include_previsions"] is True

    fetched = client.get("/runs/run-1")
    assert fetched.status_code == 200
    assert fetched.json()["run_id"] == "run-1"

    assert client.get("/reports/actions/latest").json()["type"] == "actions"
    assert client.get("/reports/s1/latest").json()["type"] == "s1"
    assert client.get("/reports/files").json()[0]["name"] == "s1_action_report.md"


def test_gui_api_returns_404_for_unknown_run():
    client = _make_client()

    response = client.get("/runs/missing")

    assert response.status_code == 404
    assert response.json()["detail"] == "Run introuvable"


def test_gui_service_run_s1_is_pollable(monkeypatch, tmp_path):
    service = GuiAppService(tmp_path)
    service.loader = object()
    service.loaded_source = {"source": "extractions"}

    def fake_execute_s1(**_kwargs):
        time.sleep(0.05)
        return {"summary": {"matched_ofs": 1}}

    monkeypatch.setattr(service, "_execute_s1", fake_execute_s1)

    run = service.run_s1()

    assert run["status"] == "running"

    for _ in range(40):
        current = service.get_run(run["run_id"])
        if current and current["status"] == "completed":
            break
        time.sleep(0.02)
    else:
        raise AssertionError("Le run S+1 n'a pas termine en arriere-plan")

    assert current is not None
    assert current["result"]["summary"]["matched_ofs"] == 1
