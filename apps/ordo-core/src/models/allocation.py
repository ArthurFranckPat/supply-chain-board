"""Modele OF Allocation - lien OF/commande vers composants alloues."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Optional


@dataclass
class OFAllocation:
    """Allocation d'un article a un document (OF ou commande)."""

    article: str
    qte_allouee: float
    num_doc: str
    date_besoin: str
    date_besoin_obj: Optional[datetime] = None

    @classmethod
    def from_csv_row(cls, row: dict) -> "OFAllocation":
        article = row.get("ARTICLE", "")
        qte_allouee_str = row.get("QTE_ALLOUEE", "0")
        num_doc = row.get("NUM_ORDRE", "")
        raw_date = row.get("DATE_FIN", "")

        qte_allouee_clean = str(qte_allouee_str).replace(",", ".").strip()
        try:
            qte_allouee = float(qte_allouee_clean) if qte_allouee_clean else 0.0
        except ValueError:
            qte_allouee = 0.0

        date_besoin_obj = None
        for fmt in (
            "%m/%d/%Y %H:%M:%S",
            "%d/%m/%Y %H:%M:%S",
            "%d/%m/%Y",
            "%Y-%m-%d",
        ):
            try:
                date_besoin_obj = datetime.strptime(str(raw_date).strip(), fmt)
                break
            except (ValueError, TypeError):
                continue

        if date_besoin_obj is not None:
            date_besoin = date_besoin_obj.strftime("%d/%m/%Y")
        else:
            date_besoin = str(raw_date or "")

        return cls(
            article=article,
            qte_allouee=qte_allouee,
            num_doc=num_doc,
            date_besoin=date_besoin,
            date_besoin_obj=date_besoin_obj,
        )

    def __repr__(self) -> str:
        return f"OFAllocation({self.article} : {self.qte_allouee} -> {self.num_doc})"
