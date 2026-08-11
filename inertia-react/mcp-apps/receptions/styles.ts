/**
 * Feuille de style de l'app MCP « receptions ».
 *
 * Mêmes règles que les apps « charge » et « stock » : chaîne injectée par un
 * `<style>`, aucune police distante, aucune couleur en dur — tout passe par les
 * variables de thème que l'hôte pousse (`useHostStyles`), avec un repli neutre.
 * La CSP de la resource n'autorise aucun domaine et le bundle doit tenir dans un
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

/* ── Histogramme ── */
.chart-wrap { position: relative; }

.legend { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; font-size: var(--font-text-xs-size, 11px); color: var(--color-text-secondary, #6b6b6b); }
.key { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-left: 8px; vertical-align: middle; }
.legend .key:first-child { margin-left: 0; }
.bar-key { background: var(--color-background-success, #16a34a); }
.pic-key { background: var(--color-text-tertiary, #8a8a8a); }
.auj-key { width: 12px; height: 0; border-top: 2px dashed var(--color-text-secondary, #6b6b6b); border-radius: 0; }

/* ── Détail lignes (plein écran) ── */
.lignes { display: flex; flex-direction: column; gap: 6px; }
.table { display: flex; flex-direction: column; gap: 2px; }
.ligne {
  display: grid;
  grid-template-columns: minmax(160px, 1.6fr) repeat(5, minmax(80px, 1fr));
  gap: 6px 12px;
  align-items: center;
  border-bottom: 1px dotted var(--color-border-secondary, rgba(0,0,0,.12));
  padding: 4px 0;
}
.cell { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.cell .muted { font-size: var(--font-text-xs-size, 10px); }
.cell span:not(.muted):not(.badge) { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cell.num span:not(.muted):not(.badge) { font-variant-numeric: tabular-nums; }
.cell.principal strong { font-weight: var(--font-weight-medium, 500); }
.cell.crit.danger span:not(.muted) { color: var(--color-text-danger, #b42318); }
.cell.crit.warning span:not(.muted) { color: var(--color-text-warning, #92400e); }

.badge {
  font-size: var(--font-text-xs-size, 10px);
  border-radius: var(--border-radius-full, 999px);
  padding: 0 6px;
  margin-left: 4px;
}
.badge.fiab {
  background: var(--color-background-warning, rgba(245,158,11,.16));
  color: var(--color-text-warning, #92400e);
}

${CHART_CSS}
`
