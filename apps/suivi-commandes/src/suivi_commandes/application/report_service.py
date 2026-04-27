from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timezone


from suivi_commandes.domain.models import CauseType, OrderLine, RetardCause, Status
from suivi_commandes.domain.services.action_recommender import Action, recommend_actions
from suivi_commandes.domain.services.status_assigner import StatusAssignment
from suivi_commandes.application.status_service import StatusService
from suivi_commandes.application.retard_service import RetardService


# ── DTOs internes ────────────────────────────────────────────────────


@dataclass(frozen=True)
class ChargeItem:
    poste: str
    libelle: str
    heures: float


@dataclass(frozen=True)
class ReportRow:
    """Ligne de rapport à plat — sérialisable vers JSON ou table PDF."""

    # OrderLine
    num_commande: str
    article: str
    designation: str
    nom_client: str
    type_commande: str
    date_expedition: date | None
    date_liv_prevue: date | None
    qte_commandee: float
    qte_allouee: float
    qte_restante: float
    besoin_net: float
    qte_allouee_virtuelle: float
    emplacement: str | None
    hum: str | None
    zone_expedition: bool
    alerte_cq_statut: bool
    jours_retard: int | None

    # Actions & causes
    actions: list[Action]
    cause_type: str | None
    cause_message: str | None
    composants_manquants: str | None


@dataclass(frozen=True)
class ReportSections:
    a_expedier: list[ReportRow]
    allocation_a_faire: list[ReportRow]
    retard_prod_groups: dict[str, list[ReportRow]]


@dataclass(frozen=True)
class ReportPayload:
    generated_at: datetime
    reference_date: date
    folder: str | None
    totals: dict[str, int]
    sections: ReportSections
    charge_retard: list[ChargeItem]


# ── Helpers ──────────────────────────────────────────────────────────


def _to_report_row(assignment: StatusAssignment, ref_date: date) -> ReportRow:
    line = assignment.line

    jours_retard = None
    if line.date_expedition and line.date_expedition < ref_date:
        jours_retard = (ref_date - line.date_expedition).days

    actions = recommend_actions(
        status=assignment.status,
        line=line,
        cause=assignment.cause,
        has_cq_alert=assignment.alerte_cq_statut,
        in_zone_expedition=line.en_zone_expedition(),
    )

    cause_type = None
    cause_message = None
    composants_manquants = None
    if assignment.cause:
        cause_type = assignment.cause.type_cause.value
        cause_message = assignment.cause.to_display_string()
        if assignment.cause.composants:
            composants_manquants = ", ".join(
                f"{art} (x{RetardCause._fmt_qty(qty)})"
                for art, qty in sorted(assignment.cause.composants.items())
            )

    return ReportRow(
        num_commande=line.num_commande,
        article=line.article,
        designation=line.designation,
        nom_client=line.nom_client,
        type_commande=line.type_commande.value,
        date_expedition=line.date_expedition,
        date_liv_prevue=line.date_liv_prevue,
        qte_commandee=line.qte_commandee,
        qte_allouee=line.qte_allouee,
        qte_restante=line.qte_restante,
        besoin_net=assignment.besoin_net,
        qte_allouee_virtuelle=assignment.qte_allouee_virtuelle,
        emplacement=", ".join(e.nom for e in line.emplacements) if line.emplacements else None,
        hum=line.emplacements[0].hum if line.emplacements else None,
        zone_expedition=line.en_zone_expedition(),
        alerte_cq_statut=assignment.alerte_cq_statut,
        jours_retard=jours_retard,
        actions=actions,
        cause_type=cause_type,
        cause_message=cause_message,
        composants_manquants=composants_manquants,
    )


def _sort_rows(rows: list[ReportRow]) -> list[ReportRow]:
    return sorted(
        rows,
        key=lambda r: (r.date_expedition or date.max, r.nom_client or "", r.num_commande),
    )


# ── Service ──────────────────────────────────────────────────────────


class ReportService:
    """Construit le payload structuré unique pour les rapports PDF / XLSX."""

    @staticmethod
    def build_payload(
        folder: str | None = None,
        reference_date: str | None = None,
    ) -> ReportPayload:
        ref_date: date
        if isinstance(reference_date, str):
            ref_date = date.fromisoformat(reference_date)
        elif isinstance(reference_date, date):
            ref_date = reference_date
        else:
            ref_date = date.today()

        generated_at = datetime.now(timezone.utc)

        assignments = StatusService.get_enriched_assignments(folder, reference_date)
        charge_result = RetardService.compute(folder, reference_date)

        # 1. Filtrer RAS (veto métier)
        non_ras = [a for a in assignments if a.status != Status.RAS]

        # 2. Totaux
        totals = {
            "a_expedier": sum(1 for a in non_ras if a.status == Status.A_EXPEDIER),
            "allocation_a_faire": sum(1 for a in non_ras if a.status == Status.ALLOCATION_A_FAIRE),
            "retard_prod": sum(1 for a in non_ras if a.status == Status.RETARD_PROD),
        }

        # 3. Buckets
        a_exp = _sort_rows(
            [_to_report_row(a, ref_date) for a in non_ras if a.status == Status.A_EXPEDIER]
        )
        alloc = _sort_rows(
            [_to_report_row(a, ref_date) for a in non_ras if a.status == Status.ALLOCATION_A_FAIRE]
        )

        retard_rows = [a for a in non_ras if a.status == Status.RETARD_PROD]
        groups: dict[str, list[ReportRow]] = {}
        for a in retard_rows:
            ct = a.cause.type_cause.value if a.cause else CauseType.INCONNUE.value
            groups.setdefault(ct, []).append(_to_report_row(a, ref_date))
        for key in groups:
            groups[key] = _sort_rows(groups[key])

        # 4. Charge retard
        charge_items = [
            ChargeItem(poste=i.poste, libelle=i.libelle, heures=i.heures)
            for i in charge_result.items
        ]

        return ReportPayload(
            generated_at=generated_at,
            reference_date=ref_date,
            folder=folder,
            totals=totals,
            sections=ReportSections(
                a_expedier=a_exp,
                allocation_a_faire=alloc,
                retard_prod_groups=groups,
            ),
            charge_retard=charge_items,
        )
