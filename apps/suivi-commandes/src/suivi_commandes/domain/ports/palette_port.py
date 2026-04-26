from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol, runtime_checkable


@dataclass(frozen=True, slots=True)
class PaletteInfo:
    unites_par_pal: int
    type_palette: str   # "800x1200" ou "1000x1200"
    gamme: str          # "Standard" ou "EasyHome"


@runtime_checkable
class PaletteInfoProvider(Protocol):
    """Port : fournit les infos de conditionnement palette pour un article."""

    def get_palette_info(self, article: str) -> PaletteInfo | None:
        """Retourne les infos palette, ou None si l'article n'est pas en palette."""
        ...
