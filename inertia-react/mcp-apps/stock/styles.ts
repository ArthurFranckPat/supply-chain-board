/**
 * Feuille de style de l'app MCP « stock ».
 *
 * Mêmes règles que l'app « charge » : chaîne injectée par un `<style>`, aucune
 * police distante, aucune couleur en dur — tout passe par les variables de thème
 * que l'hôte pousse (`useHostStyles`), avec un repli neutre. La CSP de la
 * resource n'autorise aucun domaine et le bundle doit tenir dans un seul HTML.
 */

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
.chart { width: 100%; height: 200px; display: block; overflow: visible; }
.app.plein .chart { height: 340px; }
.axis { stroke: var(--color-border-primary, rgba(0,0,0,.16)); stroke-width: 1; }
.grid { stroke: var(--color-border-secondary, rgba(0,0,0,.08)); stroke-width: 1; }
.aire-passe { fill: var(--color-background-info, #3b82f6); opacity: .13; }
.aire-futur { fill: var(--color-background-info, #3b82f6); opacity: .07; }
.trace-passe { fill: none; stroke: var(--color-text-primary, #1a1a1a); stroke-width: 1.6; opacity: .75; }
.trace-futur { fill: none; stroke: var(--color-background-info, #3b82f6); stroke-width: 1.8; }
.secu { stroke: var(--color-background-warning, #f59e0b); stroke-width: 1.4; stroke-dasharray: 5 3; }
.rupture { stroke: var(--color-background-danger, #dc2626); stroke-width: 1.4; }
.aujourdhui { stroke: var(--color-text-secondary, #6b6b6b); stroke-width: 1; stroke-dasharray: 3 3; }
.tick { font-size: 9px; fill: var(--color-text-tertiary, #8a8a8a); }
.curseur { stroke: var(--color-text-secondary, #6b6b6b); stroke-width: 1; }
.point { fill: var(--color-background-info, #3b82f6); }

.flux-bar { fill: var(--color-background-success, #16a34a); opacity: .8; }
.flux-bar.besoin { fill: var(--color-background-danger, #dc2626); opacity: .65; }

.tip {
  position: absolute; pointer-events: none;
  background: var(--color-background-inverse, #1a1a1a);
  color: var(--color-text-inverse, #fff);
  border-radius: var(--border-radius-sm, 6px);
  padding: 5px 8px; font-size: var(--font-text-xs-size, 10px);
  display: flex; flex-direction: column; gap: 1px; white-space: nowrap;
  transform: translate(-50%, -100%);
}

.legend { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; font-size: var(--font-text-xs-size, 10px); color: var(--color-text-secondary, #6b6b6b); }
.key { width: 14px; height: 0; border-top-width: 2px; border-top-style: solid; display: inline-block; }
.key.passe { border-color: var(--color-text-primary, #1a1a1a); opacity: .75; }
.key.futur { border-color: var(--color-background-info, #3b82f6); }
.key.secu { border-color: var(--color-background-warning, #f59e0b); border-top-style: dashed; }
.key.rupt { border-color: var(--color-background-danger, #dc2626); }

/* ── Logistique (plein écran) ── */
.logi { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 4px 14px; }
.logi div { display: flex; justify-content: space-between; gap: 8px; border-bottom: 1px dotted var(--color-border-secondary, rgba(0,0,0,.12)); padding: 2px 0; }
`
