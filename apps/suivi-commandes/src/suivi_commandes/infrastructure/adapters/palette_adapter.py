from __future__ import annotations

from typing import TYPE_CHECKING

from suivi_commandes.domain.palette_port import PaletteInfoProvider, PaletteInfo

if TYPE_CHECKING:
    from erp_data_access.protocols import DataReader


class DataReaderPaletteInfoProvider(PaletteInfoProvider):
    """Implémentation de PaletteInfoProvider via le DataReader ERP."""

    def __init__(self, data_reader: "DataReader") -> None:
        self._reader = data_reader

    def get_palette_info(self, article: str) -> PaletteInfo | None:
        art = self._reader.get_article(article)
        if art is None or art.cond_type_2 != "PAL" or not art.cond_qte_2:
            return None

        is_eh = self._is_easyhome(article)
        return PaletteInfo(
            unites_par_pal=int(art.cond_qte_2),
            type_palette="1000x1200" if is_eh else "800x1200",
            gamme="EasyHome" if is_eh else "Standard",
        )

    def _is_easyhome(self, article: str) -> bool:
        gamme = self._reader.get_gamme(article)
        if gamme is None:
            return False
        return any(op.poste_charge == "PP_830" for op in gamme.operations)
