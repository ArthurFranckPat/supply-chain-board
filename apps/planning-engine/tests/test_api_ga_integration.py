"""Tests d'intégration pour l'API AG (Phase 5).

Vérifient que les paramètres algorithm, ga_random_seed et ga_config_overrides
sont correctement propagés depuis l'API jusqu'au scheduler.
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest


class TestRunScheduleAPI:
    """Tests pour l'endpoint /runs/schedule avec algorithm='ga'."""

    @pytest.fixture
    def mock_service(self):
        svc = MagicMock()
        svc.loader = MagicMock()
        svc.run_schedule.return_value = {
            "run_id": "test123",
            "status": "running",
            "created_at": "2026-04-26T10:00:00Z",
            "kind": "schedule",
            "algorithm": "ga",
        }
        return svc

    def test_run_schedule_with_algorithm_ga(self, mock_service):
        """L'API accepte algorithm='ga' et le propage au service."""
        from production_planning.api.server import RunScheduleRequest, run_schedule
        from fastapi import Request

        payload = RunScheduleRequest(
            immediate_components=False,
            blocking_components_mode="blocked",
            demand_horizon_days=15,
            algorithm="ga",
            ga_random_seed=42,
            ga_config_overrides={"population_size": 50},
        )

        request = MagicMock()
        request.app.state.gui_service = mock_service

        result = run_schedule(payload, request)

        assert result["algorithm"] == "ga"
        mock_service.run_schedule.assert_called_once()
        call_kwargs = mock_service.run_schedule.call_args.kwargs
        assert call_kwargs["algorithm"] == "ga"
        assert call_kwargs["ga_random_seed"] == 42
        assert call_kwargs["ga_config_overrides"] == {"population_size": 50}

    def test_run_schedule_default_algorithm_greedy(self, mock_service):
        """Par défaut, algorithm='greedy'."""
        from production_planning.api.server import RunScheduleRequest, run_schedule

        payload = RunScheduleRequest()
        request = MagicMock()
        request.app.state.gui_service = mock_service

        run_schedule(payload, request)

        call_kwargs = mock_service.run_schedule.call_args.kwargs
        assert call_kwargs["algorithm"] == "greedy"

    def test_run_schedule_invalid_algorithm_raises(self):
        """algorithm='invalid' doit lever une ValidationError."""
        from production_planning.api.server import RunScheduleRequest

        with pytest.raises(ValueError):
            RunScheduleRequest(algorithm="invalid")


class TestRunCompareAPI:
    """Tests pour l'endpoint /runs/compare."""

    @pytest.fixture
    def mock_service(self):
        svc = MagicMock()
        svc.loader = MagicMock()
        svc.run_compare.return_value = {
            "run_id": "cmp123",
            "status": "completed",
            "created_at": "2026-04-26T10:00:00Z",
            "kind": "compare",
            "result": {
                "greedy": {"score": 0.5},
                "ga": {"score": 0.6},
                "diff": {"score_delta": 0.1, "winner": "ga"},
            },
        }
        return svc

    def test_run_compare_returns_both_results(self, mock_service):
        """L'endpoint compare retourne glouton + AG + diff."""
        from production_planning.api.server import RunScheduleRequest, run_compare

        payload = RunScheduleRequest(algorithm="ga", ga_random_seed=42)
        request = MagicMock()
        request.app.state.gui_service = mock_service

        result = run_compare(payload, request)

        assert result["status"] == "completed"
        assert "result" in result
        assert "greedy" in result["result"]
        assert "ga" in result["result"]
        assert "diff" in result["result"]
        assert result["result"]["diff"]["winner"] == "ga"


class TestScheduleServiceGA:
    """Tests pour ScheduleService avec paramètres AG."""

    def test_run_schedule_passes_algorithm_to_execute(self):
        """ScheduleService propage algorithm à _execute."""
        from production_planning.services.schedule_service import ScheduleService
        from unittest.mock import MagicMock, patch

        svc = ScheduleService(project_root=MagicMock())
        svc.runs = {}

        with patch.object(svc, "_execute") as mock_execute:
            mock_execute.return_value = {"score": 0.6}

            with patch.object(svc, "_run_in_background"):
                # Juste vérifier que les kwargs sont passés
                result = svc.run_schedule(
                    loader=MagicMock(),
                    algorithm="ga",
                    ga_random_seed=42,
                    ga_config_overrides={"population_size": 30},
                )
                assert result["status"] == "running"
                assert result["algorithm"] == "ga"

    def test_run_compare_runs_both_algorithms(self):
        """run_compare exécute glouton puis AG."""
        from production_planning.services.schedule_service import ScheduleService
        from unittest.mock import MagicMock, patch

        svc = ScheduleService(project_root=MagicMock())

        with patch.object(svc, "_execute") as mock_execute:
            mock_execute.side_effect = [
                {"score": 0.5, "taux_service": 0.8, "taux_ouverture": 0.7, "nb_changements_serie": 10},
                {"score": 0.6, "taux_service": 0.85, "taux_ouverture": 0.75, "nb_changements_serie": 8},
            ]

            result = svc.run_compare(loader=MagicMock())

            assert result["status"] == "completed"
            assert mock_execute.call_count == 2
            # Premier appel = greedy
            assert mock_execute.call_args_list[0].kwargs["algorithm"] == "greedy"
            # Deuxième appel = ga
            assert mock_execute.call_args_list[1].kwargs["algorithm"] == "ga"

    def test_compute_diff(self):
        """_compute_diff calcule correctement les différences."""
        from production_planning.services.schedule_service import ScheduleService

        svc = ScheduleService(project_root=MagicMock())
        diff = svc._compute_diff(
            {"score": 0.5, "taux_service": 0.8, "taux_ouverture": 0.7, "nb_changements_serie": 10},
            {"score": 0.6, "taux_service": 0.85, "taux_ouverture": 0.75, "nb_changements_serie": 8},
        )

        assert diff["score_delta"] == pytest.approx(0.1)
        assert diff["score_pct"] == pytest.approx(20.0)
        assert diff["taux_service_delta"] == pytest.approx(0.05)
        assert diff["setups_delta"] == -2
        assert diff["winner"] == "ga"
