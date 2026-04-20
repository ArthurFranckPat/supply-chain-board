"""Application service layer for a local GUI/API."""

from __future__ import annotations

import time
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
        self._analyse_rupture_service: Optional[Any] = None
        self._eol_residuals_service: Optional[Any] = None
        self._eol_residuals_fab_service: Optional[Any] = None
        try:
            from ..scheduler.db_schedule import init_db
            init_db()
        except Exception:
            pass

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
        self._analyse_rupture_service = None  # Invalider le service d'analyse de rupture
        self._eol_residuals_service = None  # Invalider le service EOL residuels
        self._eol_residuals_fab_service = None
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

        try:
            from ..scheduler import db_schedule
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
        progress_callback=None,
        run_id: Optional[str] = None,
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
            progress_callback=progress_callback,
            run_id=run_id,
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
            result = self._execute_schedule(
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

    # ── Analyse de Rupture ──────────────────────────────────────────

    def analyser_rupture(
        self,
        component_code: str,
        include_previsions: bool = False,
        include_receptions: bool = False,
        use_pool: bool = True,
        merge_branches: bool = True,
        include_sf: bool = True,
        include_pf: bool = False,
    ) -> dict[str, Any]:
        """Analyse l'impact d'une rupture composant."""
        if self.loader is None:
            raise RuntimeError("Aucune donnee chargee. Appelez load_data avant analyser_rupture.")

        from ..checkers.analyse_rupture import AnalyseRuptureService

        # Reconstruire le service si le loader a change
        if self._analyse_rupture_service is None:
            self._analyse_rupture_service = AnalyseRuptureService(self.loader)

        result = self._analyse_rupture_service.analyze(
            component_code,
            include_previsions=include_previsions,
            include_receptions=include_receptions,
            use_pool=use_pool,
            merge_branches=merge_branches,
            include_sf=include_sf,
            include_pf=include_pf,
        )
        return _serialize_value(result)

    # ── EOL Residual Stock Analysis ────────────────────────────────

    def eol_residuals_analyze(
        self,
        familles: list[str],
        prefixes: list[str],
        bom_depth_mode: str = "full",
        stock_mode: str = "physical",
        component_types: str = "achat_fabrication",
        projection_date: Optional[str] = None,
    ) -> dict[str, Any]:
        """Analyse residual stock for EOL product families."""
        if self.loader is None:
            raise RuntimeError("Aucune donnee chargee. Appelez load_data avant eol_residuals_analyze.")

        from ..checkers.eol_residuals import EolResidualsService

        if self._eol_residuals_service is None:
            self._eol_residuals_service = EolResidualsService(self.loader)

        parsed_projection_date = None
        if projection_date and stock_mode == "projected":
            parsed_projection_date = date.fromisoformat(projection_date)

        result = self._eol_residuals_service.analyze(
            familles=familles,
            prefixes=prefixes,
            bom_depth_mode=bom_depth_mode,
            stock_mode=stock_mode,
            component_types=component_types,
            projection_date=parsed_projection_date,
        )
        return _serialize_value(result)

    def eol_residuals_fab_check(
        self,
        familles: list[str],
        prefixes: list[str],
        desired_qty: int = 1,
        bom_depth_mode: str = "full",
        stock_mode: str = "physical",
        projection_date: Optional[str] = None,
    ) -> dict[str, Any]:
        """Evaluate which PF can be built from the residual stock pool."""
        if self.loader is None:
            raise RuntimeError("Aucune donnee chargee. Appelez load_data avant.")

        from ..checkers.eol_residuals import EolResidualsService
        from ..checkers.residual_fabrication import ResidualFabricationService
        from .eol_residuals_models import EolComponent

        # Step 1: get residual pool
        if self._eol_residuals_service is None:
            self._eol_residuals_service = EolResidualsService(self.loader)

        eol_result = self._eol_residuals_service.analyze(
            familles=familles,
            prefixes=prefixes,
            bom_depth_mode=bom_depth_mode,
            stock_mode=stock_mode,
            component_types="achat_fabrication",
            projection_date=date.fromisoformat(projection_date) if projection_date else None,
        )

        pool = [
            EolComponent(
                article=c.article,
                description=c.description,
                component_type=c.component_type,
                used_by_target_pf_count=c.used_by_target_pf_count,
                stock_qty=c.stock_qty,
                pmp=c.pmp,
                value=c.value,
            )
            for c in eol_result.components
        ]

        # Step 2: find candidate PF codes matching the perimeter
        from ..models.article import TypeApprovisionnement
        pf_codes: list[str] = []
        for article in self.loader.articles.values():
            if not article.is_fabrication():
                continue
            famille = getattr(article, "famille_produit", None) or ""
            code = article.code or ""
            matches_famille = famille in familles
            matches_prefix = any(code.startswith(p) for p in prefixes)
            if matches_famille or matches_prefix:
                pf_codes.append(article.code)

        # Step 3: batch feasibility check
        service = ResidualFabricationService(self.loader, pool)
        results = service.check_all(pf_codes=pf_codes, desired_qty=desired_qty)
        return _serialize_value(results)

    # ── Feasibility ──────────────────────────────────────────────────

    def feasibility_check(
        self,
        article: str,
        quantity: int,
        desired_date: str,
        use_receptions: bool = True,
        check_capacity: bool = True,
        depth_mode: str = "full",
    ) -> dict[str, Any]:
        """Analyse de faisabilite pour un article a une date donnee."""
        if self.loader is None:
            raise RuntimeError("Aucune donnee chargee.")

        from ..checkers.feasibility import FeasibilityService
        from ..scheduler.capacity_config import load_capacity_config

        calendar_cfg = self._get_calendar_config()
        capacity_cfg = load_capacity_config(self._config_dir)

        service = FeasibilityService(self.loader, calendar_cfg, capacity_cfg)
        result = service.check(
            article, quantity, date.fromisoformat(desired_date),
            use_receptions=use_receptions,
            check_capacity=check_capacity,
            depth_mode=depth_mode,
        )
        return _serialize_value(result)

    def feasibility_promise_date(
        self,
        article: str,
        quantity: int,
        max_horizon_days: int = 60,
    ) -> dict[str, Any]:
        """Trouve la date la plus tot pour un article+quantite."""
        if self.loader is None:
            raise RuntimeError("Aucune donnee chargee.")

        from ..checkers.feasibility import FeasibilityService
        from ..scheduler.capacity_config import load_capacity_config

        calendar_cfg = self._get_calendar_config()
        capacity_cfg = load_capacity_config(self._config_dir)

        service = FeasibilityService(self.loader, calendar_cfg, capacity_cfg)
        result = service.promise_date(article, quantity, max_horizon_days=max_horizon_days)
        return _serialize_value(result)

    def feasibility_reschedule(
        self,
        num_commande: str,
        article: str,
        new_date: str,
        new_quantity: Optional[int] = None,
        depth_mode: str = "full",
        use_receptions: bool = True,
    ) -> dict[str, Any]:
        """Simule le deplacement d'une commande et analyse les impacts."""
        if self.loader is None:
            raise RuntimeError("Aucune donnee chargee.")

        from ..checkers.feasibility import FeasibilityService
        from ..scheduler.capacity_config import load_capacity_config

        calendar_cfg = self._get_calendar_config()
        capacity_cfg = load_capacity_config(self._config_dir)

        service = FeasibilityService(self.loader, calendar_cfg, capacity_cfg)
        result = service.reschedule(
            num_commande, article, date.fromisoformat(new_date),
            new_quantity=new_quantity,
            depth_mode=depth_mode,
            use_receptions=use_receptions,
        )
        return _serialize_value(result)

    def feasibility_search_articles(self, query: str, limit: int = 20) -> list[dict]:
        """Recherche d'articles pour autocomplete."""
        if self.loader is None:
            raise RuntimeError("Aucune donnee chargee.")

        from ..checkers.feasibility import FeasibilityService

        service = FeasibilityService(self.loader)
        return service.search_articles(query, limit)

    def feasibility_search_orders(self, query: str, limit: int = 30) -> list[dict]:
        """Recherche de commandes par num_commande ou article."""
        if self.loader is None:
            raise RuntimeError("Aucune donnee chargee.")

        from ..checkers.feasibility import FeasibilityService

        service = FeasibilityService(self.loader)
        return service.search_orders(query, limit)

    def _get_calendar_config(self):
        """Load calendar config for the current year."""
        from ..scheduler.calendar_config import load_calendar_config
        from ..scheduler.holidays import ensure_holidays_in_calendar
        year = date.today().year
        config = load_calendar_config(self._config_dir, year)
        config = ensure_holidays_in_calendar(self._config_dir, config)
        return config
