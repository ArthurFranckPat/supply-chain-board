"""Outil 9 : Suggestion d'OFs suggérés à affermir.

Identifie les OFs suggérés les plus pertinents à affermir en priorité,
en tenant compte de la faisabilité composants, de l'urgence des commandes
clients associées et de la capacité disponible par poste de charge.

Algorithme :
  1. Filtre les OFs suggérés actifs dans l'horizon (≤ horizon_jours)
  2. Pré-score rapide basé sur l'urgence des commandes (sans faisabilité)
  3. Prend les top max_candidates pour le check de faisabilité (performance)
  4. Pour chaque candidat : RecursiveChecker + calcul de charge
  5. Greedy : sélectionne par score décroissant dans la capacité disponible
"""

from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Dict, List, Optional

from ...loaders.data_loader import DataLoader
from ...algorithms.charge_calculator import calculate_article_charge
from ...checkers.recursive import RecursiveChecker
from ...algorithms.matching import CommandeOFMatcher
from ...models.besoin_client import NatureBesoin


def _get_ofs_linked_to_fr_previsions(
    loader: DataLoader, reference_date: date
) -> set[str]:
    """Retourne les num_of des OFs alloués à des prévisions FR.

    Utilise l'algorithme de matching existant pour déterminer quels OFs
    sont utilisés pour couvrir des prévisions (nature_besoin=PREVISION)
    avec code_pays=FR.
    """
    # Collecter toutes les prévisions FR actives
    previsions_fr = [
        c for c in loader.commandes_clients
        if c.est_prevision() and c.code_pays == "FR" and c.qte_restante > 0
    ]

    if not previsions_fr:
        return set()

    # Initialiser le matcher
    matcher = CommandeOFMatcher(loader, date_tolerance_days=10)

    # Exécuter le matching sur les prévisions FR uniquement
    results = matcher.match_commandes(previsions_fr)

    # Collecter les num_of alloués à ces prévisions
    ofs_linked = set()
    for result in results:
        if result.of:
            ofs_linked.add(result.of.num_of)

    return ofs_linked


def _is_composant_in_nomenclature(loader: DataLoader, article: str) -> bool:
    """Vérifie si l'article est utilisé comme composant dans une nomenclature."""
    for nom in loader.nomenclatures.values():
        for comp in nom.composants:
            if comp.article_composant == article:
                return True
    return False


def _classify_ofs_by_allocation(
    loader: DataLoader, reference_date: date
) -> tuple[set[str], set[str]]:
    """Classifie les OFs par type d'allocation (prévisions FR vs commandes FR).

    Returns:
        tuple[set, set]: (ofs_linked_to_fr_previsions, ofs_linked_to_fr_commandes)
    """
    # Collecter prévisions FR
    previsions_fr = [
        c for c in loader.commandes_clients
        if c.est_prevision() and c.code_pays == "FR" and c.qte_restante > 0
    ]
    # Collecter commandes fermes FR
    commandes_fr = [
        c for c in loader.commandes_clients
        if c.est_commande() and c.code_pays == "FR" and c.qte_restante > 0
    ]

    ofs_previsions = set()
    ofs_commandes = set()

    if previsions_fr:
        matcher = CommandeOFMatcher(loader, date_tolerance_days=10)
        results = matcher.match_commandes(previsions_fr)
        for result in results:
            if result.of:
                ofs_previsions.add(result.of.num_of)

    if commandes_fr:
        matcher = CommandeOFMatcher(loader, date_tolerance_days=10)
        results = matcher.match_commandes(commandes_fr)
        for result in results:
            if result.of:
                ofs_commandes.add(result.of.num_of)

    return ofs_previsions, ofs_commandes


