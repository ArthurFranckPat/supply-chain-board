"""Implémentation de BomDataSource via le DataReader ERP.

Cet adapter ne contient AUCUNE logique métier.
Il traduit uniquement les structures ERP en objets neutres du domaine.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from suivi_commandes.domain.bom_source_port import BomDataSource, BomTree, BomComponent

if TYPE_CHECKING:
    from erp_data_access.protocols import DataReader


class DataReaderBomDataSource(BomDataSource):
    """Traduction ERP → BomTree / BomComponent / stock disponible."""

    def __init__(self, data_reader: "DataReader") -> None:
        self._reader = data_reader

    def get_bom(self, article: str) -> BomTree | None:
        nom = self._reader.get_nomenclature(article)
        if nom is None:
            return None

        composants: list[BomComponent] = []
        for comp in nom.composants:
            composants.append(BomComponent(
                article=comp.article_composant,
                qte_par_parent=comp.qte_requise(1),  # quantité unitaire par parent
                est_fabrique=comp.is_fabrique(),
                est_achete=comp.is_achete(),
            ))
        return BomTree(article=article, composants=composants)

    def get_available_stock(self, article: str) -> float:
        stock = self._reader.get_stock(article)
        return float(stock.disponible()) if stock else 0.0
