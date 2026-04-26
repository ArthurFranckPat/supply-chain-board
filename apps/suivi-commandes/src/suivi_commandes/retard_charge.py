"""Calcul des heures de retard de production par poste de charge."""

from __future__ import annotations

from collections import defaultdict
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    import pandas as pd
    from erp_data_access.loaders import DataLoader


def _is_component_in_subassembly(loader: "DataLoader", component: str, root_article: str) -> bool:
    """Vérifie si un composant fait partie d'un sous-ensemble fabriqué de l'article root.

    Retourne True si le composant est dans un sous-ensemble (niveau > 1) de la BOM,
    c'est-à-dire qu'il n'est pas un composant direct de root.
    """
    nom = loader.get_nomenclature(root_article)
    if nom is None:
        return False

    # Composants directs de root
    direct_components = {c.article_composant for c in nom.composants}
    if component in direct_components:
        return False  # C'est un composant direct, pas un sous-ensemble

    # Vérifie si le composant est dans un sous-ensemble fabriqué
    for comp in nom.composants:
        if comp.is_fabrique():
            sub_nom = loader.get_nomenclature(comp.article_composant)
            if sub_nom:
                sub_components = {c.article_composant for c in sub_nom.composants}
                if component in sub_components:
                    return True
            # Recursive check deeper
            if _component_in_bom(loader, component, comp.article_composant):
                return True
    return False


def _component_in_bom(loader: "DataLoader", component: str, article: str, seen: set[str] | None = None) -> bool:
    """Check if component appears anywhere in article's BOM tree."""
    seen = seen or set()
    if article in seen:
        return False
    seen.add(article)

    nom = loader.get_nomenclature(article)
    if nom is None:
        return False

    for comp in nom.composants:
        if comp.article_composant == component:
            return True
        if comp.is_fabrique() and _component_in_bom(loader, component, comp.article_composant, seen):
            return True
    return False


def compute_retard_charge_by_poste(
    df: "pd.DataFrame",
    loader: "DataLoader",
) -> dict[str, dict[str, str | float]]:
    """Calcule les heures cumulées de retard par poste de charge.

    Pour chaque ligne en 'Retard Prod' :
    - Si cause = rupture composants dans un sous-ensemble → charge récursive (Option A)
    - Sinon → charge directe (gamme de l'article final uniquement)

    Returns
    -------
    dict[str, dict]
        {poste_charge: {"heures": float, "libelle": str}} trié par poste.
    """
    from production_planning.planning.charge_calculator import (
        calculate_article_charge,
        is_valid_poste,
        get_poste_libelle,
    )

    if df.empty or "Statut" not in df.columns:
        return {}

    retard_rows = df[df["Statut"] == "Retard Prod"]
    charge_by_poste: dict[str, float] = defaultdict(float)
    libelle_by_poste: dict[str, str] = {}

    for _, row in retard_rows.iterrows():
        article = str(row.get("Article", ""))
        qte = float(row.get("Quantité restante", 0))
        cause = str(row.get("Cause retard", ""))
        if not article or qte <= 0:
            continue

        # Déterminer si on prend la charge récursive
        is_recursive = False
        if cause.startswith("Rupture composants:"):
            # Extraire le composant bloquant
            try:
                comp_part = cause.split(":", 1)[1].strip().split(",")[0].strip()
                comp_article = comp_part.split("x")[0].strip()
                is_recursive = _is_component_in_subassembly(loader, comp_article, article)
            except Exception:
                pass

        try:
            if is_recursive:
                # Option A : charge complète (article + sous-ensembles)
                charge_map = calculate_article_charge(article, qte, loader)
            else:
                # Charge directe uniquement (gamme de l'article final)
                gamme = loader.get_gamme(article)
                charge_map = {}
                if gamme:
                    for op in gamme.operations:
                        if is_valid_poste(op.poste_charge) and op.cadence > 0:
                            charge_map[op.poste_charge] = qte / op.cadence
        except Exception:
            continue

        for poste, hours in charge_map.items():
            if is_valid_poste(poste) and hours > 0:
                charge_by_poste[poste] += hours
                if poste not in libelle_by_poste:
                    libelle_by_poste[poste] = get_poste_libelle(poste, loader)

    # Trier par poste
    return {
        poste: {"heures": hours, "libelle": libelle_by_poste.get(poste, "")}
        for poste, hours in sorted(charge_by_poste.items())
    }
