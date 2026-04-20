"""Residual Fabrication Feasibility Service.

Evaluate which finished products (PF, fabrication) can be built using ONLY
the components available in the residual stock pool — no new procurements,
no new OFs, no receptions.
"""

from __future__ import annotations

from typing import Optional

from .residual_fabrication_models import (
    ResidualComponentGap,
    ResidualFabricationResult,
)
from .eol_residuals_models import EolComponent
from ..models.nomenclature import NomenclatureEntry, TypeArticle


class ResidualFabricationService:
    """Check PF fabrication feasibility from a fixed residual component pool.

    Parameters
    ----------
    loader : DataLoader
        Loaded ERP data (articles, nomenclatures).
    residual_pool : list[EolComponent]
        Components available from EOL residual analysis. Stock quantities
        in this pool are the ONLY supply considered.
    """

    def __init__(self, loader, residual_pool: list[EolComponent]):
        self.loader = loader
        self._pool: dict[str, float] = {c.article: c.stock_qty for c in residual_pool}

    def check_all(
        self,
        pf_codes: Optional[list[str]] = None,
        famille: Optional[str] = None,
        desired_qty: int = 1,
    ) -> list[ResidualFabricationResult]:
        """Batch-check PF fabrication feasibility against the residual pool.

        Each PF is evaluated independently against the full pool (no depletion).

        Parameters
        ----------
        pf_codes : list[str], optional
            Explicit list of PF article codes to check. Takes precedence over
            ``famille``. Use this for precise control.
        famille : str, optional
            FAMILLE_PRODUIT to filter candidate PFs. Only used when pf_codes is
            not provided.
        desired_qty : int
            Desired production quantity for each candidate PF.

        Returns
        -------
        list[ResidualFabricationResult]
        """
        candidates: list[str] = []
        if pf_codes is not None:
            candidates = pf_codes
        elif famille:
            for article in self.loader.articles.values():
                if not article.is_fabrication():
                    continue
                if getattr(article, "famille_produit", None) == famille:
                    candidates.append(article.code)
        else:
            # Fall back: all FAB articles
            for article in self.loader.articles.values():
                if article.is_fabrication():
                    candidates.append(article.code)

        return [self._check_pf(code, desired_qty) for code in candidates]

    def _check_pf(self, pf_code: str, desired_qty: int) -> ResidualFabricationResult:
        """Evaluate one PF article against the residual pool."""
        article = self.loader.get_article(pf_code)
        description = article.description or pf_code

        nom = self.loader.get_nomenclature(pf_code)
        if nom is None:
            return ResidualFabricationResult(
                pf_article=pf_code,
                description=description,
                desired_qty=desired_qty,
                feasible=False,
                max_feasible_qty=0,
                stock_gaps=[],
                alerts=[f"Nomenclature indisponible pour {pf_code}"],
            )

        # Collect all ACHAT leaf requirements: (article_code, qty_per_unit, path)
        requirements: list[tuple[str, float, list[str]]] = []
        missing_fabs: list[tuple[str, list[str]]] = []

        def collect(article_code: str, qty_per_unit: float, path: list[str]) -> None:
            """Walk BOM, collecting ACHAT leaves. FAB items in pool are treated as constrained stock."""
            bom = self.loader.get_nomenclature(article_code)
            if bom is None:
                return
            for entry in bom.composants:
                comp_code = entry.article_composant
                comp_qty = entry.qte_lien * qty_per_unit
                new_path = path + [comp_code]
                if entry.is_achete():
                    requirements.append((comp_code, float(comp_qty), new_path))
                elif comp_code in self._pool:
                    requirements.append((comp_code, float(comp_qty), new_path))
                else:
                    pool_backup = self._pool.pop(comp_code, None)
                    before = len(requirements)
                    collect(comp_code, float(comp_qty), new_path)
                    if pool_backup is not None:
                        self._pool[comp_code] = pool_backup
                    if len(requirements) == before:
                        missing_fabs.append((comp_code, new_path))

        collect(pf_code, 1.0, [pf_code])

        # Deduplicate by article — keep max qty_per_unit and longest path
        # Also track if component is a missing FAB (absent from pool, not in BOM chain)
        req_map: dict[str, tuple[float, list[str], bool]] = {}  # (qty_per_unit, path, is_missing_fab)
        for comp_code, qty_per_unit, path in requirements:
            if comp_code in req_map:
                existing_qty, existing_path, existing_missing = req_map[comp_code]
                req_map[comp_code] = (
                    max(existing_qty, qty_per_unit),
                    path if len(path) > len(existing_path) else existing_path,
                    existing_missing,
                )
            else:
                req_map[comp_code] = (qty_per_unit, path, False)
        # Add missing FABs with float(desired_qty) so gap is non-zero and visible
        for comp_code, path in missing_fabs:
            if comp_code not in req_map:
                req_map[comp_code] = (float(desired_qty), path, True)
            else:
                existing_qty, existing_path, existing_missing = req_map[comp_code]
                req_map[comp_code] = (float(desired_qty), path, True)

        gaps: list[ResidualComponentGap] = []
        min_feasible: Optional[int] = None

        for comp_code, (qty_per_unit, path, _) in req_map.items():
            pool_qty = self._pool.get(comp_code, 0.0)
            qty_needed = qty_per_unit * desired_qty
            shortage = max(0.0, qty_needed - pool_qty)

            comp_article = self.loader.get_article(comp_code)
            comp_desc = comp_article.description or comp_code if comp_article else comp_code

            if pool_qty == 0.0 and (qty_needed > 0 or qty_per_unit == 0.0):
                gaps.append(ResidualComponentGap(
                    article=comp_code,
                    description=comp_desc,
                    qty_needed=round(qty_needed, 3),
                    qty_available=0.0,
                    shortage_qty=round(qty_needed, 3),
                    is_purchase=True,
                    path=path,
                ))
            else:
                if qty_per_unit > 0:
                    feasible_for_comp = int(pool_qty / qty_per_unit)
                    if min_feasible is None or feasible_for_comp < min_feasible:
                        min_feasible = feasible_for_comp
                if shortage > 0:
                    gaps.append(ResidualComponentGap(
                        article=comp_code,
                        description=comp_desc,
                        qty_needed=round(qty_needed, 3),
                        qty_available=pool_qty,
                        shortage_qty=round(shortage, 3),
                        is_purchase=True,
                        path=path,
                    ))

        max_feasible = min_feasible if min_feasible is not None else 0

        return ResidualFabricationResult(
            pf_article=pf_code,
            description=description,
            desired_qty=desired_qty,
            feasible=(max_feasible >= desired_qty),
            max_feasible_qty=max_feasible,
            stock_gaps=gaps,
            alerts=[],
        )
