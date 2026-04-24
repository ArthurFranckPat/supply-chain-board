"""Allocation Manager - Gestion de la concurrence entre OF."""

from dataclasses import dataclass
from enum import Enum
from typing import Optional

from ..models.of import OF
from ..feasibility.base import FeasibilityResult


class AllocationStatus(Enum):
    """Statut d'allocation d'un OF."""

    FEASIBLE = "feasible"
    NOT_FEASIBLE = "not_feasible"
    SKIPPED = "skipped"
    DEFERRED = "deferred"


@dataclass
class AllocationResult:
    """Résultat de l'allocation de stock pour un OF.

    Attributes
    ----------
    of_num : str
        Numéro de l'OF
    status : AllocationStatus
        Statut de l'allocation
    feasibility_result : Optional[FeasibilityResult]
        Résultat de la vérification de faisabilité
    allocated_quantity : dict[str, int]
        Quantité allouée par composant
    decision : Optional[AgentDecision]
        Décision métier prise par le DecisionEngine
    """

    of_num: str
    status: AllocationStatus
    feasibility_result: Optional[FeasibilityResult] = None
    allocated_quantity: dict[str, int] = None

    def __repr__(self) -> str:
        """Représentation textuelle du résultat."""
        return f"AllocationResult({self.of_num}: {self.status.value})"


class StockState:
    """État du stock virtuel pour l'allocation.

    Cet état est utilisé pour suivre les allocations virtuelles
    sans modifier le stock réel.

    Attributes
    ----------
    initial_stock : dict[str, int]
        Stock initial par article
    allocated_stock : dict[str, int]
        Stock alloué par article (cumul des allocations)
    """

    def __init__(self, initial_stock: dict[str, int]):
        """Initialise l'état du stock.

        Parameters
        ----------
        initial_stock : dict[str, int]
            Stock initial par article
        """
        self.initial_stock = initial_stock.copy()
        self.allocated_stock: dict[str, int] = {}

    def get_available(self, article: str) -> int:
        """Retourne le stock disponible pour un article.

        Parameters
        ----------
        article : str
            Code de l'article

        Returns
        -------
        int
            Stock disponible (initial - alloué)
        """
        initial = self.initial_stock.get(article, 0)
        allocated = self.allocated_stock.get(article, 0)
        return initial - allocated

    def allocate(self, of_num: str, allocations: dict[str, int]):
        """Alloue du stock à un OF.

        Parameters
        ----------
        of_num : str
            Numéro de l'OF
        allocations : dict[str, int]
            Quantités à allouer par article
        """
        for article, quantity in allocations.items():
            if article not in self.allocated_stock:
                self.allocated_stock[article] = 0
            self.allocated_stock[article] += quantity

    def add_supply(self, article: str, quantity: int):
        """Ajoute un approvisionnement à l'état de stock virtuel."""
        if article not in self.initial_stock:
            self.initial_stock[article] = 0
        self.initial_stock[article] += quantity


