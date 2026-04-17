"""Application service layer for a local GUI/API."""

from __future__ import annotations

from dataclasses import asdict, is_dataclass
from datetime import date, datetime, timezone
from pathlib import Path
from threading import Thread
from typing import Any, Optional
from uuid import uuid4

from ..algorithms import AllocationManager, CommandeOFMatcher
from ..checkers import ImmediateChecker, ProjectedChecker, RecursiveChecker
from ..loaders import DataLoader
from ..loaders.csv_loader import DEFAULT_EXTRACTIONS_DIR

# TODO: restore src.reports module
try:
    from ..reports import build_action_report, write_action_report_markdown
except ImportError:
    build_action_report = None  # type: ignore[assignment]
    write_action_report_markdown = None  # type: ignore[assignment]


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

    def run_s1(
        self,
        horizon: int = 7,
        include_previsions: bool = False,
        feasibility_mode: str = "projected",
    ) -> dict[str, Any]:
        if self.loader is None:
            raise RuntimeError("Aucune donnee chargee. Appelez load_data avant run_s1.")

        run_id = uuid4().hex[:12]
        run_state = {
            "run_id": run_id,
            "status": "running",
            "created_at": _utc_now_iso(),
            "kind": "s1",
        }
        self.runs[run_id] = run_state
        Thread(
            target=self._run_s1_in_background,
            args=(run_id, horizon, include_previsions, feasibility_mode),
            daemon=True,
        ).start()
        return run_state

    def get_run(self, run_id: str) -> Optional[dict[str, Any]]:
        return self.runs.get(run_id)

    def get_latest_report(self, report_type: str) -> dict[str, Any]:
        report_paths = {
            "actions": self.project_root / "reports" / "actions" / "s1_action_report.md",
            "s1": self.project_root / "reports" / "decisions" / "decisions_report.md",
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

    def _execute_s1(
        self,
        horizon: int,
        include_previsions: bool,
        feasibility_mode: str,
    ) -> dict[str, Any]:
        assert self.loader is not None

        date_ref = date.today()
        besoins_s1 = self.loader.get_commandes_s1(
            date_ref,
            horizon,
            include_previsions=include_previsions,
        )
        matcher = CommandeOFMatcher(self.loader, date_tolerance_days=10)
        resultats_matching = matcher.match_commandes(besoins_s1)
        ofs_a_verifier = [r.of for r in resultats_matching if r.of is not None]

        if feasibility_mode == "immediate":
            checker = ImmediateChecker(self.loader)
            resultats_faisabilite = checker.check_all_ofs(ofs_a_verifier)
        elif feasibility_mode == "allocation":
            recursive_checker = RecursiveChecker(
                self.loader,
                use_receptions=True,
                check_date=date_ref,
            )
            allocation_manager = AllocationManager(
                data_loader=self.loader,
                checker=recursive_checker,
                decision_engine=None,
            )
            allocation_results = allocation_manager.allocate_stock(ofs_a_verifier)
            resultats_faisabilite = {
                of_num: result.feasibility_result
                for of_num, result in allocation_results.items()
                if result.feasibility_result is not None
            }
        else:
            checker = ProjectedChecker(self.loader)
            resultats_faisabilite = checker.check_all_ofs(ofs_a_verifier)

        action_report = None
        if build_action_report is not None:
            action_report = build_action_report(
                self.loader,
                resultats_matching,
                resultats_faisabilite,
                reference_date=date_ref,
            )
            if action_report and (action_report.component_lines or action_report.poste_kanban_lines):
                output_dir = self.project_root / "reports" / "actions"
                output_dir.mkdir(parents=True, exist_ok=True)
                if write_action_report_markdown is not None:
                    write_action_report_markdown(action_report, str(output_dir / "s1_action_report.md"))

        of_results = []
        for result in resultats_matching:
            if result.of is None:
                continue
            feasibility = resultats_faisabilite.get(result.of.num_of)
            if feasibility is None:
                continue
            of_results.append(
                {
                    "num_of": result.of.num_of,
                    "article": result.of.article,
                    "date_debut": result.of.date_debut.isoformat() if result.of.date_debut else None,
                    "date_fin": result.of.date_fin.isoformat(),
                    "qte_restante": result.of.qte_restante,
                    "commande": result.commande.num_commande,
                    "commande_article": result.commande.article,
                    "commande_date_expedition": result.commande.date_expedition_demandee.isoformat(),
                    "matching_method": result.matching_method,
                    "feasible": feasibility.feasible,
                    "missing_components": dict(feasibility.missing_components),
                    "alerts": list(feasibility.alerts),
                }
            )

        return {
            "reference_date": date_ref.isoformat(),
            "source": self.loaded_source,
            "summary": {
                "horizon_days": horizon,
                "include_previsions": include_previsions,
                "feasibility_mode": feasibility_mode,
                "besoins_s1": len(besoins_s1),
                "matched_ofs": len(ofs_a_verifier),
                "feasible_ofs": sum(1 for item in of_results if item["feasible"]),
                "non_feasible_ofs": sum(1 for item in of_results if not item["feasible"]),
                "action_components": len(action_report.component_lines) if action_report else 0,
                "kanban_postes": len(action_report.poste_kanban_lines) if action_report else 0,
            },
            "of_results": of_results,
            "action_report": _serialize_value(action_report),
            "reports": {
                "actions": self.get_latest_report("actions"),
                "s1": self.get_latest_report("s1"),
            },
        }

    def _run_s1_in_background(
        self,
        run_id: str,
        horizon: int,
        include_previsions: bool,
        feasibility_mode: str,
    ) -> None:
        run_state = self.runs[run_id]
        try:
            result = self._execute_s1(
                horizon=horizon,
                include_previsions=include_previsions,
                feasibility_mode=feasibility_mode,
            )
            run_state.update(
                {
                    "status": "completed",
                    "completed_at": _utc_now_iso(),
                    "result": result,
                }
            )
        except Exception as exc:  # pragma: no cover - defensive for UI/API runtime
            run_state.update(
                {
                    "status": "failed",
                    "completed_at": _utc_now_iso(),
                    "error": str(exc),
                }
            )

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
