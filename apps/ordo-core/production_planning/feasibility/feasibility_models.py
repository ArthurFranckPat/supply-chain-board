"""Data models for feasibility analysis."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional


@dataclass
class ComponentGap:
    """Ecart entre besoin et disponibilite pour un composant."""

    article: str
    description: str
    quantity_needed: float
    quantity_available: float
    quantity_gap: float
    earliest_reception: Optional[str] = None  # ISO date
    is_purchase: bool = True


@dataclass
class CapacityImpact:
    """Impact sur la capacite d'un poste de charge."""

    poste_charge: str
    poste_label: str
    hours_required: float
    hours_available: float
    hours_remaining: float
    utilization_pct: float


@dataclass
class AffectedOrder:
    """Commande client impactee par une replanification."""

    num_commande: str
    client: str
    article: str
    quantity: int
    original_date: str  # ISO date
    impact: str  # "delayed" | "blocked" | "unaffected"


@dataclass
class ComponentDelta:
    """Comparaison avant/apres pour un composant lors d'une simulation."""

    article: str
    description: str
    is_purchase: bool = True
    # Situation originale (avant)
    original_needed: float = 0
    original_available: float = 0
    original_gap: float = 0
    # Situation simulee (apres)
    simulated_needed: float = 0
    simulated_available: float = 0
    simulated_gap: float = 0
    # Delta
    delta_needed: float = 0  # positif = besoin supplementaire
    delta_gap: float = 0   # positif = le trou s'agrandit
    status: str = "unchanged"  # "unchanged" | "worse" | "better" | "new_gap" | "resolved"
    earliest_reception: Optional[str] = None


@dataclass
class BOMNode:
    """Noeud dans l'arbre de nomenclature avec etat de stock."""

    article: str
    description: str
    is_purchase: bool
    quantity_needed: float
    quantity_per_unit: float
    stock_available: float
    stock_gap: float
    status: str  # "ok" | "shortage" | "no_stock_data"
    earliest_reception: Optional[str] = None
    children: list[BOMNode] = field(default_factory=list)


@dataclass
class FeasibilityResultV2:
    """Resultat complet d'une analyse de faisabilite."""

    feasible: bool
    article: str
    description: str
    quantity: int
    feasible_date: Optional[str] = None  # ISO date
    desired_date: Optional[str] = None  # ISO date
    component_gaps: list[ComponentGap] = field(default_factory=list)
    capacity_impacts: list[CapacityImpact] = field(default_factory=list)
    affected_orders: list[AffectedOrder] = field(default_factory=list)
    component_deltas: list[ComponentDelta] = field(default_factory=list)
    bom_tree: list[BOMNode] = field(default_factory=list)
    depth_mode: str = "full"  # "level1" | "full"
    # Contexte original (pour la replanification)
    original_date: Optional[str] = None  # ISO date
    original_quantity: Optional[int] = None
    alerts: list[str] = field(default_factory=list)
    computation_ms: int = 0
