// inertia-react/styles/astryx-airbnb-theme.ts
//
// Thème Astryx « Airbnb » — reproduction de la grammaire Airbnb
// (design/showcase/airbnb-grammar.html + inertia-react/styles/app.css
// bloc .theme-airbnb) via defineTheme().
//
// Spike Lot 0 (issue #90) — Q2 : defineTheme() reproduit-elle la
// grammaire Airbnb (Rausch, tokens métier, brand book, shadows) ?
//
// Contrainte de type : `tokens` est `Partial<Record<TokenName, TokenValue>>`
// — n'accepte QUE les noms Astryx (core + domain : color/radius/shadow/
// typography/textSize/fontWeight/typeScale/syntax/dataviz). Les tokens
// métier (--color-ferme etc.) sont refusés par TS ; ils sont déclarés
// dans le bloc [data-astryx-theme="airbnb"] de astryx.css (scope posé
// par le provider <Theme>).

import { defineTheme } from '@astryxdesign/core/theme'

/** [light, dark] — pas de dark mode Airbnb (DESIGN.md light-only),
 *  dark = miroir défensif identique au light. */
const light = (v: string): [string, string] => [v, v]

export const airbnbTheme = defineTheme({
  name: 'airbnb',
  tokens: {
    // ── Accent Rausch (#ff385c) — CTA marque ──
    '--color-accent': light('#ff385c'),
    '--color-accent-muted': light('rgba(255, 56, 92, 0.10)'),
    '--color-on-accent': light('#ffffff'),

    // ── Neutral / surfaces ──
    '--color-neutral': light('#6a6a6a'),
    '--color-background-surface': light('#ffffff'),
    '--color-background-body': light('#ffffff'),
    '--color-background-muted': light('#f2f2f2'),
    '--color-background-card': light('#ffffff'),
    '--color-background-popover': light('#ffffff'),
    '--color-background-inverted': light('#222222'),

    // ── Text ──
    '--color-text-primary': light('#222222'),
    '--color-text-secondary': light('#6a6a6a'),
    '--color-text-accent': light('#ff385c'),

    // ── Icons ──
    '--color-icon-accent': light('#ff385c'),
    '--color-icon-primary': light('#222222'),
    '--color-icon-secondary': light('#6a6a6a'),

    // ── Borders ──
    '--color-border': light('#dddddd'),
    '--color-border-emphasized': light('#c1c1c1'),

    // ── États sémantiques (≠ Rausch) ──
    '--color-error': light('#c13515'),
    '--color-on-error': light('#ffffff'),
    '--color-success': light('#008049'),
    '--color-on-success': light('#ffffff'),
    '--color-warning': light('#fc642d'),
    '--color-on-warning': light('#ffffff'),

    // ── Overlay (scrim) ──
    '--color-overlay': light('rgba(0, 0, 0, 0.5)'),

    // ── Radius ──
    '--radius-inner': '8px',
    '--radius-element': '8px',
    '--radius-container': '14px',
    '--radius-page': '14px',
    '--radius-chat': '9999px',

    // ── Shadows — grammaire Airbnb : 2 tiers max, jamais de 3e ──
    '--shadow-low': '0 6px 20px rgb(0 0 0 / 0.16)',
    '--shadow-med': '0 18px 50px rgb(0 0 0 / 0.24)',
    '--shadow-high': '0 18px 50px rgb(0 0 0 / 0.24)',
  },
})
