"""Modèles de données pour les gammes de production."""

from dataclasses import dataclass
from typing import Optional


@dataclass
class GammeOperation:
    """Opération de gamme (poste de charge).

    Attributes
    ----------
    article : str
        Code article
    poste_charge : str
        Code du poste de charge (ex: PP_128)
    libelle_poste : str
        Libellé du poste de charge
    cadence : float
        Cadence de production (unités/heure)
    """

    article: str
    poste_charge: str
    libelle_poste: str
    cadence: float

    @classmethod
    def from_csv_row(cls, row: dict) -> "GammeOperation":
        """Crée une opération depuis une ligne CSV.

        Parameters
        ----------
        row : dict
            Ligne CSV du fichier gammes.csv

        Returns
        -------
        GammeOperation
            Opération de gamme

        Notes
        -----
        Gère le format français des décimales (virgule au lieu du point).
        Ex: "104,17" → 104.17
        """
        # Handle French decimal comma
        cadence_str = str(row.get("CADENCE", "0")).strip().replace(",", ".")
        cadence = float(cadence_str) if cadence_str and cadence_str != "0" else 0.0

        return cls(
            article=row.get("ARTICLE", ""),
            poste_charge=row.get("POSTE_CHARGE", ""),
            libelle_poste=row.get("LIBELLE_POSTE", ""),
            cadence=cadence
        )


@dataclass
class Gamme:
    """Gamme de production pour un article.

    Une gamme peut avoir plusieurs opérations (postes de charge).
    Ex: Un article peut passer sur PP_128 (assemblage) puis PP_127 (emballage).

    Attributes
    ----------
    article : str
        Code article
    operations : list[GammeOperation]
        Liste des opérations de la gamme
    """

    article: str
    operations: list[GammeOperation]

    def get_operation_for_poste(self, poste: str) -> Optional[GammeOperation]:
        """Retourne l'opération pour un poste de charge donné.

        Parameters
        ----------
        poste : str
            Code du poste de charge

        Returns
        -------
        Optional[GammeOperation]
            Opération trouvée ou None
        """
        for op in self.operations:
            if op.poste_charge == poste:
                return op
        return None

    def calculate_hours(self, quantity: int, poste: str) -> float:
        """Calcule les heures nécessaires pour une quantité à un poste.

        Parameters
        ----------
        quantity : int
            Quantité à produire
        poste : str
            Code du poste de charge

        Returns
        -------
        float
            Heures nécessaires (0 si pas d'opération ou cadence nulle)
        """
        op = self.get_operation_for_poste(poste)
        if not op or op.cadence == 0:
            return 0.0
        return quantity / op.cadence

    def calculate_all_hours(self, quantity: int) -> dict[str, float]:
        """Calcule les heures pour tous les postes de la gamme.

        Parameters
        ----------
        quantity : int
            Quantité à produire

        Returns
        -------
        dict[str, float]
            Dictionnaire {poste_charge: heures}
        """
        result = {}
        for op in self.operations:
            if op.cadence > 0:
                hours = quantity / op.cadence
                result[op.poste_charge] = result.get(op.poste_charge, 0) + hours
        return result
