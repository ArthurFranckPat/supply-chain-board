"""Routes FastAPI pour l'interrogation Sage X3."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from ..services.x3_client import X3Client

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
    representation: str = Field(default="ZSTOJOU", description="Représentation STOJOU")
    order_by: str | None = Field(default="DAT desc", description="Tri")
    count: int | None = Field(default=100, ge=1, le=1000)


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
    """Retourne l'historique des mouvements de stock pour un article."""
    try:
        client = X3Client()
        where = f"ITMREF eq '{payload.itmref}'"
        return client.query(
            classe="STOJOU",
            representation=payload.representation,
            where=where,
            order_by=payload.order_by,
            count=payload.count,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
