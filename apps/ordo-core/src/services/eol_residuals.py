"""Service métier EOL Residual Stock Analysis."""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from typing import TYPE_CHECKING, Optional

from ..services.eol_residuals_models import (
    EolResidualsComponent,
    EolResidualsResponse,
    EolResidualsSummary,
)

if TYPE_CHECKING:
    from erp_data_access import DataLoader


@dataclass
class _ComponentInfo:
    code: str
    description: str
    component_type: str  # "ACHAT" | "FABRICATION"
    used_by_target_pfs: set[str]
    used_by_all_pfs: set[str]


class EolResidualsService:
    """Calcule les composants résiduels liés à des famillesPF en fin de vie."""

    def __init__(self, loader: "DataLoader") -> None:
        self._loader = loader

    def analyze(
        self,
        familles: list[str],
        prefixes: list[str],
        bom_depth_mode: str = "full",
        stock_mode: str = "physical",
    ) -> EolResidualsResponse:
        warnings: list[str] = []

        # 1. Identify target PFs (articles fabrication with famille/prefixe filter)
        target_pfs = self._select_target_pfs(familles, prefixes, warnings)

        if not target_pfs:
            warnings.append("Aucun produit fini cible trouvé.")
            return EolResidualsResponse(
                summary=EolResidualsSummary(
                    target_pf_count=0,
                    unique_component_count=0,
                    total_stock_qty=0.0,
                    total_value=0.0,
                ),
                components=[],
                warnings=warnings,
            )

        # 2. Extract all components used by target PFs
        components_info: dict[str, _ComponentInfo] = {}
        self._extract_components(target_pfs, components_info, bom_depth_mode)

        # 3. Extract all PF→component relationships (for uniqueness check)
        all_pfs = [a for a in self._loader.articles.values() if a.is_fabrication()]
        self._build_all_pf_relationships(all_pfs, components_info, bom_depth_mode)

        # 4. Filter to unique components
        unique_components = {
            code: info
            for code, info in components_info.items()
            if self._is_unique_to_perimeter(info)
        }

        # 5. Build component details with stock and valorization
        pmp_warnings: set[str] = set()
        components: list[EolResidualsComponent] = []
        total_qty = 0.0
        total_value = 0.0

        for code, info in unique_components.items():
            stock = self._loader.get_stock(code)
            stock_qty = self._compute_stock_qty(stock, stock_mode)
            pmp = self._loader.get_article(code).pmp if self._loader.get_article(code) else None
            if pmp is None:
                pmp = 0.0
                pmp_warnings.add(f"PMP manquant pour le composant {code}")

            value = stock_qty * pmp
            total_qty += stock_qty
            total_value += value

            components.append(EolResidualsComponent(
                component_code=code,
                description=info.description,
                component_type=info.component_type,
                used_by_target_pf_count=len(info.used_by_target_pfs),
                stock_qty=stock_qty,
                pmp=pmp,
                value=value,
            ))

        # Sort by value descending
        components.sort(key=lambda c: c.value, reverse=True)

        warnings.extend(sorted(pmp_warnings))

        return EolResidualsResponse(
            summary=EolResidualsSummary(
                target_pf_count=len(target_pfs),
                unique_component_count=len(components),
                total_stock_qty=total_qty,
                total_value=total_value,
            ),
            components=components,
            warnings=warnings,
        )

    def _select_target_pfs(
        self,
        familles: list[str],
        prefixes: list[str],
        warnings: list[str],
    ) -> set[str]:
        """Select fabrication articles matching familles or prefixes."""
        target_pfs: set[str] = set()
        familles_lower = [f.lower() for f in familles]
        prefixes_upper = [p.upper() for p in prefixes]

        for article in self._loader.articles.values():
            if not article.is_fabrication():
                continue

            # Filter by famille
            if familles and article.famille_produit:
                if article.famille_produit.lower() in familles_lower:
                    target_pfs.add(article.code)
                    continue

            # Filter by prefix
            if prefixes and any(article.code.upper().startswith(p) for p in prefixes_upper):
                target_pfs.add(article.code)

        # Report unmatched selectors
        if familles:
            matched_familles = {
                a.famille_produit.lower()
                for a in self._loader.articles.values()
                if a.famille_produit and a.famille_produit.lower() in familles_lower
            }
            for f in familles:
                if f.lower() not in matched_familles:
                    warnings.append(f"Aucune correspondance pour la famille: {f}")

        if prefixes:
            all_codes = {a.code.upper() for a in self._loader.articles.values()}
            for p in prefixes:
                if not any(c.startswith(p.upper()) for c in all_codes):
                    warnings.append(f"Aucun article ne commence par le préfixe: {p}")

        return target_pfs

    def _extract_components(
        self,
        target_pfs: set[str],
        components_info: dict[str, _ComponentInfo],
        bom_depth_mode: str,
    ) -> None:
        """Recursively extract components from target PFs."""
        visited: set[str] = set()

        for pf_code in target_pfs:
            self._explode_bom(pf_code, target_pfs, components_info, visited, bom_depth_mode)

    def _explode_bom(
        self,
        article_code: str,
        target_pfs: set[str],
        components_info: dict[str, _ComponentInfo],
        visited: set[str],
        bom_depth_mode: str,
    ) -> None:
        """Recursively explode BOM for an article, tracking visited to prevent cycles."""
        if article_code in visited:
            return
        visited.add(article_code)

        nom = self._loader.get_nomenclature(article_code)
        if nom is None:
            return

        for entry in nom.composants:
            comp_code = entry.article_composant

            if comp_code not in components_info:
                article = self._loader.get_article(comp_code)
                components_info[comp_code] = _ComponentInfo(
                    code=comp_code,
                    description=entry.designation_composant,
                    component_type="ACHAT" if entry.is_achete() else "FABRICATION",
                    used_by_target_pfs=set(),
                    used_by_all_pfs=set(),
                )

            components_info[comp_code].used_by_target_pfs.add(article_code)

            # Expand ACHAT as leaf (no BOM), FABRICATION recursively if full mode
            if bom_depth_mode == "full" and entry.is_fabrique():
                self._explode_bom(comp_code, target_pfs, components_info, visited, bom_depth_mode)

    def _build_all_pf_relationships(
        self,
        all_pfs: list,
        components_info: dict[str, _ComponentInfo],
        bom_depth_mode: str,
    ) -> None:
        """Build PF→component relationships for ALL fabrication articles (for uniqueness check)."""
        visited: set[str] = set()

        for pf in all_pfs:
            self._explode_bom_all(pf.code, components_info, visited, bom_depth_mode)

    def _explode_bom_all(
        self,
        article_code: str,
        components_info: dict[str, _ComponentInfo],
        visited: set[str],
        bom_depth_mode: str,
    ) -> None:
        """Recursively explode BOM for all PF article (no target filter)."""
        if article_code in visited:
            return
        visited.add(article_code)

        nom = self._loader.get_nomenclature(article_code)
        if nom is None:
            return

        for entry in nom.composants:
            comp_code = entry.article_composant

            if comp_code in components_info:
                components_info[comp_code].used_by_all_pfs.add(article_code)

            if bom_depth_mode == "full" and entry.is_fabrique():
                self._explode_bom_all(comp_code, components_info, visited, bom_depth_mode)

    def _is_unique_to_perimeter(self, info: _ComponentInfo) -> bool:
        """Component is unique to perimeter if used only by target PFs, not by any PF outside."""
        if not info.used_by_target_pfs:
            return False
        return info.used_by_all_pfs.issubset(info.used_by_target_pfs)

    def _compute_stock_qty(self, stock, stock_mode: str) -> float:
        """Compute stock quantity based on mode."""
        if stock is None:
            return 0.0
        if stock_mode == "net_releaseable":
            return float(
                max(0, stock.stock_physique + stock.stock_bloque - stock.stock_alloue)
            )
        return float(stock.stock_physique)
