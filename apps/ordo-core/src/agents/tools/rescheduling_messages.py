"""Outil 1 : Messages de réordonnancement.

Détecte les OFs qui nécessitent une attention immédiate, analogue
aux messages de réordonnancement générés par Sage X3 :
- RETARD          : date_fin dépassée (OF déjà en retard)
- RETARD_IMMINENT : OF ferme à échéance dans <= 2 jours
- URGENCE         : OF suggéré dont une commande associée expire dans <= 5 jours
- DEBLOCAGE       : OF suggéré dont un composant est attendu dans <= 3 jours
"""

from dataclasses import dataclass
from datetime import date, timedelta
from typing import List, Optional

from ...loaders.data_loader import DataLoader


@dataclass
class ReschedulingMessage:
    """Message de réordonnancement pour un OF.

    Attributes
    ----------
    num_of : str
        Numéro de l'OF concerné
    article : str
        Code article de l'OF
    description : str
        Description de l'article
    type : str
        Type de message : RETARD | RETARD_IMMINENT | URGENCE | DEBLOCAGE
    message : str
        Message lisible décrivant la situation
    action_recommandee : str
        Action concrète à entreprendre
    priorite : int
        1 = critique, 2 = important, 3 = info
    date_fin_of : date
        Date de fin prévue de l'OF
    jours_ecart : int
        > 0 = jours de retard, < 0 = jours restants avant échéance
    commande_liee : Optional[str]
        Numéro de commande associée (pour URGENCE)
    """

    num_of: str
    article: str
    description: str
    type: str
    message: str
    action_recommandee: str
    priorite: int
    date_fin_of: date
    jours_ecart: int
    commande_liee: Optional[str] = None


