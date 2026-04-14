"""Modèles de données pour le contexte d'analyse LLM."""

from dataclasses import dataclass, field
from datetime import date
from typing import List, Dict, Any, Optional


@dataclass
class OFInfo:
    """Informations sur un OF."""
    num_of: str
    article: str
    description: str
    quantite: int
    date_fin: date
    statut: str


@dataclass
class CommandeInfo:
    """Informations sur une commande."""
    num_commande: str
    client: str
    article: str
    quantite_restante: int
    date_expedition: date
    urgence: str  # "TRÈS ÉLEVÉE", "ÉLEVÉE", "NORMALE", "FAIBLE"


@dataclass
class ComposantAnalyse:
    """Analyse d'un composant de la nomenclature."""
    article: str
    niveau: int
    type_article: str  # "Acheté" ou "Fabriqué"
    quantite_requise: int
    stock_physique: int
    stock_alloue_total: int  # Alloué à tous les OFs
    stock_alloue_cet_of: int  # Déjà alloué à cet OF
    stock_bloque: int
    stock_disponible: int
    stock_net_pour_of: int  # dispo + alloué_à_cet_of
    situation: str  # "disponible", "rupture", "bloqué", "tension"
    ratio_couverture: float  # stock_net_pour_of / quantite_requise
    receptions_imminentes: int = 0          # Total des réceptions prévues dans l'horizon
    date_reception_prochaine: Optional[date] = None  # Date de la prochaine réception


@dataclass
class ComposantCritique:
    """Composant critique (bloquant ou préoccupant)."""
    article: str
    niveau: int
    type_probleme: str  # "rupture", "bloqué", "insuffisant"
    gravite: str  # "critique", "moyen", "faible"
    description: str
    action_suggeree: str  # "débloquer", "contrôler", "approvisionner"
    details: Dict[str, Any]


@dataclass
class SituationGlobale:
    """Analyse de la situation globale."""
    faisabilite: str  # "faisable", "non_faisable", "faisable_avec_conditions"
    raison_blocage: Optional[str]
    conditions_deblocage: List[str] = field(default_factory=list)
    delai_estime: Optional[str] = None  # "2-3 jours", "1 semaine"


@dataclass
class CompetingOFsSummary:
    """Résumé des OFs en concurrence pour les mêmes composants."""
    nb_competing: int
    of_plus_urgent: Optional[str] = None
    date_plus_urgent: Optional[date] = None


@dataclass
class LLMAnalysisContext:
    """Contexte d'analyse complet pour le LLM."""

    of_info: OFInfo
    commande_info: Optional[CommandeInfo]
    composants: List[ComposantAnalyse]
    composants_critiques: List[ComposantCritique]
    situation_globale: SituationGlobale
    competing_ofs_summary: Optional[CompetingOFsSummary] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convertit le contexte en dictionnaire pour sérialisation."""
        return {
            "of_info": {
                "num_of": self.of_info.num_of,
                "article": self.of_info.article,
                "description": self.of_info.description,
                "quantite": self.of_info.quantite,
                "date_fin": self.of_info.date_fin.isoformat(),
                "statut": self.of_info.statut
            },
            "commande_info": {
                "num_commande": self.commande_info.num_commande,
                "client": self.commande_info.client,
                "article": self.commande_info.article,
                "quantite_restante": self.commande_info.quantite_restante,
                "date_expedition": self.commande_info.date_expedition.isoformat(),
                "urgence": self.commande_info.urgence
            } if self.commande_info else None,
            "composants": [
                {
                    "article": c.article,
                    "niveau": c.niveau,
                    "type_article": c.type_article,
                    "quantite_requise": c.quantite_requise,
                    "stock_physique": c.stock_physique,
                    "stock_alloue_total": c.stock_alloue_total,
                    "stock_alloue_cet_of": c.stock_alloue_cet_of,
                    "stock_bloque": c.stock_bloque,
                    "stock_disponible": c.stock_disponible,
                    "stock_net_pour_of": c.stock_net_pour_of,
                    "situation": c.situation,
                    "ratio_couverture": c.ratio_couverture,
                    "receptions_imminentes": c.receptions_imminentes,
                    "date_reception_prochaine": c.date_reception_prochaine.isoformat() if c.date_reception_prochaine else None
                }
                for c in self.composants
            ],
            "composants_critiques": [
                {
                    "article": c.article,
                    "niveau": c.niveau,
                    "type_probleme": c.type_probleme,
                    "gravite": c.gravite,
                    "description": c.description,
                    "action_suggeree": c.action_suggeree,
                    "details": c.details
                }
                for c in self.composants_critiques
            ],
            "situation_globale": {
                "faisabilite": self.situation_globale.faisabilite,
                "raison_blocage": self.situation_globale.raison_blocage,
                "conditions_deblocage": self.situation_globale.conditions_deblocage,
                "delai_estime": self.situation_globale.delai_estime
            },
            "competing_ofs_summary": {
                "nb_competing": self.competing_ofs_summary.nb_competing,
                "of_plus_urgent": self.competing_ofs_summary.of_plus_urgent,
                "date_plus_urgent": self.competing_ofs_summary.date_plus_urgent.isoformat() if self.competing_ofs_summary.date_plus_urgent else None
            } if self.competing_ofs_summary else None
        }
