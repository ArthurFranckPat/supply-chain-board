from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from math import ceil
from suivi_commandes.domain.services import StatusAssignment
from suivi_commandes.domain.ports import PaletteInfoProvider


# Capacité camion semi-remorque standard
EUROP_PER_CAMION = 33
EH_PER_CAMION = 26
EH_TO_EUROP_RATIO = EUROP_PER_CAMION / EH_PER_CAMION  # ≈ 1.27


@dataclass(frozen=True, slots=True)
class PaletteLigneResult:
    num_commande: str
    article: str
    designation: str
    type_commande: str
    statut: str
    qte_restante: float
    unites_par_pal: int
    type_palette: str
    gamme: str
    nb_palettes: int
    date_expedition: str


@dataclass(frozen=True, slots=True)
class PaletteDayResult:
    date: str
    date_fmt: str
    palettes_standard: int
    palettes_easyhome: int
    total_palettes: int
    camions: int
    nb_lignes: int


def _compute_camions(palettes_std: int, palettes_eh: int) -> int:
    equiv_std = palettes_std + palettes_eh * EH_TO_EUROP_RATIO
    return ceil(equiv_std / EUROP_PER_CAMION)


def compute_palette_summary(
    assignments: list[StatusAssignment],
    palette_provider: PaletteInfoProvider,
    reference_date: date | None = None,
) -> dict:
    """Calcule le résumé palettes/camions pour les commandes MTS et MTO.

    Domaine pur — ne dépend pas de pandas ni de DataLoader.
    """
    if not assignments:
        return {"lignes": [], "by_day": [], "moyenne": {}, "totaux": {}}

    ref_date = reference_date or date.today()
    horizon_end = ref_date + timedelta(days=14)  # 15 jours glissants

    lignes: list[dict] = []
    by_day: dict[str, dict] = {}
    palettes_by_type: dict[str, int] = {"800x1200": 0, "1000x1200": 0}

    # Initialiser les 15 jours
    for i in range(15):
        d = ref_date + timedelta(days=i)
        by_day[d.isoformat()] = {
            "date": d.isoformat(),
            "date_fmt": d.strftime("%d/%m"),
            "palettes_standard": 0,
            "palettes_easyhome": 0,
            "lignes": [],
        }

    for assignment in assignments:
        line = assignment.line
        if line.type_commande.value not in ("MTS", "MTO"):
            continue
        if line.date_expedition is None:
            continue
        if line.date_expedition < ref_date or line.date_expedition > horizon_end:
            continue

        qte = line.qte_restante
        if qte <= 0:
            continue

        pal_info = palette_provider.get_palette_info(line.article)
        if pal_info is None:
            continue

        nb_pal = ceil(qte / pal_info.unites_par_pal)
        dt = line.date_expedition

        ligne = {
            "num_commande": line.num_commande,
            "article": line.article,
            "designation": line.designation,
            "type_commande": line.type_commande.value,
            "statut": assignment.status.value,
            "qte_restante": qte,
            "unites_par_pal": pal_info.unites_par_pal,
            "type_palette": pal_info.type_palette,
            "gamme": pal_info.gamme,
            "nb_palettes": nb_pal,
            "date_expedition": dt.isoformat(),
        }
        lignes.append(ligne)

        palettes_by_type[pal_info.type_palette] += nb_pal

        day_key = dt.isoformat()
        if day_key in by_day:
            by_day[day_key]["lignes"].append(ligne)
            if pal_info.type_palette == "800x1200":
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

    # Moyenne sur jours ouvrés
    import pandas as pd
    jours_ouvres = [d for d in by_day_list if pd.Timestamp(d["date"]).weekday() < 5]
    total_camions_ouvres = sum(d["camions"] for d in jours_ouvres)
    nb_jours_ouvres = max(1, len(jours_ouvres))
    moyenne_camions_jour = total_camions_ouvres / nb_jours_ouvres
    moyenne_camions_semaine = moyenne_camions_jour * 5

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