class AllocationManager:
    """Gestionnaire de l'allocation de stock avec gestion de la concurrence.

    Ce gestionnaire applique les règles suivantes :
    1. OF avec date de besoin plus tôt = prioritaire
    2. Si un OF est 100% faisable → il passe avant un OF prioritaire mais non faisable

    Attributes
    ----------
    data_loader : DataLoader
        Loader de données
    checker : BaseChecker
        Checker à utiliser pour la vérification de faisabilité
    """

    def __init__(self, data_loader, checker):
        """Initialise le gestionnaire d'allocation.

        Parameters
        ----------
        data_loader : DataLoader
            Loader de données
        checker : BaseChecker
            Checker pour la vérification de faisabilité
        """
        self.data_loader = data_loader
        self.checker = checker

    def allocate_stock(self, ofs: list[OF]) -> dict[str, AllocationResult]:
        """Alloue le stock aux OF en gérant la concurrence.

        IMPORTANT : N'applique l'allocation virtuelle qu'aux OF SUGGÉRÉS et PLANIFIÉS.
        Les OF FERMES avec allocations ne participent pas à l'allocation virtuelle
        (leurs composants sont déjà réservés).

        Rappel des statuts :
        - 1 = Ferme → Composants alloués
        - 2 = Planifié (WOP) → Composants PAS alloués (lien commande existe)
        - 3 = Suggéré (WOS) → Composants PAS alloués

        Parameters
        ----------
        ofs : list[OF]
            Liste des OF à traiter

        Returns
        -------
        dict[str, AllocationResult]
            Résultats d'allocation indexés par numéro d'OF
        """
        # Récupérer le stock initial
        initial_stock = self._get_initial_stock()

        # Créer l'état du stock
        stock_state = StockState(initial_stock)

        # Séparer les OF en deux catégories :
        # 1. OF FERMES (statut 1) avec allocations → Pas d'allocation virtuelle
        # 2. OF PLANIFIÉS (statut 2) et SUGGÉRÉS (statut 3) → Allocation virtuelle

        of_with_allocations = set()
        for of in ofs:
            if of.statut_num == 1:  # OF FERME uniquement
                allocations = self.data_loader.get_allocations_of(of.num_of)
                if allocations:
                    of_with_allocations.add(of.num_of)

        # Filtrer les OF pour l'allocation virtuelle (PLANIFIÉS + SUGGÉRÉS)
        ofs_for_allocation = [of for of in ofs if of.num_of not in of_with_allocations]

        # Trier les OF par priorité (uniquement ceux pour allocation)
        sorted_ofs = self._sort_ofs_by_priority(ofs_for_allocation, stock_state)

        # Allouer le stock
        results = {}

        # 1. Traiter les OF FERMES avec allocations (pas d'allocation virtuelle)
        for of in ofs:
            if of.num_of in of_with_allocations:
                # Vérifier sans allocation virtuelle
                result = self.checker.check_of(of)
                results[of.num_of] = AllocationResult(
                    of_num=of.num_of,
                    status=AllocationStatus.FEASIBLE if result.feasible else AllocationStatus.NOT_FEASIBLE,
                    feasibility_result=result,
                    allocated_quantity={},  # Pas d'allocation virtuelle
                )

        # 2. Traiter les OF PLANIFIÉS et SUGGÉRÉS avec allocation virtuelle
        for of in sorted_ofs:
            result = self._allocate_of(of, stock_state)
            results[of.num_of] = result

        return results

    def _get_initial_stock(self) -> dict[str, int]:
        """Récupère le stock initial.

        Returns
        -------
        dict[str, int]
            Stock disponible par article
        """
        stock = {}
        for article, stock_obj in self.data_loader.stocks.items():
            stock[article] = stock_obj.disponible()

        # Ajouter les réceptions si le checker les utilise
        if hasattr(self.checker, "use_receptions") and self.checker.use_receptions:
            for article, receptions in self.data_loader._receptions_by_article.items():
                if article not in stock:
                    stock[article] = 0
                for reception in receptions:
                    if self.checker.check_date:
                        if reception.est_disponible_avant(self.checker.check_date):
                            stock[article] += reception.quantite_restante
                    else:
                        stock[article] += reception.quantite_restante

        return stock

    def _sort_ofs_by_priority(self, ofs: list[OF], stock_state: StockState) -> list[OF]:
        """Trie les OF par priorité (date + faisabilité).

        Parameters
        ----------
        ofs : list[OF]
            Liste des OF à trier
        stock_state : StockState
            État du stock

        Returns
        -------
        list[OF]
            Liste des OF triés par priorité
        """
        # Premièrement, vérifier la faisabilité de tous les OF
        of_status = []
        for of in ofs:
            result = self.checker.check_of(of)
            of_status.append((of, result))

        # Trier par date de besoin (croissant) puis par faisabilité
        def priority_key(item):
            of, result = item
            # Priorité 1 : date de besoin
            date_key = of.date_fin
            # Priorité 2 : faisabilité (faisable = priorité)
            feasible_key = not result.feasible
            return (date_key, feasible_key)

        of_status.sort(key=priority_key)

        return [of for of, _ in of_status]

    def _allocate_of(self, of: OF, stock_state: StockState) -> AllocationResult:
        """Alloue le stock à un OF.

        Parameters
        ----------
        of : OF
            OF à traiter
        stock_state : StockState
            État du stock

        Returns
        -------
        AllocationResult
            Résultat de l'allocation
        """
        # Créer un checker avec stock_state
        from ..feasibility.recursive import RecursiveChecker

        # Créer un checker temporaire avec le stock_state
        checker = RecursiveChecker(
            self.data_loader,
            use_receptions=getattr(self.checker, 'use_receptions', False),
            check_date=getattr(self.checker, 'check_date', None),
            stock_state=stock_state  # ← Utiliser le stock virtuel
        )

        # Vérifier la faisabilité avec le stock restant
        result = checker.check_of(of)

        if result.feasible:
            # Calculer les allocations
            allocations = self._calculate_allocations(of, stock_state)

            if allocations:
                # Allouer virtuellement
                stock_state.allocate(of.num_of, allocations)

                return AllocationResult(
                    of_num=of.num_of,
                    status=AllocationStatus.FEASIBLE,
                    feasibility_result=result,
                    allocated_quantity=allocations,
                )
            else:
                # OF faisable mais pas d'allocations nécessaires (pas de compo ACHAT)
                return AllocationResult(
                    of_num=of.num_of,
                    status=AllocationStatus.FEASIBLE,
                    feasibility_result=result,
                    allocated_quantity={},
                )
        else:
            return AllocationResult(
                of_num=of.num_of,
                status=AllocationStatus.NOT_FEASIBLE,
                feasibility_result=result,
                allocated_quantity=None,
            )

    def _calculate_allocations(self, of: OF, stock_state: StockState) -> dict[str, int]:
        """Calcule les allocations pour un OF.

        Parcourt la nomenclature de l'OF et calcule les besoins en composants ACHAT.

        Parameters
        ----------
        of : OF
            OF à traiter
        stock_state : StockState
            État du stock

        Returns
        -------
        dict[str, int]
            Allocations par article (article → quantité allouée)
        """
        allocations = {}

        # Récupérer la nomenclature
        nomenclature = self.data_loader.get_nomenclature(of.article)

        if not nomenclature:
            return allocations

        # Parcourir les composants
        for composant in nomenclature.composants:
            if composant.is_achete():
                # Calculer le besoin pour ce composant
                besoin = composant.qte_requise(of.qte_restante)

                # Vérifier le stock disponible
                stock_dispo = stock_state.get_available(composant.article_composant)

                # Allouer la quantité nécessaire (limitée au stock dispo)
                qte_allouee = min(besoin, stock_dispo)

                if qte_allouee > 0:
                    allocations[composant.article_composant] = qte_allouee

        return allocations
