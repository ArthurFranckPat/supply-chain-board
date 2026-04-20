from datetime import datetime
from html import escape

import numpy as np
import pandas as pd
import plotly.graph_objects as go
import streamlit as st
import streamlit.components.v1 as components

from data_loader import load_data, load_data_from_erp
from db_comments import init_db, load_all_comments, batch_upsert
from status_logic import assign_statuses, build_line_level_frame
from ui_components import (
    inject_app_styles,
    build_orders_table_html,
    render_grouped_orders_table,
    render_element_print_button,
    df_to_print_html,
)


st.set_page_config(
    page_title="Suivi Commandes et Retards",
    page_icon="📊",
    layout="wide",
    initial_sidebar_state="expanded",
)

inject_app_styles()


@st.cache_data
def load_cached_data() -> pd.DataFrame:
    return load_data_from_erp()


def build_sidebar_filters(df: pd.DataFrame) -> dict[str, object]:
    st.sidebar.header("🔍 Filtres")

    clients = ["Tous"] + sorted(df["Nom client commande"].dropna().unique().tolist())
    selected_client = st.sidebar.selectbox("Client", clients)

    selected_commande = st.sidebar.text_input(
        "Recherche N° commande",
        placeholder="ex: AR2601350",
    )
    selected_article = st.sidebar.text_input(
        "Recherche Article",
        placeholder="ex: A2177",
    )

    st.sidebar.markdown("**Type de commande**")
    types_commande = sorted(df["Type commande"].dropna().unique().tolist())
    selected_types = [
        type_commande
        for type_commande in types_commande
        if st.sidebar.checkbox(
            type_commande,
            value=True,
            key=f"type_commande_{type_commande}",
        )
    ]

    st.sidebar.markdown("**Statut**")
    statuts_disponibles = sorted(df["Statut"].dropna().unique().tolist())
    selected_statuts = [
        statut
        for statut in statuts_disponibles
        if st.sidebar.checkbox(statut, value=True, key=f"statut_{statut}")
    ]

    st.sidebar.markdown("---")
    st.sidebar.markdown("**Colonnes**")
    cols_article_possibles = [
        "Date expedition",
        "No commande",
        "Nom client commande",
        "Article",
        "Désignation 1",
        "Type commande",
        "Statut",
        "Poste de charge",
        "Quantité restante",
        "Quantité livrée",
        "Quantité commandée",
    ]
    cols_detail_possibles = ["Emplacement", "HUM", "Date mise en stock"]

    cols_article_sel = st.sidebar.multiselect(
        "Colonnes groupe",
        cols_article_possibles,
        default=cols_article_possibles,
    )
    cols_detail_sel = st.sidebar.multiselect(
        "Colonnes détail",
        cols_detail_possibles,
        default=cols_detail_possibles,
    )

    return {
        "client": selected_client,
        "commande": selected_commande.strip(),
        "article": selected_article.strip(),
        "types_commande": selected_types,
        "statuts": selected_statuts,
        "cols_article": cols_article_sel,
        "cols_detail": cols_detail_sel,
    }


def apply_filters(df: pd.DataFrame, filters: dict[str, object]) -> pd.DataFrame:
    df_filtered = df.copy()

    if filters["client"] != "Tous":
        df_filtered = df_filtered[df_filtered["Nom client commande"] == filters["client"]]

    if filters["commande"]:
        df_filtered = df_filtered[
            df_filtered["No commande"]
            .astype(str)
            .str.contains(filters["commande"], case=False, na=False)
        ]

    if filters["article"]:
        df_filtered = df_filtered[
            df_filtered["Article"]
            .astype(str)
            .str.contains(filters["article"], case=False, na=False)
        ]

    if filters["types_commande"]:
        df_filtered = df_filtered[
            df_filtered["Type commande"].isin(filters["types_commande"])
        ]
    else:
        df_filtered = df_filtered.iloc[0:0]

    if "Etat commande" in df_filtered.columns:
        df_filtered = df_filtered[df_filtered["Etat commande"] == "Non soldée"]

    if "Etat ligne" in df_filtered.columns:
        df_filtered = df_filtered[df_filtered["Etat ligne"] == "Attente"]

    if filters["statuts"]:
        df_filtered = df_filtered[df_filtered["Statut"].isin(filters["statuts"])]
    else:
        df_filtered = df_filtered.iloc[0:0]

    return df_filtered