@dataclass
class OFAffirmSuggestion:
    """Suggestion d'affermissement pour un OF suggéré.

    Attributes
    ----------
    num_of : str
        Numéro de l'OF
    article : str
        Code article
    description : str
        Description de l'article
    date_fin : date
        Date de fin prévue
    qte_restante : float
        Quantité restante à fabriquer
    faisable : bool
        True si tous les composants sont disponibles
    raison_infaisabilite : Optional[str]
        Composants manquants si non faisable
    commandes_couvertes : List[str]
        Numéros des commandes clients que cet OF peut couvrir
    nb_commandes_urgentes : int
        Commandes dont l'expédition est dans les 7 prochains jours
    jours_avant_echeance : int
        Jours avant la commande couverte la plus urgente
    charge_par_poste : Dict[str, float]
        Heures par poste de charge générées par cet OF
    score_priorite : float
        Score de priorité (plus élevé = plus urgent)
    """

    num_of: str
    article: str
    description: str
    date_fin: date
    qte_restante: float
    faisable: bool
    raison_infaisabilite: Optional[str]
    commandes_couvertes: List[str]
    nb_commandes_urgentes: int
    jours_avant_echeance: int
    charge_par_poste: Dict[str, float]
    score_priorite: float


@dataclass
class AffirmationPlan:
    """Plan d'affermissement recommandé pour la semaine.

    Attributes
    ----------
    ofs_recommandes : List[OFAffirmSuggestion]
        OFs à affermir en priorité, triés par score décroissant
    ofs_infaisables : List[OFAffirmSuggestion]
        OFs non faisables (composants en rupture) — ne pas affermir
    ofs_hors_capacite : List[OFAffirmSuggestion]
        OFs faisables mais exclus car les postes seraient saturés
    charge_additionnelle : Dict[str, float]
        Heures ajoutées par les OFs recommandés, par poste
    capacite_consommee : Dict[str, float]
        Taux d'utilisation de la capacité ajoutée (charge / capacite_defaut)
    nb_commandes_couvertes : int
        Nombre distinct de commandes couvertes par le plan
    nb_candidates : int
        Nombre total d'OFs candidats analysés dans l'horizon
    texte_recommandation : str
        Synthèse narrative du plan
    """

    ofs_recommandes: List[OFAffirmSuggestion]
    ofs_infaisables: List[OFAffirmSuggestion]
    ofs_hors_capacite: List[OFAffirmSuggestion]
    charge_additionnelle: Dict[str, float]
    capacite_consommee: Dict[str, float]
    nb_commandes_couvertes: int
    nb_candidates: int
    texte_recommandation: str


