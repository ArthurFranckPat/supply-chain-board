from __future__ import annotations

from typing import TYPE_CHECKING

from suivi_commandes.domain.of_matcher import OfMatcher, OFInfo
from suivi_commandes.domain.models import TypeCommande

if TYPE_CHECKING:
    from erp_data_access.protocols import DataReader


class DataReaderOfMatcher(OfMatcher):
    """Implémentation de OfMatcher via le DataReader ERP."""

    def __init__(self, data_reader: "DataReader") -> None:
        self._reader = data_reader

    @staticmethod
    def _is_plannable(statut_num: int | None) -> bool:
        return int(statut_num or 0) in (1, 2, 3)

    def find_matching_of(
        self,
        num_commande: str,
        article: str,
        type_commande: TypeCommande,
    ) -> OFInfo | None:
        # 1. Chercher par of_contremarque
        besoin = None
        for b in self._reader.commandes_clients:
            if b.num_commande == num_commande and b.article == article:
                besoin = b
                break

        if besoin and besoin.of_contremarque:
            of = self._reader.get_of_by_num(besoin.of_contremarque)
            if (
                of
                and of.article == article
                and self._is_plannable(of.statut_num)
                and of.qte_restante > 0
            ):
                return self._to_of_info(of)

        # 2. Pour MTS, chercher par origine (hard-pegging)
        if type_commande == TypeCommande.MTS:
            ofs = self._reader.get_ofs_by_origin(num_commande, article=article)
            ofs = [
                o
                for o in ofs
                if str(o.methode_obtention_livraison).strip().lower() == "ordre de fabrication"
                and self._is_plannable(o.statut_num)
                and o.qte_restante > 0
            ]
            if ofs:
                ofs.sort(key=self._of_sort_key)
                return self._to_of_info(ofs[0])

        # 3. Fallback : n'importe quel OF planifiable de l'article
        ofs = [
            o
            for o in self._reader.get_ofs_by_article(article)
            if self._is_plannable(o.statut_num) and o.qte_restante > 0
        ]
        if not ofs:
            return None
        ofs.sort(key=self._of_sort_key)
        return self._to_of_info(ofs[0])

    def get_allocations(self, num_of: str) -> dict[str, float]:
        allocs = self._reader.get_allocations_of(num_of)
        result: dict[str, float] = {}
        for a in allocs:
            result[a.article] = result.get(a.article, 0.0) + float(a.qte_allouee)
        return result

    def _to_of_info(self, of) -> OFInfo:
        return OFInfo(
            num_of=of.num_of,
            article=of.article,
            qte_restante=float(of.qte_restante),
            statut_num=int(of.statut_num or 0),
            date_debut=of.date_debut,
            date_fin=of.date_fin,
        )

    def _of_sort_key(self, of):
        return (
            {1: 0, 2: 1, 3: 2}.get(of.statut_num, 3),
            abs((of.date_fin - of.date_debut).days if of.date_fin and of.date_debut else 0),
            of.num_of,
        )
