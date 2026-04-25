"""Modele TarifAchat pour les grilles tarifaires fournisseurs."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date


@dataclass(slots=True)
class TarifAchat:
    """Palier tarifaire d'un article chez un fournisseur."""

    fiche_tarif: str
    code_fournisseur: int
    article: str
    date_debut_validite: date | None
    date_fin_validite: date | None
    quantite_mini: float
    quantite_maxi: float
    prix_unitaire: float
    unite: str
    devise: str

    def contient_quantite(self, qte: float) -> bool:
        return self.quantite_mini <= qte <= self.quantite_maxi

    @classmethod
    def from_csv_row(cls, row: dict) -> "TarifAchat":
        from ..parsers.tarif_achat_parser import parse_tarif_achat
        return parse_tarif_achat(row)
