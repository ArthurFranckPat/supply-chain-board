"""Modèle OF (Ordre de Fabrication)."""

from dataclasses import dataclass
from datetime import date, datetime
from enum import Enum
from typing import Optional


class StatutOF(Enum):
    """Statut d'un OF."""

    FERME = 1
    SUGGERE = 3
    # Ajouter d'autres statuts si nécessaire


@dataclass
class OF:
    """Ordre de fabrication.

    Attributes
    ----------
    num_of : str
        Numéro d'OF (identifiant unique)
    article : str
        Code article à fabriquer
    description : str
        Description de l'article
    statut_num : int
        Code du statut (1 = Ferme, 3 = Suggéré, etc.)
    statut_texte : str
        Statut en texte ("Ferme", "Suggéré", etc.)
    date_fin : date
        Date de fin prévue
    date_debut : Optional[date]
        Date de début prévue si disponible dans l'export ERP
    qte_a_fabriquer : int
        Quantité à fabriquer
    qte_fabriquee : int
        Quantité déjà fabriquée
    qte_restante : int
        Quantité restante à fabriquer
    """

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

    def is_ferme(self) -> bool:
        """Vérifie si l'OF est ferme (WOP)."""
        return self.statut_num == 1

    def is_suggere(self) -> bool:
        """Vérifie si l'OF est suggéré (WOS)."""
        return self.statut_num == 3

    @classmethod
    def from_csv_row(cls, row: dict) -> "OF":
        """Crée un OF à partir d'une ligne CSV.

        Parameters
        ----------
        row : dict
            Dictionnaire contenant les champs du CSV

        Returns
        -------
        OF
            Instance d'OF créée à partir de la ligne CSV
        """
        def _parse_date(value, default: Optional[date] = None) -> Optional[date]:
            """Convertit une valeur CSV en date, sinon retourne `default`."""
            if isinstance(value, date):
                return value
            if not value:
                return default

            for fmt in ("%d/%m/%Y", "%Y-%m-%d"):
                try:
                    return datetime.strptime(str(value).strip(), fmt).date()
                except ValueError:
                    continue

            return default

        date_fin = _parse_date(row.get("DATE_FIN", ""), default=date.today())
        date_debut = _parse_date(row.get("DATE_DEBUT", ""))

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
            num_of=row.get("NUM_OF", ""),
            article=row.get("ARTICLE", ""),
            description=row.get("DESCRIPTION", ""),
            statut_num=_parse_int(row.get("STATUT_NUM_OF", 3)),
            statut_texte=row.get("STATUT_TEXTE_OF", "Suggéré"),
            date_fin=date_fin,
            qte_a_fabriquer=_parse_int(row.get("QTE_A_FABRIQUER", 0)),
            qte_fabriquee=_parse_int(row.get("QTE_FABRIQUEE", 0)),
            qte_restante=_parse_int(row.get("QTE_RESTANTE", 0)),
            date_debut=date_debut,
        )

    def __repr__(self) -> str:
        """Représentation textuelle de l'OF."""
        return (
            f"OF({self.num_of}: {self.article} - {self.qte_restante} "
            f"à fabriquer avant le {self.date_fin})"
        )
