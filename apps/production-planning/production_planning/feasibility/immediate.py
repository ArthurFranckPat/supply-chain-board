"""Immediate Checker - Vérification de faisabilité immédiate (stock actuel uniquement)."""


from .recursive import RecursiveChecker
from ..loaders.data_loader import DataLoader


class ImmediateChecker(RecursiveChecker):
    """Checker pour la vérification immédiate (stock actuel uniquement).

    Ce checker utilise uniquement le stock disponible actuellement,
    sans prendre en compte les réceptions fournisseurs.

    Attributes
    ----------
    data_loader : DataLoader
        Loader de données
    """

    def __init__(self, data_loader: DataLoader):
        """Initialise le checker immédiat.

        Parameters
        ----------
        data_loader : DataLoader
            Loader de données
        """
        super().__init__(data_loader, use_receptions=False, check_date=None)

    def __repr__(self) -> str:
        """Représentation textuelle du checker."""
        return "ImmediateChecker(vérification stock actuel)"
