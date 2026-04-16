"""Modèle Article."""

from dataclasses import dataclass
from enum import Enum


class TypeApprovisionnement(Enum):
    """Type d'approvisionnement."""

    ACHAT = "ACHAT"
    FABRICATION = "FABRICATION"


@dataclass
class Article:
    """Article du catalogue produits.

    Attributes
    ----------
    code : str
        Code article (identifiant unique)
    description : str
        Description du produit
    categorie : str
        Catégorie (AP, APV, PF3, PFAS, etc.)
    type_appro : TypeApprovisionnement
        Type d'approvisionnement (ACHAT ou FABRICATION)
    delai_reappro : int
        Délai de réapprovisionnement en jours
    """

    code: str
    description: str
    categorie: str
    type_appro: TypeApprovisionnement
    delai_reappro: int

    def is_achat(self) -> bool:
        """Vérifie si l'article est acheté."""
        return self.type_appro == TypeApprovisionnement.ACHAT

    def is_fabrication(self) -> bool:
        """Vérifie si l'article est fabriqué."""
        return self.type_appro == TypeApprovisionnement.FABRICATION

    def is_fantome(self) -> bool:
        """Vérifie si l'article est un article fantôme."""
        return str(self.categorie or "").upper() == "AFANT"

    @classmethod
    def from_csv_row(cls, row: dict) -> "Article":
        """Crée un Article à partir d'une ligne CSV.

        Parameters
        ----------
        row : dict
            Dictionnaire contenant les champs du CSV

        Returns
        -------
        Article
            Instance d'Article créée à partir de la ligne CSV
        """
        type_appro_str = row.get("TYPE_APPRO", "ACHAT")
        try:
            type_appro = TypeApprovisionnement(type_appro_str)
        except ValueError:
            type_appro = TypeApprovisionnement.ACHAT

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
            code=row.get("ARTICLE", ""),
            description=row.get("DESIGNATION", ""),
            categorie=row.get("CATEGORIE", ""),
            type_appro=type_appro,
            delai_reappro=_parse_int(row.get("DELAI_REAPPRO", 0)),
        )

    def __repr__(self) -> str:
        """Représentation textuelle de l'article."""
        return f"Article({self.code} - {self.description})"
