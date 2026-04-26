"""Domain layer — modèles, ports et services métier.

Ré-exporte les sous-packages pour compatibilité avec les imports existants.
"""

from __future__ import annotations

# Models
from .models import OrderLine, TypeCommande, Status, Emplacement
from .models import RetardCause, CauseType

# Ports
from .ports import (
    BomNavigator,
    BomDataSource,
    BomTree,
    BomComponent,
    StockProvider,
    StockBreakdown,
    StockComposantInfo,
    ChargeCalculatorPort,
    PaletteInfoProvider,
    PaletteInfo,
    OfMatcher,
    OFInfo,
)

# Services
from .services import (
    StatusAssignment,
    assign_statuses,
    analyze_retard_cause,
    compute_retard_charge,
    compute_palette_summary,
    get_component_shortages,
    is_in_bom,
    is_component_in_subassembly,
)

__all__ = [
    # Models
    "OrderLine", "TypeCommande", "Status", "Emplacement",
    "RetardCause", "CauseType",
    # Ports
    "BomNavigator", "BomDataSource", "BomTree", "BomComponent",
    "StockProvider", "StockBreakdown", "StockComposantInfo",
    "ChargeCalculatorPort", "PaletteInfoProvider", "PaletteInfo",
    "OfMatcher", "OFInfo",
    # Services
    "StatusAssignment", "assign_statuses", "analyze_retard_cause",
    "compute_retard_charge", "compute_palette_summary",
    "get_component_shortages", "is_in_bom", "is_component_in_subassembly",
]
