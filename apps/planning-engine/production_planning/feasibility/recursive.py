"""Recursive Checker - Algorithme de vérification récursive des nomenclatures."""

from dataclasses import dataclass
from datetime import timedelta
from typing import TYPE_CHECKING, Optional

from .base import BaseChecker, FeasibilityResult
from ..availability import AvailabilityKernel
from ..domain_rules import is_component_treated_as_purchase, is_firm_of_status
from ..models.nomenclature import Nomenclature
from ..models.of import OF
from ..models.besoin_client import BesoinClient

if TYPE_CHECKING:
    from ..orders.allocation import StockState


@dataclass
class CheckContext:
    """Runtime context for a recursive feasibility check.

    Bundles the three parameters (depth, of_parent_est_ferme, num_of_parent)
    that are passed down every recursive call so methods only need one
    ``ctx`` argument.
    """
    depth: int = 0
    of_parent_est_ferme: bool = False
    num_of_parent: Optional[str] = None

    def child(self, of_parent_est_ferme: Optional[bool] = None, num_of_parent: Optional[str] = None) -> "CheckContext":
        """Return a child context with incremented depth."""
        return CheckContext(
            depth=self.depth + 1,
            of_parent_est_ferme=of_parent_est_ferme if of_parent_est_ferme is not None else self.of_parent_est_ferme,
            num_of_parent=num_of_parent if num_of_parent is not None else self.num_of_parent,
        )


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
        self.availability = AvailabilityKernel(data_loader)

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
        of_est_ferme = is_firm_of_status(of.statut_num)

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
        # Vérifier si la commande a des allocations
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
        qte_besoin: float,
        date_besoin,
        depth: int,
        of_parent_est_ferme: bool = False,
        num_of_parent: Optional[str] = None,
    ) -> FeasibilityResult:
        """Vérifie récursivement la faisabilité pour un article.

        Cette méthode reste la façade publique / externe ; elle crée
        un ``CheckContext`` et délègue à ``_check_article_recursive_ctx``.
        """
        ctx = CheckContext(
            depth=depth,
            of_parent_est_ferme=of_parent_est_ferme,
            num_of_parent=num_of_parent,
        )
        return self._check_article_recursive_ctx(article, qte_besoin, date_besoin, ctx)

    def _check_article_recursive_ctx(
        self,
        article: str,
        qte_besoin: float,
        date_besoin,
        ctx: CheckContext,
    ) -> FeasibilityResult:
        """Implémentation interne utilisant CheckContext."""
        result = FeasibilityResult(feasible=True, depth=ctx.depth)

        nomenclature = self.data_loader.get_nomenclature(article)

        if nomenclature is None:
            result.add_alert(f"Nomenclature non disponible pour l'article {article}")
            return result

        if not nomenclature.composants:
            result.components_checked = 1
            return result

        phantom_variant_exclusions = self._get_phantom_sibling_variant_exclusions(nomenclature)

        # Récupérer les allocations de l'OF parent si fourni
        allocations_parent = {}
        if ctx.num_of_parent and ctx.of_parent_est_ferme:
            allocations_parent = {
                alloc.article: alloc.qte_allouee
                for alloc in self.data_loader.get_allocations_of(ctx.num_of_parent)
            }

        for composant in nomenclature.composants:
            if composant.article_composant in phantom_variant_exclusions:
                continue

            result.components_checked += 1
            qte_composant = composant.qte_requise(qte_besoin)

            if self._is_component_treated_as_purchase(
                composant.article_composant, composant.is_achete(), composant.is_fabrique()
            ):
                if ctx.of_parent_est_ferme and composant.article_composant in allocations_parent:
                    continue
                if self._is_phantom_article(composant.article_composant):
                    phantom_result = self._check_phantom_component(
                        article_code=composant.article_composant,
                        qte_besoin=qte_composant,
                        date_besoin=date_besoin,
                        ctx=ctx.child(),
                    )
                    result.merge(phantom_result)
                else:
                    stock_result = self._check_stock(composant.article_composant, qte_composant, date_besoin)
                    result.merge(stock_result)

            elif composant.is_fabrique():
                if self.stock_state:
                    stock_dispo = self.availability.available_without_receptions(
                        composant.article_composant, stock_state=self.stock_state,
                    )
                else:
                    stock_dispo = self.availability.available_without_receptions(
                        composant.article_composant
                    )

                if ctx.of_parent_est_ferme and composant.article_composant in allocations_parent:
                    continue
                if stock_dispo >= qte_composant:
                    continue

                component_result = self._check_of_composant_fabrique(
                    article=composant.article_composant,
                    qte_besoin=qte_composant,
                    date_besoin=date_besoin,
                    ctx=ctx.child(),
                )
                result.merge(component_result)

        return result

    def _check_of_composant_fabrique(
        self,
        article: str,
        qte_besoin: float,
        date_besoin,
        ctx: CheckContext,
    ) -> FeasibilityResult:
        """Vérifie un composant fabriqué en cherchant son OF."""
        for statut, of_parent_est_ferme in ((1, True), (2, False), (3, False)):
            result = self._check_with_candidate_of(
                article=article,
                qte_besoin=qte_besoin,
                date_besoin=date_besoin,
                ctx=ctx.child(of_parent_est_ferme=of_parent_est_ferme),
                statut=statut,
            )
            if result is not None:
                return result

        # Aucun OF trouvé → marquer le sous-ensemble comme manquant
        result = self._check_article_recursive_ctx(
            article=article,
            qte_besoin=qte_besoin,
            date_besoin=date_besoin,
            ctx=ctx.child(of_parent_est_ferme=False, num_of_parent=None),
        )
        result.feasible = False
        result.add_missing(article, qte_besoin)
        result.add_alert(f"Aucun OF trouvé pour le sous-ensemble fabriqué {article}")
        return result

    def _check_with_candidate_of(
        self,
        *,
        article: str,
        qte_besoin: float,
        date_besoin,
        ctx: CheckContext,
        statut: int,
    ) -> Optional[FeasibilityResult]:
        """Run the recursive check against the closest OF for a given status."""
        ofs = self.data_loader.get_ofs_by_article(
            article=article,
            statut=statut,
            date_besoin=date_besoin,
        )
        if not ofs:
            return None

        selected_of = ofs[0]
        result = self._check_article_recursive_ctx(
            article=article,
            qte_besoin=qte_besoin,
            date_besoin=date_besoin,
            ctx=ctx.child(num_of_parent=selected_of.num_of),
        )
        if not result.feasible:
            result.add_missing(article, qte_besoin)
        return result

    def _check_stock(self, article: str, qte_besoin: float, date_besoin) -> FeasibilityResult:
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
            stock_dispo = self.availability.available_without_receptions(
                article,
                stock_state=self.stock_state,
            )
        else:
            # Utiliser le stock réel (comportement actuel)
            if not self.availability.has_stock_record(article):
                # Article sans stock = considéré comme en rupture
                result.feasible = False
                result.add_missing(article, qte_besoin)
                result.add_alert(f"Stock non disponible pour l'article {article}")
                return result

            stock_dispo = self.availability.available_at_date(
                article,
                date_besoin,
                use_receptions=self.use_receptions,
            )

        # Vérifier si le stock est suffisant
        if stock_dispo < qte_besoin:
            result.feasible = False
            result.add_missing(article, qte_besoin - stock_dispo)

        return result

    def _check_phantom_component(
        self,
        article_code: str,
        qte_besoin: float,
        date_besoin,
        ctx: CheckContext,
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

        failed_variants: list[tuple[str, float, FeasibilityResult]] = []
        for variant_article, qte_lien in options:
            variant_qty = qte_lien * qte_besoin
            variant_result = self._check_stock(variant_article, variant_qty, date_besoin)
            if variant_result.feasible:
                variant_result.add_alert(
                    f"AFANT {article_code} résolu en variante unique {variant_article}"
                )
                return variant_result
            failed_variants.append((variant_article, variant_qty, variant_result))

        result = FeasibilityResult(feasible=False, depth=ctx.depth)
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
        return is_component_treated_as_purchase(
            article,
            component_is_achete=is_achete,
            component_is_fabrique=is_fabrique,
        )

    def get_article_metadata(self, article_code: str):
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

    # Backward compat for internal callers
    _get_article_metadata = get_article_metadata

    def is_phantom_article(self, article_code: str) -> bool:
        """Retourne True si l'article est un fantôme AFANT."""
        article = self.get_article_metadata(article_code)
        return bool(article and getattr(article, "is_fantome", None) and article.is_fantome())

    # Backward compat for internal callers
    _is_phantom_article = is_phantom_article

    def get_phantom_variants(self, article_code: str) -> list[tuple[str, float]]:
        """Retourne les variantes réelles derrière un article fantôme."""
        nomenclature = self.data_loader.get_nomenclature(article_code)
        if nomenclature is None:
            return []
        return [
            (component.article_composant, component.qte_lien)
            for component in nomenclature.composants
        ]

    # Backward compat for internal callers
    _get_phantom_variants = get_phantom_variants

    def get_phantom_sibling_variant_exclusions(self, nomenclature: Nomenclature) -> set[str]:
        """Retourne les composants à ignorer car déjà couverts par un AFANT."""
        exclusions: set[str] = set()
        component_codes = {component.article_composant for component in nomenclature.composants}
        for component in nomenclature.composants:
            article_code = component.article_composant
            if not self.is_phantom_article(article_code):
                continue
            for variant_article, _ in self.get_phantom_variants(article_code):
                if variant_article != article_code and variant_article in component_codes:
                    exclusions.add(variant_article)
        return exclusions

    # Backward compat for internal callers
    _get_phantom_sibling_variant_exclusions = get_phantom_sibling_variant_exclusions
