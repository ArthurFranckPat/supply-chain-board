"""Modèle OF Allocation - Lien OF → Composants alloués."""

from dataclasses import dataclass
from datetime import datetime
from typing import Optional


@dataclass
class OFAllocation:
    """Allocation d'un article à un document (OF ou commande).

    Attributes
    ----------
    article : str
        Code article (composant ou produit fini)
    qte_allouee : float
        Quantité allouée (peut être décimale pour les petits consommables)
    num_doc : str
        Numéro du document (OF ou commande client)
    date_besoin : str
        Date de besoin au format DD/MM/YYYY
    date_besoin_obj : Optional[datetime]
        Date de besoin convertie en objet datetime
    """

    article: str
    qte_allouee: float
    num_doc: str
    date_besoin: str
    date_besoin_obj: Optional[datetime] = None

    @classmethod
    def from_csv_row(cls, row: dict) -> "OFAllocation":
        """Crée une OFAllocation à partir d'une ligne CSV.

        Parameters
        ----------
        row : dict
            Dictionnaire contenant les champs du CSV

        Returns
        -------
        OFAllocation
            Instance créée à partir de la ligne CSV
        """
        article = row.get("ARTICLE", "")
        qte_allouee_str = row.get("QTE_ALLOUEE", "0")
        num_doc = row.get("NUM_DOC", "")
        date_besoin = row.get("DATE_BESOIN", "")

        # Nettoyer la quantité (peut avoir des virgules)
        qte_allouee_clean = str(qte_allouee_str).replace(",", ".").strip()
        try:
            qte_allouee = float(qte_allouee_clean) if qte_allouee_clean else 0.0
        except ValueError:
            qte_allouee = 0.0

        # Convertir la date
        date_besoin_obj = None
        try:
            date_besoin_obj = datetime.strptime(date_besoin, "%d/%m/%Y")
        except (ValueError, TypeError):
            pass  # Date invalide ou vide

        return cls(
            article=article,
            qte_allouee=qte_allouee,
            num_doc=num_doc,
            date_besoin=date_besoin,
            date_besoin_obj=date_besoin_obj,
        )

    def __repr__(self) -> str:
        """Représentation textuelle de l'allocation."""
        return f"OFAllocation({self.article} : {self.qte_allouee} → {self.num_doc})"