def get_rescheduling_messages(
    loader: DataLoader,
    reference_date: date = None,
    horizon_urgence_days: int = 5,
    horizon_deblocage_days: int = 3,
    horizon_imminent_days: int = 2,
    max_retard_days: int = 90,
) -> List[ReschedulingMessage]:
    """Retourne les messages de réordonnancement pour les OFs actifs.

    Parameters
    ----------
    loader : DataLoader
        DataLoader avec accès aux données
    reference_date : date, optional
        Date de référence (défaut : aujourd'hui)
    horizon_urgence_days : int
        Seuil en jours pour détecter une commande urgente (défaut : 5)
    horizon_deblocage_days : int
        Seuil en jours pour détecter une réception imminente (défaut : 3)
    horizon_imminent_days : int
        Seuil en jours pour qualifier un retard imminent sur OF ferme (défaut : 2)
    max_retard_days : int
        Retard maximum pour générer un message RETARD (défaut : 90).
        Les OFs avec plus de max_retard_days jours de retard sont considérés
        comme des données stale (zombies) et ignorés.

    Returns
    -------
    List[ReschedulingMessage]
        Messages triés par priorité (1=critique en premier), puis retard décroissant
    """
    if reference_date is None:
        reference_date = date.today()

    messages: List[ReschedulingMessage] = []

    # Index commandes actives par article (pour URGENCE)
    commandes_by_article: dict[str, list] = {}
    for c in loader.commandes_clients:
        if c.est_commande() and c.qte_restante > 0:
            commandes_by_article.setdefault(c.article, []).append(c)

    # Index des articles avec réception imminente (pour DEBLOCAGE)
    articles_avec_reception_imminente: set[str] = {
        r.article
        for r in loader.receptions
        if r.quantite_restante > 0
        and r.date_reception_prevue <= reference_date + timedelta(days=horizon_deblocage_days)
    }

    for of in loader.ofs:
        if of.qte_restante <= 0:
            continue

        jours_ecart = (reference_date - of.date_fin).days  # > 0 = retard

        # RETARD : date fin dépassée
        if jours_ecart > 0:
            if jours_ecart <= max_retard_days:
                messages.append(ReschedulingMessage(
                    num_of=of.num_of,
                    article=of.article,
                    description=of.description,
                    type="RETARD",
                    message=(
                        f"OF {of.num_of} ({of.article}) en retard de {jours_ecart}j "
                        f"— prévu le {of.date_fin}, {of.qte_restante} unités restantes"
                    ),
                    action_recommandee=(
                        "Rejalonnez l'OF aval ou réévaluez la priorité en production"
                    ),
                    priorite=1,
                    date_fin_of=of.date_fin,
                    jours_ecart=jours_ecart,
                ))
            continue  # Un OF en retard ne cumule pas les autres types (zombie ou non)

        jours_restants = -jours_ecart

        # RETARD_IMMINENT : OF ferme à moins de N jours
        if of.is_ferme() and jours_restants <= horizon_imminent_days:
            messages.append(ReschedulingMessage(
                num_of=of.num_of,
                article=of.article,
                description=of.description,
                type="RETARD_IMMINENT",
                message=(
                    f"OF ferme {of.num_of} ({of.article}) se termine dans {jours_restants}j "
                    f"({of.date_fin}) — {of.qte_restante} unités restantes"
                ),
                action_recommandee=(
                    "Vérifiez l'avancement en production et alertez si retard prévisible"
                ),
                priorite=1,
                date_fin_of=of.date_fin,
                jours_ecart=jours_ecart,
            ))
            continue

        # URGENCE : OF suggéré avec commande client expirant bientôt
        if of.is_suggere():
            commandes_urgentes = [
                c for c in commandes_by_article.get(of.article, [])
                if (c.date_expedition_demandee - reference_date).days <= horizon_urgence_days
            ]
            if commandes_urgentes:
                earliest = min(commandes_urgentes, key=lambda c: c.date_expedition_demandee)
                delta = (earliest.date_expedition_demandee - reference_date).days
                messages.append(ReschedulingMessage(
                    num_of=of.num_of,
                    article=of.article,
                    description=of.description,
                    type="URGENCE",
                    message=(
                        f"OF suggéré {of.num_of} ({of.article}) — commande "
                        f"{earliest.num_commande} à expédier dans {delta}j "
                        f"({earliest.date_expedition_demandee})"
                    ),
                    action_recommandee=(
                        "Vérifiez la faisabilité et affermissez l'OF immédiatement"
                    ),
                    priorite=2,
                    date_fin_of=of.date_fin,
                    jours_ecart=jours_ecart,
                    commande_liee=earliest.num_commande,
                ))
                continue

        # DEBLOCAGE : OF suggéré avec réception imminente d'un composant
        # Condition : l'OF doit être réellement en rupture sur ce composant
        # (stock_dispo < besoin_of), sinon la réception n'apporte rien de nouveau
        if of.is_suggere():
            nomenclature = loader.get_nomenclature(of.article)
            if nomenclature:
                composants_deblocables = []
                for comp in nomenclature.composants:
                    if comp.article_composant not in articles_avec_reception_imminente:
                        continue
                    stock = loader.get_stock(comp.article_composant)
                    stock_dispo = (stock.stock_physique - stock.stock_alloue) if stock else 0
                    besoin_of = comp.qte_lien * of.qte_restante
                    if stock_dispo < besoin_of:
                        composants_deblocables.append(comp.article_composant)
                if composants_deblocables:
                    messages.append(ReschedulingMessage(
                        num_of=of.num_of,
                        article=of.article,
                        description=of.description,
                        type="DEBLOCAGE",
                        message=(
                            f"OF suggéré {of.num_of} ({of.article}) — réception imminente "
                            f"de composant(s) : {', '.join(composants_deblocables[:3])}"
                        ),
                        action_recommandee=(
                            "Vérifiez la faisabilité après réception et envisagez l'affermissement"
                        ),
                        priorite=3,
                        date_fin_of=of.date_fin,
                        jours_ecart=jours_ecart,
                    ))

    # Tri : priorité croissante (1=critique en premier), puis retard décroissant
    messages.sort(key=lambda m: (m.priorite, -m.jours_ecart))
    return messages