def render_metrics(df_filtered: pd.DataFrame) -> None:
    st.header("📈 Métriques Principales")

    col1, col2, col3, col4, col5, col6 = st.columns(6)

    with col1:
        st.metric("Commandes", df_filtered["No commande"].nunique())

    with col2:
        st.metric("Lignes articles", len(df_filtered))

    with col3:
        qty_restante = pd.to_numeric(
            df_filtered["Quantité restante"],
            errors="coerce",
        ).fillna(0)
        st.metric("Qty restante", int(qty_restante.sum()))

    with col4:
        qty_livree = pd.to_numeric(
            df_filtered["Quantité livrée"],
            errors="coerce",
        ).fillna(0)
        st.metric("Qty livrée", int(qty_livree.sum()))

    with col5:
        nb_retard = int((df_filtered["Statut"] == "Retard Prod").sum())
        st.metric("Retard Prod", nb_retard)

    with col6:
        prix = pd.to_numeric(df_filtered["Prix brut"], errors="coerce").fillna(0)
        qte = pd.to_numeric(df_filtered["Quantité restante"], errors="coerce").fillna(0)
        ca = (prix * qte).sum()
        if ca >= 1_000_000:
            ca_str = f"{ca / 1_000_000:.2f} M€"
        elif ca >= 1_000:
            ca_str = f"{ca / 1_000:.1f} K€"
        else:
            ca_str = f"{ca:.0f} €"
        st.metric("CA restant", ca_str)


def prepare_display_dataframe(df_filtered: pd.DataFrame) -> pd.DataFrame:
    colonnes_affichage = [
        "Date expedition",
        "No commande",
        "Nom client commande",
        "Article",
        "Désignation 1",
        "Type commande",
        "Statut",
        "Poste de charge",
        "Emplacement",
        "HUM",
        "Date mise en stock",
        "Quantité restante",
        "Quantité livrée",
        "Quantité commandée",
    ]

    colonnes_affichage = [col for col in colonnes_affichage if col in df_filtered.columns]
    df_affichage = df_filtered[colonnes_affichage].copy()
    df_affichage = df_affichage.sort_values(
        ["Date expedition", "No commande"],
        ascending=[True, True],
        na_position="last",
        kind="stable",
    )

    for col in ["Date expedition", "Date mise en stock"]:
        if col in df_affichage.columns:
            df_affichage[col] = df_affichage[col].dt.strftime("%d/%m/%Y").fillna("")

    return df_affichage


