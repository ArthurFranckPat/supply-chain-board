"""Algorithme de matching commande→OF."""

from dataclasses import dataclass, field
from datetime import date
from typing import Optional, Dict

from ..domain_rules import is_plannable_of_status, is_purchase_article
from .matching_diagnostics import (
    alert_mts_missing_hard_pegging,
    alert_mts_non_univoque,
    alert_mts_partial_cover,
    alert_no_of_found,
    alert_partial_of_coverage,
    alert_purchase_article_supply,
    method_mts_hard_pegging,
    method_none,
    method_nor_mto_cumulative,
    method_nor_mto_stock_complete,
    method_purchase_article,
)
from ..models.besoin_client import BesoinClient
from ..models.of import OF
from ..models.stock import Stock
from ..loaders.data_loader import DataLoader
from .allocation import StockState


@dataclass
class OFConso:
    """Suivi de la consommation d'un OF.

    Attributes
    ----------
    of: OF
        L'OF suivi
    qte_disponible: int
        Quantité disponible dans l'OF (initialement = qte_restante)
    qte_allouee: int
        Quantité allouée aux commandes
    commandes_servees: list[str]
        Liste des numéros de commandes servies
    """

    of: OF
    qte_disponible: int
    qte_allouee: int
    commandes_servees: list[str] = field(default_factory=list)

    def est_disponible(self, qte_besoin: int) -> bool:
        """Vérifie si l'OF peut satisfaire un besoin.

        Parameters
        ----------
        qte_besoin : int
            Quantité nécessaire

        Returns
        -------
        bool
            True si la quantité disponible >= besoin
        """
        return self.qte_disponible >= qte_besoin

    def allouer(self, qte_besoin: int, num_commande: str):
        """Alloue une quantité de l'OF à une commande.

        Parameters
        ----------
        qte_besoin : int
            Quantité à allouer
        num_commande : str
            Numéro de commande
        """
        self.qte_allouee += qte_besoin
        self.qte_disponible -= qte_besoin
        self.commandes_servees.append(num_commande)


@dataclass
class StockAllocation:
    """Résultat de l'allocation de stock.

    Attributes
    ----------
    article : str
        Code article
    qte_commandee : int
        Quantité commandée (QTE_COMMANDEE)
    qte_allouee_exist : int
        Quantité déjà allouée (QTE_ALLOUEE)
    qte_restante : int
        Quantité restante à servir (QTE_RESTANTE)
    qte_disponible : int
        Stock disponible pour cet article
    qte_allouee : int
        Quantité allouée maintenant
    besoin_net : int
        Quantité restante à couvrir par OF
    """

    article: str
    qte_commandee: int
    qte_allouee_exist: int
    qte_restante: int
    qte_disponible: int
    qte_allouee: int
    besoin_net: int


@dataclass
class OFMatchAllocation:
    """Quantité couverte par un OF donné."""

    of: OF
    qte_allouee: int
    qte_disponible_avant: int
    qte_disponible_apres: int
    match_reason: str


@dataclass
class MatchingResult:
    """Résultat du matching commande→OF.

    Attributes
    ----------
    commande : BesoinClient
        Commande client
    of : Optional[OF]
        OF principal (compatibilité; premier OF alloué s'il y en a plusieurs)
    matching_method : str
        Méthode de matching utilisée ("MTS", "NOR/MTO suggéré", "Aucun")
    alertes : list[str]
        Liste des alertes
    stock_allocation : Optional[StockAllocation]
        Allocation de stock (pour NOR/MTO)
    of_allocations : list[OFMatchAllocation]
        Couverture détaillée par OF
    remaining_uncovered_qty : int
        Reliquat non couvert après stock + OF
    """

    commande: BesoinClient
    of: Optional[OF]
    matching_method: str
    alertes: list[str] = field(default_factory=list)
    stock_allocation: Optional[StockAllocation] = None
    of_allocations: list[OFMatchAllocation] = field(default_factory=list)
    remaining_uncovered_qty: int = 0

    def add_alerte(self, alerte: str):
        """Ajoute une alerte."""
        self.alertes.append(alerte)


