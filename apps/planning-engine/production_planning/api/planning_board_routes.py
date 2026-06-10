"""Routes du planning board — ordonnancement visuel des OF.

Outil autonome : les données d'entrée sont les OF bruts de l'ERP
(Ordres de fabrication.csv), enrichis du poste de charge et de la durée
estimée via les gammes. Aucune dépendance au moteur d'ordonnancement.

Les modifications utilisateur (replanification, affermissement, édition)
sont des overrides locaux persistés en SQLite — l'ERP reste lecture seule.
"""

from __future__ import annotations

from datetime import date, timedelta
from functools import lru_cache
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field

from ..services.planning_board_store import PlanningBoardStore
from ..services.planning_board_feasibility import (
    build_effective_ofs,
    evaluate_window,
    whatif_order,
)
from ..services.planning_board_orders import evaluate_order_impacts

router = APIRouter(prefix="/api/v1/planning-board", tags=["planning-board"])

STATUT_LABELS = {1: "Ferme", 2: "Planifié", 3: "Suggéré"}


class FeasibilityRequest(BaseModel):
    """Fenêtre d'évaluation (mêmes défauts que la liste des OF)."""

    date_from: Optional[str] = Field(default=None, alias="from")
    date_to: Optional[str] = Field(default=None, alias="to")


class WhatIfRequest(BaseModel):
    """Nouvelle demande client à simuler : article × quantité × date."""

    article: str = Field(..., min_length=1)
    quantite: int = Field(..., gt=0)
    date_besoin: str = Field(..., description="YYYY-MM-DD")
    date_from: Optional[str] = Field(default=None, alias="from")
    date_to: Optional[str] = Field(default=None, alias="to")


class OfPatchRequest(BaseModel):
    """Champs modifiables d'un OF. Clé absente = inchangé, null = retour ERP."""

    date_debut: Optional[str] = Field(default=None, description="YYYY-MM-DD")
    date_fin: Optional[str] = Field(default=None, description="YYYY-MM-DD")
    statut_num: Optional[int] = Field(default=None, ge=1, le=3)
    note: Optional[str] = Field(default=None, max_length=500)


def _loader(request: Request):
    loader = request.app.state.gui_service.loader
    if loader is None:
        raise HTTPException(
            status_code=409,
            detail="Aucune donnée chargée. Appelez /api/v1/data/load d'abord.",
        )
    return loader


@lru_cache(maxsize=1)
def _store_for(project_root: str) -> PlanningBoardStore:
    return PlanningBoardStore(Path(project_root) / "data" / "planning_board.db")


def _store(request: Request) -> PlanningBoardStore:
    return _store_for(str(request.app.state.gui_service.project_root))


def _parse_iso(value: Optional[str], field: str) -> Optional[date]:
    if value is None:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=f"{field}: date invalide '{value}'") from exc


def _first_operation(loader, article: str):
    gamme = loader.get_gamme(article)
    if gamme and gamme.operations:
        return gamme.operations[0]
    return None


def _merge_of(of, override: Optional[dict[str, Any]], loader) -> dict[str, Any]:
    """Fusionne un OF ERP avec son override local et l'enrichit (gamme)."""
    override = override or {}

    eff_debut = _safe_date(override.get("date_debut")) or of.date_debut
    eff_fin = _safe_date(override.get("date_fin")) or of.date_fin
    eff_statut = override.get("statut_num") or of.statut_num

    operation = _first_operation(loader, of.article)
    cadence = float(operation.cadence) if operation else 0.0
    duree_heures = round(of.qte_restante / cadence, 2) if cadence > 0 else None

    return {
        "num_of": of.num_of,
        "article": of.article,
        "description": of.description,
        "statut_num": eff_statut,
        "statut_texte": STATUT_LABELS.get(eff_statut, str(eff_statut)),
        "statut_origine": of.statut_num,
        "date_debut": eff_debut.isoformat() if eff_debut else None,
        "date_fin": eff_fin.isoformat() if eff_fin else None,
        "date_debut_origine": of.date_debut.isoformat() if of.date_debut else None,
        "date_fin_origine": of.date_fin.isoformat() if of.date_fin else None,
        "qte_a_fabriquer": of.qte_a_fabriquer,
        "qte_fabriquee": of.qte_fabriquee,
        "qte_restante": of.qte_restante,
        "poste_charge": operation.poste_charge if operation else None,
        "libelle_poste": operation.libelle_poste if operation else None,
        "cadence": cadence or None,
        "duree_heures": duree_heures,
        "modified": bool(override),
        "note": override.get("note"),
        "updated_at": override.get("updated_at"),
    }


