"""Modele OF (Ordre de Fabrication)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from enum import Enum
from typing import Optional


class StatutOF(Enum):
    """Statut d'un OF."""

    FERME = 1
    PLANIFIE = 2
    SUGGERE = 3


@dataclass
class OF:
    """Ordre de fabrication."""

    num_of: str
    article: str
    description: str
    statut_num: int
    statut_texte: str
    date_fin: date
    qte_a_fabriquer: int
    qte_fabriquee: int
    qte_restante: int
    date_debut: Optional[date] = None
    methode_obtention_livraison: str = ""
    num_ordre_origine: str = ""

    def is_ferme(self) -> bool:
        return self.statut_num == 1

    def is_suggere(self) -> bool:
        return self.statut_num == 3

    @classmethod
    def from_csv_row(cls, row: dict) -> "OF":
        def _parse_date(value, default: Optional[date] = None) -> Optional[date]:
            if isinstance(value, date):
                return value
            if not value:
                return default

            raw = str(value).strip()
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
            return default

        def _parse_int(value) -> int:
            if isinstance(value, (int, float)):
                return int(value)
            if isinstance(value, str):
                cleaned = value.replace(",", "").replace(" ", "").strip()
                if cleaned == "" or cleaned == "-" or cleaned.lower() == "nan":
                    return 0
                return int(float(cleaned))
            return 0

        statut_raw = str(row.get("STATUT_ORDRE", "S")).strip().upper()
        statut_num_map = {"F": 1, "P": 2, "S": 3}
        statut_texte_map = {"F": "Ferme", "P": "Planifie", "S": "Suggere"}
        statut_num = statut_num_map.get(statut_raw, 3)
        statut_texte = statut_texte_map.get(statut_raw, "Suggere")

        date_fin = _parse_date(row.get("DATE_FIN", ""), default=date.today())
        date_debut = _parse_date(row.get("DATE_DEBUT", ""))

        return cls(
            num_of=row.get("NUM_ORDRE", ""),
            article=row.get("ARTICLE", ""),
            description=row.get("DESIGNATION", ""),
            statut_num=statut_num,
            statut_texte=statut_texte,
            date_fin=date_fin,
            qte_a_fabriquer=_parse_int(row.get("QTE_COMMANDEE", 0)),
            qte_fabriquee=_parse_int(row.get("QTE_REALISEE", 0)),
            qte_restante=_parse_int(row.get("QTE_RESTANTE_LIVRAISON", 0)),
            date_debut=date_debut,
            methode_obtention_livraison=str(row.get("METHODE_OBTENTION_LIVRAISON", "")).strip(),
            num_ordre_origine=str(row.get("NUM_ORDRE_ORIGINE", "")).strip(),
        )

    def __repr__(self) -> str:
        return (
            f"OF({self.num_of}: {self.article} - {self.qte_restante} "
            f"a fabriquer avant le {self.date_fin})"
        )
