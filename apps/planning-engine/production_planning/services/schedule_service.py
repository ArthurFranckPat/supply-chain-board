"""Schedule execution service — runs the scheduler and tracks run state."""

from __future__ import annotations

import time
from datetime import date
from pathlib import Path
from threading import Thread
from typing import Any, Optional
from uuid import uuid4

from ..loaders import DataLoader
from ..utils.serialization import serialize_value


def _utc_now_iso() -> str:
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


class ScheduleService:
    """Handles scheduler execution, background threading and run state tracking."""

    def __init__(self, project_root: Path):
        self.project_root = project_root
        self.runs: dict[str, dict[str, Any]] = {}
        try:
            from ..scheduling import db_schedule
            db_schedule.init_db()
        except Exception:
            pass

    def run_schedule(
        self,
        loader: DataLoader,
        immediate_components: bool = False,
        blocking_components_mode: str = "blocked",
        demand_horizon_days: int = 15,
        algorithm: str = "greedy",
        ga_random_seed: Optional[int] = None,
        ga_config_overrides: Optional[dict] = None,
    ) -> dict[str, Any]:
        run_id = uuid4().hex[:12]

        try:
            from ..scheduling import db_schedule
            db_schedule.save_run(run_id, date.today(), {
                "immediate_components": immediate_components,
                "blocking_components_mode": blocking_components_mode,
                "demand_horizon_days": demand_horizon_days,
                "algorithm": algorithm,
            })
        except Exception:
            pass

        run_state: dict[str, Any] = {
            "run_id": run_id,
            "status": "running",
            "created_at": _utc_now_iso(),
            "kind": "schedule",
            "algorithm": algorithm,
            "_start_mono": time.monotonic(),
        }
        self.runs[run_id] = run_state
        Thread(
            target=self._run_in_background,
            args=(run_id, loader, immediate_components, blocking_components_mode, demand_horizon_days),
            kwargs={"algorithm": algorithm, "ga_random_seed": ga_random_seed, "ga_config_overrides": ga_config_overrides},
            daemon=True,
        ).start()
        return run_state

    def run_compare(
        self,
        loader: DataLoader,
        immediate_components: bool = False,
        blocking_components_mode: str = "blocked",
        demand_horizon_days: int = 15,
        ga_random_seed: Optional[int] = None,
        ga_config_overrides: Optional[dict] = None,
    ) -> dict[str, Any]:
        """Lance glouton + AG et retourne la comparaison.

        Exécution synchrone (pas de thread) car c'est une opération de comparaison.
        """
        run_id = uuid4().hex[:12]

        run_state: dict[str, Any] = {
            "run_id": run_id,
            "status": "running",
            "created_at": _utc_now_iso(),
            "kind": "compare",
            "_start_mono": time.monotonic(),
        }
        self.runs[run_id] = run_state

        try:
            # 1. Glouton
            greedy_result = self._execute(
                loader=loader,
                immediate_components=immediate_components,
                blocking_components_mode=blocking_components_mode,
                demand_horizon_days=demand_horizon_days,
                algorithm="greedy",
            )

            # 2. AG
            ga_result = self._execute(
                loader=loader,
                immediate_components=immediate_components,
                blocking_components_mode=blocking_components_mode,
                demand_horizon_days=demand_horizon_days,
                algorithm="ga",
                ga_random_seed=ga_random_seed,
                ga_config_overrides=ga_config_overrides,
            )

            # 3. Comparaison
            diff = self._compute_diff(greedy_result, ga_result)

            run_state.update({
                "status": "completed",
                "completed_at": _utc_now_iso(),
                "result": {
                    "greedy": greedy_result,
                    "ga": ga_result,
                    "diff": diff,
                },
            })
        except Exception as exc:
            run_state.update({
                "status": "failed",
                "completed_at": _utc_now_iso(),
                "error": str(exc),
            })

        return run_state

    def _compute_diff(self, greedy_result: dict, ga_result: dict) -> dict[str, Any]:
        """Calcule les différences entre glouton et AG."""
        g_score = greedy_result.get("score", 0.0)
        a_score = ga_result.get("score", 0.0)
        g_service = greedy_result.get("taux_service", 0.0)
        a_service = ga_result.get("taux_service", 0.0)
        g_open = greedy_result.get("taux_ouverture", 0.0)
        a_open = ga_result.get("taux_ouverture", 0.0)
        g_setups = greedy_result.get("nb_changements_serie", 0)
        a_setups = ga_result.get("nb_changements_serie", 0)

        return {
            "score_delta": round(a_score - g_score, 4),
            "score_pct": round((a_score - g_score) / max(1e-6, g_score) * 100, 2),
            "taux_service_delta": round(a_service - g_service, 4),
            "taux_ouverture_delta": round(a_open - g_open, 4),
            "setups_delta": a_setups - g_setups,
            "winner": "ga" if a_score > g_score else "greedy" if g_score > a_score else "tie",
        }

    def _execute(
        self,
        loader: DataLoader,
        immediate_components: bool,
        blocking_components_mode: str,
        demand_horizon_days: int = 15,
        progress_callback=None,
        run_id: Optional[str] = None,
        algorithm: str = "greedy",
        ga_random_seed: Optional[int] = None,
        ga_config_overrides: Optional[dict] = None,
    ) -> dict[str, Any]:
        from ..scheduling import run_schedule as run_schedule_engine
        from ..scheduling.ga.config import load_ga_config

        ga_config = None
        if algorithm == "ga":
            try:
                overrides = ga_config_overrides or {}
                ga_config = load_ga_config(
                    path=str(self.project_root / "config" / "ga.json"),
                    overrides=overrides,
                )
            except Exception:
                from ..scheduling.ga.config import default_ga_config
                ga_config = default_ga_config()

        result = run_schedule_engine(
            loader,
            reference_date=date.today(),
            output_dir=str(self.project_root / "outputs"),
            weights_path=str(self.project_root / "config" / "weights.json"),
            immediate_components=immediate_components,
            blocking_components_mode=blocking_components_mode,
            demand_calendar_days=demand_horizon_days,
            progress_callback=progress_callback,
            run_id=run_id,
            algorithm=algorithm,
            ga_config=ga_config,
            ga_random_seed=ga_random_seed,
        )
        return serialize_value(result)

    def _run_in_background(
        self,
        run_id: str,
        loader: DataLoader,
        immediate_components: bool,
        blocking_components_mode: str,
        demand_horizon_days: int = 15,
        algorithm: str = "greedy",
        ga_random_seed: Optional[int] = None,
        ga_config_overrides: Optional[dict] = None,
    ) -> None:
        run_state = self.runs[run_id]
        start_mono = run_state.pop("_start_mono", time.monotonic())

        def on_progress(step_key: str, step_label: str, step_index: int, step_count: int, *, ga_stats: dict | None = None) -> None:
            elapsed_ms = int((time.monotonic() - start_mono) * 1000)
            progress_pct = round((step_index + 1) / step_count * 100) if step_count > 0 else 0
            update: dict[str, Any] = {
                "step_key": step_key,
                "step_label": step_label,
                "step_index": step_index,
                "step_count": step_count,
                "progress_percent": progress_pct,
                "elapsed_ms": elapsed_ms,
            }
            if ga_stats is not None:
                update["ga_stats"] = ga_stats
            run_state.update(update)

        try:
            result = self._execute(
                loader=loader,
                immediate_components=immediate_components,
                blocking_components_mode=blocking_components_mode,
                demand_horizon_days=demand_horizon_days,
                progress_callback=on_progress,
                run_id=run_id,
                algorithm=algorithm,
                ga_random_seed=ga_random_seed,
                ga_config_overrides=ga_config_overrides,
            )
            run_state.update(
                {
                    "status": "completed",
                    "completed_at": _utc_now_iso(),
                    "result": result,
                }
            )
        except Exception as exc:  # pragma: no cover
            run_state.update(
                {
                    "status": "failed",
                    "completed_at": _utc_now_iso(),
                    "error": str(exc),
                }
            )

    def get_run(self, run_id: str) -> Optional[dict[str, Any]]:
        return self.runs.get(run_id)
