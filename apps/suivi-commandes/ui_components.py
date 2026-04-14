import base64
from datetime import datetime
from html import escape

import pandas as pd
import streamlit as st
import streamlit.components.v1 as components


APP_STYLES = """
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');

html, body, [class*="css"] {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
}

[data-testid="stSidebar"] {
    background-color: #ffffff !important;
    border-right: 1px solid #e4e4e7 !important;
    padding-top: 0 !important;
}
[data-testid="stSidebar"] > div:first-child {
    padding: 1.5rem 1rem 1rem 1rem;
}

[data-testid="stSidebar"] h2,
[data-testid="stSidebar"] h3 {
    font-size: 11px !important;
    font-weight: 600 !important;
    text-transform: uppercase !important;
    letter-spacing: .06em !important;
    color: #71717a !important;
    margin-bottom: .5rem !important;
    margin-top: 1.25rem !important;
}

[data-testid="stSidebar"] label,
[data-testid="stSidebar"] .stSelectbox label,
[data-testid="stSidebar"] .stTextInput label,
[data-testid="stSidebar"] .stMultiSelect label {
    font-size: 12px !important;
    font-weight: 500 !important;
    color: #3f3f46 !important;
}

[data-testid="stSidebar"] input,
[data-testid="stSidebar"] .stSelectbox > div > div,
[data-testid="stSidebar"] .stMultiSelect > div > div {
    border-radius: 6px !important;
    border-color: #e4e4e7 !important;
    font-size: 12.5px !important;
    background: #fafafa !important;
}
[data-testid="stSidebar"] input:focus {
    border-color: #a1a1aa !important;
    box-shadow: 0 0 0 2px #f4f4f5 !important;
}

[data-testid="stSidebar"] .stCheckbox label {
    font-size: 12.5px !important;
    color: #3f3f46 !important;
}

[data-testid="stSidebar"] hr {
    border-color: #e4e4e7 !important;
    margin: 1rem 0 !important;
}

[data-testid="stSidebar"] [data-baseweb="select"] > div:first-child {
    flex-wrap: wrap !important;
    height: auto !important;
    min-height: 36px !important;
    overflow: visible !important;
}
[data-testid="stSidebar"] [data-baseweb="tag"] {
    background-color: #f4f4f5 !important;
    border: 1px solid #e4e4e7 !important;
    border-radius: 4px !important;
    padding: 0 6px !important;
    height: 22px !important;
    max-width: 100% !important;
    white-space: nowrap !important;
    overflow: visible !important;
}
[data-testid="stSidebar"] [data-baseweb="tag"] span {
    color: #18181b !important;
    font-size: 11px !important;
    font-weight: 500 !important;
    overflow: visible !important;
    max-width: none !important;
}
[data-testid="stSidebar"] [data-baseweb="tag"] [role="presentation"] {
    color: #71717a !important;
    font-size: 14px !important;
}
[data-testid="stSidebar"] [data-baseweb="tag"]:hover {
    background-color: #e4e4e7 !important;
}
[data-baseweb="menu"] {
    border: 1px solid #e4e4e7 !important;
    border-radius: 6px !important;
    box-shadow: 0 4px 12px rgba(0,0,0,.08) !important;
    background: #fff !important;
}
[data-baseweb="menu"] li {
    font-size: 12.5px !important;
    color: #18181b !important;
    padding: 6px 10px !important;
}
[data-baseweb="menu"] li:hover,
[data-baseweb="menu"] li[aria-selected="true"] {
    background-color: #f4f4f5 !important;
}
[data-testid="stSidebar"] [data-baseweb="select"] input {
    font-size: 12.5px !important;
    color: #18181b !important;
}

[data-testid="stSidebar"] strong {
    font-size: 11px !important;
    font-weight: 600 !important;
    text-transform: uppercase !important;
    letter-spacing: .06em !important;
    color: #71717a !important;
}

.main .block-container {
    padding-top: 1.5rem !important;
    max-width: 100% !important;
}

h1 {
    font-size: 1.3rem !important;
    font-weight: 600 !important;
    color: #18181b !important;
}
h2 {
    font-size: 1rem !important;
    font-weight: 600 !important;
    color: #18181b !important;
    border-bottom: 1px solid #e4e4e7;
    padding-bottom: .4rem;
}

[data-testid="metric-container"] {
    background: #fafafa;
    border: 1px solid #e4e4e7;
    border-radius: 8px;
    padding: 1rem !important;
}
[data-testid="stMetricValue"] {
    font-size: 1.5rem !important;
    font-weight: 600 !important;
    color: #18181b !important;
}
[data-testid="stMetricLabel"] {
    font-size: 11px !important;
    text-transform: uppercase;
    letter-spacing: .04em;
    color: #71717a !important;
}

.stTabs [data-baseweb="tab-list"] {
    border-bottom: 1px solid #e4e4e7;
    gap: 0;
}
.stTabs [data-baseweb="tab"] {
    font-size: 12.5px !important;
    font-weight: 500;
    color: #71717a;
    padding: 8px 16px;
    border-bottom: 2px solid transparent;
}
.stTabs [aria-selected="true"] {
    color: #18181b !important;
    border-bottom-color: #18181b !important;
}

@media print {
    [data-testid="stSidebar"],
    [data-testid="stHeader"],
    [data-testid="stToolbar"],
    [data-testid="stDecoration"],
    [data-testid="stStatusWidget"],
    .stDeployButton { display: none !important; }

    section.main { margin-left: 0 !important; }

    .main .block-container {
        max-width: 100% !important;
        padding-left: 1rem !important;
        padding-right: 1rem !important;
    }

    .stMetric, .stDataFrame, .stPlotlyChart, .stCustomComponentV1 {
        page-break-inside: avoid;
    }
}
</style>
"""


