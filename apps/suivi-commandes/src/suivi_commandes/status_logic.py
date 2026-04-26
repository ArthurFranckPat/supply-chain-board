from datetime import datetime

import numpy as np
import pandas as pd


DETAIL_ONLY_COLUMNS = {
    "Emplacement",
    "HUM",
    "Date mise en stock",
    "Qté Palette",
    "Stock interne 'A'",
    "Alloué interne 'A'",
    "Statut",
}
DISPATCH_ZONE_PATTERN = r"QUAI|SM|EXP|S9C|S3C"


def to_numeric(series: pd.Series) -> pd.Series:
    return pd.to_numeric(series, errors="coerce").fillna(0)


def get_series(df: pd.DataFrame, column: str, default: object = 0) -> pd.Series:
    if column in df.columns:
        return df[column]
    return pd.Series(default, index=df.index)


def business_days_until(target_date: pd.Timestamp, today: pd.Timestamp) -> float:
    if pd.isna(target_date) or target_date <= today:
        return np.nan
    return float(np.busday_count(today.date(), target_date.date()))


def build_line_keys(df: pd.DataFrame) -> pd.DataFrame:
    work = df.copy()
    group_columns = [col for col in work.columns if col not in DETAIL_ONLY_COLUMNS]
    work["_row_order"] = np.arange(len(work))
    work["_line_key"] = work.groupby(group_columns, sort=False, dropna=False).ngroup()
    return work


def build_line_level_frame(df: pd.DataFrame) -> pd.DataFrame:
    work = build_line_keys(df)
    work["_qte_allouee"] = to_numeric(get_series(work, "Qté allouée", 0))
    work["_reliquat"] = to_numeric(get_series(work, "Quantité restante", 0))
    work["_stock_libre_ligne"] = (
        to_numeric(get_series(work, "Stock interne 'A'", 0))
        - to_numeric(get_series(work, "Alloué interne 'A'", 0))
    )
    work["_date_liv_prevue"] = get_series(work, "Date liv prévue", pd.NaT)
    work["_emplacement"] = get_series(work, "Emplacement", "")
    work["_type_commande"] = get_series(work, "Type commande", "")
    work["_is_fabrique"] = get_series(work, "_is_fabrique", False)
    work["_is_hard_pegged"] = get_series(work, "_is_hard_pegged", False)

    # Regroupe les sous-lignes d'emplacement pour raisonner au niveau ligne métier.
    line_level = (
        work.groupby("_line_key", sort=False, dropna=False)
        .agg(
            **{
                "_row_order": ("_row_order", "min"),
                "Article": ("Article", "first"),
                "No commande": ("No commande", "first"),
                "Date expedition": ("Date expedition", "first"),
                "Date liv prévue": ("_date_liv_prevue", "first"),
                "_qte_allouee": ("_qte_allouee", "max"),
                "_reliquat": ("_reliquat", "max"),
                "_stock_libre_ligne": ("_stock_libre_ligne", "max"),
                "_type_commande": ("_type_commande", "first"),
                "_is_fabrique": ("_is_fabrique", "first"),
                "_is_hard_pegged": ("_is_hard_pegged", "first"),
                "_en_zone_expe": (
                    "_emplacement",
                    lambda values: values.fillna("")
                    .astype(str)
                    .str.upper()
                    .str.contains(DISPATCH_ZONE_PATTERN, regex=True)
                    .any(),
                ),
            }
        )
        .reset_index()
    )

    line_level["Besoin ligne"] = (
        line_level["_reliquat"] - line_level["_qte_allouee"]
    ).clip(lower=0)
    line_level["Stock libre article"] = line_level.groupby("Article")[
        "_stock_libre_ligne"
    ].transform("max")
    return line_level


def assign_statuses(df: pd.DataFrame, today: pd.Timestamp | None = None) -> pd.DataFrame:
    if df.empty:
        return df.assign(Statut=pd.Series(dtype="object"))

    reference_date = today or pd.Timestamp(datetime.now().date())
    work = build_line_keys(df)
    line_level = build_line_level_frame(df)

    # Sort by priority for sequential allocation
    sort_columns = [
        column
        for column in ["Date expedition", "Date liv prévue", "No commande", "_row_order"]
        if column in line_level.columns
    ]
    line_level = line_level.sort_values(
        sort_columns,
        ascending=True,
        na_position="last",
        kind="stable",
    )

    # Initialize virtual stock per article
    stock_virtuel = {}
    for article in line_level["Article"].unique():
        stock_virtuel[article] = line_level[line_level["Article"] == article]["_stock_libre_ligne"].iloc[0]

    # Sequential allocation
    couvert = []
    for _, row in line_level.iterrows():
        article = row["Article"]
        besoin_net = max(0, row["_reliquat"] - row["_qte_allouee"])

        if besoin_net <= 0:
            couvert.append(True)
            continue

        # MTS fabricated: no stock allocation, check hard-pegging only
        if row["_type_commande"] == "MTS" and row["_is_fabrique"]:
            couvert.append(bool(row["_is_hard_pegged"]))
            continue

        # NOR/MTO (and MTS purchase): virtual stock allocation
        qte_allouee_virt = min(besoin_net, stock_virtuel[article])
        stock_virtuel[article] -= qte_allouee_virt
        couvert.append(qte_allouee_virt >= besoin_net)

    line_level["_couvert"] = couvert

    # Assign statuses — operational action + urgency
    statuts = []
    for _, row in line_level.iterrows():
        besoin_net = max(0, row["_reliquat"] - row["_qte_allouee"])

        if besoin_net <= 0:
            statuts.append("A Expédier")
            continue

        # MTS fabriqué : pas d'allocation virtuelle. Statut = action réelle dans l'ERP
        if row["_type_commande"] == "MTS" and row["_is_fabrique"]:
            if row["Date expedition"] < reference_date and not row["_en_zone_expe"]:
                statuts.append("Retard Prod")
            else:
                statuts.append("RAS")
            continue

        # MTS achat (non fabriqué) : pas d'allocation virtuelle non plus
        if row["_type_commande"] == "MTS":
            if row["Date expedition"] < reference_date and not row["_en_zone_expe"]:
                statuts.append("Retard Prod")
            else:
                statuts.append("RAS")
            continue

        # NOR/MTO : allocation virtuelle
        if row["_couvert"]:
            statuts.append("Allocation à faire")
        elif row["Date expedition"] < reference_date and not row["_en_zone_expe"]:
            statuts.append("Retard Prod")
        else:
            statuts.append("RAS")

    line_level["Statut"] = statuts

    status_by_line = line_level.set_index("_line_key")["Statut"]
    result = work.copy()
    result["Statut"] = result["_line_key"].map(status_by_line)
    return result.drop(columns=["_row_order", "_line_key"])
