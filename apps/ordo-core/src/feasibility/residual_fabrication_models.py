"""Models for Residual Fabrication feasibility analysis."""

from dataclasses import dataclass
from typing import Optional


@dataclass
class ResidualComponentGap:
    article: str
    description: str
    qty_needed: float
    qty_available: float
    shortage_qty: float  # max(0, qty_needed - qty_available)
    is_purchase: bool
    path: list[str]  # BOM path from PF to this component


@dataclass
class ResidualFabricationResult:
    pf_article: str
    description: str
    desired_qty: int
    feasible: bool
    max_feasible_qty: int  # max units buildable from pool
    stock_gaps: list[ResidualComponentGap]
    alerts: list[str]  # "nomenclature unavailable", "not fabrication", etc.
