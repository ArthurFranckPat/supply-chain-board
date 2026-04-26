"""Composition Root — fabrique les composants applicatifs à partir d'un DataReader.

C'est le SEUL endroit de suivi-commandes qui connaît les implémentations
concrètes des adapters.  L'API layer et le domaine ne dépendent que
des Ports (Protocols).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from erp_data_access.protocols import DataReader

from suivi_commandes.domain.bom_port import BomNavigator
from suivi_commandes.domain.charge_port import ChargeCalculatorPort
from suivi_commandes.domain.of_matcher import OfMatcher
from suivi_commandes.domain.palette_port import PaletteInfoProvider
from suivi_commandes.domain.stock_port import StockProvider
from suivi_commandes.infrastructure.adapters import (
    DataReaderBomNavigator,
    DataReaderOfMatcher,
    DataReaderPaletteInfoProvider,
    DataReaderStockProvider,
    ProductionPlanningChargeAdapter,
)


@dataclass(frozen=True)
class ErpContext:
    """Tous les ports prêts à l'emploi pour une session ERP."""

    stock_provider: StockProvider
    bom_navigator: BomNavigator
    of_matcher: OfMatcher
    charge_calculator: ChargeCalculatorPort
    palette_provider: PaletteInfoProvider
    _loader: "DataReader"  # Accès direct pour les cas non-portés (gamme, etc.)

    @classmethod
    def from_loader(cls, loader: "DataReader") -> "ErpContext":
        return cls(
            stock_provider=DataReaderStockProvider(loader),
            bom_navigator=DataReaderBomNavigator(loader),
            of_matcher=DataReaderOfMatcher(loader),
            charge_calculator=ProductionPlanningChargeAdapter(loader),
            palette_provider=DataReaderPaletteInfoProvider(loader),
            _loader=loader,
        )
