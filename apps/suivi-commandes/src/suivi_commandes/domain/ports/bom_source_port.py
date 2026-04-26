"""Port : accès brut aux données de nomenclature.

Sépare l'accès aux données (ce port) de l'algorithme de calcul
de rupture (BomService dans le domaine).

L'implémentation ne contient AUCUNE logique métier — elle traduit
uniquement les structures ERP en objets neutres.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol, runtime_checkable


@dataclass(frozen=True, slots=True)
class BomComponent:
    """Un composant dans une nomenclature — données brutes."""
    article: str
    qte_par_parent: float
    est_fabrique: bool  # True = sous-ensemble avec sa propre gamme/BOM
    est_achete: bool    # True = article acheté (pas de fabrication)


@dataclass(frozen=True, slots=True)
class BomTree:
    """Nomenclature complète d'un article."""
    article: str
    composants: list[BomComponent] = field(default_factory=list)


@runtime_checkable
class BomDataSource(Protocol):
    """Port : accès brut à la BOM et au stock d'un article.

    Aucune logique de calcul — juste de la lecture.
    """

    def get_bom(self, article: str) -> BomTree | None:
        """Retourne la nomenclature de l'article, ou None si article de base."""
        ...

    def get_available_stock(self, article: str) -> float:
        """Stock disponible pour l'article."""
        ...
