from __future__ import annotations

import logging
from pathlib import Path
from typing import TYPE_CHECKING

from erp_data_access.loaders import DataLoader

from suivi_commandes.domain.models import OrderLine, TypeCommande, Emplacement
from suivi_commandes.infrastructure.mappers import SuivcdeMapper

logger = logging.getLogger(__name__)
if TYPE_CHECKING:
    from erp_data_access.protocols import DataReader


def load_order_lines(extractions_dir: Path | str | None = None) -> tuple[list[OrderLine], "DataReader"]:
    """Charge les commandes clients depuis l'ERP et les mappe en OrderLine.

    Returns
    -------
    tuple[list[OrderLine], DataReader]
        Lignes de commande typées + reader pour enrichissements futurs.
    """
    loader = DataLoader.from_extractions(extractions_dir)
    mapper = SuivcdeMapper(loader)
    lines = mapper.to_order_lines(firm_orders_only=True)
    return lines, loader


def rows_to_order_lines(rows: list[dict]) -> list[OrderLine]:
    """Convertit des rows JSON/dict (endpoint /status/assign) en OrderLine.

    Permet au endpoint legacy de bénéficier de la logique de domaine pure.
    """
    lines: list[OrderLine] = []
    for row in rows:
        type_str = str(row.get("Type commande", "MTO")).upper()
        type_cmd = TypeCommande.MTS if type_str == "MTS" else TypeCommande.MTO if type_str == "MTO" else TypeCommande.NOR

        # Emplacement parsing (peut être une string séparée par des virgules)
        emplacements: list[Emplacement] = []
        emp_raw = row.get("Emplacement")
        if emp_raw:
            for nom in str(emp_raw).split(","):
                nom = nom.strip()
                if nom:
                    emplacements.append(Emplacement(nom=nom))

        from datetime import date

        def _parse_date(val, field_name: str = "unknown"):
            if val is None or val == "":
                return None
            if isinstance(val, date):
                return val
            from datetime import datetime
            try:
                return datetime.strptime(str(val)[:10], "%Y-%m-%d").date()
            except (ValueError, TypeError) as e:
                logger.debug(
                    "[data-loader] Date invalide pour %s: %s (valeur=%r)",
                    field_name, e, val,
                )
                return None

        line = OrderLine(
            num_commande=str(row.get("No commande", "")),
            article=str(row.get("Article", "")),
            designation=str(row.get("Désignation 1", "")),
            nom_client=str(row.get("Nom client commande", "")),
            type_commande=type_cmd,
            date_expedition=_parse_date(row.get("Date expedition"), "Date expedition"),
            date_liv_prevue=_parse_date(row.get("Date liv prévue"), "Date liv prévue"),
            qte_commandee=float(row.get("Quantité commandée", 0) or 0),
            qte_allouee=float(row.get("Qté allouée", 0) or 0),
            qte_restante=float(row.get("Quantité restante", 0) or 0),
            is_fabrique=bool(row.get("_is_fabrique", False)),
            is_hard_pegged=bool(row.get("_is_hard_pegged", False)),
            emplacements=emplacements,
        )
        lines.append(line)
    return lines


