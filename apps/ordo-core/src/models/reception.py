"""Modèle Reception."""

from dataclasses import dataclass
from datetime import date


@dataclass
class Reception:
    """Réception fournisseur planifiée.

    Attributes
    ----------
    num_commande : str
        Numéro de commande fournisseur
    article : str
        Code article
    code_fournisseur : str
        Code fournisseur
    quantite_restante : int
        Quantité à recevoir
    date_reception_prevue : date
        Date de réception prévue
    """

    num_commande: str
    article: str
    code_fournisseur: str
    quantite_restante: int
    date_reception_prevue: date

    def est_disponible_avant(self, date_limite: date) -> bool:
        """Vérifie si la réception est disponible avant une date donnée.

        Parameters
        ----------
        date_limite : date
            Date limite à vérifier

        Returns
        -------
        bool
            True si la réception est prévue avant ou à la date limite
        """
        return self.date_reception_prevue < date_limite

    @classmethod
    def from_csv_row(cls, row: dict) -> "Reception":
        """Crée une Reception à partir d'une ligne CSV.

        Parameters
        ----------
        row : dict
            Dictionnaire contenant les champs du CSV

        Returns
        -------
        Reception
            Instance de Reception créée à partir de la ligne CSV
        """
        from datetime import datetime

        date_str = row.get("DATE_RECEPTION_PREVUE", "")
        if date_str:
            # Essayer le format français (DD/MM/YYYY) d'abord
            try:
                date_reception = datetime.strptime(date_str, "%d/%m/%Y").date()
            except ValueError:
                # Essayer le format ISO (YYYY-MM-DD)
                try:
                    date_reception = datetime.strptime(date_str, "%Y-%m-%d").date()
                except ValueError:
                    date_reception = date.today()
        else:
            date_reception = date.today()

        def _parse_int(value) -> int:
            """Convertit une valeur en int, en gérant les virgules de milliers."""
            if isinstance(value, (int, float)):
                return int(value)
            if isinstance(value, str):
                cleaned = value.replace(",", "").replace(" ", "").strip()
                if cleaned == "" or cleaned == "-" or cleaned == "NaN":
                    return 0
                return int(float(cleaned))
            return 0

        return cls(
            num_commande=row.get("NUM_COMMANDE", ""),
            article=row.get("ARTICLE", ""),
            code_fournisseur=row.get("CODE_FOURNISSEUR", ""),
            quantite_restante=_parse_int(row.get("QUANTITE_RESTANTE", 0)),
            date_reception_prevue=date_reception,
        )

    def __repr__(self) -> str:
        """Représentation textuelle de la réception."""
        return (
            f"Reception({self.article}: {self.quantite_restante} "
            f"prévus le {self.date_reception_prevue})"
        )
