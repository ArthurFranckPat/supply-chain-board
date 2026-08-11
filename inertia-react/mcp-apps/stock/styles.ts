/**
 * Feuille de style de l'app MCP « stock ».
 *
 * Mêmes règles que l'app « charge » : chaîne injectée par un `<style>`, aucune
 * police distante, aucune couleur en dur — tout passe par les variables de thème
 * que l'hôte pousse (`useHostStyles`), avec un repli neutre. La CSP de la
 * resource n'autorise aucun domaine et le bundle doit tenir dans un seul HTML.
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
p { margin: 0; }
.muted { color: var(--color-text-secondary, #6b6b6b); }
.err { color: var(--color-text-danger, #b42318); }
.warn {
  color: var(--color-text-warning, #92400e);
  background: var(--color-background-warning, rgba(245,158,11,.12));
  border-radius: var(--border-radius-sm, 6px);
  padding: 6px 8px;
}

.head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.head .ref { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
.badge {
  font-size: var(--font-text-xs-size, 10px);
  border-radius: var(--border-radius-full, 999px);
  padding: 1px 7px;
  background: var(--color-background-tertiary, rgba(0,0,0,.07));
}
.badge.qc { background: var(--color-background-warning, rgba(245,158,11,.16)); color: var(--color-text-warning, #92400e); }

/* ── Indicateurs ── */
.kpis { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.kpi {
  border: var(--border-width-regular, 1px) solid var(--color-border-primary, rgba(0,0,0,.12));
  border-radius: var(--border-radius-md, 8px);
  padding: 7px 9px;
  display: flex; flex-direction: column; gap: 1px; min-width: 0;
}
.kpi .k-label { font-size: var(--font-text-xs-size, 10px); color: var(--color-text-secondary, #6b6b6b); }
.kpi .k-value { font-size: var(--font-heading-sm-size, 15px); font-weight: var(--font-weight-semibold, 600); }
.kpi .k-note { font-size: var(--font-text-xs-size, 10px); color: var(--color-text-tertiary, #8a8a8a); }
.kpi.alerte { border-color: var(--color-background-danger, #dc2626); }
.kpi.alerte .k-value { color: var(--color-text-danger, #b42318); }

/* ── Graphe ── */
.chart-wrap { position: relative; }

.legend { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; font-size: var(--font-text-xs-size, 10px); color: var(--color-text-secondary, #6b6b6b); }
.key { width: 14px; height: 0; border-top-width: 2px; border-top-style: solid; display: inline-block; }
.key.passe { border-color: var(--color-text-primary, #1a1a1a); opacity: .75; }
.key.futur { border-color: var(--color-background-info, #3b82f6); }
.key.secu { border-color: var(--color-background-warning, #f59e0b); border-top-style: dashed; }
.key.rupt { border-color: var(--color-background-danger, #dc2626); }

/* ── Logistique (plein écran) ── */
.logi { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 4px 14px; }
.logi div { display: flex; justify-content: space-between; gap: 8px; border-bottom: 1px dotted var(--color-border-secondary, rgba(0,0,0,.12)); padding: 2px 0; }

${CHART_CSS}
`
