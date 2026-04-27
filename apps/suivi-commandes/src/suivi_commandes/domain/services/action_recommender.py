from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from suivi_commandes.domain.models import CauseType, OrderLine, RetardCause, Status

Severity = Literal["info", "warning", "critical"]


@dataclass(frozen=True, slots=True)
class Action:
    label: str
    severity: Severity


def recommend_actions(
    status: Status,
    line: OrderLine,
    cause: RetardCause | None,
    *,
    has_cq_alert: bool,
    in_zone_expedition: bool,
) -> list[Action]:
    """Recommande une liste d'actions métier pour une ligne de commande.

    Les règles couvrent l'ensemble des combinaisons (Statut × Cause) hors RAS.
    """
    if status == Status.A_EXPEDIER:
        if in_zone_expedition:
            return [
                Action("Confirmer chargement", "info"),
                Action("Préparer BL", "info"),
            ]
        return [Action("Déplacer en zone d'expédition", "warning")]

    if status == Status.ALLOCATION_A_FAIRE:
        if has_cq_alert:
            return [Action("Libérer la CQ avant allocation", "warning")]
        besoin = line.besoin_net()
        qte = besoin if besoin > 0 else line.qte_restante
        return [Action(f"Allouer {qte:g} unités à la commande {line.num_commande}", "info")]

    if status == Status.RETARD_PROD:
        if cause is None:
            return [Action("À investiguer manuellement", "info")]

        ct = cause.type_cause
        if ct == CauseType.STOCK_DISPONIBLE_NON_ALLOUE:
            return [Action("Allouer immédiatement le stock", "warning")]

        if ct == CauseType.AUCUN_OF_PLANIFIE:
            return [Action("Créer un OF / escalader ordonnancement", "critical")]

        if ct == CauseType.RUPTURE_COMPOSANTS:
            actions: list[Action] = []
            if cause.composants:
                parts = [
                    f"{art} (x{RetardCause._fmt_qty(qty)})"
                    for art, qty in sorted(cause.composants.items())
                ]
                actions.append(
                    Action(
                        f"Relancer fournisseur composants: {', '.join(parts)}",
                        "critical",
                    )
                )
            actions.append(Action("Vérifier prochain arrivage", "warning"))
            return actions

        if ct == CauseType.ATTENTE_RECEPTION_FOURNISSEUR:
            return [
                Action("Confirmer date de réception", "warning"),
                Action("Suivre transitaire", "info"),
            ]

        if ct == CauseType.INCONNUE:
            return [Action("À investiguer manuellement", "info")]

        return [Action(cause.message or "À investiguer manuellement", "info")]

    return []
