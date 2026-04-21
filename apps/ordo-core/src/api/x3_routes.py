"""Routes FastAPI pour l'interrogation Sage X3."""

from __future__ import annotations

from datetime import date, timedelta
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..services.x3_client import X3Client
from ..services.x3_parser import parse_query_response, parse_resources, STOJOU_FIELDS
import base64

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


def _build_stock_where(payload: X3StockHistoryRequest) -> list[str]:
    """Construit les clauses SData where pour /stock-history."""
    clauses: list[str] = [f"ITMREF eq '{payload.itmref}'"]

    if not payload.include_internal:
        clauses.append("TRSTYP le 6")

    horizon_date = (date.today() - timedelta(days=payload.horizon_days)).strftime("%Y-%m-%d")
    clauses.append(f"IPTDAT ge @{horizon_date}@")

    return clauses


@router.get("/config")
def x3_config() -> dict[str, str]:
    """Retourne la configuration X3 effective (password masqué)."""
    try:
        client = X3Client()
        creds = f"{client.username}:{client.password}"
        token = base64.b64encode(creds.encode()).decode()
        return {
            "base_url": client.base_url,
            "username": client.username,
            "password_masked": "*" * len(client.password),
            "auth_header": f"Basic {token}",
            "full_url_template": f"{client.base_url}/{{classe}}?representation={{representation}}.$query",
        }
    except Exception as exc:
        return {
            "error": str(exc),
            "env_file_searched": str(Path(__file__).resolve().parents[2] / ".env"),
        }


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
        where = _build_stock_where(payload)

        if payload.all_pages:
            resources = client.query_all(
                classe="STOJOU",
                representation="ZSTOJOU",
                where=where,
                order_by=payload.order_by,
            )
            items = parse_resources(resources, fields=STOJOU_FIELDS)
            return {"count": len(items), "items": items}

        raw = client.query(
            classe="STOJOU",
            representation="ZSTOJOU",
            where=where,
            order_by=payload.order_by,
        )
        return parse_query_response(raw, fields=STOJOU_FIELDS)
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
