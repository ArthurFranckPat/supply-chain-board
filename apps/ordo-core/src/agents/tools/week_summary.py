"""Outil 8 : Briefing quotidien de l'ordonnanceur.

Agrège les signaux des outils 1 à 6 en un résumé structuré
utilisable comme point d'entrée conversationnel pour le super-agent.
"""

from dataclasses import dataclass, field
from datetime import date
from typing import Dict, List, Optional

from ...loaders.data_loader import DataLoader
from .rescheduling_messages import ReschedulingMessage, get_rescheduling_messages
from .late_receptions import LateReceptionImpact, check_late_receptions_impact
from .bottleneck_detector import BottleneckAlert, detect_bottlenecks
from .service_rate_kpis import ServiceRateKPIs, get_service_rate_kpis


@dataclass
class WeekSummary:
    """Briefing hebdomadaire structuré.

    Attributes
    ----------
    date_calcul : date
        Date du briefing
    taux_service_global : float
        Taux de service global (0.0 → 1.0)
    nb_commandes_en_retard : int
        Commandes dont l'expédition est dépassée
    nb_ofs_affermis : int
        OFs fermes actifs
    nb_ofs_suggeres : int
        OFs suggérés actifs
    messages_critiques : List[ReschedulingMessage]
        Messages de priorité 1 (RETARD, RETARD_IMMINENT)
    messages_importants : List[ReschedulingMessage]
        Messages de priorité 2 (URGENCE, DEBLOCAGE)
    receptions_en_retard : List[LateReceptionImpact]
        Réceptions fournisseurs en retard avec impact
    alertes_goulots : List[BottleneckAlert]
        Postes en saturation ou tension
    postes_sous_charge : List[BottleneckAlert]
        Postes sous-chargés (opportunité d'avancement)
    kpis : Optional[ServiceRateKPIs]
        KPIs complets (si calculés)
    texte_briefing : str
        Résumé textuel prêt à être utilisé par le LLM
    """

    date_calcul: date
    taux_service_global: float
    nb_commandes_en_retard: int
    nb_ofs_affermis: int
    nb_ofs_suggeres: int
    messages_critiques: List[ReschedulingMessage] = field(default_factory=list)
    messages_importants: List[ReschedulingMessage] = field(default_factory=list)
    receptions_en_retard: List[LateReceptionImpact] = field(default_factory=list)
    alertes_goulots: List[BottleneckAlert] = field(default_factory=list)
    postes_sous_charge: List[BottleneckAlert] = field(default_factory=list)
    kpis: Optional[ServiceRateKPIs] = None
    texte_briefing: str = ""


def summarize_week_status(
    loader: DataLoader,
    reference_date: date = None,
    num_weeks: int = 4,
    capacite_par_poste: Optional[Dict[str, float]] = None,
) -> WeekSummary:
    """Génère le briefing quotidien de l'ordonnanceur.

    Appelle en cascade :
    1. get_rescheduling_messages   → OFs nécessitant une action
    2. check_late_receptions_impact → risques composants fournisseurs
    3. detect_bottlenecks           → tensions de charge
    4. get_service_rate_kpis        → santé globale du service client

    Parameters
    ----------
    loader : DataLoader
        DataLoader avec accès aux données
    reference_date : date, optional
        Date de référence (défaut : aujourd'hui)
    num_weeks : int
        Horizon d'analyse de la heatmap (défaut : 4)
    capacite_par_poste : Dict[str, float], optional
        Capacité nominale par poste en heures/semaine

    Returns
    -------
    WeekSummary
        Briefing structuré avec texte prêt à l'emploi
    """
    if reference_date is None:
        reference_date = date.today()

    # 1. Messages de réordonnancement
    all_messages = get_rescheduling_messages(loader, reference_date)
    messages_critiques = [m for m in all_messages if m.priorite == 1]
    messages_importants = [m for m in all_messages if m.priorite == 2]

    # 2. Réceptions en retard
    receptions_en_retard = check_late_receptions_impact(loader, reference_date)

    # 3. Goulots
    all_alerts = detect_bottlenecks(
        loader, reference_date, num_weeks=num_weeks,
        capacite_par_poste=capacite_par_poste,
    )
    alertes_goulots = [a for a in all_alerts if a.statut in ("SATURE", "TENSION")]
    postes_sous_charge = [a for a in all_alerts if a.statut == "SOUS_CHARGE"]

    # 4. KPIs
    kpis = get_service_rate_kpis(loader, reference_date, capacite_par_poste)

    # Construire le texte de briefing
    texte = _build_briefing_text(
        reference_date=reference_date,
        kpis=kpis,
        messages_critiques=messages_critiques,
        messages_importants=messages_importants,
        receptions_en_retard=receptions_en_retard,
        alertes_goulots=alertes_goulots,
        postes_sous_charge=postes_sous_charge,
    )

    return WeekSummary(
        date_calcul=reference_date,
        taux_service_global=kpis.taux_service_global,
        nb_commandes_en_retard=kpis.nb_commandes_en_retard,
        nb_ofs_affermis=kpis.ofs_affermis_actifs,
        nb_ofs_suggeres=kpis.ofs_suggeres_actifs,
        messages_critiques=messages_critiques,
        messages_importants=messages_importants,
        receptions_en_retard=receptions_en_retard,
        alertes_goulots=alertes_goulots,
        postes_sous_charge=postes_sous_charge,
        kpis=kpis,
        texte_briefing=texte,
    )


