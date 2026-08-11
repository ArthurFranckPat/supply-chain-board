/**
 * Feuille de style de l'app MCP « ruptures ».
 *
 * Mêmes règles que les autres apps : chaîne injectée par un `<style>`, aucune
 * police distante, aucune couleur en dur — tout passe par les variables de thème
 * de l'hôte (`useHostStyles`), avec un repli neutre. CSP fermée, bundle dans un
 * seul fichier HTML.
 */

import { CHART_CSS } from '../chart-bridge'

export const APP_CSS = `
:root { color-scheme: light dark; }
* { box-sizing: border-box; }
html, body { height: 100%; }
body {
  margin: 0;
  font-family: var(--font-sans, system-ui, -apple-system, "Segoe UI", sans-serif);
  font-size: var(--font-text-sm-size, 13px);
  color: var(--color-text-primary, #1a1a1a);
  background: transparent;
}
.app { padding: 12px 14px 16px; display: flex; flex-direction: column; gap: 12px; }
.app.plein { min-height: 100vh; }
h1 { font-size: var(--font-heading-sm-size, 15px); margin: 0; font-weight: var(--font-weight-semibold, 600); }
h2 { font-size: var(--font-text-md-size, 14px); margin: 0 0 4px; font-weight: var(--font-weight-semibold, 600); }
p { margin: 0; }
.muted { color: var(--color-text-secondary, #6b6b6b); }
.small { font-size: var(--font-text-xs-size, 11px); }
.err { color: var(--color-text-danger, #b42318); }
.danger { color: var(--color-text-danger, #b42318); }
.warn {
  color: var(--color-text-warning, #92400e);
  background: var(--color-background-warning, rgba(245,158,11,.12));
  border-radius: var(--border-radius-sm, 6px);
  padding: 6px 8px;
}
.head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.head p { margin-top: 2px; }

/* ── Indicateurs ── */
.kpis { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.kpi {
  border: var(--border-width-regular, 1px) solid var(--color-border-primary, rgba(0,0,0,.12));
  border-radius: var(--border-radius-md, 8px);
  padding: 7px 9px;
  display: flex; flex-direction: column; gap: 1px; min-width: 0;
}
.kpi .k-label { font-size: var(--font-text-xs-size, 10px); color: var(--color-text-secondary, #6b6b6b); }
.kpi .k-value { font-size: var(--font-heading-sm-size, 15px); font-weight: var(--font-weight-semibold, 600); font-variant-numeric: tabular-nums; }
.kpi .k-note { font-size: var(--font-text-xs-size, 10px); color: var(--color-text-tertiary, #8a8a8a); }
.kpi.alerte { border-color: var(--color-background-danger, #dc2626); }
.kpi.alerte .k-value { color: var(--color-text-danger, #b42318); }
.kpi.verdicts {
  flex-direction: row; flex-wrap: wrap; align-items: center; gap: 5px;
}

.pastille {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: var(--font-text-xs-size, 11px);
  border-radius: var(--border-radius-full, 999px);
  padding: 1px 8px;
  background: var(--color-background-tertiary, rgba(0,0,0,.07));
}
.pastille.sans_couverture { background: var(--color-background-danger, rgba(220,38,38,.14)); color: var(--color-text-danger, #b42318); }
.pastille.retard { background: var(--color-background-warning, rgba(245,158,11,.16)); color: var(--color-text-warning, #92400e); }
.pastille.a_risque { background: var(--color-background-warning, rgba(245,158,11,.10)); color: var(--color-text-warning, #92400e); }

/* ── Classement ── */
.classement { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 3px; }
.rang {
  display: grid;
  grid-template-columns: minmax(130px, 1.1fr) minmax(100px, 2.2fr) minmax(150px, 1.3fr);
  align-items: center; gap: 10px;
  padding: 5px 6px;
  border-radius: var(--border-radius-sm, 6px);
}
.rang:hover { background: var(--color-background-secondary, rgba(0,0,0,.04)); }
.rang-id { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.rang-id strong { font-weight: var(--font-weight-medium, 500); }
.rang-id span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.barre {
  position: relative; display: flex; align-items: center; height: 16px;
  border-radius: var(--border-radius-xs, 3px);
  overflow: hidden;
}
.qte {
  position: absolute; right: 5px; top: 50%; transform: translateY(-50%);
  font-size: var(--font-text-xs-size, 11px); font-variant-numeric: tabular-nums;
  color: var(--color-text-primary, #1a1a1a);
  text-shadow: 0 0 3px var(--color-background-primary, #fff);
}

.rang-meta { display: flex; flex-direction: column; gap: 1px; font-size: var(--font-text-xs-size, 11px); min-width: 0; }
.rang-meta span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.tag {
  display: inline-block;
  font-size: var(--font-text-xs-size, 10px);
  border-radius: var(--border-radius-full, 999px);
  padding: 0 7px;
  background: var(--color-background-tertiary, rgba(0,0,0,.07));
  width: fit-content;
}
.tag.sans_couverture { background: var(--color-background-danger, rgba(220,38,38,.14)); color: var(--color-text-danger, #b42318); }
.tag.retard { background: var(--color-background-warning, rgba(245,158,11,.16)); color: var(--color-text-warning, #92400e); }
.tag.a_risque { background: var(--color-background-warning, rgba(245,158,11,.10)); color: var(--color-text-warning, #92400e); }
.tag.sous_ensemble { background: var(--color-background-tertiary, rgba(0,0,0,.10)); }

.rang-suite { padding: 4px 6px; }

/* ── Détail (plein écran) ── */
.detail { display: flex; flex-direction: column; gap: 6px; }
.table { display: flex; flex-direction: column; gap: 2px; }
.ligne {
  display: grid;
  grid-template-columns: minmax(150px, 1.4fr) repeat(6, minmax(90px, 1fr));
  gap: 6px 12px;
  align-items: center;
  border-bottom: 1px dotted var(--color-border-secondary, rgba(0,0,0,.12));
  padding: 4px 0;
}
.cell { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.cell .muted { font-size: var(--font-text-xs-size, 10px); }
.cell span:not(.muted):not(.tag) { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cell.num span:not(.muted):not(.tag) { font-variant-numeric: tabular-nums; }
.cell.principal strong { font-weight: var(--font-weight-medium, 500); }

${CHART_CSS}
`
