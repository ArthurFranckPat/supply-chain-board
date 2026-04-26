from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol, runtime_checkable


@dataclass(frozen=True, slots=True)
class StockBreakdown:
    """Décomposition du stock virtuellement allouable pour un article.

    - ``available_strict`` : part utilisable hors stock sous CQ.
    - ``available_qc`` : part utilisable provenant du stock sous CQ.
    - ``available_total`` : total allocable (strict + CQ), borné à >= 0.
    """

    available_total: float
    available_strict: float
    available_qc: float


@dataclass(frozen=True, slots=True)
class StockComposantInfo:
    """Détail stock d'un composant (pour affichage modal).

    Inclut l'article, stock physique, sous CQ, alloué, dispo total,
    dispo stricte, et dates de réception fournisseurs ожидаемые.
    """

    article: str
    designation: str = ""
    stock_physique: float = 0.0
    stock_sous_cq: float = 0.0
    stock_alloue: float = 0.0
    disponible_total: float = 0.0
    disponible_strict: float = 0.0
    prochain_arrive: str = ""
    qte_arrive: float = 0.0


@runtime_checkable
class StockProvider(Protocol):
    """Port : fournit le stock disponible pour l'allocation virtuelle.

    Le domaine ne connaît pas l'implémentation (ERP, mock, etc.).
    """

    def get_available_stock(self, article: str) -> float:
        """Stock utilisable pour la planification (physique + sous CQ - alloué)."""
        ...

    def get_stock_breakdown(self, article: str) -> StockBreakdown:
        """Décomposition strict/CQ du stock allocable pour un article."""
        ...

    def get_stock_detail(
        self, article: str, num_commande: str | None = None
    ) -> StockComposantInfo:
        """Détail complet du stock d'un article (physique, CQ, alloué, dispo).

        Si num_commande est fourni, l'allocation est lue depuis Allocations.csv
        pour cet article + commande.
        """
        ...
