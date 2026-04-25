"""Contract tests for the local GUI API."""

from fastapi.testclient import TestClient

from production_planning.api.server import create_app


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

    def get_run(self, run_id):
        return self.runs.get(run_id)

    def get_latest_report(self, report_type):
        return {"type": report_type, "exists": True, "content": "# report"}

    def list_reports(self):
        return [{"name": "schedule_report.md", "category": "outputs"}]


def _make_client():
    return TestClient(create_app(_StubGuiService()))


def test_gui_api_core_endpoints():
    client = _make_client()

    assert client.get("/health").json() == {"status": "ok"}

    config = client.get("/api/v1/config")
    assert config.status_code == 200
    assert {item["id"] for item in config.json()["sources"]} == {"extractions"}

    loaded = client.post("/api/v1/data/load", json={"source": "extractions"}).json()
    assert loaded["source"] == "extractions"

    fetched = client.get("/api/v1/runs/run-1")
    assert fetched.status_code == 200
    assert fetched.json()["run_id"] == "run-1"

    assert client.get("/api/v1/reports/actions/latest").json()["type"] == "actions"
    assert client.get("/api/v1/reports/files").json()[0]["name"] == "schedule_report.md"


def test_gui_api_returns_404_for_unknown_run():
    client = _make_client()

    response = client.get("/api/v1/runs/missing")

    assert response.status_code == 404
    assert response.json()["detail"] == "Run introuvable"
