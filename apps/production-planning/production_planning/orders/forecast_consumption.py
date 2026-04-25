"""Algorithme de consommation des prévisions par les commandes fermes.

La consommation des prévisions permet d'éviter la surévaluation de la charge
en déduisant les commandes fermes des prévisions correspondantes.

Logique:
- Par article et par semaine
- Prévision nette = max(0, Total Prévisions - Total Commandes)
- Si Prévision nette = 0, la prévision est éliminée
"""

from collections import defaultdict
from dataclasses import replace
from typing import Optional

from ..models.besoin_client import BesoinClient, NatureBesoin


def consume_forecasts_by_article(
    besoins: list[BesoinClient],
    week_label: Optional[str] = None
) -> tuple[list[BesoinClient], dict[str, dict]]:
    """Applique la consommation des prévisions par article.

    Cette fonction regroupe toutes les prévisions d'un article pour une semaine
    donnée, soustrait les commandes fermes correspondantes, et ajuste ou
    élimine les prévisions en conséquence.

    Parameters
    ----------
    besoins : list[BesoinClient]
        Liste des besoins pour une semaine donnée
    week_label : Optional[str], optional
        Label de la semaine (ex: "S+2"), utilisé pour le débogage

    Returns
    -------
    tuple[list[BesoinClient], dict[str, dict]]
        (besoins_ajustés, stats_consommation)

        - besoins_ajustés: Liste des besoins avec prévisions consommées.
          Toutes les commandes sont conservées intactes. Les prévisions
          sont ajustées ou éliminées selon la consommation.

        - stats: Dictionnaire {article: {"prev_brut": X, "cmd": Y, "prev_net": Z}}
          Permet d'afficher le détail de la consommation

    Examples
    --------
    >>> besoins = [besoin_prev_720, besoin_cmd_1200]
    >>> ajustes, stats = consume_forecasts_by_article(besoins, "S+2")
    >>> stats["11026032"]
    {"prev_brut": 720, "cmd": 1200, "prev_net": 0}
    >>> len(ajustes)
    1  # Seulement la commande, la prévision a été éliminée
    """
    # 1. Séparer commandes et prévisions
    commandes = [b for b in besoins if b.nature_besoin == NatureBesoin.COMMANDE]
    previsions = [b for b in besoins if b.nature_besoin == NatureBesoin.PREVISION]

    # 2. Regrouper par article
    commandes_par_article = defaultdict(int)
    for cmd in commandes:
        commandes_par_article[cmd.article] += cmd.qte_restante

    previsions_par_article = defaultdict(list)
    for prev in previsions:
        previsions_par_article[prev.article].append(prev)

    # 3. Calculer la consommation pour chaque article
    stats = {}
    for article, liste_prev in previsions_par_article.items():
        total_prev = sum(p.qte_restante for p in liste_prev)
        total_cmd = commandes_par_article.get(article, 0)

        prev_net = max(0, total_prev - total_cmd)

        stats[article] = {
            "prev_brut": total_prev,
            "cmd": total_cmd,
            "prev_net": prev_net
        }

    # 4. Construire la liste des besoins ajustés
    besoins_ajustes = []

    # 4.1. Conserver toutes les commandes (inchangées)
    besoins_ajustes.extend(commandes)

    # 4.2. Ajouter les prévisions ajustées
    for article, liste_prev in previsions_par_article.items():
        prev_net = stats[article]["prev_net"]

        if prev_net > 0:
            # Créer un besoin synthétique avec la quantité ajustée
            # On prend le premier besoin comme template pour conserver les métadonnées
            template = liste_prev[0]

            # Utiliser dataclasses.replace pour créer une copie modifiée
            besoin_ajuste = replace(
                template,
                qte_restante=prev_net,
                qte_allouee=0,  # Réinitialiser car c'est un besoin synthétique
                qte_commandee=prev_net  # Ajuster aussi la quantité commandée
            )

            besoins_ajustes.append(besoin_ajuste)
        # Sinon: prev_net = 0, on n'ajoute pas la prévision (éliminée)

    return besoins_ajustes, stats


def format_consumption_stats(stats: dict[str, dict]) -> str:
    """Formate les statistiques de consommation pour l'affichage.

    Parameters
    ----------
    stats : dict[str, dict]
        Dictionnaire retourné par consume_forecasts_by_article

    Returns
    -------
    str
        Chaîne formatée prête à afficher

    Examples
    --------
    >>> stats = {"11026032": {"prev_brut": 720, "cmd": 1200, "prev_net": 0}}
    >>> print(format_consumption_stats(stats))
    11026032: Prev 720p - Cmd 1200p → Net 0p (-100%)
    """
    lignes = []
    for article, data in sorted(stats.items()):
        prev_brut = data["prev_brut"]
        cmd = data["cmd"]
        prev_net = data["prev_net"]

        if prev_brut > 0:
            pct = (prev_net - prev_brut) / prev_brut * 100
            sign = "+" if pct > 0 else ""
            lignes.append(
                f"{article}: Prev {prev_brut}p - Cmd {cmd}p → Net {prev_net}p ({sign}{pct:.0f}%)"
            )
        else:
            # Cas théorique où il n'y a pas de prévisions
            lignes.append(
                f"{article}: Prev 0p - Cmd {cmd}p → Net 0p (N/A)"
            )

    return "\n".join(lignes)
