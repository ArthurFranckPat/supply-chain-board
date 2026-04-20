"""Modeles de resultats pour l'analyse de rupture composant."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class PoolContrib:
    """Contribution d'un article au pool de stock composant."""

    article: str
    description: str
    categorie: str  # "COMPOSANT" | "SF" | "PF" | "AUTRE"
    stock_utilise: int  # stock_physique de l'article
    ratio_cumule: float  # produit des qte_lien depuis le composant
    contribution: float  # stock_utilise * ratio_cumule
    parent_article: str | None = None  # article parent dans l'arborescence BOM


@dataclass
class ComponentInfo:
    """Informations sur le composant en rupture."""

    code: str
    description: str
    stock_physique: int
    stock_alloue: int
    stock_disponible: int
    stock_disponible_projete: int  # stock + receptions fournisseurs
    deficit: int
    deficit_projete: int  # deficit avec receptions
    pool_total: float  # pool multi-niveaux (composant + SF + PF)
    pool_repartition: list[PoolContrib]  # detail par article source


@dataclass
class BlockedOF:
    """OF bloque par la rupture du composant."""

    num_of: str
    article: str
    qte_a_fabriquer: int
    qte_restante: int
    date_fin: str  # ISO format
    statut: str  # "Ferme" | "Planifie" | "Suggere"
    postes_charge: list[str]
    composants_alloues: bool = False  # True si les composants sont deja alloues a cet OF


@dataclass
class CommandeBloquee:
    """Commande client bloquee par la rupture de composant."""

    num_commande: str
    client: str
    article: str
    qte_restante: int
    date_expedition: str  # ISO format
    nature: str  # "COMMANDE" | "PREVISION"
    type_commande: str  # "MTS" | "NOR" | "MTO"
    chemin_impact: list[str]  # [composant, ..., article_commande]
    ofs_bloquants: list[BlockedOF]
    qte_impact_composant: float  # composant consomme par cette commande
    proj_pool: float  # stock projete restant APRES cette commande
    etat: str  # "RUPTURE" ou "OK"
    matching_method: str = ""  # "origin_order" | "contremarque" | "stock" | "of_search"
    branch_key: str | None = None  # SF article when merge_branches=False
    branch_pool_total: float | None = None  # pool total de la branche (split mode)


@dataclass
class AnalyseRuptureSummary:
    """Resume global de l'analyse de rupture."""

    total_blocked_ofs: int
    total_affected_orders: int
    affected_lines: list[str]
    max_bom_depth: int
    total_nodes_visited: int
    truncated: bool


@dataclass
class AnalyseRuptureResult:
    """Resultat complet de l'analyse de rupture composant."""

    component: ComponentInfo
    commandes_bloquees: list[CommandeBloquee]
    ofs_sans_commande: list[BlockedOF]  # OFs sans rattachement commande direct
    summary: AnalyseRuptureSummary
    include_previsions: bool = False
    include_receptions: bool = False
    use_pool: bool = True
    merge_branches: bool = True
    include_sf: bool = True
    include_pf: bool = False
