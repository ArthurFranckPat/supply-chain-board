"""Domain services — logique métier pure."""
from __future__ import annotations
from .status_assigner import StatusAssignment, assign_statuses
from .cause_analyzer import analyze_retard_cause
from .retard_charge_calculator import compute_retard_charge
from .palette_calculator import compute_palette_summary
from .bom_service import get_component_shortages, is_in_bom, is_component_in_subassembly
__all__ = ["StatusAssignment", "assign_statuses", "analyze_retard_cause",
    "compute_retard_charge", "compute_palette_summary",
    "get_component_shortages", "is_in_bom", "is_component_in_subassembly"]