STATUS_BADGES = {
    "A Livrer": ("background:#dcfce7;color:#166534", "A Livrer"),
    "Allocation à faire": ("background:#dbeafe;color:#1e40af", "Allocation à faire"),
    "Retard Prod": ("background:#fee2e2;color:#991b1b", "Retard Prod"),
    "Horizon MAD aux Expé": ("background:#fef9c3;color:#854d0e", "Horizon MAD"),
    "RAS": ("background:#f4f4f5;color:#71717a", "RAS"),
}


_BTN_CSS = """<style>
body{margin:0;background:transparent}
.pb{display:inline-flex;align-items:center;gap:5px;padding:5px 12px;
  border-radius:6px;border:1px solid #e4e4e7;background:#fff;color:#18181b;
  font-size:12.5px;font-weight:500;font-family:Inter,-apple-system,sans-serif;
  cursor:pointer;transition:background .15s,border-color .15s;white-space:nowrap}
.pb:hover{background:#f4f4f5;border-color:#a1a1aa}
</style>"""

_PRINT_TABLE_CSS = """
<style>
  @page{margin:0}
  body{margin:1.5rem;font-family:Inter,-apple-system,sans-serif}
  table{border-collapse:collapse;width:100%;font-size:12px}
  th{padding:8px 12px;text-align:left;font-size:11px;font-weight:600;
     text-transform:uppercase;letter-spacing:.04em;color:#71717a;
     background:#fafafa;border-bottom:2px solid #e4e4e7}
  td{padding:7px 12px;border-bottom:1px solid #f0f0f0;color:#18181b;vertical-align:middle}
  tr:last-child td{border-bottom:none}
  h2{font-family:Inter,-apple-system,sans-serif;font-size:14px;font-weight:600;
     color:#18181b;margin-bottom:1rem}
</style>"""


def inject_app_styles() -> None:
    st.markdown(APP_STYLES, unsafe_allow_html=True)


def render_element_print_button(html_content: str, label: str = "🖨️ Imprimer") -> None:
    """Ouvre une nouvelle fenêtre contenant uniquement html_content et déclenche l'impression."""
    b64 = base64.b64encode(html_content.encode("utf-8")).decode("ascii")
    components.html(
        f"""<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
body{{margin:0;background:transparent;font-family:Inter,-apple-system,sans-serif}}
.pb{{display:inline-flex;align-items:center;gap:5px;padding:5px 12px;
  border-radius:6px;border:1px solid #e4e4e7;background:#fff;color:#18181b;
  font-size:12.5px;font-weight:500;cursor:pointer;white-space:nowrap;
  transition:background .15s,border-color .15s}}
.pb:hover{{background:#f4f4f5;border-color:#a1a1aa}}
</style>
</head><body>
<script>
function doPrint(){{
  var html=decodeURIComponent(escape(atob("{b64}")));
  var win=window.open("","_blank");
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(function(){{win.print();}},500);
}}
</script>
<button class="pb" onclick="doPrint()">🖨️ {label}</button>
</body></html>""",
        height=42,
    )