def render_analyses(
    df_filtered: pd.DataFrame,
    orders_table_html: str = "",
    df_affichage: pd.DataFrame | None = None,
    comments_dict: dict | None = None,
) -> None:
    tab1, tab2, tab3, tab4, tab5 = st.tabs(
        ["Par Client", "Retard production", "Par État", "Profondeur du retard", "💬 Commentaires"]
    )

    with tab1:
        stats_client = (
            df_filtered.groupby("Nom client commande")
            .agg(
                **{
                    "Nb commandes": ("No commande", "nunique"),
                    "Total livré": ("Quantité livrée", "sum"),
                    "Total restant": ("Quantité restante", "sum"),
                }
            )
            .sort_values("Nb commandes", ascending=False)
        )
        render_element_print_button(df_to_print_html(stats_client, "Par Client"), "Imprimer")
        st.dataframe(stats_client, use_container_width=True)

    with tab2:
        if "Poste de charge" in df_filtered.columns and "Cadence" in df_filtered.columns:
            df_poste = df_filtered[df_filtered["Statut"] == "Retard Prod"].copy()
            df_poste["Cadence"] = pd.to_numeric(df_poste["Cadence"], errors="coerce")
            df_poste["Quantité restante"] = pd.to_numeric(
                df_poste["Quantité restante"],
                errors="coerce",
            ).fillna(0)
            cadence_positive = df_poste["Cadence"].where(df_poste["Cadence"] > 0, np.nan)
            df_poste["Charge_h"] = df_poste["Quantité restante"].div(cadence_positive)

            stats_poste = (
                df_poste[
                    df_poste["Poste de charge"].notna()
                    & (df_poste["Poste de charge"] != "")
                ]
                .groupby("Poste de charge")
                .agg(
                    **{
                        "Charge cumulée": ("Charge_h", "sum"),
                        "Qté restante": ("Quantité restante", "sum"),
                        "Nb lignes": ("Article", "count"),
                    }
                )
                .reset_index()
                .sort_values("Charge cumulée", ascending=False)
            )
            stats_poste["Charge cumulée"] = pd.to_numeric(
                stats_poste["Charge cumulée"],
                errors="coerce",
            ).fillna(0.0)
            poste_count = len(stats_poste)
            bar_width = 0.04
            spacing = bar_width * 1.05
            x_positions = np.arange(poste_count, dtype=float) * spacing

            fig = go.Figure()
            fig.add_bar(
                x=x_positions,
                y=stats_poste["Charge cumulée"].round(1),
                width=bar_width,
                marker_color=[
                    "#ef4444" if value > 40 else "#f97316" if value > 16 else "#22c55e"
                    for value in stats_poste["Charge cumulée"]
                ],
                text=stats_poste["Charge cumulée"].round(1).astype(str) + " h",
                textposition="outside",
                customdata=stats_poste[["Poste de charge", "Qté restante", "Nb lignes"]].values,
                hovertemplate=(
                    "<b>%{customdata[0]}</b><br>"
                    "Charge cumulée : <b>%{y:.1f} h</b><br>"
                    "Qté restante : %{customdata[1]}<br>"
                    "Nb lignes : %{customdata[2]}"
                    "<extra></extra>"
                ),
            )
            fig.update_layout(
                title=dict(
                    text="Retard production — Charge cumulée par poste de charge (heures)",
                    font=dict(size=13, color="#18181b"),
                ),
                xaxis=dict(
                    tickfont=dict(size=11),
                    showgrid=False,
                    title=None,
                    tickmode="array",
                    tickvals=x_positions,
                    ticktext=stats_poste["Poste de charge"].tolist(),
                    range=[
                        -bar_width / 2,
                        (x_positions[-1] if poste_count else 0) + bar_width / 2,
                    ],
                ),
                yaxis=dict(
                    tickfont=dict(size=11),
                    gridcolor="#f4f4f5",
                    title="Heures",
                    range=[0, max(14, float(stats_poste["Charge cumulée"].max()) + 1)],
                ),
                plot_bgcolor="#ffffff",
                paper_bgcolor="#ffffff",
                bargap=0.0,
                margin=dict(t=40, b=20, l=40, r=20),
                font=dict(family="Inter, sans-serif"),
                showlegend=False,
            )
            combined_html = fig.to_html(include_plotlyjs="cdn", full_html=True).replace(
                "<head>",
                "<head><style>"
                "@page{margin:0}"
                "html,body{height:100%;margin:0;padding:1.5rem;box-sizing:border-box;"
                "font-family:Inter,-apple-system,sans-serif;display:flex;flex-direction:column}"
                ".plotly-graph-div{min-height:60vh !important;flex:0 0 60vh}"
                "table{border-collapse:collapse;width:100%;font-size:12px;margin-top:1.5rem}"
                "th{padding:8px 12px;text-align:left;font-size:11px;font-weight:600;"
                "text-transform:uppercase;letter-spacing:.04em;color:#71717a;"
                "background:#fafafa;border-bottom:2px solid #e4e4e7}"
                "td{padding:7px 12px;border-bottom:1px solid #f0f0f0;color:#18181b}"
                "tr:last-child td{border-bottom:none}"
                "</style>",
                1,
            ).replace("</body>", f"{orders_table_html}</body>", 1)
            render_element_print_button(combined_html, "Imprimer graphique + tableau")
            st.plotly_chart(fig, use_container_width=True)
            st.dataframe(stats_poste, use_container_width=True, hide_index=True)

    with tab3:
        if "Etat ligne" in df_filtered.columns:
            stats_etat = (
                df_filtered.groupby("Etat ligne")
                .agg(
                    **{
                        "Nb commandes": ("No commande", "nunique"),
                        "Nb articles": ("Article", "count"),
                    }
                )
                .sort_values("Nb articles", ascending=False)
            )
            render_element_print_button(df_to_print_html(stats_etat, "Par État"), "Imprimer")
            st.dataframe(stats_etat, use_container_width=True)

    with tab4:
        render_delay_depth_chart(df_filtered)

    with tab5:
        if df_affichage is None or df_affichage.empty:
            st.info("Aucune ligne à afficher.")
        else:
            cols_for_editor = [
                c for c in ["No commande", "Article", "Désignation 1", "Nom client commande", "Statut", "Date expedition"]
                if c in df_affichage.columns
            ]
            df_lines = (
                df_affichage[cols_for_editor]
                .drop_duplicates(subset=["No commande", "Article"])
                .copy()
                .reset_index(drop=True)
            )
            cd = comments_dict or {}
            df_lines["Commentaire"] = df_lines.apply(
                lambda r: cd.get((str(r["No commande"]), str(r["Article"])), {}).get("comment", ""),
                axis=1,
            )
            n_with = df_lines["Commentaire"].astype(bool).sum()
            st.caption(f"{n_with} ligne(s) avec commentaire sur {len(df_lines)} ligne(s) affichées")
            col_config = {c: st.column_config.Column(disabled=True) for c in cols_for_editor}
            col_config["Commentaire"] = st.column_config.TextColumn(
                "Commentaire",
                width="large",
                help="Cause du retard, action en cours, information utile…",
            )
            edited = st.data_editor(
                df_lines,
                column_config=col_config,
                hide_index=True,
                use_container_width=True,
                key="comments_editor",
            )
            if st.button("💾 Enregistrer les commentaires", type="primary"):
                rows_to_save = [
                    {
                        "no_commande": str(row["No commande"]),
                        "article": str(row["Article"]),
                        "comment": str(row.get("Commentaire", "") or ""),
                    }
                    for _, row in edited.iterrows()
                ]
                batch_upsert(rows_to_save)
                st.success("Commentaires enregistrés.")


