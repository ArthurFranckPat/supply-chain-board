from __future__ import annotations

from typing import TYPE_CHECKING

from erp_data_access.models.besoin_client import TypeCommande as ErpTypeCommande
from erp_data_access.protocols import DataReader

from suivi_commandes.domain.models import OrderLine, TypeCommande

if TYPE_CHECKING:
    from erp_data_access.protocols import DataReader


class SuivcdeMapper:
    """Transforme les données ERP (DataReader) en objets de domaine OrderLine.

    Remplace l'ancien build_suivcde_dataframe qui produisait un DataFrame legacy.
    """

    def __init__(self, data_reader: DataReader) -> None:
        self._reader = data_reader

    def to_order_lines(self, firm_orders_only: bool = True) -> list[OrderLine]:
        lines: list[OrderLine] = []

        for besoin in self._reader.commandes_clients:
            if firm_orders_only and not besoin.est_commande():
                continue

            article_obj = self._reader.get_article(besoin.article)

            is_fabrique = article_obj.is_fabrication() if article_obj else False
            hard_pegged = (
                self._is_hard_pegged(besoin.num_commande, besoin.article)
                if besoin.type_commande == ErpTypeCommande.MTS and is_fabrique
                else False
            )

            type_cmd = self._map_type_commande(besoin.type_commande)

            line = OrderLine(
                num_commande=besoin.num_commande,
                article=besoin.article,
                designation=besoin.description or "",
                nom_client=besoin.nom_client or "",
                type_commande=type_cmd,
                date_expedition=besoin.date_expedition_demandee,
                date_liv_prevue=None,  # Pas dans BesoinClient actuellement
                qte_commandee=float(besoin.qte_commandee),
                qte_allouee=float(besoin.qte_allouee),
                qte_restante=float(besoin.qte_restante_livraison),
                is_fabrique=is_fabrique,
                is_hard_pegged=hard_pegged,
                emplacements=[],  # TODO: peupler depuis les données de stock si besoin
            )
            lines.append(line)

        return lines

    @staticmethod
    def _map_type_commande(erp_type: ErpTypeCommande) -> TypeCommande:
        mapping = {
            ErpTypeCommande.MTS: TypeCommande.MTS,
            ErpTypeCommande.MTO: TypeCommande.MTO,
            ErpTypeCommande.NOR: TypeCommande.NOR,
        }
        return mapping.get(erp_type, TypeCommande.MTO)

    def _is_hard_pegged(self, num_commande: str, article: str) -> bool:
        ofs = self._reader.get_ofs_by_origin(num_commande, article)
        if not ofs:
            return False
        for of in ofs:
            if (
                str(of.methode_obtention_livraison).strip().lower() == "ordre de fabrication"
                and of.qte_restante > 0
                and of.statut_num in (1, 2, 3)
            ):
                return True
        return False
