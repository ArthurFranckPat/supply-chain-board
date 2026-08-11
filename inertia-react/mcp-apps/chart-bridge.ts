/**
 * Pont TanStack Charts pour les apps MCP autonomes.
 *
 * Les primitives de `@r/components/ui/chart` lisent les tokens `--serie-*` et
 * la classe `.chart-tooltip` que le site définit dans `styles/app.css` — rien
 * de tout ça n'existe dans un HTML autonome dont la seule palette est celle
 * que l'hôte pousse (`--color-*`, `useHostStyles`). Ce bloc les définit par
 * apport sur les variables hôte, avec repli neutre : même règle que le reste
 * de la feuille d'une app.
 *
 * À concaténer dans le `APP_CSS` de chaque app qui utilise les primitives.
 */
export const CHART_CSS = `
/* ── Pont TanStack Charts (@r/components/ui/chart) ── */
[data-slot='chart'] { min-width: 0; width: 100%; }

:root {
  --ts-chart-1: var(--color-background-info, #3b82f6);
  --ts-chart-2: var(--color-background-warning, #f59e0b);
  --ts-chart-3: var(--color-background-danger, #dc2626);
  --ts-chart-4: var(--color-background-success, #16a34a);
  --ts-chart-5: var(--color-text-tertiary, #8a8a8a);
  --ts-chart-6: var(--color-text-secondary, #6b6b6b);

  --serie-ferme: var(--color-background-success, #16a34a);
  --serie-planifie: var(--color-background-info, #3b82f6);
  --serie-suggere: var(--color-background-warning, #f59e0b);
  --serie-induit: color-mix(in oklab, var(--color-background-info, #3b82f6) 38%, transparent);
  --serie-reel: var(--color-text-primary, #1a1a1a);
  --serie-projete: color-mix(in oklab, var(--color-text-primary, #1a1a1a) 45%, transparent);
  --serie-capacite: color-mix(in oklab, var(--color-text-primary, #1a1a1a) 45%, transparent);
  --serie-tendance: var(--color-text-tertiary, #8a8a8a);
  --serie-neutre: color-mix(in oklab, var(--color-text-primary, #1a1a1a) 32%, transparent);
  --serie-encre: var(--color-background-info, #3b82f6);
  --serie-alerte: var(--color-background-danger, #dc2626);
  --serie-grille: color-mix(in oklab, var(--color-text-primary, #1a1a1a) 8%, transparent);
  --serie-piste: color-mix(in oklab, var(--color-text-primary, #1a1a1a) 8%, transparent);
}

.chart-tooltip {
  border-radius: var(--border-radius-sm, 6px);
  border: var(--border-width-regular, 1px) solid var(--color-border-primary, rgba(0,0,0,.12));
  background: var(--color-background-inverse, #1a1a1a);
  color: var(--color-text-inverse, #fff);
  box-shadow: var(--shadow-md, 0 2px 8px rgba(0,0,0,.2));
  padding: 5px 8px;
  font-size: var(--font-text-xs-size, 11px);
  line-height: 15px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
`