def render_delay_depth_chart(df_filtered: pd.DataFrame) -> None:
    today = pd.Timestamp(datetime.now().date())
    line_level = build_line_level_frame(df_filtered)
    line_level = line_level[
        (line_level["Besoin ligne"] > 0)
        & line_level["Date expedition"].notna()
        & (line_level["Date expedition"] < today)
    ].copy()
    if line_level.empty:
        st.info("Aucune ligne en retard dans le périmètre filtré.")
        return

    line_level["Jours de retard"] = (
        line_level["Date expedition"]
        .apply(
            lambda value: np.busday_count(value.date(), today.date())
            if pd.notna(value) and value.date() < today.date()
            else 0
        )
        .astype(int)
    )
    line_level = line_level[line_level["Jours de retard"] > 0].copy()
    if line_level.empty:
        st.info("Aucun retard ouvré strictement positif sur les lignes filtrées.")
        return

    bins = [0, 2, 5, 10, np.inf]
    labels = ["1-2 j", "3-5 j", "6-10 j", "> 10 j"]
    labels_display = list(reversed(labels))
    line_level["Tranche retard"] = pd.cut(
        line_level["Jours de retard"],
        bins=bins,
        labels=labels,
        include_lowest=True,
        right=True,
    )

    stats_retard = (
        line_level.groupby("Tranche retard", observed=True)
        .agg(
            **{
                "Nb lignes": ("No commande", "count"),
                "Qté restante": ("Besoin ligne", "sum"),
            }
        )
        .reindex(labels_display, fill_value=0)
        .reset_index()
    )

    bar_colors = ["#f59e0b", "#f97316", "#ef4444", "#b91c1c"]
    max_value = max(20, int(stats_retard["Nb lignes"].max()) + 1)
    chart_width = 760
    chart_height = 250
    margin_left = 70
    margin_right = 16
    margin_top = 14
    margin_bottom = 34
    plot_width = chart_width - margin_left - margin_right
    plot_height = chart_height - margin_top - margin_bottom
    row_step = plot_height / max(len(stats_retard), 1)
    bar_height = min(28, row_step * 0.55)
    radius = bar_height / 2
    axis_x = margin_left
    axis_y = chart_height - margin_bottom
    top_y = margin_top

    svg_parts = [
        f'<svg viewBox="0 0 {chart_width} {chart_height}" width="100%" height="{chart_height}" xmlns="http://www.w3.org/2000/svg">',
        '<style>text{font-family:Inter,Segoe UI,sans-serif;fill:#71717a} .title{font-size:13px;font-weight:600;fill:#18181b} .tick{font-size:11px} .value{font-size:12px;font-weight:600;fill:#ffffff}</style>',
        '<text class="title" x="0" y="12">Profondeur du retard en jours ouvrés</text>',
        f'<line x1="{axis_x}" y1="{top_y}" x2="{axis_x}" y2="{axis_y}" stroke="#d4d4d8" stroke-width="1.2"/>',
        f'<line x1="{axis_x}" y1="{axis_y}" x2="{chart_width - margin_right}" y2="{axis_y}" stroke="#d4d4d8" stroke-width="1.2"/>',
    ]

    for idx, row in stats_retard.iterrows():
        label = escape(str(row["Tranche retard"]))
        value = float(row["Nb lignes"])
        color = bar_colors[idx % len(bar_colors)]
        y_center = top_y + row_step * idx + row_step / 2
        y_top = y_center - bar_height / 2
        bar_length = 0 if max_value == 0 else (value / max_value) * plot_width

        svg_parts.append(
            f'<text class="tick" x="{axis_x - 8}" y="{y_center + 4}" text-anchor="end">{label}</text>'
        )

        if value > 0 and bar_length > 0:
            x0 = axis_x
            x1 = axis_x + bar_length
            y0 = y_top
            y1 = y_top + bar_height
            radius_px = min(radius, bar_length / 2)

            if bar_length <= radius_px:
                svg_parts.append(
                    f'<rect x="{x0}" y="{y0}" width="{bar_length}" height="{bar_height}" rx="{radius_px}" ry="{radius_px}" fill="{color}"/>'
                )
            else:
                path = (
                    f"M {x0} {y0} "
                    f"H {x1 - radius_px} "
                    f"A {radius_px} {radius_px} 0 0 1 {x1} {y0 + radius_px} "
                    f"V {y1 - radius_px} "
                    f"A {radius_px} {radius_px} 0 0 1 {x1 - radius_px} {y1} "
                    f"H {x0} Z"
                )
                svg_parts.append(f'<path d="{path}" fill="{color}"/>')

            if value > 0:
                text_x = axis_x + bar_length / 2
                svg_parts.append(
                    f'<text class="value" x="{text_x}" y="{y_center + 4}" text-anchor="middle">{int(value)}</text>'
                )

    svg_parts.append('</svg>')
    svg_html = "".join(svg_parts)
    render_element_print_button(
        f"<!DOCTYPE html><html><head><meta charset='utf-8'>"
        f"<title>Profondeur du retard</title>"
        f"<style>@page{{margin:0}}body{{margin:1.5rem}}svg{{width:100%;max-width:{chart_width}px}}</style>"
        f"</head><body>{svg_html}</body></html>",
        "Imprimer le graphique",
    )
    components.html(svg_html, height=chart_height + 10)

    detail_retard = (
        line_level[
            [
                "Date expedition",
                "No commande",
                "Article",
                "Besoin ligne",
                "Jours de retard",
                "Tranche retard",
            ]
        ]
        .rename(columns={"Besoin ligne": "Qté restante"})
        .sort_values(["Jours de retard", "Date expedition"], ascending=[False, True])
        .reset_index(drop=True)
    )
    detail_retard["Date expedition"] = detail_retard["Date expedition"].dt.strftime(
        "%d/%m/%Y"
    )
    render_element_print_button(
        df_to_print_html(detail_retard, "Détail du retard"), "Imprimer le tableau"
    )
    st.dataframe(detail_retard, use_container_width=True, hide_index=True)