def _safe_date(value: Optional[str]) -> Optional[date]:
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        return None


def _effective_start(row: dict[str, Any]) -> Optional[str]:
    return row["date_debut"] or row["date_fin"]


@router.get("/ofs")
def list_ofs(
    request: Request,
    date_from: Optional[str] = Query(default=None, alias="from"),
    date_to: Optional[str] = Query(default=None, alias="to"),
    statut: Optional[int] = Query(default=None, ge=1, le=3),
    poste: Optional[str] = None,
    q: Optional[str] = None,
    include_done: bool = Query(default=False, description="Inclure les OF soldés (qte_restante <= 0)"),
) -> dict[str, Any]:
    """Liste des OF fusionnés (ERP + overrides), filtrables.

    Par défaut : fenêtre [aujourd'hui - 7j, aujourd'hui + 42j] sur la date
    de début effective (ou date de fin si pas de début).
    """
    loader = _loader(request)
    store = _store(request)
    overrides = store.get_overrides()

    today = date.today()
    from_d = _parse_iso(date_from, "from") or (today - timedelta(days=7))
    to_d = _parse_iso(date_to, "to") or (today + timedelta(days=42))
    if to_d < from_d:
        raise HTTPException(status_code=422, detail="'to' antérieur à 'from'")

    query = q.strip().lower() if q else None

    rows: list[dict[str, Any]] = []
    postes: set[str] = set()
    for of in loader.ofs:
        if not include_done and of.qte_restante <= 0:
            continue
        row = _merge_of(of, overrides.get(of.num_of), loader)

        start = _safe_date(_effective_start(row))
        if start is None or not (from_d <= start <= to_d):
            continue
        if row["poste_charge"]:
            postes.add(row["poste_charge"])
        if statut is not None and row["statut_num"] != statut:
            continue
        if poste and row["poste_charge"] != poste:
            continue
        if query and not (
            query in of.num_of.lower()
            or query in of.article.lower()
            or query in (of.description or "").lower()
        ):
            continue
        rows.append(row)

    rows.sort(key=lambda r: (_effective_start(r) or "9999", r["num_of"]))
    return {
        "ofs": rows,
        "total": len(rows),
        "window": {"from": from_d.isoformat(), "to": to_d.isoformat()},
        "postes": sorted(postes),
        "nb_modified": sum(1 for r in rows if r["modified"]),
    }


@router.get("/ofs/{num_of}")
def get_of(num_of: str, request: Request) -> dict[str, Any]:
    loader = _loader(request)
    of = loader.get_of_by_num(num_of)
    if of is None:
        raise HTTPException(status_code=404, detail=f"OF inconnu: {num_of}")
    return _merge_of(of, _store(request).get_override(num_of), loader)


@router.patch("/ofs/{num_of}")
def patch_of(num_of: str, payload: OfPatchRequest, request: Request) -> dict[str, Any]:
    """Modifie un OF (override local) : dates, statut (affermir = statut_num 1), note."""
    loader = _loader(request)
    of = loader.get_of_by_num(num_of)
    if of is None:
        raise HTTPException(status_code=404, detail=f"OF inconnu: {num_of}")

    fields = payload.model_dump(exclude_unset=True)
    if not fields:
        raise HTTPException(status_code=422, detail="Aucun champ à modifier")

    # Validation des dates fournies
    debut = _parse_iso(fields.get("date_debut"), "date_debut")
    fin = _parse_iso(fields.get("date_fin"), "date_fin")
    eff_debut = debut or _safe_date((_store(request).get_override(num_of) or {}).get("date_debut")) or of.date_debut
    eff_fin = fin or _safe_date((_store(request).get_override(num_of) or {}).get("date_fin")) or of.date_fin
    if "date_debut" in fields and fields["date_debut"] is None:
        eff_debut = of.date_debut
    if "date_fin" in fields and fields["date_fin"] is None:
        eff_fin = of.date_fin
    if eff_debut and eff_fin and eff_fin < eff_debut:
        raise HTTPException(status_code=422, detail="date_fin antérieure à date_debut")

    # Interdire la rétrogradation d'un OF ferme ERP (déjà lancé en production)
    if of.statut_num == 1 and fields.get("statut_num") not in (None, 1):
        raise HTTPException(
            status_code=422,
            detail=f"OF {num_of} déjà Ferme dans l'ERP : rétrogradation impossible",
        )

    store = _store(request)
    store.upsert_override(num_of, fields)
    return _merge_of(of, store.get_override(num_of), loader)


