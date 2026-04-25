from datetime import date, timedelta
from typing import Optional
from .models import CandidateOF
from .decision_trace import DecisionTrace


def generic_sort_key(
    candidate: CandidateOF,
    last_article: Optional[str],
    loader,
    family_counts: dict[str, int],
    kanban_conso: dict[str, float],
    kanban_articles: set[str],
    tracked_kanban_requirements_fn,
    shortage_articles: set[str],
    current_day: Optional[date] = None,
) -> tuple:
    # Combine priority rules:
    # 1. BDH buffer and in shortage (PP153 logic)
    # 2. Normal OF
    # 3. BDH buffer not in shortage
    if candidate.is_buffer_bdh and candidate.article in shortage_articles:
        priority = 0
    elif not candidate.is_buffer_bdh:
        priority = 1
    else:
        priority = 2

    # Urgence : due_date d'abord — un OF en retard ou dû demain doit passer
    # avant un OF dont le target_day correspond mais qui est dû plus tard.
    # L'urgence absolue prime sur le lissage.
    due_urgency = 0
    if current_day and candidate.due_date <= current_day:
        due_urgency = 0  # En retard → priorité maximale
    elif current_day and candidate.due_date <= current_day + timedelta(days=1):
        due_urgency = 1  # Dû demain → haute priorité
    elif current_day and candidate.due_date <= current_day + timedelta(days=2):
        due_urgency = 2  # Dû dans 2 jours
    else:
        due_urgency = 3  # Pas urgent

    # JIT bonus : la réalité montre 7/21 OF produits le jour de l'échéance.
    # On favorise la planification le jour J pour maximiser le JIT.
    jit_bonus = 0
    if current_day and candidate.due_date == current_day:
        jit_bonus = -2  # Très fort bonus pour planifier le jour de l'échéance

    # Prematurity penalty : un OF dû dans >1 jour ne doit pas passer avant
    # un OF dû plus tôt. La réalité montre que les OF sont produits le jour J,
    # pas en avance. On pénalise d'autant plus que l'OF est prématuré.
    prematurity = 0
    if current_day and candidate.due_date > current_day + timedelta(days=1):
        prematurity = (candidate.due_date - current_day).days  # 2, 3, 4...

    # Temporal proximity: favoriser les OF dont le target_day correspond au jour courant.
    # Pénalité linéaire — ne départage que les OF de même urgence.
    if current_day and candidate.target_day:
        target_day_delta = abs((candidate.target_day - current_day).days)
    else:
        target_day_delta = 5  # Pas de target_day → pénalité modérée

    # Serie grouping bonus
    serie_bonus = 1
    if last_article:
        if candidate.article == last_article:
            serie_bonus = -2  # Very strong bonus for identical article
        else:
            last_nom = loader.get_nomenclature(last_article)
            cand_nom = loader.get_nomenclature(candidate.article)
            if last_nom and cand_nom:
                last_comps = {c.article_composant for c in last_nom.composants}
                cand_comps = {c.article_composant for c in cand_nom.composants}
                if last_comps & cand_comps:
                    serie_bonus = -0.5

    # Mix penalty (PP830 logic)
    mix_penalty = 0
    art_info = loader.get_article(candidate.article)
    if art_info:
        desc = art_info.description.upper()
        parts = desc.split()
        fam_cand = next(
            (
                p
                for p in parts
                if len(p) >= 3
                and p not in ["ESH", "ESHKIT", "ESHGPE", "CBL", "CPT", "BDH", "BIP", "GP", "PNEU", "BOIT"]
            ),
            None,
        )
        if fam_cand:
            if family_counts:
                avg_other = sum(c for f, c in family_counts.items() if f != fam_cand) / max(
                    1, len(family_counts) - (1 if fam_cand in family_counts else 0)
                )
                if family_counts.get(fam_cand, 0) > avg_other + 1:
                    mix_penalty = 1

    # Kanban penalty (PP830 logic)
    kanban_penalty = 0
    kanban_reqs = tracked_kanban_requirements_fn(loader, candidate.article, candidate.quantity, kanban_articles)
    for k_art, qty_needed in kanban_reqs.items():
        current_conso = kanban_conso[k_art]
        kanban_penalty += int((current_conso + qty_needed) / 50)

    return (
        priority,
        due_urgency,  # Urgence absolue en premier
        jit_bonus,    # Bonus JIT (négatif = favorisé)
        prematurity,  # Pénalité de prématurité (0 si dû ≤ J+1)
        target_day_delta,  # Puis lissage spatial
        candidate.due_date,  # Puis date exacte
        -candidate.charge_hours,  # Gros OF d'abord quand urgence égale
        serie_bonus,
        mix_penalty,
        kanban_penalty,
        candidate.article,
        candidate.num_of,
    )


def generic_decision_trace(
    candidate: CandidateOF,
    last_article: Optional[str],
    loader,
    family_counts: dict[str, int],
    kanban_conso: dict[str, float],
    kanban_articles: set[str],
    tracked_kanban_requirements_fn,
    shortage_articles: set[str],
    current_day: Optional[date] = None,
) -> DecisionTrace:
    sort_key = generic_sort_key(
        candidate,
        last_article,
        loader,
        family_counts,
        kanban_conso,
        kanban_articles,
        tracked_kanban_requirements_fn,
        shortage_articles,
        current_day,
    )
    (priority, due_urgency, jit_bonus, prematurity, target_day_delta,
     _, neg_charge, serie_bonus, mix_penalty, kanban_penalty, _, _) = sort_key

    composite_score = (
        priority * 10000
        + due_urgency * 1000
        + jit_bonus * 100
        + prematurity * 10
        + target_day_delta
    )

    reason = _build_reason_human(
        candidate, priority, due_urgency, jit_bonus, prematurity,
        serie_bonus, mix_penalty, kanban_penalty, current_day,
    )

    return DecisionTrace(
        num_of=candidate.num_of,
        scheduled_day=candidate.scheduled_day,
        priority=priority,
        due_urgency=due_urgency,
        jit_bonus=jit_bonus,
        prematurity_days=prematurity,
        target_day_delta=target_day_delta,
        serie_bonus=serie_bonus,
        mix_penalty=mix_penalty,
        kanban_penalty=kanban_penalty,
        composite_score=composite_score,
        reason_human=reason,
    )


def _build_reason_human(
    candidate: CandidateOF,
    priority: int,
    due_urgency: int,
    jit_bonus: float,
    prematurity: int,
    serie_bonus: float,
    mix_penalty: int,
    kanban_penalty: float,
    current_day: Optional[date],
) -> str:
    reasons = []
    if priority == 0:
        reasons.append('BDH en rupture')
    elif priority == 1:
        reasons.append('OF normal')
    else:
        reasons.append('BDH non urgent')

    if due_urgency == 0:
        reasons.append('en retard')
    elif due_urgency == 1:
        reasons.append('dû demain')
    elif due_urgency == 2:
        reasons.append('dû dans 2j')
    else:
        reasons.append('pas urgent')

    if jit_bonus == -2:
        reasons.append('JIT optimal')

    if prematurity > 0:
        reasons.append(f'précoce-{prematurity}j')

    if serie_bonus == -2:
        reasons.append('même article')
    elif serie_bonus == -0.5:
        reasons.append('série apparentée')

    if mix_penalty > 0:
        reasons.append('famille majoritaire')

    if kanban_penalty > 0:
        reasons.append(f'impact kanban+{kanban_penalty}')

    return '; '.join(reasons)[:80]
