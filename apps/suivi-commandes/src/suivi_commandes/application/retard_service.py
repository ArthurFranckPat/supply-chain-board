"""Application service — calcul de charge retard par poste."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import pandas as pd

from suivi_commandes.data_loader import load_order_lines
from suivi_commandes.domain.status_assigner import assign_statuses

from .composition import ErpContext


@dataclass(frozen=True)
class RetardChargeItem:
    poste: str
    libelle: str
    heures: float


@dataclass(frozen=True)
class RetardChargeResult:
    items: list[RetardChargeItem]
    total_heures: float


class RetardService:
    """Calcule la charge en retard par poste de charge."""

    @staticmethod
    def compute(
        folder: str | None = None,
        reference_date: str | None = None,
    ) -> RetardChargeResult:
        from suivi_commandes.domain.retard_charge_calculator import compute_retard_charge

        lines, loader = load_order_lines(extractions_dir=Path(folder) if folder else None)
        ctx = ErpContext.from_loader(loader)

        stock_provider = ctx.stock_provider
        ref_date = pd.Timestamp(reference_date).date() if reference_date else None
        assignments = assign_statuses(lines, stock_provider, reference_date=ref_date)

        charge_map = compute_retard_charge(
            assignments, ctx.bom_navigator, ctx.charge_calculator
        )

        items = [
            RetardChargeItem(
                poste=poste,
                libelle=str(info.get("libelle", "")),
                heures=round(float(info.get("heures", 0)), 2),
            )
            for poste, info in charge_map.items()
        ]
        total = round(sum(item.heures for item in items), 2)
        return RetardChargeResult(items=items, total_heures=total)
