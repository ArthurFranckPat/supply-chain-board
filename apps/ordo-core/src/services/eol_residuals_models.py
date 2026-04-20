"""Contrats Pydantic pour le module EOL Residual Stock Analysis."""

from __future__ import annotations

from pydantic import BaseModel, Field
from typing import Literal


class EolResidualsRequest(BaseModel):
    familles: list[str] = Field(default_factory=list)
    prefixes: list[str] = Field(default_factory=list)
    bom_depth_mode: Literal["level1", "full"] = "full"
    stock_mode: Literal["physical", "net_releaseable"] = "physical"


class EolResidualsComponent(BaseModel):
    component_code: str
    description: str
    component_type: str  # "ACHAT" | "FABRICATION"
    used_by_target_pf_count: int
    stock_qty: float
    pmp: float
    value: float


class EolResidualsSummary(BaseModel):
    target_pf_count: int
    unique_component_count: int
    total_stock_qty: float
    total_value: float


class EolResidualsResponse(BaseModel):
    summary: EolResidualsSummary
    components: list[EolResidualsComponent]
    warnings: list[str]
