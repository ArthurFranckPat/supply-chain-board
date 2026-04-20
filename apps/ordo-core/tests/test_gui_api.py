"""Contract tests for the local GUI API."""

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

    def get_run(self, run_id):
        return self.runs.get(run_id)

    def get_latest_report(self, report_type):
        return {"type": report_type, "exists": True, "content": "# report"}

    def list_reports(self):
        return [{"name": "schedule_report.md", "category": "outputs"}]

    def eol_residuals_analyze(self, familles, prefixes, bom_depth_mode="full", stock_mode="physical"):
        return {
            "summary": {
                "target_pf_count": len(familles) + len(prefixes),
                "unique_component_count": 0,
                "total_stock_qty": 0.0,
                "total_value": 0.0,
            },
            "components": [],
            "warnings": [],
        }


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

    fetched = client.get("/runs/run-1")
    assert fetched.status_code == 200
    assert fetched.json()["run_id"] == "run-1"

    assert client.get("/reports/actions/latest").json()["type"] == "actions"
    assert client.get("/reports/files").json()[0]["name"] == "schedule_report.md"


def test_gui_api_returns_404_for_unknown_run():
    client = _make_client()

    response = client.get("/runs/missing")

    assert response.status_code == 404
    assert response.json()["detail"] == "Run introuvable"


class TestEolResidualsApi:

    def test_requires_familles_or_prefixes(self):
        client = _make_client()
        response = client.post("/api/v1/eol-residuals/analyze", json={})
        assert response.status_code == 400
        assert "familles ou prefixes requis" in response.json()["detail"]

    def test_accepts_familles_only(self):
        client = _make_client()
        response = client.post("/api/v1/eol-residuals/analyze", json={"familles": ["CLIM"]})
        assert response.status_code == 200
        assert response.json()["summary"]["target_pf_count"] == 1

    def test_accepts_prefixes_only(self):
        client = _make_client()
        response = client.post("/api/v1/eol-residuals/analyze", json={"prefixes": ["CLIM"]})
        assert response.status_code == 200

    def test_bom_depth_mode_validation(self):
        client = _make_client()
        response = client.post("/api/v1/eol-residuals/analyze", json={"familles": ["CLIM"], "bom_depth_mode": "invalid"})
        assert response.status_code == 422  # Pydantic validation error

    def test_stock_mode_validation(self):
        client = _make_client()
        response = client.post("/api/v1/eol-residuals/analyze", json={"familles": ["CLIM"], "stock_mode": "invalid"})
        assert response.status_code == 422

    def test_valid_bom_depth_modes(self):
        client = _make_client()
        for mode in ["level1", "full"]:
            response = client.post("/api/v1/eol-residuals/analyze", json={"familles": ["CLIM"], "bom_depth_mode": mode})
            assert response.status_code == 200, f"failed for mode {mode}"

    def test_valid_stock_modes(self):
        client = _make_client()
        for mode in ["physical", "net_releaseable"]:
            response = client.post("/api/v1/eol-residuals/analyze", json={"familles": ["CLIM"], "stock_mode": mode})
            assert response.status_code == 200, f"failed for mode {mode}"
