"""Modèles de données pour le calcul de charge."""

from dataclasses import dataclass


@dataclass(slots=True)
class ChargeByPoste:
    """Charge pour un poste de charge sur plusieurs semaines.

    Attributes
    ----------
    poste_charge : str
        Code du poste de charge (ex: PP_128)
    libelle_poste : str
        Libellé du poste de charge
    charges : dict[str, float]
        Dictionnaire des charges par semaine
        Clé: "S+1", "S+2", etc.
        Valeur: heures de charge
    """

    poste_charge: str
    libelle_poste: str
    charges: dict[str, float]

    def get_total(self) -> float:
        """Retourne la charge totale sur toutes les semaines.

        Returns
        -------
        float
            Total des heures
        """
        return sum(self.charges.values())

    def get_charge_for_week(self, week_label: str) -> float:
        """Retourne la charge pour une semaine donnée.

        Parameters
        ----------
        week_label : str
            Libellé de la semaine (ex: "S+1")

        Returns
        -------
        float
            Heures de charge (0 si pas de charge pour cette semaine)
        """
        return self.charges.get(week_label, 0.0)