def render_data_info(df_filtered: pd.DataFrame) -> None:
    with st.expander("ℹ️ Informations sur les données"):
        col1, col2, col3 = st.columns(3)

        with col1:
            st.write(f"**Nombre total de lignes:** {len(df_filtered)}")
            st.write(
                f"**Nombre de commandes uniques:** {df_filtered['No commande'].nunique()}"
            )

        with col2:
            st.write(
                f"**Nombre de clients:** {df_filtered['Nom client commande'].nunique()}"
            )
            st.write(f"**Nombre d'articles:** {df_filtered['Article'].nunique()}")

        with col3:
            date_min = (
                df_filtered["Date expedition"].min().strftime("%d/%m/%Y")
                if df_filtered["Date expedition"].notna().any()
                else "N/A"
            )
            date_max = (
                df_filtered["Date expedition"].max().strftime("%d/%m/%Y")
                if df_filtered["Date expedition"].notna().any()
                else "N/A"
            )
            st.write(f"**Date la plus ancienne:** {date_min}")
            st.write(f"**Date la plus récente:** {date_max}")


def render_export(df_affichage: pd.DataFrame) -> None:
    st.header("💾 Export")
    csv = df_affichage.to_csv(index=False, sep=";")
    st.download_button(
        label="📥 Télécharger en CSV",
        data=csv,
        file_name=f"export_suivi_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv",
        mime="text/csv",
    )


