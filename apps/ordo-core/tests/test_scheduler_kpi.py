from datetime import date

from production_planning.scheduling.kpi import compute_kpis, load_weights
from production_planning.scheduling.models import CandidateOF


def test_load_weights_renormalizes_values(tmp_path):
    weights_file = tmp_path / "weights.json"
    weights_file.write_text('{"w1": 7, "w2": 2, "w3": 1}', encoding="utf-8")

    weights = load_weights(weights_file)

    assert weights == {"w1": 0.7, "w2": 0.2, "w3": 0.1}


def test_compute_kpis_returns_normalized_score():
    tasks = [
        CandidateOF(
            num_of="OF1",
            article="ART1",
            description="Test",
            line="PP_830",
            scheduled_day=date(2026, 4, 6),
            start_hour=0.0,
            end_hour=7.0,
            charge_hours=7.0,
            due_date=date(2026, 4, 6),
            quantity=10,
        )
    ]

    kpis = compute_kpis(tasks)

    assert kpis["taux_service"] == 1.0
    assert kpis["taux_ouverture"] > 0

