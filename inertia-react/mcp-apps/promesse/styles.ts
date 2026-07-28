/**
 * Feuille de style de l'app MCP « promesse ».
 *
 * Mêmes règles que les autres apps : chaîne injectée par un `<style>`, aucune
 * police distante, aucune couleur en dur — tout passe par les variables de thème
 * de l'hôte (`useHostStyles`), avec un repli neutre. CSP fermée, bundle dans un
 * seul fichier HTML.
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
h2 { font-size: var(--font-text-md-size, 14px); margin: 0 0 6px; font-weight: var(--font-weight-semibold, 600); }
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

/* ── Dates ── */
.kpis { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.kpi {
  border: var(--border-width-regular, 1px) solid var(--color-border-primary, rgba(0,0,0,.12));
  border-radius: var(--border-radius-md, 8px);
  padding: 7px 9px;
  display: flex; flex-direction: column; gap: 1px; min-width: 0;
}
.kpi .k-label { font-size: var(--font-text-xs-size, 10px); color: var(--color-text-secondary, #6b6b6b); }
.kpi .k-value { font-size: var(--font-heading-sm-size, 15px); font-weight: var(--font-weight-semibold, 600); font-variant-numeric: tabular-nums; }
.kpi .k-value.small-v { font-size: var(--font-text-md-size, 14px); }
.kpi .k-note { font-size: var(--font-text-xs-size, 10px); color: var(--color-text-tertiary, #8a8a8a); }
.kpi.principale { border-color: var(--color-background-info, #3b82f6); }
.kpi.principale .k-value { color: var(--color-background-info, #3b82f6); }
.kpi.alerte { border-color: var(--color-background-danger, #dc2626); }
.kpi.alerte .k-value { color: var(--color-text-danger, #b42318); }

/* ── Frise ── */
.frise { display: flex; flex-direction: column; gap: 4px; }
.jalons {
  list-style: none; margin: 0; padding: 0;
  display: flex; align-items: stretch; gap: 0;
  overflow-x: auto;
}
.jalon {
  position: relative;
  display: flex; flex-direction: column; align-items: flex-start;
  flex: 0 0 auto; min-width: 120px;
  padding: 0 10px 0 0;
}
.pastille {
  display: inline-flex; align-items: center; justify-content: center;
  width: 22px; height: 22px; border-radius: var(--border-radius-full, 999px);
  background: var(--color-background-secondary, rgba(0,0,0,.06));
  color: var(--color-text-primary, #1a1a1a);
  font-size: var(--font-text-md-size, 13px);
  z-index: 1;
}
.jalon.stock .pastille { background: var(--color-background-success, #16a34a); color: var(--color-text-inverse, #fff); }
.jalon.reception .pastille { background: var(--color-background-info, #3b82f6); color: var(--color-text-inverse, #fff); }
.jalon.of .pastille { background: var(--color-background-tertiary, #8a8a8a); color: var(--color-text-inverse, #fff); }
.jalon.appro .pastille { background: var(--color-background-warning, #f59e0b); color: var(--color-text-inverse, #fff); }
.jalon.fabrication .pastille { background: var(--color-background-info, #3b82f6); color: var(--color-text-inverse, #fff); }
.jalon.infeasible .pastille { background: var(--color-background-danger, #dc2626); color: var(--color-text-inverse, #fff); }

/* Fil reliant les pastilles : horizontal sous la pastille. */
.fil {
  position: absolute;
  top: 11px; left: 22px; right: 0; height: 0;
  border-top: 2px solid var(--color-border-primary, rgba(0,0,0,.16));
  z-index: 0;
}
.jalon:last-child .fil { display: none; }

.cartouche {
  margin-top: 6px;
  display: flex; flex-direction: column; gap: 1px;
  font-size: var(--font-text-xs-size, 11px);
  max-width: 160px;
}
.cartouche strong { font-weight: var(--font-weight-medium, 500); font-size: var(--font-text-sm-size, 12px); }
.cartouche .meta { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.jalon.limitant .pastille {
  box-shadow: 0 0 0 2px var(--color-background-primary, #fff), 0 0 0 4px var(--color-background-info, #3b82f6);
}

.tag {
  display: inline-block; width: fit-content;
  font-size: var(--font-text-xs-size, 10px);
  border-radius: var(--border-radius-full, 999px);
  padding: 0 7px; margin-top: 2px;
}
.limitant-tag {
  background: var(--color-background-info, rgba(59,130,246,.14));
  color: var(--color-background-info, #3b82f6);
  font-weight: var(--font-weight-semibold, 600);
}
`
