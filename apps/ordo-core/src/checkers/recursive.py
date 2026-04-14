"""Recursive Checker - Algorithme de vérification récursive des nomenclatures."""

from datetime import timedelta
from typing import Optional

from .base import BaseChecker, FeasibilityResult
from ..models.nomenclature import Nomenclature
from ..models.of import OF
from ..models.besoin_client import BesoinClient


class RecursiveChecker(BaseChecker):
    """Checker avec vérification récursive des nomenclatures.

    Ce checker vérifie récursivement tous les niveaux de nomenclature :
    - Si un composant est ACHAT → vérifier le stock
    - Si un composant est FABRIQUÉ → vérifier récursivement sa nomenclature

    Attributes
    ----------
    data_loader : DataLoader
        Loader de données
    use_receptions : bool
        Si True, utilise les réceptions fournisseurs dans le calcul du stock
    check_date : Optional[date]
        Date de vérification (pour filtrer les réceptions)
    stock_state : Optional[StockState]
        État du stock virtuel pour allocation (None = stock réel)
    """

    def __init__(self, data_loader, use_receptions: bool = False, check_date: Optional = None, stock_state: Optional["StockState"] = None):
        """Initialise le checker récursif.

        Parameters
        ----------
        data_loader : DataLoader
            Loader de données
        use_receptions : bool
            Si True, utilise les réceptions fournisseurs
        check_date : Optional[date]
            Date de vérification (None = aujourd'hui)
        stock_state : Optional[StockState]
            État du stock virtuel pour allocation (None = stock réel)
        """
        super().__init__(data_loader)
        self.use_receptions = use_receptions
        self.check_date = check_date
        self.stock_state = stock_state

    def check_of(self, of: OF) -> FeasibilityResult:
        """Vérifie la faisabilité d'un OF avec récursion.

        Parameters
        ----------
        of : OF
            Ordre de fabrication à vérifier

        Returns
        -------
        FeasibilityResult
            Résultat de la vérification
        """
        # L'OF parent est FERME si statut = 1
        of_est_ferme = (of.statut_num == 1)

        # Pour les réceptions, la date de besoin suit la priorité métier:
        # DATE_DEBUT si disponible, sinon commande liée - 2j, sinon DATE_FIN - 2j.
        date_besoin = self._get_date_besoin_commande(of)

        return self._check_article_recursive(
            article=of.article,
            qte_besoin=of.qte_restante,
            date_besoin=date_besoin,
            depth=0,
            of_parent_est_ferme=of_est_ferme,
            num_of_parent=of.num_of,
        )

    def _get_date_besoin_commande(self, of: OF):
        """Retourne la date de besoin composants d'un OF.

        Parameters
        ----------
        of : OF
            Ordre de fabrication

        Returns
        -------
        date
            Date de besoin des composants selon la priorité métier
        """
        if of.date_debut is not None:
            return of.date_debut

        commandes = [
            c for c in self.data_loader.commandes_clients
            if c.of_contremarque == of.num_of
        ]
        if commandes:
            return min(c.date_expedition_demandee for c in commandes) - timedelta(days=2)

        return of.date_fin - timedelta(days=2)

    def check_commande(self, commande: BesoinClient) -> FeasibilityResult:
        """Vérifie la faisabilité d'une commande client avec récursion.

        Pour les commandes MTS avec OF lié, vérifie l'OF associé.
        Pour toutes les commandes, tient compte des allocations existantes.

        Parameters
        ----------
        commande : BesoinClient
            Commande client à vérifier

        Returns
        -------
        FeasibilityResult
            Résultat de la vérification
        """
        result = FeasibilityResult(feasible=True, depth=0)

        # Cas 1 : Commande MTS avec OF lié
        if commande.is_mts() and commande.of_contremarque:
            of = self.data_loader.get_of_by_num(commande.of_contremarque)
            if of:
                # Vérifier l'OF lié
                return self.check_of(of)
            else:
                result.add_alert(f"OF {commande.of_contremarque} introuvable pour la commande MTS")
                result.feasible = False
                return result

        # Cas 2 : Vérifier si la commande a des allocations
        allocations = self.data_loader.get_allocations_of(commande.num_commande)

        if allocations:
            # La commande a des allocations → les utiliser comme référence
            # Traiter comme si of_parent_est_ferme=True (composants déjà alloués)
            return self._check_article_recursive(
                article=commande.article,
                qte_besoin=commande.qte_restante,
                date_besoin=commande.date_expedition_demandee,
                depth=0,
                of_parent_est_ferme=True,  # Composants déjà alloués
                num_of_parent=commande.num_commande,  # Utiliser le numéro de commande
            )

        # Cas 3 : Pas d'allocations connues → vérification standard
        return self._check_article_recursive(
            article=commande.article,
            qte_besoin=commande.qte_restante,
            date_besoin=commande.date_expedition_demandee,
            depth=0,
            of_parent_est_ferme=False,
            num_of_parent=None,
        )

    def _check_article_recursive(
        self,
        article: str,
        qte_besoin: int,
        date_besoin,
        depth: int,
        of_parent_est_ferme: bool = False,
        num_of_parent: Optional[str] = None,
    ) -> FeasibilityResult:
        """Vérifie récursivement la faisabilité pour un article.

        Parameters
        ----------
        article : str
            Code de l'article à vérifier
        qte_besoin : int
            Quantité nécessaire
        date_besoin : date
            Date de besoin
        depth : int
            Profondeur de récursion actuelle
        of_parent_est_ferme : bool
            True si l'OF parent est FERME (composants déjà alloués)
        num_of_parent : Optional[str]
            Numéro de l'OF parent pour vérifier les allocations

        Returns
        -------
        FeasibilityResult
            Résultat de la vérification
        """
        result = FeasibilityResult(feasible=True, depth=depth)

        # Récupérer la nomenclature de l'article
        nomenclature = self.data_loader.get_nomenclature(article)

        if nomenclature is None:
            # Nomenclature non disponible
            result.add_alert(f"Nomenclature non disponible pour l'article {article}")
            return result

        if not nomenclature.composants:
            # Pas de composants = article de base (ACHAT ou sans nomenclature)
            result.components_checked = 1
            return result

        phantom_variant_exclusions = self._get_phantom_sibling_variant_exclusions(nomenclature)

        # Récupérer les allocations de l'OF parent si fourni
        # IMPORTANT : Les OF FERMES avec allocations ne participent pas à l'allocation virtuelle
        allocations_parent = {}
        if num_of_parent and of_parent_est_ferme:
            allocations_parent = {
                alloc.article: alloc.qte_allouee
                for alloc in self.data_loader.get_allocations_of(num_of_parent)
            }

        # Vérifier chaque composant de la nomenclature
        for composant in nomenclature.composants:
            if composant.article_composant in phantom_variant_exclusions:
                continue

            result.components_checked += 1

            # Calculer la quantité nécessaire pour ce composant
            qte_composant = int(composant.qte_lien * qte_besoin)

            if self._is_component_treated_as_purchase(composant.article_composant, composant.is_achete(), composant.is_fabrique()):
                # LOGIQUE : Si le composant est déjà alloué à l'OF parent, skip
                if of_parent_est_ferme and composant.article_composant in allocations_parent:
                    # Composant déjà alloué à l'OF FERME → Pas de vérification
                    continue
                else:
                    if self._is_phantom_article(composant.article_composant):
                        phantom_result = self._check_phantom_component(
                            article_code=composant.article_composant,
                            qte_besoin=qte_composant,
                            date_besoin=date_besoin,
                            depth=depth + 1,
                        )
                        result.merge(phantom_result)
                    else:
                        # Pas alloué → Vérifier le stock disponible
                        stock_result = self._check_stock(composant.article_composant, qte_composant, date_besoin)
                        result.merge(stock_result)

            elif composant.is_fabrique():
                # LOGIQUE : Vérifier le stock disponible d'abord
                if self.stock_state:
                    stock_dispo = self.stock_state.get_available(composant.article_composant)
                else:
                    stock = self.data_loader.get_stock(composant.article_composant)
                    stock_dispo = stock.disponible() if stock else 0

                # Si stock suffisant OU OF parent FERME avec allocation → Pas de vérification d'OF
                if of_parent_est_ferme and composant.article_composant in allocations_parent:
                    # Composant fabriqué déjà alloué → Pas de vérification
                    continue
                elif stock_dispo >= qte_composant:
                    # Stock disponible suffisant → Pas besoin de vérifier l'OF
                    continue
                else:
                    # Stock insuffisant → Vérifier l'OF du composant
                    component_result = self._check_of_composant_fabrique(
                        article=composant.article_composant,
                        qte_besoin=qte_composant,
                        date_besoin=date_besoin,
                        depth=depth + 1,
                    )
                    result.merge(component_result)

        return result

    def _check_of_composant_fabrique(
        self,
        article: str,
        qte_besoin: int,
        date_besoin,
        depth: int,
    ) -> FeasibilityResult:
        """Vérifie un composant fabriqué en cherchant son OF.

        Parameters
        ----------
        article : str
            Article fabriqué à vérifier
        qte_besoin : int
            Quantité nécessaire
        date_besoin : date
            Date de besoin
        depth : int
            Profondeur de récursion

        Returns
        -------
        FeasibilityResult
            Résultat de la vérification
        """
        # 1. Chercher un OF FERME avec date la plus proche
        ofs_ferme = self.data_loader.get_ofs_by_article(
            article=article,
            statut=1,  # FERME
            date_besoin=date_besoin,
        )

        if ofs_ferme:
            # OF FERME trouvé → Ses ACHAT sont OK, mais continuer la récursion
            of_ferme = ofs_ferme[0]  # Le plus proche
            result = self._check_article_recursive(
                article=article,
                qte_besoin=qte_besoin,
                date_besoin=date_besoin,
                depth=depth,
                of_parent_est_ferme=True,
                num_of_parent=of_ferme.num_of,  # ← Passer le num_of
            )
            if not result.feasible:
                result.add_missing(article, qte_besoin)
            return result

        # 2. Pas d'OF FERME → Chercher OF PLANIFIÉ (WOP)
        ofs_planifie = self.data_loader.get_ofs_by_article(
            article=article,
            statut=2,  # PLANIFIÉ
            date_besoin=date_besoin,
        )

        if ofs_planifie:
            # OF PLANIFIÉ → Vérifier sa faisabilité complète (composants pas alloués)
            of_planifie = ofs_planifie[0]  # Le plus proche
            result = self._check_article_recursive(
                article=article,
                qte_besoin=qte_besoin,
                date_besoin=date_besoin,
                depth=depth,
                of_parent_est_ferme=False,  # Composants PAS alloués
                num_of_parent=of_planifie.num_of,
            )
            if not result.feasible:
                result.add_missing(article, qte_besoin)
            return result

        # 3. Pas d'OF PLANIFIÉ → Chercher OF SUGGÉRÉ
        ofs_suggere = self.data_loader.get_ofs_by_article(
            article=article,
            statut=3,  # SUGGÉRÉ
            date_besoin=date_besoin,
        )

        if ofs_suggere:
            # OF SUGGÉRÉ → Vérifier sa faisabilité complète
            of_suggere = ofs_suggere[0]  # Le plus proche
            result = self._check_article_recursive(
                article=article,
                qte_besoin=qte_besoin,
                date_besoin=date_besoin,
                depth=depth,
                of_parent_est_ferme=False,
                num_of_parent=of_suggere.num_of,  # ← Passer le num_of
            )
            if not result.feasible:
                result.add_missing(article, qte_besoin)
            return result

        # 4. Aucun OF trouvé → marquer le sous-ensemble comme manquant
        # tout en parcourant sa nomenclature pour identifier les achats racines bloquants.
        result = self._check_article_recursive(
            article=article,
            qte_besoin=qte_besoin,
            date_besoin=date_besoin,
            depth=depth,
            of_parent_est_ferme=False,
            num_of_parent=None,  # Pas d'OF parent
        )
        result.feasible = False
        result.add_missing(article, qte_besoin)
        result.add_alert(f"Aucun OF trouvé pour le sous-ensemble fabriqué {article}")
        return result

    def _check_stock(self, article: str, qte_besoin: int, date_besoin) -> FeasibilityResult:
        """Vérifie si le stock est suffisant pour un article.

        Utilise le stock virtuel si stock_state est fourni, sinon le stock réel.

        Parameters
        ----------
        article : str
            Code de l'article
        qte_besoin : int
            Quantité nécessaire
        date_besoin : date
            Date de besoin

        Returns
        -------
        FeasibilityResult
            Résultat de la vérification de stock
        """
        result = FeasibilityResult()

        # Récupérer le stock (virtuel ou réel)
        if self.stock_state:
            # Utiliser le stock virtuel (allocation activée)
            stock_dispo = self.stock_state.get_available(article)
        else:
            # Utiliser le stock réel (comportement actuel)
            stock = self.data_loader.get_stock(article)
            if stock is None:
                # Article sans stock = considéré comme en rupture
                result.feasible = False
                result.add_missing(article, qte_besoin)
                result.add_alert(f"Stock non disponible pour l'article {article}")
                return result

            stock_dispo = stock.disponible()

            # Ajouter les réceptions si activé
            if self.use_receptions:
                # Les réceptions doivent arriver avant la date de besoin
                # (date d'expédition commande liée, ou date_fin OF en fallback)
                receptions = self.data_loader.get_receptions(article)
                for reception in receptions:
                    if reception.est_disponible_avant(date_besoin):
                        stock_dispo += reception.quantite_restante

        # Vérifier si le stock est suffisant
        if stock_dispo < qte_besoin:
            result.feasible = False
            result.add_missing(article, qte_besoin - stock_dispo)

        return result

    def _check_phantom_component(
        self,
        article_code: str,
        qte_besoin: int,
        date_besoin,
        depth: int,
    ) -> FeasibilityResult:
        """Résout un article fantôme vers une seule variante réelle.

        Règle métier : un même OF ne mélange jamais plusieurs variantes.
        Une seule variante doit couvrir 100% du besoin.
        La référence fantôme elle-même représente l'ancienne variante à
        épuiser avant la bascule vers une nouvelle référence.
        """
        variants = self._get_phantom_variants(article_code)
        options: list[tuple[str, float]] = [(article_code, 1.0)]
        for variant_article, qte_lien in variants:
            if variant_article == article_code:
                continue
            options.append((variant_article, qte_lien))

        failed_variants: list[tuple[str, int, FeasibilityResult]] = []
        for variant_article, qte_lien in options:
            variant_qty = int(qte_lien * qte_besoin)
            variant_result = self._check_stock(variant_article, variant_qty, date_besoin)
            if variant_result.feasible:
                variant_result.add_alert(
                    f"AFANT {article_code} résolu en variante unique {variant_article}"
                )
                return variant_result
            failed_variants.append((variant_article, variant_qty, variant_result))

        result = FeasibilityResult(feasible=False, depth=depth)
        result.add_missing(article_code, qte_besoin)
        details = []
        for variant_article, variant_qty, variant_result in failed_variants:
            shortage = variant_result.missing_components.get(variant_article, variant_qty)
            details.append(f"{variant_article} manque {shortage}")
        if details:
            result.add_alert(
                f"AFANT {article_code}: aucune variante complète disponible ({'; '.join(details)})"
            )
        else:
            result.add_alert(
                f"AFANT {article_code}: aucune variante complète disponible"
            )
        return result

    def _is_component_treated_as_purchase(
        self,
        article_code: str,
        is_achete: bool,
        is_fabrique: bool,
    ) -> bool:
        """Détermine si un composant suit la logique d'appro externe.

        Les articles de sous-traitance (catégorie commençant par ``ST``)
        sont traités comme des articles achetés, même si la nomenclature
        les marque comme fabriqués.
        """
        article = self._get_article_metadata(article_code)
        if article is not None and getattr(article, "is_achat", None):
            if article.is_achat():
                return True
        if is_achete:
            return True
        if not is_fabrique:
            return False
        return self._is_subcontracted_article(article_code)

    def _get_article_metadata(self, article_code: str):
        """Retourne le référentiel article quand il est disponible."""
        article = None
        if hasattr(self.data_loader, "get_article"):
            try:
                article = self.data_loader.get_article(article_code)
            except Exception:
                article = None

        if article is None and hasattr(self.data_loader, "articles"):
            articles = getattr(self.data_loader, "articles")
            if isinstance(articles, dict):
                article = articles.get(article_code)
        return article

    def _is_phantom_article(self, article_code: str) -> bool:
        """Retourne True si l'article est un fantôme AFANT."""
        article = self._get_article_metadata(article_code)
        return bool(article and getattr(article, "is_fantome", None) and article.is_fantome())

    def _get_phantom_variants(self, article_code: str) -> list[tuple[str, float]]:
        """Retourne les variantes réelles derrière un article fantôme."""
        nomenclature = self.data_loader.get_nomenclature(article_code)
        if nomenclature is None:
            return []
        return [
            (component.article_composant, component.qte_lien)
            for component in nomenclature.composants
        ]

    def _get_phantom_sibling_variant_exclusions(self, nomenclature: Nomenclature) -> set[str]:
        """Retourne les composants à ignorer car déjà couverts par un AFANT.

        Si un parent contient à la fois un AFANT et sa variante réelle en
        composants frères, l'AFANT pilote seul le choix de variante pour l'OF.
        """
        exclusions: set[str] = set()
        component_codes = {component.article_composant for component in nomenclature.composants}
        for component in nomenclature.composants:
            article_code = component.article_composant
            if not self._is_phantom_article(article_code):
                continue
            for variant_article, _ in self._get_phantom_variants(article_code):
                if variant_article != article_code and variant_article in component_codes:
                    exclusions.add(variant_article)
        return exclusions

    def _is_subcontracted_article(self, article_code: str) -> bool:
        """Retourne True si l'article relève de la sous-traitance."""
        article = self._get_article_metadata(article_code)
        categorie = getattr(article, "categorie", "") if article is not None else ""
        return str(categorie or "").upper().startswith("ST")
