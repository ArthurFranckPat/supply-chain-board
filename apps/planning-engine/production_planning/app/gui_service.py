"""Application service layer for a local GUI/API."""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from ..loaders import DataLoader
from ..loaders.csv_loader import DEFAULT_EXTRACTIONS_DIR
from ..planning.calendar_config import load_calendar_config, save_calendar_config, get_month_calendar
from ..planning.capacity_config import (
    load_capacity_config,
    save_capacity_config,
    to_api_dict,
    set_daily_override,
    remove_daily_override,
    set_weekly_override,
    remove_weekly_override,
    ensure_poste,
)
from ..planning.holidays import ensure_holidays_in_calendar, refresh_holidays as refresh_holidays_api
from ..services.schedule_service import ScheduleService
from ..services.feasibility_facade import FeasibilityFacade
from ..services.analyse_service import AnalyseService



def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


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
    """Thin application facade for GUI and API consumers.

    Delegates heavy domain work to focused sub-services:
    - ScheduleService   : scheduler execution & run tracking
    - FeasibilityFacade : feasibility checks with cached configs
    - AnalyseService    : rupture, EOL, lot-eco, stock analytics
    """

    def __init__(self, project_root: str | Path = "."):
        self.project_root = Path(project_root).resolve()
        self.loader: Optional[DataLoader] = None
        self.loaded_source: Optional[dict[str, Any]] = None
        self._schedule_service = ScheduleService(self.project_root)
        self._feasibility_facade: Optional[FeasibilityFacade] = None
        self._analyse_service: Optional[AnalyseService] = None

    # ------------------------------------------------------------------
    # Data loading
    # ------------------------------------------------------------------

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
        self._feasibility_facade = None
        self._analyse_service = None
        self.loaded_source = {
            "source": "extractions",
            "extractions_dir": target_dir,
            "loaded_at": _utc_now_iso(),
            "counts": _build_loader_counts(loader),
        }
        return self.loaded_source

    # ------------------------------------------------------------------
    # Scheduler delegation
    # ------------------------------------------------------------------

    def run_schedule(
        self,
        immediate_components: bool = False,
        blocking_components_mode: str = "blocked",
        demand_horizon_days: int = 15,
        algorithm: str = "greedy",
        ga_random_seed: Optional[int] = None,
        ga_config_overrides: Optional[dict] = None,
    ) -> dict[str, Any]:
        if self.loader is None:
            raise RuntimeError("Aucune donnee chargee. Appelez load_data avant run_schedule.")
        return self._schedule_service.run_schedule(
            loader=self.loader,
            immediate_components=immediate_components,
            blocking_components_mode=blocking_components_mode,
            demand_horizon_days=demand_horizon_days,
            algorithm=algorithm,
            ga_random_seed=ga_random_seed,
            ga_config_overrides=ga_config_overrides,
        )

    def run_compare(
        self,
        immediate_components: bool = False,
        blocking_components_mode: str = "blocked",
        demand_horizon_days: int = 15,
        ga_random_seed: Optional[int] = None,
        ga_config_overrides: Optional[dict] = None,
    ) -> dict[str, Any]:
        if self.loader is None:
            raise RuntimeError("Aucune donnee chargee. Appelez load_data avant run_compare.")
        return self._schedule_service.run_compare(
            loader=self.loader,
            immediate_components=immediate_components,
            blocking_components_mode=blocking_components_mode,
            demand_horizon_days=demand_horizon_days,
            ga_random_seed=ga_random_seed,
            ga_config_overrides=ga_config_overrides,
        )

    def get_run(self, run_id: str) -> Optional[dict[str, Any]]:
        return self._schedule_service.get_run(run_id)

    # ------------------------------------------------------------------
    # Reports
    # ------------------------------------------------------------------

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

    # ------------------------------------------------------------------
    # Calendar
    # ------------------------------------------------------------------

    @property
    def _config_dir(self) -> str:
        return str(self.project_root / "config")

    def get_calendar(self, year: int, month: int) -> dict[str, Any]:
        if month < 1 or month > 12:
            raise ValueError("Month must be 1-12")
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
        from ..planning.calendar_config import DayOff

        config = load_calendar_config(self._config_dir, year)
        config = ensure_holidays_in_calendar(self._config_dir, config)

        for entry in additions:
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

    # ------------------------------------------------------------------
    # Capacity
    # ------------------------------------------------------------------

    def get_capacity_config(self) -> dict[str, Any]:
        import re

        config = load_capacity_config(self._config_dir)
        result = to_api_dict(config)
        poste_re = re.compile(r"^PP_\d+$")

        result["postes"] = {
            k: v for k, v in result["postes"].items() if poste_re.match(k)
        }

        if self.loader is not None:
            discovered: dict[str, str] = {}
            for gamme in self.loader.gammes.values():
                for op in gamme.operations:
                    if poste_re.match(op.poste_charge):
                        discovered.setdefault(op.poste_charge, op.libelle_poste or "")
            for poste in sorted(discovered):
                if poste in result["postes"]:
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

    # ------------------------------------------------------------------
    # Feasibility delegation
    # ------------------------------------------------------------------

    def _ensure_feasibility(self) -> FeasibilityFacade:
        if self.loader is None:
            raise RuntimeError("Aucune donnee chargee.")
        if self._feasibility_facade is None:
            self._feasibility_facade = FeasibilityFacade(
                self.loader, self.project_root / "config"
            )
        return self._feasibility_facade

    def feasibility_check(
        self,
        article: str,
        quantity: int,
        desired_date: str,
        use_receptions: bool = True,
        check_capacity: bool = True,
        depth_mode: str = "full",
    ) -> dict[str, Any]:
        return self._ensure_feasibility().check(
            article, quantity, desired_date,
            use_receptions=use_receptions,
            check_capacity=check_capacity,
            depth_mode=depth_mode,
        )

    def feasibility_promise_date(
        self,
        article: str,
        quantity: int,
        max_horizon_days: int = 60,
    ) -> dict[str, Any]:
        return self._ensure_feasibility().promise_date(
            article, quantity, max_horizon_days=max_horizon_days
        )

    def feasibility_reschedule(
        self,
        num_commande: str,
        article: str,
        new_date: str,
        new_quantity: Optional[int] = None,
        depth_mode: str = "full",
        use_receptions: bool = True,
    ) -> dict[str, Any]:
        return self._ensure_feasibility().reschedule(
            num_commande, article, new_date,
            new_quantity=new_quantity,
            depth_mode=depth_mode,
            use_receptions=use_receptions,
        )

    def feasibility_search_articles(self, query: str, limit: int = 20) -> list[dict]:
        return self._ensure_feasibility().search_articles(query, limit)

    def feasibility_search_orders(self, query: str, limit: int = 30) -> list[dict]:
        return self._ensure_feasibility().search_orders(query, limit)

    # ------------------------------------------------------------------
    # Analysis delegation
    # ------------------------------------------------------------------

    def _ensure_analyse(self) -> AnalyseService:
        if self.loader is None:
            raise RuntimeError("Aucune donnee chargee.")
        if self._analyse_service is None:
            self._analyse_service = AnalyseService(self.loader)
        return self._analyse_service

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
        return self._ensure_analyse().analyser_rupture(
            component_code,
            include_previsions=include_previsions,
            include_receptions=include_receptions,
            use_pool=use_pool,
            merge_branches=merge_branches,
            include_sf=include_sf,
            include_pf=include_pf,
        )

    def analyser_lot_eco(self, target_coverage_weeks: float = 4.0, demand_horizon_weeks: float = 52.0) -> dict[str, Any]:
        return self._ensure_analyse().analyser_lot_eco(target_coverage_weeks, demand_horizon_weeks)

    def project_stock(
        self,
        article: str,
        stock_initial: float,
        lot_eco: int,
        lot_optimal: int,
        delai_reappro_jours: int,
        demande_hebdo: float,
        horizon_weeks: int = 26,
    ) -> dict[str, Any]:
        return self._ensure_analyse().project_stock(
            article=article,
            stock_initial=stock_initial,
            lot_eco=lot_eco,
            lot_optimal=lot_optimal,
            delai_reappro_jours=delai_reappro_jours,
            demande_hebdo=demande_hebdo,
            horizon_weeks=horizon_weeks,
        )

    def eol_residuals_analyze(
        self,
        familles: list[str],
        prefixes: list[str],
        bom_depth_mode: str = "full",
        stock_mode: str = "physical",
        component_types: str = "achat_fabrication",
        projection_date: Optional[str] = None,
    ) -> dict[str, Any]:
        return self._ensure_analyse().eol_residuals_analyze(
            familles=familles,
            prefixes=prefixes,
            bom_depth_mode=bom_depth_mode,
            stock_mode=stock_mode,
            component_types=component_types,
            projection_date=projection_date,
        )

    def eol_residuals_fab_check(
        self,
        familles: list[str],
        prefixes: list[str],
        desired_qty: int = 1,
        bom_depth_mode: str = "full",
        stock_mode: str = "physical",
        projection_date: Optional[str] = None,
    ) -> dict[str, Any]:
        return self._ensure_analyse().eol_residuals_fab_check(
            familles=familles,
            prefixes=prefixes,
            desired_qty=desired_qty,
            bom_depth_mode=bom_depth_mode,
            stock_mode=stock_mode,
            projection_date=projection_date,
        )

    def analyser_evolution_stock(
        self,
        itmref: str,
        horizon_days: int = 45,
        include_internal: bool = False,
        include_stock_q: bool = False,
    ) -> dict[str, Any]:
        return self._ensure_analyse().analyser_evolution_stock(
            itmref=itmref,
            horizon_days=horizon_days,
            include_internal=include_internal,
            include_stock_q=include_stock_q,
        )
