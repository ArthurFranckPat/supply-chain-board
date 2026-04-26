"""Application service — résumé palette par jour / ligne / totaux."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import pandas as pd

from suivi_commandes.data_loader import load_order_lines
from suivi_commandes.domain.status_assigner import assign_statuses

from .composition import ErpContext


@dataclass(frozen=True)
class PaletteByDay:
    jour: str
    nb_palettes: float
    nb_commandes: int


@dataclass(frozen=True)
class PaletteMoyenne:
    palettes_par_jour: float
    palettes_par_commande: float


@dataclass(frozen=True)
class PaletteTotaux:
    total_palettes: float
    total_commandes: int


@dataclass(frozen=True)
class PaletteLigne:
    num_commande: str
    article: str
    nb_palettes: float


@dataclass(frozen=True)
class PaletteResult:
    lignes: list[PaletteLigne]
    by_day: list[PaletteByDay]
    moyenne: PaletteMoyenne
    totaux: PaletteTotaux


class PaletteService:
    """Calcule le résumé palette des commandes."""

    @staticmethod
    def compute(
        folder: str | None = None,
        reference_date: str | None = None,
    ) -> PaletteResult:
        from suivi_commandes.domain.palette_calculator import compute_palette_summary

        lines, loader = load_order_lines(extractions_dir=Path(folder) if folder else None)
        ctx = ErpContext.from_loader(loader)

        stock_provider = ctx.stock_provider
        ref_date = pd.Timestamp(reference_date).date() if reference_date else None
        assignments = assign_statuses(lines, stock_provider, reference_date=ref_date)

        result = compute_palette_summary(
            assignments, ctx.palette_provider, reference_date=ref_date
        )

        return PaletteResult(
            lignes=[PaletteLigne(**row) for row in result["lignes"]],
            by_day=[PaletteByDay(**d) for d in result["by_day"]],
            moyenne=PaletteMoyenne(**result["moyenne"]),
            totaux=PaletteTotaux(**result["totaux"]),
        )
