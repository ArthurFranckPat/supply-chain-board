"""Modele Reception."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime


@dataclass
class Reception:
    """Reception fournisseur planifiee."""

    num_commande: str
    article: str
    code_fournisseur: str
    quantite_restante: int
    date_reception_prevue: date

    def est_disponible_avant(self, date_limite: date) -> bool:
        return self.date_reception_prevue < date_limite

    @classmethod
    def from_csv_row(cls, row: dict) -> "Reception":
        def _parse_date(value) -> date:
            raw = str(value or "").strip()
            for fmt in (
                "%m/%d/%Y %H:%M:%S",
                "%d/%m/%Y %H:%M:%S",
                "%d/%m/%Y",
                "%Y-%m-%d",
            ):
                try:
                    return datetime.strptime(raw, fmt).date()
                except ValueError:
                    continue
            return date.today()

        def _parse_int(value) -> int:
            if isinstance(value, (int, float)):
                return int(value)
            if isinstance(value, str):
                cleaned = value.replace(",", "").replace(" ", "").strip()
                if cleaned == "" or cleaned == "-" or cleaned.lower() == "nan":
                    return 0
                return int(float(cleaned))
            return 0

        return cls(
            num_commande=row.get("NUM_ORDRE", ""),
            article=row.get("ARTICLE", ""),
            code_fournisseur=row.get("NOM_FOURNISSEUR_OU_CLIENT", ""),
            quantite_restante=_parse_int(row.get("QTE_RESTANTE_FABRICATION", 0)),
            date_reception_prevue=_parse_date(row.get("DATE_FIN", "")),
        )

    def __repr__(self) -> str:
        return (
            f"Reception({self.article}: {self.quantite_restante} "
            f"prevus le {self.date_reception_prevue})"
        )
