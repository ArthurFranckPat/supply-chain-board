"""Impacts du planning sur les commandes clients (planning board).

Relie les OF du board aux commandes clients via l'algorithme de matching
du projet (CommandeOFMatcher : contremarque MTS, ordre d'origine, stock
virtuel puis recherche d'OF avec partage), puis croise avec :

- les dates effectives des OF (overrides locaux appliqués) → retard,
- la faisabilité composants (allocation virtuelle séquentielle) → blocage.

Statuts commande, par priorité décroissante :
  sans_couverture > bloquee > retard > stock > on_time
"""

from __future__ import annotations

from datetime import date
from typing import Any, Optional

from ..orders.matching import CommandeOFMatcher
from .planning_board_feasibility import build_effective_ofs, evaluate_window


def _safe_date(value: Optional[str]) -> Optional[date]:
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        return None


def _effective_date_fin(of, overrides: dict[str, dict[str, Any]]) -> date:
    ov = overrides.get(of.num_of) or {}
    return _safe_date(ov.get("date_fin")) or of.date_fin


def evaluate_order_impacts(
    loader,
    overrides: dict[str, dict[str, Any]],
    *,
    from_d: date,
    to_d: date,
) -> dict[str, Any]:
    """Évalue le statut de service de chaque commande client de la fenêtre."""
    demandes = [
        besoin
        for besoin in loader.commandes_clients
        if besoin.qte_restante > 0
        and besoin.date_expedition_demandee is not None
        and from_d <= besoin.date_expedition_demandee <= to_d
    ]

    matcher = CommandeOFMatcher(loader, date_tolerance_days=30)
    matching_results = matcher.match_commandes(demandes)

    effective_ofs = build_effective_ofs(loader, overrides, from_d, to_d)
    feasibility = evaluate_window(loader, effective_ofs, horizon_end=to_d)

    today = date.today()
    rows: list[dict[str, Any]] = []
    for result in matching_results:
        commande = result.commande

        of_rows: list[dict[str, Any]] = []
        blocked = False
        latest_fin: Optional[date] = None
        for allocation in result.of_allocations:
            of = allocation.of
            eff_fin = _effective_date_fin(of, overrides)
            entry = feasibility.get(of.num_of)
            of_faisable = entry.faisable if entry else None
            if of_faisable is False:
                blocked = True
            if latest_fin is None or eff_fin > latest_fin:
                latest_fin = eff_fin
            of_rows.append(
                {
                    "num_of": of.num_of,
                    "article": of.article,
                    "qte_allouee": allocation.qte_allouee,
                    "date_fin": eff_fin.isoformat(),
                    "faisable": of_faisable,
                    "modified": of.num_of in overrides,
                    "statut_num": (overrides.get(of.num_of) or {}).get("statut_num")
                    or of.statut_num,
                }
            )

        jours_retard = 0
        if latest_fin is not None and latest_fin > commande.date_expedition_demandee:
            jours_retard = (latest_fin - commande.date_expedition_demandee).days

        if result.remaining_uncovered_qty > 0 or (
            not result.of_allocations and "stock" not in result.matching_method.lower()
        ):
            statut = "sans_couverture"
        elif blocked:
            statut = "bloquee"
        elif jours_retard > 0:
            statut = "retard"
        elif not result.of_allocations:
            statut = "stock"
        else:
            statut = "on_time"

        rows.append(
            {
                "num_commande": commande.num_commande,
                "client": commande.nom_client,
                "article": commande.article,
                "description": commande.description,
                "qte_restante": commande.qte_restante,
                "date_expedition": commande.date_expedition_demandee.isoformat(),
                "deja_en_retard": commande.date_expedition_demandee < today,
                "nature": "commande" if commande.est_commande() else "prevision",
                "type_commande": str(
                    getattr(commande.type_commande, "value", commande.type_commande)
                ),
                "matching_method": result.matching_method,
                "reliquat": result.remaining_uncovered_qty,
                "statut": statut,
                "jours_retard": jours_retard,
                "ofs": of_rows,
            }
        )

    rows.sort(key=lambda r: (r["date_expedition"], r["num_commande"]))

    statut_counts: dict[str, int] = {}
    for row in rows:
        statut_counts[row["statut"]] = statut_counts.get(row["statut"], 0) + 1

    return {
        "orders": rows,
        "window": {"from": from_d.isoformat(), "to": to_d.isoformat()},
        "stats": {
            "nb_commandes": len(rows),
            "nb_on_time": statut_counts.get("on_time", 0) + statut_counts.get("stock", 0),
            "nb_retard": statut_counts.get("retard", 0),
            "nb_bloquees": statut_counts.get("bloquee", 0),
            "nb_sans_couverture": statut_counts.get("sans_couverture", 0),
        },
    }