def main() -> None:
    st.title("📊 Tableau de Bord - Suivi Commandes et Retards")

    df = assign_statuses(load_cached_data())
    if df.empty:
        st.error("❌ Aucune donnée trouvée. Vérifiez que le fichier CSV existe.")
        return

    filters = build_sidebar_filters(df)
    df_filtered = apply_filters(df, filters)

    init_db()
    comments_dict = load_all_comments()

    render_metrics(df_filtered)

    st.header("📋 Détail des Commandes")
    df_affichage = prepare_display_dataframe(df_filtered)
    cols_article = [col for col in filters["cols_article"] if col in df_affichage.columns]
    cols_detail = [col for col in filters["cols_detail"] if col in df_affichage.columns]
    table_html = build_orders_table_html(df_affichage, cols_article, cols_detail, comments=comments_dict)
    print_html = (
        "<!DOCTYPE html><html><head><meta charset='utf-8'>"
        "<title>Détail des Commandes</title></head>"
        f"<body style='margin:0'>{table_html}</body></html>"
    )
    render_element_print_button(print_html, "Imprimer le tableau")
    render_grouped_orders_table(df_affichage, cols_article, cols_detail, comments=comments_dict)

    df_retard = prepare_display_dataframe(
        df_filtered[df_filtered["Statut"] == "Retard Prod"]
    )
    retard_table_html = build_orders_table_html(df_retard, cols_article, cols_detail, comments=comments_dict)

    st.header("📊 Analyses")
    render_analyses(df_filtered, orders_table_html=retard_table_html, df_affichage=df_affichage, comments_dict=comments_dict)
    render_data_info(df_filtered)
    render_export(df_affichage)

    st.sidebar.markdown("---")
    st.sidebar.markdown(
        f"📅 Mise à jour: {datetime.now().strftime('%d/%m/%Y %H:%M:%S')}"
    )


if __name__ == "__main__":
    main()
