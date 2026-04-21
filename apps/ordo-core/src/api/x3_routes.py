"""Routes FastAPI pour l'interrogation Sage X3."""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..services.x3_client import X3Client
from ..services.x3_parser import parse_query_response, parse_resources, STOJOU_FIELDS

router = APIRouter(prefix="/x3", tags=["sage-x3"])


class X3QueryRequest(BaseModel):
    classe: str = Field(..., description="Nom de la classe (ex: STOJOU)")
    representation: str = Field(..., description="Nom de la représentation (ex: ZSTOJOU)")
    where: str | None = Field(default=None, description="Clause SData (ex: ITMREF eq '11035404')")
    order_by: str | None = Field(default=None, description="Tri SData (ex: DAT desc)")
    count: int | None = Field(default=None, ge=1, le=1000)
    offset: int | None = Field(default=None, ge=0)


class X3DetailRequest(BaseModel):
    classe: str = Field(..., description="Nom de la classe")
    key: str = Field(..., description="Clé primaire (composants séparés par ~)")
    representation: str = Field(..., description="Nom de la représentation")


class X3StockHistoryRequest(BaseModel):
    itmref: str = Field(..., description="Code article")
    order_by: str | None = Field(default="IPTDAT desc", description="Tri")
    count: int | None = Field(default=100, ge=1, le=1000)
    all_pages: bool = Field(default=False, description="Récupérer toutes les pages via $next")
    include_internal: bool = Field(
        default=False,
        description="Inclure les mouvements internes (TRSTYP <= 6)"
    )
    horizon_days: int = Field(
        default=45,
        ge=1,
        le=365,
        description="Horizon en jours glissants (depuis aujourd'hui - N jours)"
    )


def _filter_items(
    items: list[dict[str, Any]],
    payload: X3StockHistoryRequest,
) -> list[dict[str, Any]]:
    """Filtre côté Python les mouvements TRSTYP et la date."""
    horizon_date = date.today() - timedelta(days=payload.horizon_days)
    filtered: list[dict[str, Any]] = []

    for item in items:
        # Filtre date
        iptdat = item.get("IPTDAT")
        if iptdat:
            try:
                item_date = date.fromisoformat(str(iptdat))
                if item_date < horizon_date:
                    continue
            except ValueError:
                pass

        # Filtre TRSTYP : internes = <= 6, exclus par défaut
        trstyp = item.get("TRSTYP")
        if trstyp is not None and not payload.include_internal:
            try:
                if int(trstyp) <= 6:
                    continue
            except (ValueError, TypeError):
                pass

        filtered.append(item)

    return filtered


@router.post("/query")
def x3_query(payload: X3QueryRequest) -> dict[str, Any]:
    """Exécute une requête $query sur la WEB API Sage X3."""
    try:
        client = X3Client()
        return client.query(
            classe=payload.classe,
            representation=payload.representation,
            where=payload.where,
            order_by=payload.order_by,
            count=payload.count,
            offset=payload.offset,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.post("/detail")
def x3_detail(payload: X3DetailRequest) -> dict[str, Any]:
    """Lit le détail d'un enregistrement via $detail."""
    try:
        client = X3Client()
        return client.detail(
            classe=payload.classe,
            key=payload.key,
            representation=payload.representation,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.post("/stock-history")
def x3_stock_history(payload: X3StockHistoryRequest) -> dict[str, Any]:
    """Retourne l'historique des mouvements de stock pour un article (parsé)."""
    try:
        client = X3Client()
        where = f"ITMREF eq '{payload.itmref}'"

        if payload.all_pages:
            resources = client.query_all(
                classe="STOJOU",
                representation="ZSTOJOU",
                where=where,
                order_by=payload.order_by,
                count=payload.count,
            )
            items = parse_resources(resources, fields=STOJOU_FIELDS)
            items = _filter_items(items, payload)
            return {"count": len(items), "items": items}

        raw = client.query(
            classe="STOJOU",
            representation="ZSTOJOU",
            where=where,
            order_by=payload.order_by,
            count=payload.count,
        )
        result = parse_query_response(raw, fields=STOJOU_FIELDS)
        result["items"] = _filter_items(result["items"], payload)
        result["count"] = len(result["items"])
        return result
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
