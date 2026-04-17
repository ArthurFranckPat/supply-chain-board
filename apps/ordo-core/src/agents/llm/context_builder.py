"""Construction du contexte d'analyse pour le LLM."""

from datetime import date, timedelta
from typing import Dict, List, Optional, Tuple

from ..models import OF, BesoinClient
from ...models.nomenclature import TypeArticle
from ...loaders import DataLoader
from .models import (
    LLMAnalysisContext,
    OFInfo,
    CommandeInfo,
    ComposantAnalyse,
    ComposantCritique,
    SituationGlobale,
    CompetingOFsSummary
)


class LLMContextBuilder:
    """Construit un contexte structuré pour le LLM.

    Workflow d'analyse (ORDRE CRITIQUE):
    1. Récupérer les allocations pour cet OF
       → Lit allocations.csv, filtre NUM_DOC = of.num_of
    2. Pour chaque composant de la nomenclature:
       - Récupérer les allocations de ce composant
       - Filtrer: combien est alloué à CET OF ?
       - Calculer stock_net = stock_disponible + stock_alloué_à_cet_of
       - Identifier si manque après allocations
       - Si manque: regarder stock_bloqué
    3. Classifier les composants critiques
    """

    def __init__(self, loader: DataLoader):
        """Initialise le builder.

        Parameters
        ----------
        loader : DataLoader
            DataLoader avec accès aux stocks, nomenclatures, allocations
        """
        self.loader = loader

    def build_context(
        self,
        of: OF,
        commande: Optional[BesoinClient] = None,
        current_date: date = None,
        competing_ofs: Optional[List[OF]] = None
    ) -> LLMAnalysisContext:
        """Construit le contexte complet d'analyse pour un OF.

        Parameters
        ----------
        of : OF
            OF à analyser
        commande : BesoinClient, optional
            Commande associée (si disponible)
        current_date : date, optional
            Date de référence (défaut: date.today())
        competing_ofs : List[OF], optional
            OFs en concurrence pour les mêmes composants

        Returns
        -------
        LLMAnalysisContext
            Contexte structuré complet
        """
        if current_date is None:
            current_date = date.today()

        # 1. Informations OF
        of_info = OFInfo(
            num_of=of.num_of,
            article=of.article,
            description=of.description,
            quantite=of.qte_restante,
            date_fin=of.date_fin,
            statut=of.statut_texte
        )

        # 2. Informations commande (si disponible)
        commande_info = None
        if commande:
            urgence = self._calculer_urgence(commande.date_expedition_demandee, current_date=current_date)
            commande_info = CommandeInfo(
                num_commande=commande.num_commande,
                client=commande.nom_client,
                article=commande.article,
                quantite_restante=commande.qte_restante,
                date_expedition=commande.date_expedition_demandee,
                urgence=urgence
            )

        # 3. Récupérer les nomenclatures
        nomenclature = self.loader.get_nomenclature(of.article)
        if not nomenclature or not nomenclature.composants:
            # Pas de nomenclature connue
            return LLMAnalysisContext(
                of_info=of_info,
                commande_info=commande_info,
                composants=[],
                composants_critiques=[],
                situation_globale=SituationGlobale(
                    faisabilite="inconnue",
                    raison_blocage="Nomenclature non disponible",
                    conditions_deblocage=[],
                    delai_estime=None
                ),
                competing_ofs_summary=None
            )

        # 4. Récupérer les allocations pour cet OF
        allocations_of = self.loader.get_allocations_of(of.num_of)

        # Créer un dictionnaire des allocations par composant
        allocations_par_composant: Dict[str, int] = {}
        for alloc in allocations_of:
            allocations_par_composant[alloc.article] = allocations_par_composant.get(alloc.article, 0) + alloc.qte_allouee

        # 5. Analyser chaque composant
        composants_analyses: List[ComposantAnalyse] = []
        for comp in nomenclature.composants:
            analyse = self._analyser_composant(comp, of, allocations_par_composant)
            composants_analyses.append(analyse)

        # 6. Identifier les composants critiques
        composants_critiques = self._identifier_composants_critiques(composants_analyses)

        # 7. Analyser la situation globale
        situation_globale = self._analyser_situation_globale(
            composants_analyses,
            composants_critiques,
            of,
            current_date=current_date
        )

        # 8. Résumé des OFs concurrents
        competing_ofs_summary = None
        if competing_ofs:
            autres_ofs = [o for o in competing_ofs if o.num_of != of.num_of]
            if autres_ofs:
                of_le_plus_urgent = min(autres_ofs, key=lambda o: o.date_fin)
                competing_ofs_summary = CompetingOFsSummary(
                    nb_competing=len(autres_ofs),
                    of_plus_urgent=of_le_plus_urgent.num_of,
                    date_plus_urgent=of_le_plus_urgent.date_fin
                )

        return LLMAnalysisContext(
            of_info=of_info,
            commande_info=commande_info,
            composants=composants_analyses,
            composants_critiques=composants_critiques,
            situation_globale=situation_globale,
            competing_ofs_summary=competing_ofs_summary
        )

    def _analyser_composant(
        self,
        comp,
        of: OF,
        allocations_par_composant: Dict[str, int]
    ) -> ComposantAnalyse:
        """Analyse un composant de la nomenclature.

        Parameters
        ----------
        comp : NomenclatureEntry
            Composant à analyser
        of : OF
            OF en cours d'analyse
        allocations_par_composant : Dict[str, int]
            Allocations par article

        Returns
        -------
        ComposantAnalyse
            Analyse du composant
        """
        # Récupérer le stock
        stock_info = self.loader.get_stock(comp.article_composant)
        if stock_info:
            stock_physique = stock_info.stock_physique
            stock_alloue_total = stock_info.stock_alloue
            stock_bloque = stock_info.stock_bloque
            stock_disponible = stock_physique - stock_alloue_total - stock_bloque
        else:
            stock_physique = 0
            stock_alloue_total = 0
            stock_bloque = 0
            stock_disponible = 0

        # Quantité allouée à cet OF précis
        # FORFAIT : quantité fixe par OF ; PROPORTIONNEL : qte_lien × qte_parent
        quantite_requise = comp.qte_requise(of.qte_restante)

        stock_alloue_cet_of = allocations_par_composant.get(comp.article_composant, 0)

        # Stock net pour cet OF
        stock_net_pour_of = stock_disponible + stock_alloue_cet_of

        # Ratio de couverture
        if quantite_requise > 0:
            ratio_couverture = stock_net_pour_of / quantite_requise
        else:
            ratio_couverture = 1.0  # Pas de besoin = 100%

        # Classifier la situation
        situation = self._classifier_situation(
            stock_net_pour_of,
            quantite_requise,
            stock_bloque
        )

        # Récupérer les réceptions imminentes (horizon : date_fin OF + 14 jours)
        from datetime import timedelta
        horizon_reception = of.date_fin + timedelta(days=14)
        receptions = self.loader.get_receptions(comp.article_composant)
        receptions_futures = [r for r in receptions if r.date_reception_prevue <= horizon_reception]
        receptions_imminentes = sum(r.quantite_restante for r in receptions_futures)
        date_reception_prochaine = (
            min(r.date_reception_prevue for r in receptions_futures)
            if receptions_futures else None
        )

        return ComposantAnalyse(
            article=comp.article_composant,
            niveau=comp.niveau,
            type_article=comp.type_article.value,
            quantite_requise=quantite_requise,
            stock_physique=stock_physique,
            stock_alloue_total=stock_alloue_total,
            stock_alloue_cet_of=stock_alloue_cet_of,
            stock_bloque=stock_bloque,
            stock_disponible=stock_disponible,
            stock_net_pour_of=stock_net_pour_of,
            situation=situation,
            ratio_couverture=ratio_couverture,
            receptions_imminentes=receptions_imminentes,
            date_reception_prochaine=date_reception_prochaine
        )

    def _classifier_situation(
        self,
        stock_net: int,
        quantite_requise: int,
        stock_bloque: int
    ) -> str:
        """Classifie la situation d'un composant.

        Parameters
        ----------
        stock_net : int
            Stock net pour l'OF
        quantite_requise : int
            Quantité requise
        stock_bloque : int
            Stock bloqué

        Returns
        -------
        str
            "disponible", "rupture", "bloqué", "tension"
        """
        if stock_net >= quantite_requise:
            return "disponible"
        elif stock_net > 0:
            return "tension"
        elif stock_bloque > 0:
            return "bloqué"
        else:
            return "rupture"

    def _identifier_composants_critiques(
        self,
        composants: List[ComposantAnalyse]
    ) -> List[ComposantCritique]:
        """Identifie les composants critiques (bloquant ou préoccupant).

        Parameters
        ----------
        composants : List[ComposantAnalyse]
            Liste des composants analysés

        Returns
        -------
        List[ComposantCritique]
            Liste des composants critiques
        """
        critiques = []

        for comp in composants:
            # Critère 1: Ratio de couverture < 50%
            if comp.ratio_couverture < 0.5:
                critiques.append(self._creer_composant_critique(comp, "rupture", "critique"))

            # Critère 2: Ratio entre 50% et 80%
            elif comp.ratio_couverture < 0.8:
                critiques.append(self._creer_composant_critique(comp, "insuffisant", "moyen"))

            # Critère 3: Situation bloqué
            elif comp.situation == "bloqué":
                # Vérifier si le stock bloqué peut couvrir le manque
                manque = comp.quantite_requise - comp.stock_net_pour_of
                if comp.stock_bloque >= manque:
                    critiques.append(self._creer_composant_critique(
                        comp,
                        "bloqué",
                        "critique",
                        details={
                            "manque": manque,
                            "stock_bloque": comp.stock_bloque,
                            "potentiel_deblocage": comp.stock_bloque,
                            "action_nature": "accélérer_process"
                        }
                    ))
                else:
                    # Stock bloqué insuffisant
                    critiques.append(self._creer_composant_critique(
                        comp,
                        "bloqué_insuffisant",
                        "critique",
                        details={
                            "manque": manque,
                            "stock_bloque": comp.stock_bloque,
                            "deficit": manque - comp.stock_bloque
                        }
                    ))

        return critiques

    def _creer_composant_critique(
        self,
        comp: ComposantAnalyse,
        type_probleme: str,
        gravite: str,
        details: Optional[Dict[str, any]] = None
    ) -> ComposantCritique:
        """Crée un composant critique à partir de l'analyse.

        Parameters
        ----------
        comp : ComposantAnalyse
            Composant analysé
        type_probleme : str
            Type de problème
        gravite : str
            Gravité du problème
        details : Dict, optional
            Détails supplémentaires

        Returns
        -------
        ComposantCritique
            Composant critique
        """
        # Déterminer l'action suggérée
        if type_probleme == "bloqué":
            action = "débloquer"
        elif type_probleme == "rupture":
            action = "approvisionner"
        else:
            action = "surveiller"

        # Construire la description
        description = self._construire_description(comp, type_probleme)

        return ComposantCritique(
            article=comp.article,
            niveau=comp.niveau,
            type_probleme=type_probleme,
            gravite=gravite,
            description=description,
            action_suggeree=action,
            details=details or {}
        )

    def _construire_description(self, comp: ComposantAnalyse, type_probleme: str) -> str:
        """Construit une description textuelle du problème.

        Parameters
        ----------
        comp : ComposantAnalyse
            Composant analysé
        type_probleme : str
            Type de problème

        Returns
        -------
        str
            Description du problème
        """
        if type_probleme == "bloqué":
            manque = comp.quantite_requise - comp.stock_net_pour_of
            return (
                f"{manque} unités manquantes. "
                f"{comp.stock_net_pour_of} disponibles (déjà alloué), "
                f"{comp.stock_bloque} en contrôle qualité. "
                f"Potentiel de déblocage: {comp.stock_bloque} unités."
            )
        elif type_probleme == "rupture":
            return (
                f"Rupture de stock. "
                f"{comp.stock_disponible} disponibles, "
                f"{comp.stock_alloue_cet_of} alloué à cet OF. "
                f"Manque: {comp.quantite_requise - comp.stock_net_pour_of} unités."
            )
        else:
            return (
                f"Stock insuffisant. "
                f"{comp.stock_net_pour_of} disponibles pour {comp.quantite_requise} requis. "
                f"Ratio: {comp.ratio_couverture:.1%}"
            )

    def _analyser_situation_globale(
        self,
        composants: List[ComposantAnalyse],
        composants_critiques: List[ComposantCritique],
        of: OF,
        current_date: date = None
    ) -> SituationGlobale:
        """Analyse la situation globale de l'OF.

        Parameters
        ----------
        composants : List[ComposantAnalyse]
            Tous les composants analysés
        composants_critiques : List[ComposantCritique]
            Composants critiques
        of : OF
            OF analysé

        Returns
        -------
        SituationGlobale
            Analyse de la situation globale
        """
        # Vérifier si tous les composants sont disponibles
        tous_disponibles = all(c.situation == "disponible" for c in composants)

        if tous_disponibles:
            return SituationGlobale(
                faisabilite="faisable",
                raison_blocage=None,
                conditions_deblocage=[],
                delai_estime=None
            )

        # Vérifier s'il y a des composants bloqués avec potentiel de déblocage
        bloques_avec_potentiel = [
            c for c in composants_critiques
            if c.type_probleme == "bloqué"
            and c.details.get("potentiel_deblocage", 0) > c.details.get("manque", 0)
        ]

        if bloques_avec_potentiel:
            conditions = []
            for c in bloques_avec_potentiel:
                manque = c.details.get("manque", 0)
                conditions.append(
                    f"Contrôle qualité de {c.details['stock_bloque']} {c.article} "
                    f"(manque {manque} unités)"
                )

            # Estimer le délai (2-3 jours pour contrôle qualité)
            return SituationGlobale(
                faisabilite="faisable_avec_conditions",
                raison_blocage="Composants en contrôle qualité",
                conditions_deblocage=conditions,
                delai_estime="2-3 jours"
            )

        if current_date is None:
            current_date = date.today()

        # Vérifier si les réceptions imminentes couvrent les manques (hors cas bloqué déjà géré)
        ruptures_couvertes_par_reception = [
            c for c in composants
            if c.situation in ("rupture", "tension")
            and c.receptions_imminentes >= (c.quantite_requise - c.stock_net_pour_of)
            and c.date_reception_prochaine is not None
        ]
        composants_en_manque = [
            c for c in composants if c.situation in ("rupture", "tension")
        ]
        if ruptures_couvertes_par_reception and len(ruptures_couvertes_par_reception) == len(composants_en_manque):
            dates = [c.date_reception_prochaine for c in ruptures_couvertes_par_reception]
            date_max = max(dates)
            delai = f"{(date_max - current_date).days} jours"
            conditions = [
                f"Réception de {c.receptions_imminentes} {c.article} prévue le {c.date_reception_prochaine}"
                for c in ruptures_couvertes_par_reception
            ]
            return SituationGlobale(
                faisabilite="faisable_apres_reception",
                raison_blocage="Composants en attente de réception fournisseur",
                conditions_deblocage=conditions,
                delai_estime=delai
            )

        # Vérifier s'il y a des composants en rupture vraie (sans bloqué)
        ruptures_sans_blocage = [
            c for c in composants_critiques
            if c.type_probleme in ["rupture", "insuffisant"]
            and c.article not in ["bloqué", "bloqué_insuffisant"]
        ]

        if ruptures_sans_blocage:
            return SituationGlobale(
                faisabilite="non_faisable",
                raison_blocage="Rupture de stock sans perspective de déblocage",
                conditions_deblocage=[],
                delai_estime=None
            )

        # Cas par défaut : non faisable avec conditions diverses
        conditions = [c.description for c in composants_critiques[:3]]
        return SituationGlobale(
            faisabilite="non_faisable",
            raison_blocage="Composants manquants",
            conditions_deblocage=conditions,
            delai_estime=None
        )

    def _calculer_urgence(self, date_expedition: date, current_date: date = None) -> str:
        """Calcule le niveau d'urgence d'une commande.

        Parameters
        ----------
        date_expedition : date
            Date d'expédition demandée
        current_date : date, optional
            Date de référence (défaut: date.today())

        Returns
        -------
        str
            Niveau d'urgence
        """
        if current_date is None:
            current_date = date.today()
        delta = (date_expedition - current_date).days

        if delta <= 2:
            return "TRÈS ÉLEVÉE"
        elif delta <= 5:
            return "ÉLEVÉE"
        elif delta <= 10:
            return "NORMALE"
        else:
            return "FAIBLE"
