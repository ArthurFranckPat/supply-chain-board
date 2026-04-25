"""Transform ERP data into a SUIVCDE-compatible DataFrame.

This transformer builds a pandas DataFrame with French column names matching
the SUIVCDE.csv format so that ``status_logic.assign_statuses()`` operates
unchanged on data sourced from the shared ERP loading layer.

The column mapping is configurable via ``SUIVCDEColumnMapping`` so that new
downstream formats can be supported without modifying this module (OCP).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

import pandas as pd

from ..models.gamme import Gamme
from ..models.stock import Stock
from ..protocols import OrderReader, StockReader, GammeReader


@dataclass
class SUIVCDEColumnMapping:
    """Configurable mapping from model fields to SUIVCDE column names.

    Override any field to customize the output column names.
    """

    no_commande: str = "No commande"
    nom_client: str = "Nom client commande"
    article: str = "Article"
    designation: str = "Désignation 1"
    type_commande: str = "Type commande"
    date_expedition: str = "Date expedition"
    qte_commandee: str = "Quantité commandée"
    qte_allouee: str = "Qté allouée"
    qte_restante: str = "Quantité restante"
    qte_livree: str = "Quantité livrée"
    stock_physique: str = "Stock interne 'A'"
    stock_alloue: str = "Alloué interne 'A'"
    poste_charge: str = "Poste de charge"
    cadence: str = "Cadence"


# Default mapping instance
DEFAULT_MAPPING = SUIVCDEColumnMapping()

# Columns that status_logic expects to exist (even with None values).
_IGNORED_COLUMNS: list[str] = [
    "Emplacement",
    "HUM",
    "Date mise en stock",
    "Qté Palette",
    "Prix brut",
    "Date liv prévue",
    "Etat commande",
    "Etat ligne",
]


def build_suivcde_dataframe(
    data_loader: OrderReader & StockReader & GammeReader,
    *,
    mapping: SUIVCDEColumnMapping = DEFAULT_MAPPING,
    firm_orders_only: bool = True,
) -> pd.DataFrame:
    """Build a DataFrame compatible with SUIVCDE.csv from a data provider.

    Parameters
    ----------
    data_loader : OrderReader & StockReader & GammeReader
        Any object implementing the three reader protocols. This decouples
        the transformer from the concrete DataLoader (DIP).
    mapping : SUIVCDEColumnMapping
        Column name mapping. Override to customize output (OCP).
    firm_orders_only : bool
        If True, only include firm orders (nature_besoin == COMMANDE).

    Returns
    -------
    pd.DataFrame
        DataFrame with SUIVCDE-style column names.
    """
    rows: list[dict] = []

    for besoin in data_loader.commandes_clients:
        if firm_orders_only and not besoin.est_commande():
            continue

        stock: Optional[Stock] = data_loader.get_stock(besoin.article)
        gamme: Optional[Gamme] = data_loader.get_gamme(besoin.article)

        poste_charge = ""
        cadence = 0.0
        if gamme and gamme.operations:
            first_op = gamme.operations[0]
            poste_charge = first_op.poste_charge
            cadence = first_op.cadence

        qte_livree = besoin.qte_commandee - besoin.qte_restante

        row = {
            mapping.no_commande: besoin.num_commande,
            mapping.nom_client: besoin.nom_client,
            mapping.article: besoin.article,
            mapping.designation: besoin.description,
            mapping.type_commande: besoin.type_commande.value,
            mapping.date_expedition: besoin.date_expedition_demandee,
            mapping.qte_commandee: besoin.qte_commandee,
            mapping.qte_allouee: besoin.qte_allouee,
            mapping.qte_restante: besoin.qte_restante,
            mapping.qte_livree: qte_livree,
            mapping.stock_physique: stock.stock_physique if stock else 0,
            mapping.stock_alloue: stock.stock_alloue if stock else 0,
            mapping.poste_charge: poste_charge,
            mapping.cadence: cadence,
        }

        for col in _IGNORED_COLUMNS:
            row[col] = None

        rows.append(row)

    df = pd.DataFrame(rows)

    if df.empty:
        return df

    df[mapping.date_expedition] = pd.to_datetime(df[mapping.date_expedition], errors="coerce")
    df[mapping.cadence] = pd.to_numeric(df[mapping.cadence], errors="coerce").fillna(0)

    return df
