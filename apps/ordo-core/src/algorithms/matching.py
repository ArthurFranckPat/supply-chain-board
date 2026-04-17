"""Algorithme de matching commande→OF."""

from dataclasses import dataclass, field
from datetime import date
from typing import Optional, Dict

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
class MatchingResult:
    """Résultat du matching commande→OF.

    Attributes
    ----------
    commande : BesoinClient
        Commande client
    of : Optional[OF]
        OF matché (None si aucun)
    matching_method : str
        Méthode de matching utilisée ("MTS", "NOR/MTO suggéré", "Aucun")
    alertes : list[str]
        Liste des alertes
    stock_allocation : Optional[StockAllocation]
        Allocation de stock (pour NOR/MTO)
    """

    commande: BesoinClient
    of: Optional[OF]
    matching_method: str
    alertes: list[str] = field(default_factory=list)
    stock_allocation: Optional[StockAllocation] = None

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
            if of.statut_num not in (1, 2, 3):
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
        # Priorité au lien explicite commande -> OF via NUM_ORDRE_ORIGINE.
        # Ce lien remplace fonctionnellement l'ancien OF_CONTREMARQUE.
        linked_result = self._match_by_origin_order(commande)
        if linked_result is not None:
            return linked_result

        # Tous les types utilisent le même chemin : allocation stock + recherche OF
        return self._match_nor_mto(commande, stock_state)

    def _match_by_origin_order(self, commande: BesoinClient) -> Optional[MatchingResult]:
        """Match direct via OF.NUM_ORDRE_ORIGINE = commande.num_commande.

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
                and of.statut_num in (1, 2, 3)
                and of.qte_restante > 0
            )
        ]
        if not linked_ofs:
            return None

        # Prioriser OF fermés, puis planifiés, puis suggérés; ensuite la date la plus proche.
        def _priority(of: OF) -> tuple[int, int]:
            statut_rank = {1: 0, 2: 1, 3: 2}.get(of.statut_num, 3)
            date_gap = abs((of.date_fin - commande.date_expedition_demandee).days)
            return (statut_rank, date_gap)

        linked_ofs.sort(key=_priority)
        selected = linked_ofs[0]
        self.ofs_deja_utilises.add(selected.num_of)

        return MatchingResult(
            commande=commande,
            of=selected,
            matching_method="Lien direct NUM_ORDRE_ORIGINE",
            alertes=[],
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

    def _find_of_for_besoin_net(
        self,
        commande: BesoinClient,
        besoin_net: int,
    ) -> Optional[OF]:
        """Trouve un OF pour un besoin net donné.

        Priorité :
        1. OF affermis (statut 1) - déjà lancés en production
        2. OF suggérés (statut 3) - créés par CBN/MRP

        Parameters
        ----------
        commande : BesoinClient
            Commande client
        besoin_net : int
            Besoin net à couvrir par OF

        Returns
        -------
        Optional[OF]
            OF trouvé ou None
        """
        candidates = []

        for of_conso in self.of_conso.values():
            of = of_conso.of

            # Vérifier l'article
            if of.article != commande.article:
                continue

            # Vérifier la quantité disponible avec OFConso
            if not of_conso.est_disponible(besoin_net):
                continue

            # Vérifier la date (± tolérance)
            ecart_days = abs((of.date_fin - commande.date_expedition_demandee).days)
            if ecart_days > self.date_tolerance_days:
                continue

            # Candidat trouvé avec priorité : affermis > planifié > suggéré
            if of.statut_num == 1:
                priorite = 0  # Affermi
            elif of.statut_num == 2:
                priorite = 1  # Planifié
            else:
                priorite = 2  # Suggéré
            candidates.append((of_conso, ecart_days, priorite))

        if not candidates:
            return None

        # Trier par priorité, puis écart de date, puis quantité décroissante
        candidates.sort(key=lambda x: (x[2], x[1], -x[0].of.qte_restante))

        # Meilleur candidat
        return candidates[0][0].of

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
                matching_method="NOR/MTO (stock complet)",
                alertes=[],
                stock_allocation=allocation,
            )

        # 3. Vérifier le type d'article
        article = self.data_loader.get_article(commande.article)

        # 3a. Article ACHAT = pas d'OF, seulement du stock
        if article and article.is_achat():
            return MatchingResult(
                commande=commande,
                of=None,
                matching_method="Article acheté",
                alertes=[
                    f"Article ACHAT - Stock alloué: {allocation.qte_allouee}, "
                    f"Besoin net: {allocation.besoin_net} (approvisionnement requis)"
                ],
                stock_allocation=allocation,
            )

        # 3b. Article FABRICATION = chercher un OF (affermi prioritaire, puis suggéré)
        # Initialiser OFConso pour cet article si pas déjà fait
        if commande.article not in {of.article for of in self.data_loader.ofs if of.num_of in self.of_conso}:
            self._initialiser_of_conso(articles={commande.article})

        # 4. Chercher un OF pour le besoin net (affermi prioritaire)
        of = self._find_of_for_besoin_net(commande, allocation.besoin_net)

        if not of:
            return MatchingResult(
                commande=commande,
                of=None,
                matching_method="Aucun",
                alertes=[
                    f"Stock alloué: {allocation.qte_allouee}, "
                    f"Besoin net: {allocation.besoin_net}, "
                    f"Aucun OF trouvé (affermi ou suggéré) pour {commande.article}"
                ],
                stock_allocation=allocation,
            )

        # 5. Allouer la quantité sur l'OF
        of_conso = self.of_conso[of.num_of]
        of_conso.allouer(allocation.besoin_net, commande.num_commande)

        # Déterminer le type d'OF pour le message
        if of.statut_num == 1:
            of_type = "Affermé"
        elif of.statut_num == 2:
            of_type = "Planifié"
        else:
            of_type = "Suggéré"

        return MatchingResult(
            commande=commande,
            of=of,
            matching_method=f"NOR/MTO ({of_type} - stock: {allocation.qte_allouee} + OF: {allocation.besoin_net})",
            alertes=[],
            stock_allocation=allocation,
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