def suggest_ofs_to_affirm(
    loader: DataLoader,
    reference_date: date = None,
    capacite_par_poste: Dict[str, float] = None,
    capacite_defaut: float = 35.0,
    horizon_jours: int = 14,
    max_candidates: int = 200,
) -> AffirmationPlan:
    """Suggère les OFs suggérés à affermir en priorité.

    Parameters
    ----------
    loader : DataLoader
        DataLoader avec accès aux données
    reference_date : date, optional
        Date de référence (défaut : aujourd'hui)
    capacite_par_poste : Dict[str, float], optional
        Capacité disponible en heures par poste (défaut : capacite_defaut pour tous)
    capacite_defaut : float
        Capacité nominale par défaut en heures/semaine (défaut : 35h)
    horizon_jours : int
        Horizon en jours pour filtrer les OFs candidats (défaut : 14 jours)
    max_candidates : int
        Nombre maximum d'OFs à analyser pour la faisabilité (défaut : 200).
        Les candidats sont pré-triés par urgence avant ce filtre.

    Returns
    -------
    AffirmationPlan
        Plan d'affermissement recommandé
    """
    if reference_date is None:
        reference_date = date.today()
    if capacite_par_poste is None:
        capacite_par_poste = {}

    deadline = reference_date + timedelta(days=horizon_jours)
    urgence_horizon = reference_date + timedelta(days=7)

    # --- 1. Index des commandes actives par article ---
    commandes_by_article: dict[str, list] = {}
    for c in loader.commandes_clients:
        if c.est_commande() and c.qte_restante > 0:
            commandes_by_article.setdefault(c.article, []).append(c)

    # --- 1b. Classification des OFs par allocation (prévisions FR vs commandes FR)
    ofs_linked_to_fr_previsions, ofs_linked_to_fr_commandes = _classify_ofs_by_allocation(
        loader, reference_date
    )

    # --- 2. Candidats : OFs planifiés (statut=2) + suggérés (statut=3) avec règles canal FR
    candidats_bruts = []
    for of in loader.ofs:
        if of.statut_num not in (2, 3):
            continue
        if of.qte_restante <= 0:
            continue
        if of.date_fin > deadline:
            continue

        # OF planifié (statut=2) : toujours inclus (WOP MTS)
        if of.statut_num == 2:
            candidats_bruts.append(of)
            continue

        # OF suggéré (statut=3) : règles canal FR
        # 1. Exclure si lié à une prévision FR
        if of.num_of in ofs_linked_to_fr_previsions:
            continue
        # 2. Inclure si lié à une commande ferme FR
        if of.num_of in ofs_linked_to_fr_commandes:
            candidats_bruts.append(of)
            continue
        # 3. Inclure si article est composant dans une nomenclature
        if _is_composant_in_nomenclature(loader, of.article):
            candidats_bruts.append(of)
            continue
        # 4. Sinon exclure (article final non-composant non-lié)

    nb_candidates_total = len(candidats_bruts)

    if not candidats_bruts:
        return AffirmationPlan(
            ofs_recommandes=[],
            ofs_infaisables=[],
            ofs_hors_capacite=[],
            charge_additionnelle={},
            capacite_consommee={},
            nb_commandes_couvertes=0,
            nb_candidates=0,
            texte_recommandation=(
                f"Aucun OF suggéré actif dans les {horizon_jours} prochains jours."
            ),
        )

    # --- 3. Pré-score rapide (sans faisabilité) pour filtrer les top max_candidates ---
    def _prescore(of) -> float:
        cmds = commandes_by_article.get(of.article, [])
        couvertes = [c for c in cmds if of.date_fin <= c.date_expedition_demandee]
        urgentes = [c for c in couvertes if c.date_expedition_demandee <= urgence_horizon]
        if couvertes:
            jours = (min(c.date_expedition_demandee for c in couvertes) - reference_date).days
        else:
            jours = (of.date_fin - reference_date).days
        return (len(urgentes) * 50 + len(couvertes) * 10) / max(1, jours)

    candidats_bruts.sort(key=_prescore, reverse=True)
    candidats = candidats_bruts[:max_candidates]

    # --- 4. Faisabilité + charge pour chaque candidat ---
    checker = RecursiveChecker(loader)
    suggestions: List[OFAffirmSuggestion] = []

    for of in candidats:
        # Faisabilité
        result = checker.check_of(of)
        faisable = result.feasible
        raison = _extract_raison(result) if not faisable else None

        # Charge par poste
        charge = calculate_article_charge(of.article, of.qte_restante, loader)

        # Commandes couvertes et urgentes
        cmds = commandes_by_article.get(of.article, [])
        couvertes = [
            c for c in cmds
            if of.date_fin <= c.date_expedition_demandee
        ]
        urgentes = [c for c in couvertes if c.date_expedition_demandee <= urgence_horizon]

        if couvertes:
            jours_avant = (
                min(c.date_expedition_demandee for c in couvertes) - reference_date
            ).days
        else:
            jours_avant = (of.date_fin - reference_date).days

        score = (len(urgentes) * 50 + len(couvertes) * 10) / max(1, jours_avant)

        suggestions.append(OFAffirmSuggestion(
            num_of=of.num_of,
            article=of.article,
            description=of.description,
            date_fin=of.date_fin,
            qte_restante=of.qte_restante,
            faisable=faisable,
            raison_infaisabilite=raison,
            commandes_couvertes=[c.num_commande for c in couvertes],
            nb_commandes_urgentes=len(urgentes),
            jours_avant_echeance=jours_avant,
            charge_par_poste=charge,
            score_priorite=round(score, 4),
        ))

    # --- 5. Séparer faisables / infaisables ---
    infaisables = [s for s in suggestions if not s.faisable]
    faisables = sorted(
        [s for s in suggestions if s.faisable],
        key=lambda s: -s.score_priorite,
    )

    # --- 6. Greedy : sélection dans la capacité disponible ---
    charge_totale: dict[str, float] = {}
    recommandes: List[OFAffirmSuggestion] = []
    hors_capacite: List[OFAffirmSuggestion] = []
    commandes_vues: set[str] = set()

    for sug in faisables:
        # Vérifier si la charge de cet OF tient dans la capacité restante
        peut_ajouter = all(
            charge_totale.get(poste, 0.0) + heures
            <= capacite_par_poste.get(poste, capacite_defaut)
            for poste, heures in sug.charge_par_poste.items()
        )

        if peut_ajouter:
            recommandes.append(sug)
            for poste, heures in sug.charge_par_poste.items():
                charge_totale[poste] = charge_totale.get(poste, 0.0) + heures
            commandes_vues.update(sug.commandes_couvertes)
        else:
            hors_capacite.append(sug)

    # --- 7. Taux d'utilisation ---
    capacite_consommee = {
        poste: round(heures / capacite_par_poste.get(poste, capacite_defaut), 3)
        for poste, heures in charge_totale.items()
    }

    texte = _build_recommendation_text(
        recommandes, infaisables, hors_capacite,
        len(commandes_vues), charge_totale,
        reference_date, nb_candidates_total,
    )

    return AffirmationPlan(
        ofs_recommandes=recommandes,
        ofs_infaisables=infaisables,
        ofs_hors_capacite=hors_capacite,
        charge_additionnelle={k: round(v, 2) for k, v in charge_totale.items()},
        capacite_consommee=capacite_consommee,
        nb_commandes_couvertes=len(commandes_vues),
        nb_candidates=nb_candidates_total,
        texte_recommandation=texte,
    )