def df_to_print_html(df: pd.DataFrame, title: str = "") -> str:
    """Convertit un DataFrame en document HTML prêt à imprimer."""
    heading = f"<h2>{escape(title)}</h2>" if title else ""
    return (
        f"<!DOCTYPE html><html><head><meta charset='utf-8'>"
        f"<title>{escape(title)}</title>{_PRINT_TABLE_CSS}</head>"
        f"<body>{heading}{df.to_html(border=0)}</body></html>"
    )


def html_value(value: object) -> str:
    if pd.isna(value):
        return ""
    return escape(str(value))


def get_shipping_date_class(value: object) -> str:
    if pd.isna(value):
        return ""

    try:
        shipping_date = datetime.strptime(str(value), "%d/%m/%Y").date()
    except ValueError:
        return ""

    delta_days = (shipping_date - datetime.now().date()).days
    if delta_days < 0:
        return "row-overdue"
    if delta_days <= 2:
        return "row-soon"
    return ""


def build_orders_table_html(
    df_affichage: pd.DataFrame,
    cols_article: list[str],
    cols_detail: list[str],
    *,
    comments: dict | None = None,
    max_height: int = 600,
) -> str:
    """Construit et retourne le HTML du tableau des commandes groupées."""
    headers_html = "".join(
        f"<th>{escape(column)}</th>" for column in cols_article + cols_detail
    )
    headers_html += "<th>Commentaire</th>"

    rows_html = ""
    group_id = 0
    for (_, _), group in df_affichage.groupby(
        ["No commande", "Article"],
        sort=False,
        observed=True,
    ):
        current_group = f"g{group_id}"
        group_id += 1
        rows = group.reset_index(drop=True)
        has_multi = len(rows) > 1
        group_date_class = get_shipping_date_class(rows.iloc[0].get("Date expedition"))

        for row_index, row in rows.iterrows():
            if row_index == 0:
                article_cells = ""
                for column in cols_article:
                    value = html_value(row[column]) if column in row else ""
                    if column == "Article":
                        icon_path = (
                            '<path d="M12 5v14M5 12h14"/>'
                            if has_multi
                            else '<path d="M5 12h14"/>'
                        )
                        button = (
                            f'<button class="tog" id="b{current_group}" '
                            f'onclick="tog(\'{current_group}\')">'
                            f'<svg id="ic{current_group}" xmlns="http://www.w3.org/2000/svg" '
                            'width="12" height="12" viewBox="0 0 24 24" fill="none" '
                            'stroke="currentColor" stroke-width="2.5" stroke-linecap="round" '
                            f'stroke-linejoin="round">{icon_path}</svg></button>'
                            if has_multi
                            else '<span style="display:inline-block;width:24px"></span>'
                        )
                        article_cells += (
                            f'<td class="cell-mono">{button}'
                            f'<span class="article-code">{value}</span></td>'
                        )
                    elif column == "Statut":
                        css, label = STATUS_BADGES.get(
                            row[column],
                            ("background:#f4f4f5;color:#71717a", value),
                        )
                        article_cells += (
                            f'<td><span class="badge" style="{css}">'
                            f"{escape(label)}</span></td>"
                        )
                    elif column == "Date expedition":
                        article_cells += f'<td class="cell-muted">{value}</td>'
                    elif column == "No commande":
                        article_cells += f'<td class="cell-muted">{value}</td>'
                    else:
                        article_cells += f"<td>{value}</td>"

                detail_cells = ""
                for column in cols_detail:
                    value = html_value(row[column]) if column in row else ""
                    if column == "Emplacement" and has_multi:
                        detail_cells += (
                            f'<td><span id="es{current_group}">{value}</span>'
                            f'<span id="em{current_group}" '
                            'style="display:none;color:#71717a;font-style:italic;font-size:11.5px">'
                            f"{len(rows)} emplacements</span></td>"
                        )
                    else:
                        detail_cells += f"<td>{value}</td>"

                # Cellule commentaire
                no_cmd = str(row.get("No commande", ""))
                art = str(row.get("Article", ""))
                entry = comments.get((no_cmd, art)) if comments else None
                if entry:
                    full_text = entry["comment"]
                    display = (full_text[:40] + "…") if len(full_text) > 40 else full_text
                    updated = entry.get("updated_at", "")
                    tooltip = escape(full_text) + (f" [{updated}]" if updated else "")
                    comment_cell = (
                        f'<td class="cell-comment" title="{tooltip}">'
                        f'{escape(display)}</td>'
                    )
                else:
                    comment_cell = '<td class="cell-comment"></td>'

                row_classes = "first-row"
                if group_date_class:
                    row_classes += f" {group_date_class}"
                rows_html += f'<tr class="{row_classes}">{article_cells}{detail_cells}{comment_cell}</tr>'
                continue

            empty_cells = "".join("<td></td>" for _ in cols_article)
            detail_cells = "".join(
                f"<td>{html_value(row[column]) if column in row else ''}</td>"
                for column in cols_detail
            )
            rows_html += (
                f'<tr class="sub {current_group} {group_date_class}" style="display:none">'
                f"{empty_cells}{detail_cells}<td></td></tr>"
            )

    html = f"""
    <style>
      @page {{ margin: 0; }}
      *, *::before, *::after {{ box-sizing: border-box; }}
      body {{ margin: 0; }}
      .wrap {{ overflow: auto; max-height: {max_height}px; border-radius: 8px; border: 1px solid #e4e4e7; background: #fff; font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", sans-serif; }}
      .gt {{ width: 100%; border-collapse: collapse; font-size: 12.5px; }}
      .gt thead tr {{ border-bottom: 1px solid #e4e4e7; }}
      .gt th {{ padding: 10px 12px; text-align: left; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; color: #71717a; white-space: nowrap; position: sticky; top: 0; background: #fafafa; z-index: 1; }}
      .gt td {{ padding: 8px 12px; border-bottom: 1px solid #f0f0f0; white-space: nowrap; color: #18181b; vertical-align: middle; }}
      .gt tbody tr:last-child td {{ border-bottom: none; }}
      .first-row td {{ background: #fafafa; border-top: 1px solid #e4e4e7; }}
      .first-row:first-child td {{ border-top: none; }}
      .sub td {{ background: #fff; }}
      .row-overdue td {{ background: #fef2f2 !important; color: #991b1b; }}
      .row-overdue .cell-muted,
      .row-overdue .article-code {{ color: #991b1b !important; }}
      .row-soon td {{ background: #fffbeb !important; color: #a16207; }}
      .row-soon .cell-muted,
      .row-soon .article-code {{ color: #a16207 !important; }}
      .gt tbody tr:hover td {{ background: #f4f4f5 !important; transition: background 0.1s; }}
      .tog {{ display: inline-flex; align-items: center; justify-content: center; width: 18px; height: 18px; border-radius: 4px; border: 1px solid #d4d4d8; background: #fff; cursor: pointer; color: #52525b; margin-right: 6px; padding: 0; vertical-align: middle; flex-shrink: 0; transition: background .15s, border-color .15s; }}
      .tog:hover {{ background: #f4f4f5; border-color: #a1a1aa; }}
      .article-code {{ font-weight: 500; color: #18181b; }}
      .cell-mono {{ font-family: "SF Mono", "Fira Code", monospace; font-size: 11.5px; }}
      .cell-muted {{ color: #71717a; font-size: 12px; }}
      .badge {{ display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 9999px; font-size: 11px; font-weight: 500; white-space: nowrap; }}
      .cell-comment {{ color: #6366f1; font-size: 11.5px; font-style: italic; max-width: 200px; overflow: hidden; text-overflow: ellipsis; cursor: help; }}
    </style>
    <div class="wrap">
    <table class="gt">
      <thead><tr>{headers_html}</tr></thead>
      <tbody>{rows_html}</tbody>
    </table>
    </div>
    <script>
    document.querySelectorAll('[id^="em"]').forEach(function(el) {{
      el.style.display = '';
      var gid = el.id.slice(2);
      var es = document.getElementById('es' + gid);
      if (es) es.style.display = 'none';
    }});

    function tog(g) {{
      var subs = document.querySelectorAll('.sub.' + g);
      var ic = document.getElementById('ic' + g);
      var es = document.getElementById('es' + g);
      var em = document.getElementById('em' + g);
      var collapsed = subs.length > 0 && subs[0].style.display === 'none';
      subs.forEach(r => r.style.display = collapsed ? '' : 'none');
      if (ic) ic.innerHTML = collapsed ? '<path d="M5 12h14"/>' : '<path d="M12 5v14M5 12h14"/>';
      if (es) es.style.display = collapsed ? '' : 'none';
      if (em) em.style.display = collapsed ? 'none' : '';
    }}
    </script>
    """

    return html


def render_grouped_orders_table(
    df_affichage: pd.DataFrame,
    cols_article: list[str],
    cols_detail: list[str],
    *,
    comments: dict | None = None,
    max_height: int = 600,
) -> None:
    html = build_orders_table_html(df_affichage, cols_article, cols_detail, comments=comments, max_height=max_height)
    components.html(html, height=max_height, scrolling=True)