class CommandeOFMatcher:
    """Gestionnaire du matching commande→OF.

    Attributes
    ----------
    data_loader : DataLoader
        Loader de données
    date_tolerance_days : int
        Tolérance en jours pour le matching par date
    of_conso: Dict[str, OFConso]
        Dictionnaire des OF suivis (num_of → OFConso)
    """

    def __init__(self, data_loader: DataLoader, date_tolerance_days: int = 10):
        """Initialise le matcher.

        Parameters
        ----------
        data_loader : DataLoader
            Loader de données
        date_tolerance_days : int
            Tolérance en jours pour le matching par date (défaut: 10)
        """
        self.data_loader = data_loader
        self.date_tolerance_days = date_tolerance_days
        self.of_conso: Dict[str, OFConso] = {}
        self.ofs_deja_utilises: set[str] = set()

    def reset(self):
        """Réinitialise les OF utilisés."""
        self.of_conso.clear()
        self.ofs_deja_utilises.clear()

    def _initialiser_of_conso(self, articles: set[str] = None):
        """Initialise le suivi des OF pour les articles donnés.

        Inclut les OF affermis (statut 1), planifiés (statut 2) et suggérés (statut 3).

        Parameters
        ----------
        articles : set[str], optional
            Articles à initialiser. Si None, tous les articles NOR/MTO.
        """
        for of in self.data_loader.ofs:
            # OF affermis (statut 1), planifiés (statut 2) ou suggérés (statut 3)
            if not is_plannable_of_status(of.statut_num):
                continue

            # Filtrer par articles si demandé
            if articles and of.article not in articles:
                continue

            # Créer le suivi
            if of.num_of not in self.of_conso:
                self.of_conso[of.num_of] = OFConso(
                    of=of,
                    qte_disponible=of.qte_restante,
                    qte_allouee=0,
                    commandes_servees=[],
                )

    def _create_stock_state(self) -> StockState:
        """Crée l'état du stock virtuel pour l'allocation.

        Returns
        -------
        StockState
            État du stock initialisé avec le stock disponible
        """
        initial_stock = {}
        for article, stock_obj in self.data_loader.stocks.items():
            initial_stock[article] = stock_obj.disponible()

        return StockState(initial_stock)

    def match_commande(self, commande: BesoinClient, stock_state: StockState = None) -> MatchingResult:
        """Match une commande avec un OF.

        Parameters
        ----------
        commande : BesoinClient
            Commande à matcher
        stock_state : StockState, optional
            État du stock virtuel pour gérer la concurrence

        Returns
        -------
        MatchingResult
            Résultat du matching
        """
        if commande.is_mts():
            return self._match_mts(commande)
        return self._match_nor_mto(commande, stock_state)

    def _linked_origin_ofs(self, commande: BesoinClient) -> list[OF]:
        """Retourne les OF liés via OF.NUM_ORDRE_ORIGINE = commande.num_commande.

        Le matching ne s'applique que pour les OF dont
        METHODE_OBTENTION_LIVRAISON = "Ordre de fabrication".
        """
        linked_ofs = self.data_loader.get_ofs_by_origin(
            commande.num_commande,
            article=commande.article,
        )
        if not linked_ofs:
            return None

        linked_ofs = [
            of for of in linked_ofs
            if (
                str(of.methode_obtention_livraison).strip().lower() == "ordre de fabrication"
                and is_plannable_of_status(of.statut_num)
                and of.qte_restante > 0
            )
        ]
        return linked_ofs

    def _consume_of_quantity(self, of: OF, qte: int, num_commande: str, reason: str) -> OFMatchAllocation:
        """Consomme une quantité sur un OF suivi et retourne la trace d'allocation."""
        if of.num_of not in self.of_conso:
            self._initialiser_of_conso(articles={of.article})
        if of.num_of not in self.of_conso:
            self.of_conso[of.num_of] = OFConso(
                of=of,
                qte_disponible=of.qte_restante,
                qte_allouee=0,
                commandes_servees=[],
            )

        of_conso = self.of_conso[of.num_of]
        before = of_conso.qte_disponible
        allocated = min(qte, before)
        of_conso.allouer(allocated, num_commande)
        return OFMatchAllocation(
            of=of,
            qte_allouee=allocated,
            qte_disponible_avant=before,
            qte_disponible_apres=of_conso.qte_disponible,
            match_reason=reason,
        )

    def _match_mts(self, commande: BesoinClient) -> MatchingResult:
        """Applique le hard pegging strict pour les commandes MTS."""
        linked_ofs = self._linked_origin_ofs(commande)

        if not linked_ofs:
            return MatchingResult(
                commande=commande,
                of=None,
                matching_method=method_mts_hard_pegging(),
                alertes=[alert_mts_missing_hard_pegging(commande.article)],
                remaining_uncovered_qty=commande.qte_restante,
            )

        # Hard pegging attendu : un seul OF de référence.
        linked_ofs.sort(
            key=lambda of: (
                {1: 0, 2: 1, 3: 2}.get(of.statut_num, 3),
                abs((of.date_fin - commande.date_expedition_demandee).days),
            )
        )
        selected = linked_ofs[0]
        self.ofs_deja_utilises.add(selected.num_of)

        if len(linked_ofs) > 1:
            allocation = self._consume_of_quantity(
                selected,
                min(commande.qte_restante, selected.qte_restante),
                commande.num_commande,
                "MTS hard pegging principal",
            )
            return MatchingResult(
                commande=commande,
                of=selected,
                matching_method=method_mts_hard_pegging(),
                alertes=[
                    alert_mts_non_univoque(len(linked_ofs), commande.num_commande)
                ],
                of_allocations=[allocation],
                remaining_uncovered_qty=max(commande.qte_restante - allocation.qte_allouee, 0),
            )

        allocation = self._consume_of_quantity(
            selected,
            commande.qte_restante,
            commande.num_commande,
            "MTS hard pegging",
        )
        remaining = max(commande.qte_restante - allocation.qte_allouee, 0)
        alertes = []
        if remaining > 0:
            alertes.append(
                alert_mts_partial_cover(
                    selected.num_of,
                    allocation.qte_allouee,
                    commande.qte_restante,
                )
            )

        return MatchingResult(
            commande=commande,
            of=selected,
            matching_method=method_mts_hard_pegging(),
            alertes=alertes,
            of_allocations=[allocation],
            remaining_uncovered_qty=remaining,
        )

    def _allocate_stock(self, commande: BesoinClient, stock_state: StockState = None) -> StockAllocation:
        """Alloue le stock disponible pour une commande.

        IMPORTANT : Utilise commande.qte_restante (quantité restante à servir)
        Si stock_state est fourni, gère la concurrence avec allocation virtuelle.

        Parameters
        ----------
        commande : BesoinClient
            Commande à traiter
        stock_state : StockState, optional
            État du stock virtuel pour gérer la concurrence

        Returns
        -------
        StockAllocation
            Résultat de l'allocation
        """
        stock = self.data_loader.get_stock(commande.article)

        if stock is None:
            # Pas de stock = tout en besoin net
            return StockAllocation(
                article=commande.article,
                qte_commandee=commande.qte_commandee,
                qte_allouee_exist=commande.qte_allouee,
                qte_restante=commande.qte_restante,
                qte_disponible=0,
                qte_allouee=0,
                besoin_net=commande.qte_restante,
            )

        # Utiliser le stock virtuel si fourni, sinon le stock physique
        if stock_state is not None:
            qte_dispo = stock_state.get_available(commande.article)
        else:
            qte_dispo = stock.disponible()

        # Allouer min(stock_dispo, qte_restante)
        qte_allouee = min(qte_dispo, commande.qte_restante)
        besoin_net = commande.qte_restante - qte_allouee

        # Enregistrer l'allocation virtuelle si stock_state fourni
        if stock_state is not None and qte_allouee > 0:
            stock_state.allocate(commande.num_commande, {commande.article: qte_allouee})

        return StockAllocation(
            article=commande.article,
            qte_commandee=commande.qte_commandee,
            qte_allouee_exist=commande.qte_allouee,
            qte_restante=commande.qte_restante,
            qte_disponible=qte_dispo,
            qte_allouee=qte_allouee,
            besoin_net=besoin_net,
        )

    def _iter_of_candidates(self, commande: BesoinClient) -> list[OFConso]:
        """Retourne les OF candidats triés pour une couverture cumulative."""
        is_firm_order = commande.est_commande()
        candidates: list[tuple[int, int, int, OFConso]] = []

        for of_conso in self.of_conso.values():
            of = of_conso.of
            if of.article != commande.article:
                continue
            if of_conso.qte_disponible <= 0:
                continue

            ecart_days = abs((of.date_fin - commande.date_expedition_demandee).days)
            if ecart_days > self.date_tolerance_days:
                continue

            if not is_firm_order and of.statut_num in (1, 2):
                continue

            week_gap = abs(((of.date_fin - commande.date_expedition_demandee).days) // 7)
            priorite = {1: 0, 2: 1, 3: 2}.get(of.statut_num, 3)
            candidates.append((priorite, week_gap, ecart_days, of_conso))

        candidates.sort(
            key=lambda item: (
                item[0],
                item[1],
                item[2],
                -item[3].qte_disponible,
                item[3].of.num_of,
            )
        )
        return [item[3] for item in candidates]

    def _match_nor_mto(self, commande: BesoinClient, stock_state: StockState = None) -> MatchingResult:
        """Match une commande NOR/MTO avec allocation de stock + OF.

        IMPORTANT : Utilise QTE_RESTANTE (quantité réelle à servir)

        Parameters
        ----------
        commande : BesoinClient
            Commande NOR/MTO à matcher
        stock_state : StockState, optional
            État du stock virtuel pour gérer la concurrence

        Returns
        -------
        MatchingResult
            Résultat du matching
        """
        # 1. Allouer le stock disponible avec gestion de la concurrence
        allocation = self._allocate_stock(commande, stock_state)

        # 2. Si stock complet, pas d'OF nécessaire
        if allocation.besoin_net == 0:
            return MatchingResult(
                commande=commande,
                of=None,
                matching_method=method_nor_mto_stock_complete(),
                alertes=[],
                stock_allocation=allocation,
            )

        # 3. Vérifier le type d'article
        article = self.data_loader.get_article(commande.article)

        # 3a. Article ACHAT = pas d'OF, seulement du stock
        if is_purchase_article(article):
            return MatchingResult(
                commande=commande,
                of=None,
                matching_method=method_purchase_article(),
                alertes=[
                    alert_purchase_article_supply(
                        allocation.qte_allouee,
                        allocation.besoin_net,
                    )
                ],
                stock_allocation=allocation,
            )

        # 3b. Article FABRICATION = chercher un OF (affermi prioritaire, puis suggéré)
        # Initialiser OFConso pour cet article si pas déjà fait
        if commande.article not in {of.article for of in self.data_loader.ofs if of.num_of in self.of_conso}:
            self._initialiser_of_conso(articles={commande.article})

        remaining = allocation.besoin_net
        of_allocations: list[OFMatchAllocation] = []
        for of_conso in self._iter_of_candidates(commande):
            if remaining <= 0:
                break
            of = of_conso.of
            allocated = self._consume_of_quantity(
                of,
                remaining,
                commande.num_commande,
                "MTO/NOR couverture cumulative",
            )
            if allocated.qte_allouee <= 0:
                continue
            of_allocations.append(allocated)
            remaining -= allocated.qte_allouee

        if not of_allocations:
            return MatchingResult(
                commande=commande,
                of=None,
                matching_method=method_none(),
                alertes=[
                    alert_no_of_found(
                        allocation.qte_allouee,
                        allocation.besoin_net,
                        commande.article,
                    )
                ],
                stock_allocation=allocation,
                remaining_uncovered_qty=allocation.besoin_net,
            )

        primary_of = of_allocations[0].of
        details = " + ".join(
            f"{alloc.of.num_of}:{alloc.qte_allouee}"
            for alloc in of_allocations
        )
        alertes = []
        if remaining > 0:
            alertes.append(
                alert_partial_of_coverage(
                    sum(a.qte_allouee for a in of_allocations),
                    allocation.besoin_net,
                    commande.article,
                )
            )

        return MatchingResult(
            commande=commande,
            of=primary_of,
            matching_method=method_nor_mto_cumulative(allocation.qte_allouee, details),
            alertes=alertes,
            stock_allocation=allocation,
            of_allocations=of_allocations,
            remaining_uncovered_qty=remaining,
        )

    def match_commandes(self, commandes: list[BesoinClient]) -> list[MatchingResult]:
        """Match plusieurs commandes avec des OF.

        Les commandes sont traitées par ordre de date d'expédition
        pour gérer la concurrence sur les OF.

        Parameters
        ----------
        commandes : list[BesoinClient]
            Liste des commandes à matcher

        Returns
        -------
        list[MatchingResult]
            Liste des résultats de matching
        """
        # Reset OFConso pour un nouveau matching
        self.reset()

        # Collecter les articles NOR/MTO pour initialiser OFConso
        articles_nor_mto = {c.article for c in commandes}
        self._initialiser_of_conso(articles=articles_nor_mto)

        # Créer l'état du stock virtuel pour gérer la concurrence
        stock_state = self._create_stock_state()

        # Trier par priorité : commandes > prévisions > date d'expédition > ancienneté
        commandes_triees = sorted(commandes, key=lambda c: (
            0 if c.est_commande() else 1,   # Commandes = 0, Prévisions = 1
            c.date_expedition_demandee,      # Date expedition (plus proche = prioritaire)
            c.date_commande or date.max      # Ancienneté (plus ancien = prioritaire, None = moins prioritaire)
        ))

        results = []
        for commande in commandes_triees:
            result = self.match_commande(commande, stock_state)
            results.append(result)

        return results
