"""Application service layer for a local GUI/API."""

from __future__ import annotations

from dataclasses import asdict, is_dataclass
from datetime import date, datetime, timezone
from pathlib import Path
from threading import Thread
from typing import Any, Optional
from uuid import uuid4

from ..loaders import DataLoader
from ..loaders.csv_loader import DEFAULT_EXTRACTIONS_DIR
from ..scheduler.calendar_config import load_calendar_config, save_calendar_config, get_month_calendar
from ..scheduler.capacity_config import load_capacity_config, save_capacity_config, to_api_dict, set_daily_override, remove_daily_override, set_weekly_override, remove_weekly_override, ensure_poste
from ..scheduler.holidays import ensure_holidays_in_calendar, refresh_holidays as refresh_holidays_api


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _serialize_value(value: Any) -> Any:
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if is_dataclass(value):
        return {
            key: _serialize_value(item)
            for key, item in asdict(value).items()
            if not key.startswith("_")
        }
    if isinstance(value, dict):
        return {key: _serialize_value(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_serialize_value(item) for item in value]
    return value


def _build_loader_counts(loader: DataLoader) -> dict[str, int]:
    return {
        "articles": len(loader.articles),
        "nomenclatures": len(loader.nomenclatures),
        "gammes": len(loader.gammes),
        "ofs": len(loader.ofs),
        "stocks": len(loader.stocks),
        "receptions": len(loader.receptions),
        "commandes_clients": len(loader.commandes_clients),
    }


class GuiAppService:
    """Thin application facade for GUI and API consumers."""

    def __init__(self, project_root: str | Path = "."):
        self.project_root = Path(project_root).resolve()
        self.loader: Optional[DataLoader] = None
        self.loaded_source: Optional[dict[str, Any]] = None
        self.runs: dict[str, dict[str, Any]] = {}

    def get_config(self) -> dict[str, Any]:
        return {
            "project_root": str(self.project_root),
            "data_dir_default": str(DEFAULT_EXTRACTIONS_DIR),
            "extractions_mode_supported": True,
            "sources": [
                {"id": "extractions", "label": "Extractions ERP"},
            ],
            "feasibility_modes": [
                {"id": "projected", "label": "Dispo projetee"},
                {"id": "immediate", "label": "Dispo immediate"},
                {"id": "allocation", "label": "Allocation virtuelle"},
            ],
        }

    def load_data(
        self,
        source: str = "extractions",
        data_dir: Optional[str] = None,
        extractions_dir: Optional[str] = None,
    ) -> dict[str, Any]:
        if source != "extractions":
            raise ValueError(f"Source non supportee: {source}")

        target_dir = extractions_dir or data_dir or str(DEFAULT_EXTRACTIONS_DIR)
        loader = DataLoader.from_extractions(target_dir)

        loader.load_all()
        self.loader = loader
        self.loaded_source = {
            "source": "extractions",
            "extractions_dir": target_dir,
            "loaded_at": _utc_now_iso(),
            "counts": _build_loader_counts(loader),
        }
        return self.loaded_source

    def get_run(self, run_id: str) -> Optional[dict[str, Any]]:
        return self.runs.get(run_id)

    def get_latest_report(self, report_type: str) -> dict[str, Any]:
        report_paths = {
            "actions": self.project_root / "reports" / "actions" / "s1_action_report.md",
        }
        try:
            path = report_paths[report_type]
        except KeyError as exc:
            raise ValueError(f"Type de rapport inconnu: {report_type}") from exc

        return {
            "type": report_type,
            "path": str(path),
            "exists": path.exists(),
            "content": path.read_text(encoding="utf-8") if path.exists() else "",
            "updated_at": datetime.fromtimestamp(path.stat().st_mtime).isoformat() if path.exists() else None,
        }

    def list_reports(self) -> list[dict[str, Any]]:
        reports_dir = self.project_root / "reports"
        entries: list[dict[str, Any]] = []
        if not reports_dir.exists():
            return entries

        for path in sorted(reports_dir.rglob("*")):
            if not path.is_file():
                continue
            entries.append(
                {
                    "name": path.name,
                    "path": str(path),
                    "category": path.parent.name,
                    "updated_at": datetime.fromtimestamp(path.stat().st_mtime).isoformat(),
                    "size_bytes": path.stat().st_size,
                }
            )
        return entries

    # ── Scheduler run ──────────────────────────────────────────────

    def run_schedule(
        self,
        immediate_components: bool = False,
        blocking_components_mode: str = "blocked",
        demand_horizon_days: int = 15,
    ) -> dict[str, Any]:
        if self.loader is None:
            raise RuntimeError("Aucune donnee chargee. Appelez load_data avant run_schedule.")

        run_id = uuid4().hex[:12]
        run_state: dict[str, Any] = {
            "run_id": run_id,
            "status": "running",
            "created_at": _utc_now_iso(),
            "kind": "schedule",
        }
        self.runs[run_id] = run_state
        Thread(
            target=self._run_schedule_in_background,
            args=(run_id, immediate_components, blocking_components_mode, demand_horizon_days),
            daemon=True,
        ).start()
        return run_state

    def _execute_schedule(
        self,
        immediate_components: bool,
        blocking_components_mode: str,
        demand_horizon_days: int = 15,
    ) -> dict[str, Any]:
        from ..scheduler import run_schedule as run_schedule_engine

        assert self.loader is not None
        result = run_schedule_engine(
            self.loader,
            reference_date=date.today(),
            output_dir=str(self.project_root / "outputs"),
            weights_path=str(self.project_root / "config" / "weights.json"),
            immediate_components=immediate_components,
            blocking_components_mode=blocking_components_mode,
            demand_calendar_days=demand_horizon_days,
        )
        return _serialize_value(result)

    def _run_schedule_in_background(
        self,
        run_id: str,
        immediate_components: bool,
        blocking_components_mode: str,
        demand_horizon_days: int = 15,
    ) -> None:
        run_state = self.runs[run_id]
        try:
            result = self._execute_schedule(
                immediate_components=immediate_components,
                blocking_components_mode=blocking_components_mode,
                demand_horizon_days=demand_horizon_days,
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

    # ── Calendar / Capacity ─────────────────────────────────────────

    @property
    def _config_dir(self) -> str:
        return str(self.project_root / "config")

    def get_calendar(self, year: int, month: int) -> dict[str, Any]:
        config = load_calendar_config(self._config_dir, year)
        config = ensure_holidays_in_calendar(self._config_dir, config)
        days = get_month_calendar(year, month, config)
        return {
            "year": year,
            "month": month,
            "days": days,
            "holidays_fetched_at": config.holidays_fetched_at,
        }

    def update_manual_off_days(
        self,
        year: int,
        additions: list[dict],
        removals: list[str],
    ) -> dict[str, Any]:
        config = load_calendar_config(self._config_dir, year)
        config = ensure_holidays_in_calendar(self._config_dir, config)

        for entry in additions:
            from ..scheduler.calendar_config import DayOff
            config.manual_off_days.append(
                DayOff(date=entry["date"], name=entry.get("reason", ""), source="manual")
            )

        removal_set = set(removals)
        config.manual_off_days = [
            d for d in config.manual_off_days if d.date not in removal_set
        ]

        save_calendar_config(self._config_dir, config)
        return {"status": "ok", "manual_off_count": len(config.manual_off_days)}

    def refresh_holidays(self, year: int) -> dict[str, Any]:
        holidays = refresh_holidays_api(year, self._config_dir)
        config = load_calendar_config(self._config_dir, year)
        config.holidays = holidays
        config.holidays_fetched_at = _utc_now_iso()
        save_calendar_config(self._config_dir, config)
        return {"status": "ok", "holidays_count": len(holidays)}

    def get_capacity_config(self) -> dict[str, Any]:
        import re
        config = load_capacity_config(self._config_dir)
        result = to_api_dict(config)
        poste_re = re.compile(r"^PP_\d+$")

        # Filter out postes that don't match PP_XXX pattern
        result["postes"] = {
            k: v for k, v in result["postes"].items() if poste_re.match(k)
        }

        # Merge discovered postes from ERP data if loaded
        if self.loader is not None:
            discovered: dict[str, str] = {}  # poste -> libelle
            for gamme in self.loader.gammes.values():
                for op in gamme.operations:
                    if poste_re.match(op.poste_charge):
                        discovered.setdefault(op.poste_charge, op.libelle_poste or "")
            for poste in sorted(discovered):
                if poste in result["postes"]:
                    # Always use ERP label, it's the source of truth
                    result["postes"][poste]["label"] = discovered[poste]
                else:
                    result["postes"][poste] = {
                        "poste": poste,
                        "label": discovered[poste],
                        "default_hours": config.shift_hours,
                        "shift_pattern": "1x8",
                        "daily_overrides": {},
                    }

        return result

    def update_poste_capacity(
        self,
        poste: str,
        default_hours: float,
        shift_pattern: str,
        label: str = "",
    ) -> dict[str, Any]:
        config = load_capacity_config(self._config_dir)
        existing_label = getattr(config.postes.get(poste), "label", "") or ""
        # Prefer explicit label, then existing saved label, then empty
        effective_label = label or existing_label
        p = ensure_poste(config, poste, effective_label)
        p.default_hours = default_hours
        p.shift_pattern = shift_pattern
        if effective_label:
            p.label = effective_label
        save_capacity_config(self._config_dir, config)
        return {"status": "ok"}

    def set_capacity_override(
        self,
        poste: str,
        key: str,
        hours: float = 0.0,
        reason: str = "",
        pattern: Optional[dict[str, float]] = None,
    ) -> dict[str, Any]:
        config = load_capacity_config(self._config_dir)
        if "-W" in key:
            if pattern is not None:
                set_weekly_override(config, key, poste, pattern, reason)
            else:
                # Legacy: single hours value → create uniform pattern
                p = {str(d): hours for d in range(1, 8)}
                set_weekly_override(config, key, poste, p, reason)
        else:
            set_daily_override(config, poste, key, hours, reason)
        save_capacity_config(self._config_dir, config)
        return {"status": "ok"}

    def remove_capacity_override(
        self,
        poste: str,
        key: str,
    ) -> dict[str, Any]:
        config = load_capacity_config(self._config_dir)
        if "-W" in key:
            remove_weekly_override(config, key, poste)
        else:
            remove_daily_override(config, poste, key)
        save_capacity_config(self._config_dir, config)
        return {"status": "ok"}
