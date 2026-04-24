"""Models for EOL Residual Stock Analysis."""

from dataclasses import dataclass
from typing import Optional


@dataclass
class EolComponent:
    article: str
    description: str
    component_type: str  # "ACHAT" or "FABRICATION"
    used_by_target_pf_count: int
    stock_qty: float
    pmp: float
    value: float


@dataclass
class EolSummary:
    target_pf_count: int
    unique_component_count: int
    total_stock_qty: float
    total_value: float


@dataclass
class EolResidualsResult:
    summary: EolSummary
    components: list[EolComponent]
    warnings: list[str]


@dataclass
class EolResidualsRequest:
    familles: list[str]
    prefixes: list[str]
    bom_depth_mode: str = "full"  # "level1" | "full"
    stock_mode: str = "physical"  # "physical" | "net_releaseable"
    component_types: str = "achat_fabrication"
