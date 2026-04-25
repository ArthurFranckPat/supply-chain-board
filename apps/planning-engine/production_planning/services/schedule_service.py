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
            from ..scheduling.db_schedule import init_db
            init_db()
        except Exception:
            pass

    def run_schedule(
        self,
        loader: DataLoader,
        immediate_components: bool = False,
        blocking_components_mode: str = "blocked",
        demand_horizon_days: int = 15,
    ) -> dict[str, Any]:
        run_id = uuid4().hex[:12]

        try:
            from ..scheduling import db_schedule
            db_schedule.save_run(run_id, date.today(), {
                "immediate_components": immediate_components,
                "blocking_components_mode": blocking_components_mode,
                "demand_horizon_days": demand_horizon_days,
            })
        except Exception:
            pass

        run_state: dict[str, Any] = {
            "run_id": run_id,
            "status": "running",
            "created_at": _utc_now_iso(),
            "kind": "schedule",
            "_start_mono": time.monotonic(),
        }
        self.runs[run_id] = run_state
        Thread(
            target=self._run_in_background,
            args=(run_id, loader, immediate_components, blocking_components_mode, demand_horizon_days),
            daemon=True,
        ).start()
        return run_state

    def _execute(
        self,
        loader: DataLoader,
        immediate_components: bool,
        blocking_components_mode: str,
        demand_horizon_days: int = 15,
        progress_callback=None,
        run_id: Optional[str] = None,
    ) -> dict[str, Any]:
        from ..scheduling import run_schedule as run_schedule_engine

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
        )
        return serialize_value(result)

    def _run_in_background(
        self,
        run_id: str,
        loader: DataLoader,
        immediate_components: bool,
        blocking_components_mode: str,
        demand_horizon_days: int = 15,
    ) -> None:
        run_state = self.runs[run_id]
        start_mono = run_state.pop("_start_mono", time.monotonic())

        def on_progress(step_key: str, step_label: str, step_index: int, step_count: int) -> None:
            elapsed_ms = int((time.monotonic() - start_mono) * 1000)
            progress_pct = round((step_index + 1) / step_count * 100) if step_count > 0 else 0
            run_state.update({
                "step_key": step_key,
                "step_label": step_label,
                "step_index": step_index,
                "step_count": step_count,
                "progress_percent": progress_pct,
                "elapsed_ms": elapsed_ms,
            })

        try:
            result = self._execute(
                loader=loader,
                immediate_components=immediate_components,
                blocking_components_mode=blocking_components_mode,
                demand_horizon_days=demand_horizon_days,
                progress_callback=on_progress,
                run_id=run_id,
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