def _extract_raison(result) -> str:
    """Extrait la raison d'infaisabilité depuis FeasibilityResult."""
    if result.missing_components:
        top = list(result.missing_components.keys())[:3]
        return f"Composants en rupture : {', '.join(top)}"
    if result.alerts:
        return result.alerts[0]
    return "Composants insuffisants"


def _build_recommendation_text(
    recommandes: list,
    infaisables: list,
    hors_capacite: list,
    nb_commandes: int,
    charge_totale: dict,
    reference_date: date,
    nb_candidates_total: int,
) -> str:
    """Construit la synthèse narrative du plan d'affermissement."""
    lines = [
        f"PLAN D'AFFERMISSEMENT — {reference_date.strftime('%d/%m/%Y')}",
        f"({nb_candidates_total} OFs suggérés analysés)",
        "",
    ]

    if recommandes:
        lines.append(f"{len(recommandes)} OF(s) a affermir :")
        for s in recommandes[:5]:
            cmd_str = f" → {len(s.commandes_couvertes)} commande(s)" if s.commandes_couvertes else ""
            urgent_str = f" ({s.nb_commandes_urgentes} urgente(s))" if s.nb_commandes_urgentes else ""
            lines.append(f"  • {s.num_of} ({s.article}) — {s.date_fin}{cmd_str}{urgent_str}")
        if len(recommandes) > 5:
            lines.append(f"  ... et {len(recommandes) - 5} autre(s)")
        lines.append(f"Commandes clients couvertes : {nb_commandes}")
    else:
        lines.append("Aucun OF recommandé pour cet horizon.")

    if charge_totale:
        top_postes = sorted(charge_totale.items(), key=lambda x: -x[1])[:3]
        postes_str = ", ".join(f"{p}: {h:.1f}h" for p, h in top_postes)
        lines.append(f"Charge additionnelle : {postes_str}")

    if infaisables:
        lines.append(
            f"{len(infaisables)} OF(s) bloques composants — ne pas affermir "
            f"(ex: {infaisables[0].num_of} — {infaisables[0].raison_infaisabilite})"
        )

    if hors_capacite:
        lines.append(
            f"{len(hors_capacite)} OF(s) faisable(s) mais hors capacite — a reporter."
        )

    return "\n".join(lines)
