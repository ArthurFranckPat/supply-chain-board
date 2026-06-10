"""Tests du planning board — overlay d'overrides locaux sur les OF ERP."""

from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient

from production_planning.api.server import create_app
from production_planning.models import OF
from production_planning.services.planning_board_store import PlanningBoardStore

from erp_data_access.models.gamme import Gamme, GammeOperation

TODAY = date.today()


def _of(num_of, article, statut=3, debut_offset=2, fin_offset=5, qte_restante=100):
    return OF(
        num_of=num_of,
        article=article,
        description=f"Article {article}",
        statut_num=statut,
        statut_texte={1: "Ferme", 2: "Planifié", 3: "Suggéré"}[statut],
        date_debut=TODAY + timedelta(days=debut_offset),
        date_fin=TODAY + timedelta(days=fin_offset),
        qte_a_fabriquer=qte_restante,
        qte_fabriquee=0,
        qte_restante=qte_restante,
    )


class _FakeLoader:
    def __init__(self):
        self.ofs = [
            _of("OF001", "ART-A", statut=3),
            _of("OF002", "ART-B", statut=1, debut_offset=4),
            _of("OF003", "ART-A", statut=3, debut_offset=60),  # hors fenêtre par défaut
            _of("OF004", "ART-C", statut=2, qte_restante=0),  # soldé
        ]
        self._gammes = {
            "ART-A": Gamme(
                article="ART-A",
                operations=[GammeOperation("ART-A", "PP_830", "Ligne 830", cadence=50.0)],
            ),
        }

    def get_of_by_num(self, num_of):
        return next((of for of in self.ofs if of.num_of == num_of), None)

    def get_gamme(self, article):
        return self._gammes.get(article)


class _StubGuiService:
    def __init__(self, project_root):
        self.loader = _FakeLoader()
        self.project_root = project_root


@pytest.fixture
def client(tmp_path):
    return TestClient(create_app(_StubGuiService(tmp_path)))


def test_list_ofs_default_window_excludes_done_and_far(client):
    data = client.get("/api/v1/planning-board/ofs").json()
    nums = {row["num_of"] for row in data["ofs"]}
    assert nums == {"OF001", "OF002"}  # OF003 hors fenêtre, OF004 soldé
    assert data["nb_modified"] == 0


def test_of_enriched_with_gamme(client):
    data = client.get("/api/v1/planning-board/ofs").json()
    of1 = next(r for r in data["ofs"] if r["num_of"] == "OF001")
    assert of1["poste_charge"] == "PP_830"
    assert of1["duree_heures"] == 2.0  # 100 / 50
    of2 = next(r for r in data["ofs"] if r["num_of"] == "OF002")
    assert of2["poste_charge"] is None
    assert of2["duree_heures"] is None


def test_patch_reschedule_and_affermir(client):
    new_debut = (TODAY + timedelta(days=10)).isoformat()
    new_fin = (TODAY + timedelta(days=13)).isoformat()
    resp = client.patch(
        "/api/v1/planning-board/ofs/OF001",
        json={"date_debut": new_debut, "date_fin": new_fin, "statut_num": 1},
    )
    assert resp.status_code == 200
    row = resp.json()
    assert row["date_debut"] == new_debut
    assert row["statut_num"] == 1
    assert row["statut_origine"] == 3
    assert row["modified"] is True

    # Persistance visible dans la liste
    data = client.get("/api/v1/planning-board/ofs").json()
    of1 = next(r for r in data["ofs"] if r["num_of"] == "OF001")
    assert of1["statut_num"] == 1
    assert data["nb_modified"] == 1


def test_patch_rejects_demote_firm_erp_of(client):
    resp = client.patch("/api/v1/planning-board/ofs/OF002", json={"statut_num": 3})
    assert resp.status_code == 422


def test_patch_rejects_fin_before_debut(client):
    resp = client.patch(
        "/api/v1/planning-board/ofs/OF001",
        json={"date_fin": (TODAY - timedelta(days=30)).isoformat()},
    )
    assert resp.status_code == 422


def test_patch_unknown_of_404(client):
    resp = client.patch("/api/v1/planning-board/ofs/NOPE", json={"statut_num": 1})
    assert resp.status_code == 404


def test_reset_override(client):
    client.patch("/api/v1/planning-board/ofs/OF001", json={"statut_num": 1})
    resp = client.delete("/api/v1/planning-board/ofs/OF001/override")
    assert resp.status_code == 200
    assert resp.json()["statut_num"] == 3
    assert resp.json()["modified"] is False


def test_overrides_listing_and_reset_all(client):
    client.patch("/api/v1/planning-board/ofs/OF001", json={"statut_num": 1})
    client.patch("/api/v1/planning-board/ofs/OF002", json={"note": "priorité client"})

    listing = client.get("/api/v1/planning-board/overrides").json()
    assert listing["total"] == 2

    deleted = client.delete("/api/v1/planning-board/overrides").json()
    assert deleted["deleted"] == 2
    assert client.get("/api/v1/planning-board/overrides").json()["total"] == 0


def test_events_journal(client):
    client.patch("/api/v1/planning-board/ofs/OF001", json={"statut_num": 1})
    client.delete("/api/v1/planning-board/ofs/OF001/override")
    events = client.get("/api/v1/planning-board/events").json()["events"]
    actions = [e["action"] for e in events]
    assert actions[:2] == ["reset", "update"]  # plus récent en premier


def test_store_merge_partial_updates(tmp_path):
    store = PlanningBoardStore(tmp_path / "pb.db")
    store.upsert_override("OF1", {"date_debut": "2026-06-15"})
    store.upsert_override("OF1", {"statut_num": 1})
    merged = store.get_override("OF1")
    assert merged["date_debut"] == "2026-06-15"
    assert merged["statut_num"] == 1

    store.upsert_override("OF1", {"date_debut": None})
    assert store.get_override("OF1")["date_debut"] is None

    with pytest.raises(ValueError):
        store.upsert_override("OF1", {"hack": "x"})
