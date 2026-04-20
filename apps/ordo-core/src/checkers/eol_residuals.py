"""EOL Residual Stock Analysis Service.

Calcule les composants résiduels liés à des familles en fin de vie.
"""

from __future__ import annotations

from typing import Optional

from .eol_residuals_models import (
    EolComponent,
    EolResidualsRequest,
    EolResidualsResult,
    EolSummary,
)
from ..models.nomenclature import TypeArticle


class EolResidualsService:
    """EOL Residual Stock Analysis service.

    Parameters
    ----------
    loader : DataLoader
        Loaded ERP data.
    """

    def __init__(self, loader):
        self.loader = loader

    def analyze(
        self,
        familles: list[str],
        prefixes: list[str],
        bom_depth_mode: str = "full",
        stock_mode: str = "physical",
        component_types: str = "achat_fabrication",
        projection_date=None,
    ) -> EolResidualsResult:
        """Analyze residual stock for EOL families.

        Parameters
        ----------
        familles : list[str]
            Liste de familles produit (FAMILLE_PRODUIT).
        prefixes : list[str]
            Liste de préfixes (union avec familles).
        bom_depth_mode : str
            "level1" (direct components only) or "full" (recursive).
        stock_mode : str
            "physical" (stock_physique), "net_releaseable", or "projected".
        component_types : str
            Currently only "achat_fabrication" is supported.
        projection_date : date, optional
            Required when stock_mode="projected". Date for stock projection.

        Returns
        -------
        EolResidualsResult
        """
        if not familles and not prefixes:
            raise ValueError("familles et prefixes ne peuvent pas être tous les deux vides")

        if stock_mode == "projected" and projection_date is None:
            raise ValueError("projection_date is required when stock_mode='projected'")

        warnings: list[str] = []

        # ── Step 1: Identify target PF articles ────────────────────────
        target_pfs = self._find_target_pfs(familles, prefixes)
        if not target_pfs:
            warnings.append("Aucune famille ou préfixe ne correspond à un article PF")
            return EolResidualsResult(
                summary=EolSummary(0, 0, 0.0, 0.0),
                components=[],
                warnings=warnings,
            )

        # ── Step 2: Collect all PF articles outside the target perimeter ─
        outside_pfs = self._find_outside_pfs(familles, prefixes)

        # ── Step 3: Extract components from target PFs ────────────────
        raw_components = self._extract_components(target_pfs, bom_depth_mode)

        # ── Step 4: Filter for uniqueness (not used by outside PFs) ───
        unique_components = self._filter_unique_components(
            raw_components, target_pfs, outside_pfs
        )

        # ── Step 5: Compute projected consumption if needed ────────────
        projected_consumption: dict[str, float] = {}
        if stock_mode == "projected":
            projected_consumption = self._compute_projected_consumption(
                unique_components, projection_date
            )

        # ── Step 6: Build component details with stock & valorization ──
        components: list[EolComponent] = []
        total_stock_qty = 0.0
        total_value = 0.0

        for comp_code, comp_info in unique_components.items():
            stock = self.loader.get_stock(comp_code)
            pmp = getattr(comp_info["article"], "pmp", None) or 0.0

            if stock_mode == "physical":
                stock_qty = stock.stock_physique if stock else 0
            elif stock_mode == "net_releaseable":
                stock_qty = (stock.stock_physique + stock.stock_bloque - stock.stock_alloue) if stock else 0
            else:  # projected
                stock_qty = stock.stock_physique if stock else 0
                # Add future receptions
                for reception in self.loader.get_receptions(comp_code):
                    if reception.date_reception_prevue <= projection_date:
                        stock_qty += reception.quantite_restante
                # Subtract projected consumption
                stock_qty -= projected_consumption.get(comp_code, 0.0)

            value = round(stock_qty * pmp, 2)

            if pmp == 0.0:
                warnings.append(f"PMP manquant pour l'article {comp_code}")

            comp_type = "ACHAT" if comp_info["is_achat"] else "FABRICATION"
            components.append(EolComponent(
                article=comp_code,
                description=comp_info["article"].description or comp_code,
                component_type=comp_type,
                used_by_target_pf_count=comp_info["pf_count"],
                stock_qty=float(stock_qty),
                pmp=pmp,
                value=value,
            ))
            total_stock_qty += stock_qty
            total_value += value

        components.sort(key=lambda c: c.article)

        return EolResidualsResult(
            summary=EolSummary(
                target_pf_count=len(target_pfs),
                unique_component_count=len(components),
                total_stock_qty=round(total_stock_qty, 2),
                total_value=round(total_value, 2),
            ),
            components=components,
            warnings=warnings,
        )

    # ── Private helpers ──────────────────────────────────────────────

    def _find_target_pfs(
        self, familles: list[str], prefixes: list[str]
    ) -> list:
        """Find FAB articles matching familles/prefixes (potential finished products)."""
        target_pfs = []
        for article in self.loader.articles.values():
            if not article.is_fabrication():
                continue
            famille = getattr(article, "famille_produit", None) or ""
            code = article.code or ""

            matches_famille = famille in familles
            matches_prefix = any(code.startswith(p) for p in prefixes)

            if matches_famille or matches_prefix:
                target_pfs.append(article)
        return target_pfs

    def _find_outside_pfs(
        self, familles: list[str], prefixes: list[str]
    ) -> set:
        """Find FAB articles with a famille_produit that is NOT in target perimeter.

        Only includes articles that have a real family assignment (i.e. finished products),
        not intermediate FAB components that happen to be FAB but have no famille_produit.
        """
        outside = set()
        for article in self.loader.articles.values():
            if not article.is_fabrication():
                continue
            famille = getattr(article, "famille_produit", None) or ""
            # Skip articles without a famille_produit (intermediate FAB components)
            if not famille:
                continue
            code = article.code or ""

            matches_famille = famille in familles
            matches_prefix = any(code.startswith(p) for p in prefixes)

            if not matches_famille and not matches_prefix:
                outside.add(article.code)
        return outside

    def _extract_components(
        self, target_pfs: list, bom_depth_mode: str
    ) -> dict:
        """Extract components from target PFs.

        Returns dict[article_code, {article, is_achat, pf_count, parent_chain: set}]
        parent_chain contains article codes of parent components (FAB) and PF codes
        that led to this component being discovered.
        """
        components: dict = {}

        def _recurse(article_code: str, parent_chain: set, depth: int = 0):
            nom = self.loader.get_nomenclature(article_code)
            if nom is None:
                return

            for entry in nom.composants:
                comp_code = entry.article_composant
                is_achat = entry.is_achete()

                new_chain = parent_chain | {comp_code}
                if comp_code in components:
                    components[comp_code]["pf_count"] += 1
                    components[comp_code]["parent_chain"] |= parent_chain
                else:
                    comp_article = self.loader.get_article(comp_code)
                    if comp_article is None:
                        continue
                    components[comp_code] = {
                        "article": comp_article,
                        "is_achat": is_achat,
                        "pf_count": 1,
                        "parent_chain": parent_chain.copy(),
                    }

                # Recurse into FABRICATED components if full depth mode
                if bom_depth_mode == "full" and not is_achat:
                    _recurse(comp_code, new_chain, depth + 1)

        for pf in target_pfs:
            _recurse(pf.code, {pf.code})

        return components

    def _filter_unique_components(
        self,
        raw_components: dict,
        target_pfs: list,
        outside_pfs: set,
    ) -> dict:
        """Keep only components not used by any PF outside target perimeter.

        A component is unique if used by at least one target PF and by no outside PFs.
        Intermediate FAB components in the parent_chain are NOT considered PFs
        for the exclusion check — only direct usage by outside PFs matters.
        """
        filtered = {}
        for comp_code, info in raw_components.items():
            # Exclude if any outside PF directly uses this component
            if self._is_component_used_by_outside(comp_code, outside_pfs):
                continue
            filtered[comp_code] = info

        return filtered

    def _is_component_used_by_outside(self, comp_code: str, outside_pfs: set) -> bool:
        """Check if an outside PF uses this component directly."""
        for outside_pf_code in outside_pfs:
            nom = self.loader.get_nomenclature(outside_pf_code)
            if nom is None:
                continue
            for entry in nom.composants:
                if entry.article_composant == comp_code:
                    return True
        return False

    def _compute_projected_consumption(
        self,
        unique_components: dict,
        projection_date,
    ) -> dict[str, float]:
        """Compute projected consumption per component for OFs finishing before projection_date.

        Returns dict[component_code, qty_consumed].
        Considers ALL OFs (not just EOL target) since non-EOL products
        also consume the shared component pool.
        """
        consumption: dict[str, float] = {}

        for of in self.loader.ofs:
            if of.qte_restante <= 0:
                continue
            if of.date_fin > projection_date:
                continue

            # Compute how much of each component this OF consumes
            self._add_of_consumption(of.article, of.qte_restante, consumption, visited=set())

        return consumption

    def _add_of_consumption(
        self,
        article: str,
        qty: int,
        consumption: dict[str, float],
        visited: set,
    ) -> None:
        """Add component consumption for producing `qty` of `article`.

        Recurses through nomenclature FAB components to find all ACHAT leaf components
        and accumulates their consumed quantities.
        """
        if article in visited:
            return
        visited.add(article)

        nom = self.loader.get_nomenclature(article)
        if nom is None:
            return

        for entry in nom.composants:
            comp_code = entry.article_composant
            comp_qty = entry.qte_requise(qty)

            if entry.is_achete():
                # ACHAT component: this is a leaf — consume it directly
                consumption[comp_code] = consumption.get(comp_code, 0.0) + comp_qty
            else:
                # FAB component: recurse to find its ACHAT children
                self._add_of_consumption(comp_code, comp_qty, consumption, visited)