@router.delete("/ofs/{num_of}/override")
def reset_of(num_of: str, request: Request) -> dict[str, Any]:
    """Annule les modifications locales d'un OF (retour aux valeurs ERP)."""
    loader = _loader(request)
    of = loader.get_of_by_num(num_of)
    if of is None:
        raise HTTPException(status_code=404, detail=f"OF inconnu: {num_of}")
    deleted = _store(request).delete_override(num_of)
    row = _merge_of(of, None, loader)
    row["reset"] = deleted
    return row


@router.get("/overrides")
def list_overrides(request: Request) -> dict[str, Any]:
    """Toutes les modifications locales en attente (revue avant report ERP)."""
    overrides = _store(request).get_overrides()
    return {"overrides": list(overrides.values()), "total": len(overrides)}


@router.delete("/overrides")
def reset_all(request: Request) -> dict[str, Any]:
    count = _store(request).delete_all_overrides()
    return {"deleted": count}


@router.post("/feasibility")
def evaluate_feasibility(payload: FeasibilityRequest, request: Request) -> dict[str, Any]:
    """Faisabilité de tous les OF de la fenêtre, overrides appliqués.

    Allocation virtuelle séquentielle : affermis d'abord, puis date de
    besoin croissante, puis faisables avant non-faisables. Un OF faisable
    réserve ses composants ACHAT → la concurrence est visible.
    """
    loader = _loader(request)
    overrides = _store(request).get_overrides()

    today = date.today()
    from_d = _parse_iso(payload.date_from, "from") or (today - timedelta(days=7))
    to_d = _parse_iso(payload.date_to, "to") or (today + timedelta(days=42))
    if to_d < from_d:
        raise HTTPException(status_code=422, detail="'to' antérieur à 'from'")

    effective_ofs = build_effective_ofs(loader, overrides, from_d, to_d)
    entries = evaluate_window(loader, effective_ofs, horizon_end=to_d)

    results = {num_of: entry.to_dict() for num_of, entry in entries.items()}
    return {
        "results": results,
        "window": {"from": from_d.isoformat(), "to": to_d.isoformat()},
        "stats": {
            "nb_evalues": len(results),
            "nb_ok": sum(1 for e in results.values() if e["statut"] == "ok"),
            "nb_bloques": sum(1 for e in results.values() if e["statut"] == "bloque"),
            "nb_sans_nomenclature": sum(
                1 for e in results.values() if e["statut"] == "sans_nomenclature"
            ),
        },
    }


@router.post("/orders")
def order_impacts(payload: FeasibilityRequest, request: Request) -> dict[str, Any]:
    """Impacts du planning sur les commandes clients de la fenêtre.

    Matching commande→OF (contremarque MTS, ordre d'origine, stock virtuel
    puis OF partagés) croisé avec dates effectives (overrides) et
    faisabilité composants → statut par commande :
    on_time / stock / retard / bloquee / sans_couverture.
    """
    loader = _loader(request)
    overrides = _store(request).get_overrides()

    today = date.today()
    from_d = _parse_iso(payload.date_from, "from") or (today - timedelta(days=7))
    to_d = _parse_iso(payload.date_to, "to") or (today + timedelta(days=42))
    if to_d < from_d:
        raise HTTPException(status_code=422, detail="'to' antérieur à 'from'")

    return evaluate_order_impacts(loader, overrides, from_d=from_d, to_d=to_d)


@router.post("/whatif")
def whatif(payload: WhatIfRequest, request: Request) -> dict[str, Any]:
    """Simule une nouvelle commande (article × quantité × date) sans rien enregistrer.

    Retourne la faisabilité de la demande et la liste des OF existants qui
    deviendraient infaisables (composants asséchés), avec les commandes
    clients liées à ces OF.
    """
    loader = _loader(request)
    article = payload.article.strip()
    if loader.get_article(article) is None:
        raise HTTPException(status_code=404, detail=f"Article inconnu: {article}")

    besoin_d = _parse_iso(payload.date_besoin, "date_besoin")
    today = date.today()
    from_d = _parse_iso(payload.date_from, "from") or (today - timedelta(days=7))
    to_d = _parse_iso(payload.date_to, "to") or (today + timedelta(days=42))

    return whatif_order(
        loader,
        _store(request).get_overrides(),
        article=article,
        quantite=payload.quantite,
        date_besoin=besoin_d,
        from_d=from_d,
        to_d=to_d,
    )


@router.get("/events")
def list_events(request: Request, limit: int = Query(default=100, ge=1, le=1000)) -> dict[str, Any]:
    """Journal des actions utilisateur (historique des modifications)."""
    return {"events": _store(request).list_events(limit)}
