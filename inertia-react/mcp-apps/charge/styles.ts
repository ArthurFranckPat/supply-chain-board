/**
 * Feuille de style de l'app MCP « charge ».
 *
 * Exportée en chaîne et injectée par un `<style>` : pas de fichier CSS séparé, pas
 * de Tailwind, pas de police distante — la CSP de la resource n'autorise aucun
 * domaine et le bundle doit tenir dans un seul fichier HTML.
 *
 * Toutes les couleurs et polices passent par les variables de thème que l'hôte
 * pousse (`useHostStyles` → `applyHostStyleVariables`), avec un repli neutre : dans
 * Claude Desktop l'app doit se fondre dans le fil de discussion, dans /copilote dans
 * le thème Airbnb. Une palette codée en dur jurerait dans au moins un des deux.
 */

import { CHART_CSS } from '../chart-bridge'

export const APP_CSS = `
:root {
  color-scheme: light dark;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: var(--font-sans, system-ui, -apple-system, "Segoe UI", sans-serif);
  font-size: var(--font-text-sm-size, 13px);
  color: var(--color-text-primary, #1a1a1a);
  background: transparent;
}
.app { padding: 12px 14px 16px; display: flex; flex-direction: column; gap: 12px; }

/* Plein écran : l'app remplit le cadre que l'hôte lui a donné, sinon le graphe
   resterait une vignette de 190 px au milieu d'une page vide. */
html, body { height: 100%; }
.app.plein { min-height: 100vh; }
.app.plein .detail { flex: 1; min-height: 0; }
h1 { font-size: var(--font-heading-sm-size, 15px); margin: 0; font-weight: var(--font-weight-semibold, 600); }
h2 { font-size: var(--font-text-md-size, 14px); margin: 0 0 2px; font-weight: var(--font-weight-semibold, 600); }
p { margin: 0; }
.muted { color: var(--color-text-secondary, #6b6b6b); font-weight: var(--font-weight-normal, 400); }
.head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.head p { margin-top: 2px; }

button {
  font: inherit;
  color: inherit;
  cursor: pointer;
  background: var(--color-background-secondary, rgba(0,0,0,.04));
  border: var(--border-width-regular, 1px) solid var(--color-border-primary, rgba(0,0,0,.12));
  border-radius: var(--border-radius-sm, 6px);
  padding: 4px 9px;
}
button:hover:not(:disabled) { background: var(--color-background-tertiary, rgba(0,0,0,.07)); }
button:disabled { opacity: .55; cursor: default; }
button:focus-visible { outline: 2px solid var(--color-ring-primary, #3b82f6); outline-offset: 1px; }

.err { color: var(--color-text-danger, #b42318); }
.warn {
  color: var(--color-text-warning, #92400e);
  background: var(--color-background-warning, rgba(245,158,11,.12));
  border-radius: var(--border-radius-sm, 6px);
  padding: 6px 8px;
}

/* ── Annuaire ── */
.postes { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.poste {
  width: 100%;
  display: grid;
  grid-template-columns: minmax(140px, 1.1fr) minmax(90px, 2fr) minmax(120px, auto);
  align-items: center;
  gap: 12px;
  text-align: left;
  background: transparent;
  border: none;
  border-radius: var(--border-radius-sm, 6px);
  padding: 6px 8px;
}
.poste:hover:not(:disabled) { background: var(--color-background-secondary, rgba(0,0,0,.04)); }
.poste-id { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.poste-id span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.poste-id strong { font-weight: var(--font-weight-medium, 500); }

.chiffres { display: flex; flex-direction: column; align-items: flex-end; gap: 1px; white-space: nowrap; }
.taux { font-variant-numeric: tabular-nums; font-weight: var(--font-weight-semibold, 600); }
.badge {
  font-size: var(--font-text-xs-size, 11px);
  color: var(--color-text-danger, #b42318);
  background: var(--color-background-danger, rgba(220,38,38,.12));
  border-radius: var(--border-radius-full, 999px);
  padding: 1px 7px;
}

/* ── Détail hebdo ── */
.detail { display: flex; flex-direction: column; gap: 8px; }

.legend { display: flex; align-items: center; gap: 6px; color: var(--color-text-tertiary, #8a8a8a); font-size: var(--font-text-xs-size, 11px); }
.key { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-left: 8px; }
.legend .key:first-child { margin-left: 0; }
.bar-key { background: var(--color-background-success, #16a34a); }
.cap-key { height: 2px; border-radius: 0; background: var(--color-text-primary, #1a1a1a); opacity: .6; }

${CHART_CSS}
`
