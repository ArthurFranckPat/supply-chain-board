/**
 * Feuille de style de l'app MCP « retards ».
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

/* ── Classement ── */
.classement { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 3px; }
.rang {
  display: grid;
  grid-template-columns: minmax(140px, 1.1fr) minmax(110px, 2.2fr) minmax(150px, 1.2fr);
  align-items: center; gap: 10px;
  padding: 5px 6px;
  border-radius: var(--border-radius-sm, 6px);
}
.rang:hover { background: var(--color-background-secondary, rgba(0,0,0,.04)); }
.rang-id { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.rang-id strong { font-weight: var(--font-weight-medium, 500); }
.rang-id span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.barre {
  position: relative; display: block; height: 16px;
  background: var(--color-background-secondary, rgba(0,0,0,.05));
  border-radius: var(--border-radius-xs, 3px);
  overflow: hidden;
}
.remplissage {
  position: absolute; inset: 0 auto 0 0;
  border-radius: inherit;
}
.rang.retard .remplissage { background: var(--color-background-warning, #f59e0b); opacity: .85; }
.rang.infeasible .remplissage {
  background: repeating-linear-gradient(
    45deg,
    var(--color-background-danger, #dc2626),
    var(--color-background-danger, #dc2626) 5px,
    rgba(220,38,38,.55) 5px,
    rgba(220,38,38,.55) 10px
  );
}
.qte {
  position: absolute; right: 5px; top: 50%; transform: translateY(-50%);
  font-size: var(--font-text-xs-size, 11px); font-variant-numeric: tabular-nums;
  color: var(--color-text-primary, #1a1a1a);
  text-shadow: 0 0 3px var(--color-background-primary, #fff);
}
.rang.infeasible .qte { color: var(--color-text-danger, #b42318); font-weight: var(--font-weight-semibold, 600); }

.rang-meta { display: flex; flex-direction: column; gap: 1px; font-size: var(--font-text-xs-size, 11px); min-width: 0; }
.rang-meta span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

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
.cell span:not(.muted):not(.danger) { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cell.num span:not(.muted):not(.danger) { font-variant-numeric: tabular-nums; }
.cell.principal strong { font-weight: var(--font-weight-medium, 500); }
.ligne.infeasible { background: var(--color-background-danger, rgba(220,38,38,.05)); }
`
