"""Projected Checker - Vérification de faisabilité projetée (stock + réceptions fournisseurs)."""

from datetime import date

from .recursive import RecursiveChecker
from ..loaders.data_loader import DataLoader


class ProjectedChecker(RecursiveChecker):
    """Checker pour la vérification projetée (stock + réceptions fournisseurs).

    Ce checker utilise le stock disponible actuel ainsi que les réceptions
    fournisseurs prévues avant la date de besoin de l'OF.

    Attributes
    ----------
    data_loader : DataLoader
        Loader de données
    check_date : Optional[date]
        Date de vérification pour filtrer les réceptions (None = date de besoin de chaque OF)
    """

    def __init__(self, data_loader: DataLoader, check_date: date = None):
        """Initialise le checker projeté.

        Parameters
        ----------
        data_loader : DataLoader
            Loader de données
        check_date : Optional[date]
            Date de vérification. Si None, utilise la date de besoin de chaque OF
        """
        super().__init__(data_loader, use_receptions=True, check_date=check_date)

    def __repr__(self) -> str:
        """Représentation textuelle du checker."""
        date_str = self.check_date.strftime("%Y-%m-%d") if self.check_date else "date de besoin OF"
        return f"ProjectedChecker(vérification stock + réceptions, date={date_str})"