def _build_briefing_text(
    reference_date: date,
    kpis: ServiceRateKPIs,
    messages_critiques: List[ReschedulingMessage],
    messages_importants: List[ReschedulingMessage],
    receptions_en_retard: List[LateReceptionImpact],
    alertes_goulots: List[BottleneckAlert],
    postes_sous_charge: List[BottleneckAlert],
) -> str:
    """Construit le texte de briefing lisible pour le LLM."""
    lines = [
        f"=== BRIEFING ORDONNANCEMENT — {reference_date.strftime('%d/%m/%Y')} ===",
        "",
        "## SANTÉ GLOBALE",
        f"  Taux de service : {round(kpis.taux_service_global * 100, 1)}%"
        f" ({kpis.nb_commandes_servies}/{kpis.nb_commandes_total} commandes servies)",
        f"  Commandes en retard : {kpis.nb_commandes_en_retard}",
        f"  OFs actifs : {kpis.ofs_affermis_actifs} fermes, {kpis.ofs_suggeres_actifs} suggérés",
        "",
    ]

    # Alertes critiques
    if messages_critiques:
        lines.append(f"## ALERTES CRITIQUES ({len(messages_critiques)})")
        for m in messages_critiques[:10]:
            lines.append(f"  [{m.type}] {m.message}")
            lines.append(f"    → {m.action_recommandee}")
        lines.append("")

    # Actions importantes
    if messages_importants:
        lines.append(f"## ACTIONS IMPORTANTES ({len(messages_importants)})")
        for m in messages_importants[:5]:
            lines.append(f"  [{m.type}] {m.message}")
            lines.append(f"    → {m.action_recommandee}")
        lines.append("")

    # Réceptions en retard
    critiques_recep = [r for r in receptions_en_retard if r.niveau_risque == "CRITIQUE"]
    if critiques_recep:
        lines.append(f"## RÉCEPTIONS FOURNISSEURS EN RETARD (risque CRITIQUE : {len(critiques_recep)})")
        for r in critiques_recep[:5]:
            lines.append(
                f"  {r.article} ({r.fournisseur}) — {r.jours_retard}j de retard"
                f", {len(r.ofs_bloques)} OF(s) bloqué(s)"
            )
        lines.append("")

    # Goulots
    satures = [a for a in alertes_goulots if a.statut == "SATURE"]
    if satures:
        lines.append(f"## POSTES SATURÉS ({len(satures)})")
        for a in satures[:5]:
            lines.append(
                f"  {a.poste} ({a.semaine}) — {round(a.taux_charge * 100)}%"
                f" | {a.suggestion}"
            )
        lines.append("")

    # Sous-charge = opportunité
    if postes_sous_charge:
        lines.append(f"## POSTES SOUS-CHARGÉS — opportunités d'avancement ({len(postes_sous_charge)})")
        for a in postes_sous_charge[:3]:
            lines.append(
                f"  {a.poste} ({a.semaine}) — {round(a.taux_charge * 100)}%"
                f" | {a.suggestion}"
            )
        lines.append("")

    if not messages_critiques and not satures and not critiques_recep:
        lines.append("Situation sous contrôle — aucune alerte critique aujourd'hui.")

    return "\n".join(lines)
