"""Calcul des besoins en palettes et camions pour les commandes MTS/MTO.

Les articles fabriqués sur la ligne PP_830 appartiennent à la gamme EasyHome
et utilisent des palettes 1000x1200. Les autres articles utilisent des
palettes europ standard 800x1200.

Semi-remorque standard (tautliner) : 13.6m x 2.45m
- Palettes 800x1200 : 33 par camion
- Palettes 1000x1200 : 26 par camion
- En mix : une EasyHome = 33/26 ≈ 1.27 places europ
"""

from __future__ import annotations

from math import ceil
from typing import TYPE_CHECKING
from datetime import date, timedelta

import pandas as pd

if TYPE_CHECKING:
    from erp_data_access.loaders import DataLoader


# Capacité camion semi-remorque standard
EUROP_PER_CAMION = 33
EH_PER_CAMION = 26
# Ratio de conversion EasyHome -> équivalent europ
EH_TO_EUROP_RATIO = EUROP_PER_CAMION / EH_PER_CAMION  # ≈ 1.27


def _is_easyhome(loader: "DataLoader", article: str) -> bool:
    """True si l'article est fabriqué sur la ligne PP_830 (gamme EasyHome)."""
    gamme = loader.get_gamme(article)
    if gamme is None:
        return False
    return any(op.poste_charge == "PP_830" for op in gamme.operations)


def _get_palette_info(loader: "DataLoader", article: str) -> dict | None:
    """Retourne les infos palette pour un article, ou None si pas de PAL."""
    art = loader.get_article(article)
    if art is None or art.cond_type_2 != "PAL" or not art.cond_qte_2:
        return None

    is_eh = _is_easyhome(loader, article)
    return {
        "unites_par_pal": int(art.cond_qte_2),
        "type_palette": "1000x1200" if is_eh else "800x1200",
        "gamme": "EasyHome" if is_eh else "Standard",
    }


def _compute_camions(palettes_std: int, palettes_eh: int) -> int:
    """Calcule le nombre de camions en mix (un camion peut transporter les deux types)."""
    equiv_std = palettes_std + palettes_eh * EH_TO_EUROP_RATIO
    return ceil(equiv_std / EUROP_PER_CAMION)


def compute_palette_summary(
    df: "pd.DataFrame",
    loader: "DataLoader",
    reference_date: date | None = None,
) -> dict:
    """Calcule le résumé palettes/camions pour les commandes MTS et MTO.

    Agrégation par jour sur les 15 jours glissants.

    Returns
    -------
    dict avec:
        - lignes: liste des commandes avec détail palette
        - by_day: agrégation par jour (15 jours glissants)
        - totaux: agrégation globale (seulement dates futures)
    """
    if df.empty or "Statut" not in df.columns:
        return {"lignes": [], "by_day": [], "totaux": {}}

    ref_date = reference_date or date.today()
    horizon_end = ref_date + timedelta(days=14)  # 15 jours glissants

    # Filtrer MTS et MTO uniquement (exclure NOR) + dates dans l'horizon
    scope = df[
        df["Type commande"].isin(["MTS", "MTO"])
        & (df["Date expedition"] >= pd.Timestamp(ref_date))
        & (df["Date expedition"] <= pd.Timestamp(horizon_end))
    ]

    lignes: list[dict] = []
    by_day: dict[str, dict] = {}
    palettes_by_type: dict[str, int] = {"800x1200": 0, "1000x1200": 0}

    # Initialiser les 15 jours (même ceux sans commandes)
    for i in range(15):
        d = ref_date + timedelta(days=i)
        by_day[d.isoformat()] = {
            "date": d.isoformat(),
            "date_fmt": d.strftime("%d/%m"),
            "palettes_standard": 0,
            "palettes_easyhome": 0,
            "lignes": [],
        }

    for _, row in scope.iterrows():
        article = str(row.get("Article", ""))
        qte = float(row.get("Quantité restante", 0))
        date_exp = row.get("Date expedition")
        if not article or qte <= 0 or date_exp is None or pd.isna(date_exp):
            continue

        dt = date_exp.date() if hasattr(date_exp, "date") else date_exp
        if isinstance(dt, str):
            dt = pd.Timestamp(dt).date()

        if dt < ref_date or dt > horizon_end:
            continue

        pal_info = _get_palette_info(loader, article)
        if pal_info is None:
            continue

        nb_pal = ceil(qte / pal_info["unites_par_pal"])
        statut = str(row.get("Statut", ""))

        ligne = {
            "num_commande": str(row.get("No commande", "")),
            "article": article,
            "designation": str(row.get("Désignation 1", "")),
            "type_commande": str(row.get("Type commande", "")),
            "statut": statut,
            "qte_restante": qte,
            "unites_par_pal": pal_info["unites_par_pal"],
            "type_palette": pal_info["type_palette"],
            "gamme": pal_info["gamme"],
            "nb_palettes": nb_pal,
            "date_expedition": dt.isoformat(),
        }
        lignes.append(ligne)

        # Agrégation globale
        palettes_by_type[pal_info["type_palette"]] += nb_pal

        # Agrégation par jour
        day_key = dt.isoformat()
        if day_key in by_day:
            by_day[day_key]["lignes"].append(ligne)
            if pal_info["type_palette"] == "800x1200":
                by_day[day_key]["palettes_standard"] += nb_pal
            else:
                by_day[day_key]["palettes_easyhome"] += nb_pal

    # Calcul camions par jour
    by_day_list: list[dict] = []
    for day_key in sorted(by_day.keys()):
        d = by_day[day_key]
        total_pal = d["palettes_standard"] + d["palettes_easyhome"]
        camions = _compute_camions(d["palettes_standard"], d["palettes_easyhome"])
        by_day_list.append({
            "date": d["date"],
            "date_fmt": d["date_fmt"],
            "palettes_standard": d["palettes_standard"],
            "palettes_easyhome": d["palettes_easyhome"],
            "total_palettes": total_pal,
            "camions": camions,
            "nb_lignes": len(d["lignes"]),
        })

    # Moyenne camions sur les jours ouvrés (lun-ven) des 15 jours
    jours_ouvres = [d for d in by_day_list if pd.Timestamp(d["date"]).weekday() < 5]
    total_camions_ouvres = sum(d["camions"] for d in jours_ouvres)
    nb_jours_ouvres = max(1, len(jours_ouvres))
    moyenne_camions_jour = total_camions_ouvres / nb_jours_ouvres
    moyenne_camions_semaine = moyenne_camions_jour * 5

    # Totaux globaux
    camions_total = _compute_camions(palettes_by_type["800x1200"], palettes_by_type["1000x1200"])

    return {
        "lignes": lignes,
        "by_day": by_day_list,
        "moyenne": {
            "par_jour": round(moyenne_camions_jour, 1),
            "par_semaine": round(moyenne_camions_semaine, 1),
        },
        "totaux": {
            "palettes_standard": palettes_by_type["800x1200"],
            "palettes_easyhome": palettes_by_type["1000x1200"],
            "total_palettes": sum(palettes_by_type.values()),
            "camions": camions_total,
            "total_lignes": len(lignes),
        },
    }
