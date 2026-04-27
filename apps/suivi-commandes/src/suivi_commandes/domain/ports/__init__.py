"""Domain ports — interfaces abstraites (Protocols)."""
from __future__ import annotations
from .bom_port import BomNavigator
from .bom_source_port import BomDataSource, BomTree, BomComponent
from .stock_port import StockProvider, StockBreakdown, StockComposantInfo
from .charge_port import ChargeCalculatorPort
from .palette_port import PaletteInfoProvider, PaletteInfo
from .of_matcher import OfMatcher, OFInfo
from .report_renderer_port import ReportRendererPort
__all__ = ["BomNavigator", "BomDataSource", "BomTree", "BomComponent",
    "StockProvider", "StockBreakdown", "StockComposantInfo",
    "ChargeCalculatorPort", "PaletteInfoProvider", "PaletteInfo", "OfMatcher", "OFInfo",
    "ReportRendererPort"]
