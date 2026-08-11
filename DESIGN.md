---
name: Supply Chain Board
description: Design system Cursor PRODUIT light — extrait :root complet (2026-08-11)
source: product-css-extract
extracted: '2026-08-11'
authority: product
file: cursor/product-tokens-light.css
colors:
  base: '#141414'
  chrome: '#f8f8f8'
  sidebar: '#f3f3f3'
  editor: '#fcfcfc'
  brand: '#f54e00'
  accent: '#2778c1'
  focus: '#2778c1'
  actionLabel: '#fcfcfc'
  success: '#007041'
  warn: '#a46700'
  danger: '#be1744'
  added: '#007041'
  modified: '#a46700'
  removed: '#be1744'
  untracked: '#176c74'
typography:
  sans: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
  mono: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace'
  weight-normal: 418
  weight-medium: 500
  weight-semibold: 600
  weight-bold: 700
  size-base: '13px'
rounded:
  xs: '2px'
  sm: '4px'
  base: '6px'
  lg: '8px'
  xl: '12px'
  '2xl': '14px'
  '3xl': '16px'
  full: '9999px'
---

# Design System: Supply Chain Board

**Autorité unique :** extrait `:root` produit Cursor light (collage navigateur 2026-08-11).  
**Fichier brut :** [`cursor/product-tokens-light.css`](cursor/product-tokens-light.css) — 865 propriétés.  
**Hors scope :** marketing getdesign, DESIGN éditoriaux tiers.

Runtime board : `.theme-cursor` (`inertia-react/styles/app.css`) mappe ces tokens sur shadcn.

---

## 1. Visual Theme & Atmosphere

Produit light dense. Trois plans opaques structurants :

| Plan              | Token                                        | Hex       |
| ----------------- | -------------------------------------------- | --------- |
| Sidebar           | `--sidebar` / `--bg-sidebar`                 | `#f3f3f3` |
| Chrome            | `--chrome` / `--bg-chrome`                   | `#f8f8f8` |
| Editor / elevated | `--editor` / `--bg-editor` / `--bg-elevated` | `#fcfcfc` |

Encre `--base` `#141414`. CTA filled `--bg-neutral` / `--cursor-button-background` `#141414` + `--actionLabel` `#fcfcfc`. Accent UI bleu `--accent` `#2778c1`. Marque `--brand` `#f54e00`. Typo UI 13px / weight 418. Radius 6–8px.

**Attention :** `--cursor-sidebar: #181818` coexiste dans l’extrait (valeur sombre) — **ne pas l’utiliser** pour le shell light ; prendre `--sidebar` / `--bg-sidebar` `#f3f3f3`.

**Cards :** `--cursor-bg-card` / `--bg-quaternary` = `color-mix(in oklab, #141414 6%, transparent)` (wash). Surfaces opaques type panneau : `--bg-elevated` / `--editor` `#fcfcfc` ou `--bg-quaternary-opaque` / `--bg-quaternary-opaque-elevated`.

---

## 2. Board mapping (Supply Chain)

### Card KPI — recipe DOM Cursor (pricing Pro+)

```html
<div
  class="rounded-[12px] bg-elevated shadow-[0_0_0_1px_var(--border-quaternary)] h-full p-4"
></div>
```

| Propriété | Classe / token                                                                         | Valeur                                |
| --------- | -------------------------------------------------------------------------------------- | ------------------------------------- |
| Radius    | `rounded-[12px]`                                                                       | `12px` (`--cursor-radius-xl`)         |
| Fond      | `bg-elevated`                                                                          | `#fcfcfc`                             |
| Filet     | `shadow-[0_0_0_1px_var(--border-quaternary)]`                                          | ring 1px via **shadow**, pas `border` |
| Padding   | `p-4`                                                                                  | `16px`                                |
| CTA       | `bg-neutral text-inverted hover:bg-neutral-hover h-7 rounded-md text-base font-medium` | `#141414` / `#fcfcfc`                 |

### DataTable — recipe CSS (markup TanStack inchangé)

Source : table API keys produit Cursor. Overrides sous `.theme-cursor table` uniquement — pas de remplacement du composant `DataTable` par un `<table>` ad hoc.

| Élément | Recipe Cursor | CSS board |
| ------- | ------------- | --------- |
| `thead tr` | `border-b border-quaternary` | filet mix base 4% |
| `th` | `px-4 py-3 text-xs font-normal text-tertiary` | padding 12×16, weight 400, tertiary |
| `th` trié | — | `aria-sort` → primary, weight 500 |
| `tbody tr` | `border-b border-quaternary last:border-b-0` | idem ; hover `bg-quaternary` (mix 6%) |
| `td` | `px-4 py-3` + `text-base text-secondary` | padding 12×16, 13px, secondary |
| Emphase cellule | `font-medium text-primary` | `.text-foreground` → `#141414` |

Dashboard : `theadRowClass="bg-transparent"`, `getRowClass={() => 'group/row'}` (pas de zebra / `border-t` Airbnb).

| Élément                | Token produit                                                 | Valeur                                          |
| ---------------------- | ------------------------------------------------------------- | ----------------------------------------------- |
| AppSidebar             | `--bg-sidebar`                                                | `#f3f3f3`                                       |
| Page / TopBar          | `--bg-chrome`                                                 | `#f8f8f8`                                       |
| Card KPI               | `--bg-elevated` + ring `--border-quaternary`                  | `#fcfcfc` + shadow 1px                          |
| Texte                  | `--text-primary` / `--base`                                   | `#141414`                                       |
| Texte secondaire       | `--text-secondary`                                            | `color-mix(in oklab, #141414 74%, transparent)` |
| Texte tertiaire        | `--text-tertiary`                                             | `color-mix(in oklab, #141414 60%, transparent)` |
| CTA filled             | `--cursor-button-background` + `--cursor-button-foreground`   | `#141414` / `#fcfcfc`                           |
| CTA hover              | `--cursor-button-hover-background`                            | `color-mix(in oklab, #f8f8f8 10%, #141414)`     |
| CTA secondary          | `--cursor-button-secondary-*`                                 | wash 8% / base                                  |
| Wordmark / alerte rare | `--brand`                                                     | `#f54e00`                                       |
| Focus / ring           | `--focus` / `--border-focus`                                  | `#2778c1` / mix 15%                             |
| Border défaut          | `--border-tertiary` / `--cursor-stroke-tertiary`              | mix base 8%                                     |
| Border fort            | `--border-primary`                                            | mix base 20%                                    |
| Item actif nav         | `--bg-active`                                                 | mix base 16%                                    |
| Hover chrome           | `--bg-tertiary`                                               | mix base 8%                                     |
| Success                | `--success`                                                   | `#007041`                                       |
| Warn                   | `--warn`                                                      | `#a46700`                                       |
| Danger                 | `--danger`                                                    | `#be1744`                                       |
| Radius bouton          | `--cursor-radius-base` / `rounded-md`                         | `6px`                                           |
| Radius card            | `rounded-[12px]` / `--cursor-radius-xl`                       | `12px`                                          |
| Ombre card/workbench   | `--cursor-box-shadow-workbench` / `--color-theme-shadow-card` | voir § shadows                                  |

---

## 3. Core primitives (hex solides)

| Token                   | Valeur    |
| ----------------------- | --------- |
| `--base`                | `#141414` |
| `--chrome`              | `#f8f8f8` |
| `--sidebar`             | `#f3f3f3` |
| `--editor`              | `#fcfcfc` |
| `--brand`               | `#f54e00` |
| `--accent`              | `#2778c1` |
| `--focus`               | `#2778c1` |
| `--actionLabel`         | `#fcfcfc` |
| `--success`             | `#007041` |
| `--warn`                | `#a46700` |
| `--danger`              | `#be1744` |
| `--added`               | `#007041` |
| `--modified`            | `#a46700` |
| `--removed`             | `#be1744` |
| `--untracked`           | `#176c74` |
| `--black`               | `#000`    |
| `--white`               | `#fff`    |
| `--blue`                | `#2778c1` |
| `--orange`              | `#cd4500` |
| `--yellow`              | `#a46700` |
| `--green`               | `#007041` |
| `--cyan`                | `#176c74` |
| `--red`                 | `#be1744` |
| `--magenta`             | `#92156a` |
| `--purple`              | `#7565cc` |
| `--bg-chrome`           | `#f8f8f8` |
| `--bg-sidebar`          | `#f3f3f3` |
| `--bg-editor`           | `#fcfcfc` |
| `--bg-elevated`         | `#fcfcfc` |
| `--bg-neutral`          | `#141414` |
| `--bg-brand`            | `#f54e00` |
| `--bg-accent`           | `#2778c1` |
| `--bg-success`          | `#007041` |
| `--bg-warn`             | `#a46700` |
| `--bg-danger`           | `#be1744` |
| `--bg-luminous`         | `#fff`    |
| `--bg-scrim`            | `#0006`   |
| `--bg-unified-elevated` | `#fcfcfc` |
| `--light-grey-wash`     | `#f5f5f5` |
| `--borders`             | `#ccc`    |

---

## 4. Text

| Token                           | Valeur                                          |
| ------------------------------- | ----------------------------------------------- |
| `--cursor-foreground`           | `#141414`                                       |
| `--cursor-text-invert`          | `#fcfcfc`                                       |
| `--cursor-text-link`            | `#2778c1`                                       |
| `--cursor-text-primary`         | `#141414`                                       |
| `--cursor-text-quaternary`      | `color-mix(in oklab, #141414 36%, transparent)` |
| `--cursor-text-secondary`       | `color-mix(in oklab, #141414 74%, transparent)` |
| `--cursor-text-tertiary`        | `color-mix(in oklab, #141414 60%, transparent)` |
| `--text-accent`                 | `#2778c1`                                       |
| `--text-accent-quaternary`      | `color-mix(in oklab, #2778c1 40%, transparent)` |
| `--text-accent-secondary`       | `color-mix(in oklab, #2778c1 78%, transparent)` |
| `--text-accent-tertiary`        | `color-mix(in oklab, #2778c1 64%, transparent)` |
| `--text-actionLabel`            | `#fcfcfc`                                       |
| `--text-actionLabel-quaternary` | `color-mix(in oklab, #fcfcfc 32%, transparent)` |
| `--text-actionLabel-secondary`  | `color-mix(in oklab, #fcfcfc 70%, transparent)` |
| `--text-actionLabel-tertiary`   | `color-mix(in oklab, #fcfcfc 48%, transparent)` |
| `--text-added`                  | `#007041`                                       |
| `--text-added-quaternary`       | `color-mix(in oklab, #007041 40%, transparent)` |
| `--text-added-secondary`        | `color-mix(in oklab, #007041 78%, transparent)` |
| `--text-added-tertiary`         | `color-mix(in oklab, #007041 64%, transparent)` |
| `--text-base`                   | `1rem`                                          |
| `--text-blue`                   | `#2778c1`                                       |
| `--text-blue-quaternary`        | `color-mix(in oklab, #2778c1 40%, transparent)` |
| `--text-blue-secondary`         | `color-mix(in oklab, #2778c1 78%, transparent)` |
| `--text-blue-tertiary`          | `color-mix(in oklab, #2778c1 64%, transparent)` |
| `--text-brand`                  | `#f54e00`                                       |
| `--text-brand-quaternary`       | `color-mix(in oklab, #f54e00 40%, transparent)` |
| `--text-brand-secondary`        | `color-mix(in oklab, #f54e00 78%, transparent)` |
| `--text-brand-tertiary`         | `color-mix(in oklab, #f54e00 64%, transparent)` |
| `--text-cyan`                   | `#176c74`                                       |
| `--text-cyan-quaternary`        | `color-mix(in oklab, #176c74 40%, transparent)` |
| `--text-cyan-secondary`         | `color-mix(in oklab, #176c74 78%, transparent)` |
| `--text-cyan-tertiary`          | `color-mix(in oklab, #176c74 64%, transparent)` |
| `--text-danger`                 | `#be1744`                                       |
| `--text-danger-quaternary`      | `color-mix(in oklab, #be1744 40%, transparent)` |
| `--text-danger-secondary`       | `color-mix(in oklab, #be1744 78%, transparent)` |
| `--text-danger-tertiary`        | `color-mix(in oklab, #be1744 64%, transparent)` |
| `--text-gray-100`               | `#e6e6e6`                                       |
| `--text-gray-200`               | `#ccc`                                          |
| `--text-gray-300`               | `#b3b3b3`                                       |
| `--text-gray-400`               | `#999`                                          |
| `--text-gray-500`               | `#888`                                          |
| `--text-gray-600`               | `#666`                                          |
| `--text-gray-700`               | `#4d4d4d`                                       |
| `--text-gray-800`               | `#333`                                          |
| `--text-gray-900`               | `#1a1a1a`                                       |
| `--text-green`                  | `#007041`                                       |
| `--text-green-quaternary`       | `color-mix(in oklab, #007041 40%, transparent)` |
| `--text-green-secondary`        | `color-mix(in oklab, #007041 78%, transparent)` |
| `--text-green-tertiary`         | `color-mix(in oklab, #007041 64%, transparent)` |
| `--text-inverted`               | `#fcfcfc`                                       |
| `--text-inverted-quaternary`    | `color-mix(in oklab, #fcfcfc 32%, transparent)` |
| `--text-inverted-secondary`     | `color-mix(in oklab, #fcfcfc 70%, transparent)` |
| `--text-inverted-tertiary`      | `color-mix(in oklab, #fcfcfc 48%, transparent)` |
| `--text-lg`                     | `2.25rem`                                       |
| `--text-luminous`               | `#fff`                                          |
| `--text-luminous-quaternary`    | `#ffffff52`                                     |
| `--text-luminous-secondary`     | `#ffffffb3`                                     |
| `--text-luminous-tertiary`      | `#ffffff7a`                                     |
| `--text-magenta`                | `#92156a`                                       |
| `--text-magenta-quaternary`     | `color-mix(in oklab, #92156a 40%, transparent)` |
| `--text-magenta-secondary`      | `color-mix(in oklab, #92156a 78%, transparent)` |
| `--text-magenta-tertiary`       | `color-mix(in oklab, #92156a 64%, transparent)` |
| `--text-md`                     | `1.375rem`                                      |
| `--text-orange`                 | `#cd4500`                                       |
| `--text-orange-quaternary`      | `color-mix(in oklab, #cd4500 40%, transparent)` |
| `--text-orange-secondary`       | `color-mix(in oklab, #cd4500 78%, transparent)` |
| `--text-orange-tertiary`        | `color-mix(in oklab, #cd4500 64%, transparent)` |
| `--text-primary`                | `#141414`                                       |
| `--text-purple`                 | `#7565cc`                                       |
| `--text-purple-quaternary`      | `color-mix(in oklab, #7565cc 40%, transparent)` |
| `--text-purple-secondary`       | `color-mix(in oklab, #7565cc 78%, transparent)` |
| `--text-purple-tertiary`        | `color-mix(in oklab, #7565cc 64%, transparent)` |
| `--text-quaternary`             | `color-mix(in oklab, #141414 36%, transparent)` |
| `--text-red`                    | `#be1744`                                       |
| `--text-red-quaternary`         | `color-mix(in oklab, #be1744 40%, transparent)` |
| `--text-red-secondary`          | `color-mix(in oklab, #be1744 78%, transparent)` |
| `--text-red-tertiary`           | `color-mix(in oklab, #be1744 64%, transparent)` |
| `--text-removed`                | `#be1744`                                       |
| `--text-removed-quaternary`     | `color-mix(in oklab, #be1744 40%, transparent)` |
| `--text-removed-secondary`      | `color-mix(in oklab, #be1744 78%, transparent)` |
| `--text-removed-tertiary`       | `color-mix(in oklab, #be1744 64%, transparent)` |
| `--text-secondary`              | `color-mix(in oklab, #141414 74%, transparent)` |
| `--text-success`                | `#007041`                                       |
| `--text-success-quaternary`     | `color-mix(in oklab, #007041 40%, transparent)` |
| `--text-success-secondary`      | `color-mix(in oklab, #007041 78%, transparent)` |
| `--text-success-tertiary`       | `color-mix(in oklab, #007041 64%, transparent)` |
| `--text-tertiary`               | `color-mix(in oklab, #141414 60%, transparent)` |
| `--text-warn`                   | `#a46700`                                       |
| `--text-warn-quaternary`        | `color-mix(in oklab, #a46700 40%, transparent)` |
| `--text-warn-secondary`         | `color-mix(in oklab, #a46700 78%, transparent)` |
| `--text-warn-tertiary`          | `color-mix(in oklab, #a46700 64%, transparent)` |
| `--text-xl`                     | `3.25rem`                                       |
| `--text-xs`                     | `.75rem`                                        |
| `--text-yellow`                 | `#a46700`                                       |
| `--text-yellow-quaternary`      | `color-mix(in oklab, #a46700 40%, transparent)` |
| `--text-yellow-secondary`       | `color-mix(in oklab, #a46700 78%, transparent)` |
| `--text-yellow-tertiary`        | `color-mix(in oklab, #a46700 64%, transparent)` |

---

## 5. Icon

| Token                                    | Valeur                                          |
| ---------------------------------------- | ----------------------------------------------- |
| `--cursor-icon-accent-primary`           | `#2778c1`                                       |
| `--cursor-icon-accent-secondary`         | `color-mix(in oklab, #2778c1 70%, transparent)` |
| `--cursor-icon-blue-primary`             | `#2778c1`                                       |
| `--cursor-icon-blue-secondary`           | `color-mix(in srgb, #2778c1 70%, transparent)`  |
| `--cursor-icon-cyan-primary`             | `#176c74`                                       |
| `--cursor-icon-cyan-secondary`           | `color-mix(in oklab, #176c74 70%, transparent)` |
| `--cursor-icon-git-added-primary`        | `#007041`                                       |
| `--cursor-icon-git-added-quaternary`     | `color-mix(in srgb, #007041 32%, transparent)`  |
| `--cursor-icon-git-added-secondary`      | `color-mix(in srgb, #007041 70%, transparent)`  |
| `--cursor-icon-git-added-tertiary`       | `color-mix(in srgb, #007041 56%, transparent)`  |
| `--cursor-icon-git-modified-primary`     | `#a46700`                                       |
| `--cursor-icon-git-modified-quaternary`  | `color-mix(in srgb, #a46700 32%, transparent)`  |
| `--cursor-icon-git-modified-secondary`   | `color-mix(in srgb, #a46700 70%, transparent)`  |
| `--cursor-icon-git-modified-tertiary`    | `color-mix(in srgb, #a46700 56%, transparent)`  |
| `--cursor-icon-git-removed-primary`      | `#be1744`                                       |
| `--cursor-icon-git-removed-quaternary`   | `color-mix(in srgb, #be1744 32%, transparent)`  |
| `--cursor-icon-git-removed-secondary`    | `color-mix(in srgb, #be1744 70%, transparent)`  |
| `--cursor-icon-git-removed-tertiary`     | `color-mix(in srgb, #be1744 56%, transparent)`  |
| `--cursor-icon-git-untracked-primary`    | `#176c74`                                       |
| `--cursor-icon-git-untracked-quaternary` | `color-mix(in srgb, #176c74 32%, transparent)`  |
| `--cursor-icon-git-untracked-secondary`  | `color-mix(in srgb, #176c74 70%, transparent)`  |
| `--cursor-icon-git-untracked-tertiary`   | `color-mix(in srgb, #176c74 56%, transparent)`  |
| `--cursor-icon-green-primary`            | `#007041`                                       |
| `--cursor-icon-green-secondary`          | `color-mix(in oklab, #007041 70%, transparent)` |
| `--cursor-icon-magenta-primary`          | `#92156a`                                       |
| `--cursor-icon-magenta-secondary`        | `color-mix(in oklab, #92156a 70%, transparent)` |
| `--cursor-icon-orange-primary`           | `#cd4500`                                       |
| `--cursor-icon-orange-secondary`         | `color-mix(in oklab, #cd4500 70%, transparent)` |
| `--cursor-icon-primary`                  | `#141414`                                       |
| `--cursor-icon-purple-primary`           | `#7565cc`                                       |
| `--cursor-icon-purple-secondary`         | `color-mix(in oklab, #7565cc 70%, transparent)` |
| `--cursor-icon-quaternary`               | `color-mix(in oklab, #141414 28%, transparent)` |
| `--cursor-icon-red-primary`              | `#be1744`                                       |
| `--cursor-icon-red-secondary`            | `color-mix(in oklab, #be1744 70%, transparent)` |
| `--cursor-icon-secondary`                | `color-mix(in oklab, #141414 66%, transparent)` |
| `--cursor-icon-tertiary`                 | `color-mix(in oklab, #141414 52%, transparent)` |
| `--cursor-icon-yellow-primary`           | `#a46700`                                       |
| `--cursor-icon-yellow-secondary`         | `color-mix(in oklab, #a46700 70%, transparent)` |
| `--icon-accent`                          | `#2778c1`                                       |
| `--icon-accent-quaternary`               | `color-mix(in oklab, #2778c1 32%, transparent)` |
| `--icon-accent-secondary`                | `color-mix(in oklab, #2778c1 70%, transparent)` |
| `--icon-accent-tertiary`                 | `color-mix(in oklab, #2778c1 56%, transparent)` |
| `--icon-actionLabel`                     | `#fcfcfc`                                       |
| `--icon-actionLabel-quaternary`          | `color-mix(in oklab, #fcfcfc 24%, transparent)` |
| `--icon-actionLabel-secondary`           | `color-mix(in oklab, #fcfcfc 62%, transparent)` |
| `--icon-actionLabel-tertiary`            | `color-mix(in oklab, #fcfcfc 40%, transparent)` |
| `--icon-blue`                            | `#2778c1`                                       |
| `--icon-blue-quaternary`                 | `color-mix(in oklab, #2778c1 32%, transparent)` |
| `--icon-blue-secondary`                  | `color-mix(in oklab, #2778c1 70%, transparent)` |
| `--icon-blue-tertiary`                   | `color-mix(in oklab, #2778c1 56%, transparent)` |
| `--icon-brand`                           | `#f54e00`                                       |
| `--icon-brand-quaternary`                | `color-mix(in oklab, #f54e00 32%, transparent)` |
| `--icon-brand-secondary`                 | `color-mix(in oklab, #f54e00 70%, transparent)` |
| `--icon-brand-tertiary`                  | `color-mix(in oklab, #f54e00 56%, transparent)` |
| `--icon-cyan`                            | `#176c74`                                       |
| `--icon-cyan-quaternary`                 | `color-mix(in oklab, #176c74 32%, transparent)` |
| `--icon-cyan-secondary`                  | `color-mix(in oklab, #176c74 70%, transparent)` |
| `--icon-cyan-tertiary`                   | `color-mix(in oklab, #176c74 56%, transparent)` |
| `--icon-danger`                          | `#be1744`                                       |
| `--icon-danger-quaternary`               | `color-mix(in oklab, #be1744 32%, transparent)` |
| `--icon-danger-secondary`                | `color-mix(in oklab, #be1744 70%, transparent)` |
| `--icon-danger-tertiary`                 | `color-mix(in oklab, #be1744 56%, transparent)` |
| `--icon-green`                           | `#007041`                                       |
| `--icon-green-quaternary`                | `color-mix(in oklab, #007041 32%, transparent)` |
| `--icon-green-secondary`                 | `color-mix(in oklab, #007041 70%, transparent)` |
| `--icon-green-tertiary`                  | `color-mix(in oklab, #007041 56%, transparent)` |
| `--icon-inverted`                        | `#fcfcfc`                                       |
| `--icon-inverted-quaternary`             | `color-mix(in oklab, #fcfcfc 24%, transparent)` |
| `--icon-inverted-secondary`              | `color-mix(in oklab, #fcfcfc 62%, transparent)` |
| `--icon-inverted-tertiary`               | `color-mix(in oklab, #fcfcfc 40%, transparent)` |
| `--icon-luminous`                        | `#fff`                                          |
| `--icon-luminous-quaternary`             | `#ffffff3d`                                     |
| `--icon-luminous-secondary`              | `#ffffff9e`                                     |
| `--icon-luminous-tertiary`               | `#fff6`                                         |
| `--icon-magenta`                         | `#92156a`                                       |
| `--icon-magenta-quaternary`              | `color-mix(in oklab, #92156a 32%, transparent)` |
| `--icon-magenta-secondary`               | `color-mix(in oklab, #92156a 70%, transparent)` |
| `--icon-magenta-tertiary`                | `color-mix(in oklab, #92156a 56%, transparent)` |
| `--icon-orange`                          | `#cd4500`                                       |
| `--icon-orange-quaternary`               | `color-mix(in oklab, #cd4500 32%, transparent)` |
| `--icon-orange-secondary`                | `color-mix(in oklab, #cd4500 70%, transparent)` |
| `--icon-orange-tertiary`                 | `color-mix(in oklab, #cd4500 56%, transparent)` |
| `--icon-primary`                         | `#141414`                                       |
| `--icon-purple`                          | `#7565cc`                                       |
| `--icon-purple-quaternary`               | `color-mix(in oklab, #7565cc 32%, transparent)` |
| `--icon-purple-secondary`                | `color-mix(in oklab, #7565cc 70%, transparent)` |
| `--icon-purple-tertiary`                 | `color-mix(in oklab, #7565cc 56%, transparent)` |
| `--icon-quaternary`                      | `color-mix(in oklab, #141414 28%, transparent)` |
| `--icon-red`                             | `#be1744`                                       |
| `--icon-red-quaternary`                  | `color-mix(in oklab, #be1744 32%, transparent)` |
| `--icon-red-secondary`                   | `color-mix(in oklab, #be1744 70%, transparent)` |
| `--icon-red-tertiary`                    | `color-mix(in oklab, #be1744 56%, transparent)` |
| `--icon-secondary`                       | `color-mix(in oklab, #141414 66%, transparent)` |
| `--icon-success`                         | `#007041`                                       |
| `--icon-success-quaternary`              | `color-mix(in oklab, #007041 32%, transparent)` |
| `--icon-success-secondary`               | `color-mix(in oklab, #007041 70%, transparent)` |
| `--icon-success-tertiary`                | `color-mix(in oklab, #007041 56%, transparent)` |
| `--icon-tertiary`                        | `color-mix(in oklab, #141414 52%, transparent)` |
| `--icon-warn`                            | `#a46700`                                       |
| `--icon-warn-quaternary`                 | `color-mix(in oklab, #a46700 32%, transparent)` |
| `--icon-warn-secondary`                  | `color-mix(in oklab, #a46700 70%, transparent)` |
| `--icon-warn-tertiary`                   | `color-mix(in oklab, #a46700 56%, transparent)` |
| `--icon-yellow`                          | `#a46700`                                       |
| `--icon-yellow-quaternary`               | `color-mix(in oklab, #a46700 32%, transparent)` |
| `--icon-yellow-secondary`                | `color-mix(in oklab, #a46700 70%, transparent)` |
| `--icon-yellow-tertiary`                 | `color-mix(in oklab, #a46700 56%, transparent)` |

---

## 6. Background (`--bg-*` + `--cursor-bg-*`)

| Token                                  | Valeur                                          |
| -------------------------------------- | ----------------------------------------------- |
| `--bg-accent`                          | `#2778c1`                                       |
| `--bg-accent-hover`                    | `color-mix(in oklab, #141414 10%, #2778c1)`     |
| `--bg-accent-quaternary`               | `color-mix(in oklab, #2778c1 8%, transparent)`  |
| `--bg-accent-secondary`                | `color-mix(in oklab, #2778c1 24%, transparent)` |
| `--bg-accent-tertiary`                 | `color-mix(in oklab, #2778c1 12%, transparent)` |
| `--bg-active`                          | `color-mix(in oklab, #141414 16%, transparent)` |
| `--bg-added`                           | `color-mix(in oklab, #007041 92%, transparent)` |
| `--bg-added-quaternary`                | `color-mix(in oklab, #007041 8%, transparent)`  |
| `--bg-added-secondary`                 | `color-mix(in oklab, #007041 24%, transparent)` |
| `--bg-added-tertiary`                  | `color-mix(in oklab, #007041 12%, transparent)` |
| `--bg-blue`                            | `color-mix(in oklab, #2778c1 92%, transparent)` |
| `--bg-blue-quaternary`                 | `color-mix(in oklab, #2778c1 8%, transparent)`  |
| `--bg-blue-secondary`                  | `color-mix(in oklab, #2778c1 24%, transparent)` |
| `--bg-blue-tertiary`                   | `color-mix(in oklab, #2778c1 12%, transparent)` |
| `--bg-brand`                           | `#f54e00`                                       |
| `--bg-brand-hover`                     | `color-mix(in oklab, #141414 10%, #f54e00)`     |
| `--bg-brand-quaternary`                | `color-mix(in oklab, #f54e00 8%, transparent)`  |
| `--bg-brand-secondary`                 | `color-mix(in oklab, #f54e00 24%, transparent)` |
| `--bg-brand-tertiary`                  | `color-mix(in oklab, #f54e00 12%, transparent)` |
| `--bg-chrome`                          | `#f8f8f8`                                       |
| `--bg-cyan`                            | `color-mix(in oklab, #176c74 92%, transparent)` |
| `--bg-cyan-quaternary`                 | `color-mix(in oklab, #176c74 8%, transparent)`  |
| `--bg-cyan-secondary`                  | `color-mix(in oklab, #176c74 24%, transparent)` |
| `--bg-cyan-tertiary`                   | `color-mix(in oklab, #176c74 12%, transparent)` |
| `--bg-danger`                          | `#be1744`                                       |
| `--bg-danger-hover`                    | `color-mix(in oklab, #141414 10%, #be1744)`     |
| `--bg-danger-quaternary`               | `color-mix(in oklab, #be1744 8%, transparent)`  |
| `--bg-danger-secondary`                | `color-mix(in oklab, #be1744 24%, transparent)` |
| `--bg-danger-tertiary`                 | `color-mix(in oklab, #be1744 12%, transparent)` |
| `--bg-editor`                          | `#fcfcfc`                                       |
| `--bg-elevated`                        | `#fcfcfc`                                       |
| `--bg-focused`                         | `color-mix(in oklab, #141414 22%, transparent)` |
| `--bg-green`                           | `color-mix(in oklab, #007041 92%, transparent)` |
| `--bg-green-quaternary`                | `color-mix(in oklab, #007041 8%, transparent)`  |
| `--bg-green-secondary`                 | `color-mix(in oklab, #007041 24%, transparent)` |
| `--bg-green-tertiary`                  | `color-mix(in oklab, #007041 12%, transparent)` |
| `--bg-luminous`                        | `#fff`                                          |
| `--bg-luminous-quaternary`             | `#ffffff0a`                                     |
| `--bg-luminous-secondary`              | `#fff3`                                         |
| `--bg-luminous-tertiary`               | `#ffffff14`                                     |
| `--bg-magenta`                         | `color-mix(in oklab, #92156a 92%, transparent)` |
| `--bg-magenta-quaternary`              | `color-mix(in oklab, #92156a 8%, transparent)`  |
| `--bg-magenta-secondary`               | `color-mix(in oklab, #92156a 24%, transparent)` |
| `--bg-magenta-tertiary`                | `color-mix(in oklab, #92156a 12%, transparent)` |
| `--bg-neutral`                         | `#141414`                                       |
| `--bg-neutral-hover`                   | `color-mix(in oklab, #f8f8f8 10%, #141414)`     |
| `--bg-neutral-secondary`               | `color-mix(in oklab, #141414 24%, transparent)` |
| `--bg-orange`                          | `color-mix(in oklab, #cd4500 92%, transparent)` |
| `--bg-orange-quaternary`               | `color-mix(in oklab, #cd4500 8%, transparent)`  |
| `--bg-orange-secondary`                | `color-mix(in oklab, #cd4500 24%, transparent)` |
| `--bg-orange-tertiary`                 | `color-mix(in oklab, #cd4500 12%, transparent)` |
| `--bg-primary`                         | `color-mix(in oklab, #141414 20%, transparent)` |
| `--bg-primary-opaque`                  | `color-mix(in oklab, #141414 20%, #f8f8f8)`     |
| `--bg-purple`                          | `color-mix(in oklab, #7565cc 92%, transparent)` |
| `--bg-purple-quaternary`               | `color-mix(in oklab, #7565cc 8%, transparent)`  |
| `--bg-purple-secondary`                | `color-mix(in oklab, #7565cc 24%, transparent)` |
| `--bg-purple-tertiary`                 | `color-mix(in oklab, #7565cc 12%, transparent)` |
| `--bg-quaternary`                      | `color-mix(in oklab, #141414 6%, transparent)`  |
| `--bg-quaternary-opaque`               | `color-mix(in oklab, #141414 6%, #f8f8f8)`      |
| `--bg-quaternary-opaque-elevated`      | `color-mix(in oklab, #141414 6%, #fcfcfc)`      |
| `--bg-quinary`                         | `color-mix(in oklab, #141414 4%, transparent)`  |
| `--bg-quinary-opaque`                  | `color-mix(in oklab, #141414 4%, #f8f8f8)`      |
| `--bg-red`                             | `color-mix(in oklab, #be1744 92%, transparent)` |
| `--bg-red-quaternary`                  | `color-mix(in oklab, #be1744 8%, transparent)`  |
| `--bg-red-secondary`                   | `color-mix(in oklab, #be1744 24%, transparent)` |
| `--bg-red-tertiary`                    | `color-mix(in oklab, #be1744 12%, transparent)` |
| `--bg-removed`                         | `color-mix(in oklab, #be1744 92%, transparent)` |
| `--bg-removed-quaternary`              | `color-mix(in oklab, #be1744 8%, transparent)`  |
| `--bg-removed-secondary`               | `color-mix(in oklab, #be1744 24%, transparent)` |
| `--bg-removed-tertiary`                | `color-mix(in oklab, #be1744 12%, transparent)` |
| `--bg-scrim`                           | `#0006`                                         |
| `--bg-secondary`                       | `color-mix(in oklab, #141414 14%, transparent)` |
| `--bg-secondary-opaque`                | `color-mix(in oklab, #141414 14%, #f8f8f8)`     |
| `--bg-sidebar`                         | `#f3f3f3`                                       |
| `--bg-success`                         | `#007041`                                       |
| `--bg-success-hover`                   | `color-mix(in oklab, #141414 10%, #007041)`     |
| `--bg-success-quaternary`              | `color-mix(in oklab, #007041 8%, transparent)`  |
| `--bg-success-secondary`               | `color-mix(in oklab, #007041 24%, transparent)` |
| `--bg-success-tertiary`                | `color-mix(in oklab, #007041 12%, transparent)` |
| `--bg-tertiary`                        | `color-mix(in oklab, #141414 8%, transparent)`  |
| `--bg-tertiary-opaque`                 | `color-mix(in oklab, #141414 8%, #f8f8f8)`      |
| `--bg-unified-elevated`                | `#fcfcfc`                                       |
| `--bg-warn`                            | `#a46700`                                       |
| `--bg-warn-hover`                      | `color-mix(in oklab, #141414 10%, #a46700)`     |
| `--bg-warn-quaternary`                 | `color-mix(in oklab, #a46700 8%, transparent)`  |
| `--bg-warn-secondary`                  | `color-mix(in oklab, #a46700 24%, transparent)` |
| `--bg-warn-tertiary`                   | `color-mix(in oklab, #a46700 12%, transparent)` |
| `--bg-yellow`                          | `color-mix(in oklab, #a46700 92%, transparent)` |
| `--bg-yellow-quaternary`               | `color-mix(in oklab, #a46700 8%, transparent)`  |
| `--bg-yellow-secondary`                | `color-mix(in oklab, #a46700 24%, transparent)` |
| `--bg-yellow-tertiary`                 | `color-mix(in oklab, #a46700 12%, transparent)` |
| `--cursor-bg-accent`                   | `#2778c1`                                       |
| `--cursor-bg-accent-hover`             | `color-mix(in oklab, #141414 10%, #2778c1)`     |
| `--cursor-bg-accent-quaternary`        | `color-mix(in srgb, #2778c1 8%, transparent)`   |
| `--cursor-bg-accent-secondary`         | `color-mix(in srgb, #2778c1 24%, transparent)`  |
| `--cursor-bg-accent-tertiary`          | `color-mix(in srgb, #2778c1 12%, transparent)`  |
| `--cursor-bg-active`                   | `color-mix(in oklab, #141414 16%, transparent)` |
| `--cursor-bg-blue-primary`             | `#2778c1`                                       |
| `--cursor-bg-blue-secondary`           | `color-mix(in srgb, #2778c1 12%, transparent)`  |
| `--cursor-bg-card`                     | `color-mix(in oklab, #141414 6%, transparent)`  |
| `--cursor-bg-chrome`                   | `#f8f8f8`                                       |
| `--cursor-bg-cyan-primary`             | `#176c74`                                       |
| `--cursor-bg-cyan-secondary`           | `color-mix(in oklab, #176c74 12%, transparent)` |
| `--cursor-bg-diff-inserted`            | `#00af6624`                                     |
| `--cursor-bg-diff-removed`             | `#ff617b38`                                     |
| `--cursor-bg-editor`                   | `#fcfcfc`                                       |
| `--cursor-bg-elevated`                 | `#fcfcfc`                                       |
| `--cursor-bg-focused`                  | `color-mix(in oklab, #141414 22%, transparent)` |
| `--cursor-bg-git-added-hover`          | `color-mix(in srgb, #141414 10%, #007041)`      |
| `--cursor-bg-git-added-primary`        | `#007041`                                       |
| `--cursor-bg-git-added-quaternary`     | `color-mix(in srgb, #007041 8%, transparent)`   |
| `--cursor-bg-git-added-secondary`      | `color-mix(in srgb, #007041 24%, transparent)`  |
| `--cursor-bg-git-added-tertiary`       | `color-mix(in srgb, #007041 12%, transparent)`  |
| `--cursor-bg-git-modified-hover`       | `color-mix(in srgb, #141414 10%, #a46700)`      |
| `--cursor-bg-git-modified-primary`     | `#a46700`                                       |
| `--cursor-bg-git-modified-quaternary`  | `color-mix(in srgb, #a46700 8%, transparent)`   |
| `--cursor-bg-git-modified-secondary`   | `color-mix(in srgb, #a46700 24%, transparent)`  |
| `--cursor-bg-git-modified-tertiary`    | `color-mix(in srgb, #a46700 12%, transparent)`  |
| `--cursor-bg-git-removed-hover`        | `color-mix(in srgb, #141414 10%, #be1744)`      |
| `--cursor-bg-git-removed-primary`      | `#be1744`                                       |
| `--cursor-bg-git-removed-quaternary`   | `color-mix(in srgb, #be1744 8%, transparent)`   |
| `--cursor-bg-git-removed-secondary`    | `color-mix(in srgb, #be1744 24%, transparent)`  |
| `--cursor-bg-git-removed-tertiary`     | `color-mix(in srgb, #be1744 12%, transparent)`  |
| `--cursor-bg-git-untracked-hover`      | `color-mix(in srgb, #141414 10%, #176c74)`      |
| `--cursor-bg-git-untracked-primary`    | `#176c74`                                       |
| `--cursor-bg-git-untracked-quaternary` | `color-mix(in srgb, #176c74 8%, transparent)`   |
| `--cursor-bg-git-untracked-secondary`  | `color-mix(in srgb, #176c74 24%, transparent)`  |
| `--cursor-bg-git-untracked-tertiary`   | `color-mix(in srgb, #176c74 12%, transparent)`  |
| `--cursor-bg-green-primary`            | `#007041`                                       |
| `--cursor-bg-green-secondary`          | `color-mix(in oklab, #007041 12%, transparent)` |
| `--cursor-bg-input`                    | `#fcfcfc`                                       |
| `--cursor-bg-input-surface`            | `color-mix(in oklab, #141414 6%, transparent)`  |
| `--cursor-bg-magenta-primary`          | `#92156a`                                       |
| `--cursor-bg-magenta-secondary`        | `color-mix(in oklab, #92156a 12%, transparent)` |
| `--cursor-bg-orange-primary`           | `#cd4500`                                       |
| `--cursor-bg-orange-secondary`         | `color-mix(in oklab, #cd4500 12%, transparent)` |
| `--cursor-bg-primary`                  | `color-mix(in oklab, #141414 20%, transparent)` |
| `--cursor-bg-purple-primary`           | `#7565cc`                                       |
| `--cursor-bg-purple-secondary`         | `color-mix(in oklab, #7565cc 12%, transparent)` |
| `--cursor-bg-purple-tertiary`          | `color-mix(in oklab, #7565cc 8%, transparent)`  |
| `--cursor-bg-quaternary`               | `color-mix(in oklab, #141414 6%, transparent)`  |
| `--cursor-bg-quinary`                  | `color-mix(in oklab, #141414 4%, transparent)`  |
| `--cursor-bg-red-primary`              | `#be1744`                                       |
| `--cursor-bg-red-secondary`            | `color-mix(in oklab, #be1744 12%, transparent)` |
| `--cursor-bg-secondary`                | `color-mix(in oklab, #141414 14%, transparent)` |
| `--cursor-bg-sidebar`                  | `#f3f3f3`                                       |
| `--cursor-bg-tertiary`                 | `color-mix(in oklab, #141414 8%, transparent)`  |
| `--cursor-bg-yellow-primary`           | `#a46700`                                       |
| `--cursor-bg-yellow-secondary`         | `color-mix(in oklab, #a46700 12%, transparent)` |

---

## 7. Border / stroke

| Token                               | Valeur                                                                            |
| ----------------------------------- | --------------------------------------------------------------------------------- |
| `--border-accent`                   | `color-mix(in oklab, #2778c1 92%, transparent)`                                   |
| `--border-accent-quaternary`        | `color-mix(in oklab, #2778c1 28%, transparent)`                                   |
| `--border-accent-secondary`         | `color-mix(in oklab, #2778c1 56%, transparent)`                                   |
| `--border-accent-tertiary`          | `color-mix(in oklab, #2778c1 32%, transparent)`                                   |
| `--border-added`                    | `color-mix(in oklab, #007041 92%, transparent)`                                   |
| `--border-added-quaternary`         | `color-mix(in oklab, #007041 28%, transparent)`                                   |
| `--border-added-secondary`          | `color-mix(in oklab, #007041 56%, transparent)`                                   |
| `--border-added-tertiary`           | `color-mix(in oklab, #007041 32%, transparent)`                                   |
| `--border-blue`                     | `color-mix(in oklab, #2778c1 92%, transparent)`                                   |
| `--border-blue-quaternary`          | `color-mix(in oklab, #2778c1 28%, transparent)`                                   |
| `--border-blue-secondary`           | `color-mix(in oklab, #2778c1 56%, transparent)`                                   |
| `--border-blue-tertiary`            | `color-mix(in oklab, #2778c1 32%, transparent)`                                   |
| `--border-brand`                    | `color-mix(in oklab, #f54e00 92%, transparent)`                                   |
| `--border-brand-quaternary`         | `color-mix(in oklab, #f54e00 28%, transparent)`                                   |
| `--border-brand-secondary`          | `color-mix(in oklab, #f54e00 56%, transparent)`                                   |
| `--border-brand-tertiary`           | `color-mix(in oklab, #f54e00 32%, transparent)`                                   |
| `--border-cyan`                     | `color-mix(in oklab, #176c74 92%, transparent)`                                   |
| `--border-cyan-quaternary`          | `color-mix(in oklab, #176c74 28%, transparent)`                                   |
| `--border-cyan-secondary`           | `color-mix(in oklab, #176c74 56%, transparent)`                                   |
| `--border-cyan-tertiary`            | `color-mix(in oklab, #176c74 32%, transparent)`                                   |
| `--border-danger`                   | `color-mix(in oklab, #be1744 92%, transparent)`                                   |
| `--border-danger-quaternary`        | `color-mix(in oklab, #be1744 28%, transparent)`                                   |
| `--border-danger-secondary`         | `color-mix(in oklab, #be1744 56%, transparent)`                                   |
| `--border-danger-tertiary`          | `color-mix(in oklab, #be1744 32%, transparent)`                                   |
| `--border-focus`                    | `color-mix(in oklab, #2778c1 15%, transparent)`                                   |
| `--border-green`                    | `color-mix(in oklab, #007041 92%, transparent)`                                   |
| `--border-green-quaternary`         | `color-mix(in oklab, #007041 28%, transparent)`                                   |
| `--border-green-secondary`          | `color-mix(in oklab, #007041 56%, transparent)`                                   |
| `--border-green-tertiary`           | `color-mix(in oklab, #007041 32%, transparent)`                                   |
| `--border-magenta`                  | `color-mix(in oklab, #92156a 92%, transparent)`                                   |
| `--border-magenta-quaternary`       | `color-mix(in oklab, #92156a 28%, transparent)`                                   |
| `--border-magenta-secondary`        | `color-mix(in oklab, #92156a 56%, transparent)`                                   |
| `--border-magenta-tertiary`         | `color-mix(in oklab, #92156a 32%, transparent)`                                   |
| `--border-neutral`                  | `color-mix(in oklab, #141414 80%, transparent)`                                   |
| `--border-orange`                   | `color-mix(in oklab, #cd4500 92%, transparent)`                                   |
| `--border-orange-quaternary`        | `color-mix(in oklab, #cd4500 28%, transparent)`                                   |
| `--border-orange-secondary`         | `color-mix(in oklab, #cd4500 56%, transparent)`                                   |
| `--border-orange-tertiary`          | `color-mix(in oklab, #cd4500 32%, transparent)`                                   |
| `--border-primary`                  | `color-mix(in oklab, #141414 20%, transparent)`                                   |
| `--border-purple`                   | `color-mix(in oklab, #7565cc 92%, transparent)`                                   |
| `--border-purple-quaternary`        | `color-mix(in oklab, #7565cc 28%, transparent)`                                   |
| `--border-purple-secondary`         | `color-mix(in oklab, #7565cc 56%, transparent)`                                   |
| `--border-purple-tertiary`          | `color-mix(in oklab, #7565cc 32%, transparent)`                                   |
| `--border-quaternary`               | `color-mix(in oklab, #141414 4%, transparent)`                                    |
| `--border-quaternary-opaque`        | `color-mix(in oklab, color-mix(in oklab, #141414 4%, transparent) 100%, #fcfcfc)` |
| `--border-red`                      | `color-mix(in oklab, #be1744 92%, transparent)`                                   |
| `--border-red-quaternary`           | `color-mix(in oklab, #be1744 28%, transparent)`                                   |
| `--border-red-secondary`            | `color-mix(in oklab, #be1744 56%, transparent)`                                   |
| `--border-red-tertiary`             | `color-mix(in oklab, #be1744 32%, transparent)`                                   |
| `--border-removed`                  | `color-mix(in oklab, #be1744 92%, transparent)`                                   |
| `--border-removed-quaternary`       | `color-mix(in oklab, #be1744 28%, transparent)`                                   |
| `--border-removed-secondary`        | `color-mix(in oklab, #be1744 56%, transparent)`                                   |
| `--border-removed-tertiary`         | `color-mix(in oklab, #be1744 32%, transparent)`                                   |
| `--border-secondary`                | `color-mix(in oklab, #141414 12%, transparent)`                                   |
| `--border-success`                  | `color-mix(in oklab, #007041 92%, transparent)`                                   |
| `--border-success-quaternary`       | `color-mix(in oklab, #007041 28%, transparent)`                                   |
| `--border-success-secondary`        | `color-mix(in oklab, #007041 56%, transparent)`                                   |
| `--border-success-tertiary`         | `color-mix(in oklab, #007041 32%, transparent)`                                   |
| `--border-tertiary`                 | `color-mix(in oklab, #141414 8%, transparent)`                                    |
| `--border-tertiary-opaque`          | `color-mix(in oklab, color-mix(in oklab, #141414 8%, transparent) 100%, #fcfcfc)` |
| `--border-warn`                     | `color-mix(in oklab, #a46700 92%, transparent)`                                   |
| `--border-warn-quaternary`          | `color-mix(in oklab, #a46700 28%, transparent)`                                   |
| `--border-warn-secondary`           | `color-mix(in oklab, #a46700 56%, transparent)`                                   |
| `--border-warn-tertiary`            | `color-mix(in oklab, #a46700 32%, transparent)`                                   |
| `--border-yellow`                   | `color-mix(in oklab, #a46700 92%, transparent)`                                   |
| `--border-yellow-quaternary`        | `color-mix(in oklab, #a46700 28%, transparent)`                                   |
| `--border-yellow-secondary`         | `color-mix(in oklab, #a46700 56%, transparent)`                                   |
| `--border-yellow-tertiary`          | `color-mix(in oklab, #a46700 32%, transparent)`                                   |
| `--borders`                         | `#ccc`                                                                            |
| `--cursor-stroke-blue-primary`      | `color-mix(in srgb, #2778c1 56%, transparent)`                                    |
| `--cursor-stroke-blue-secondary`    | `color-mix(in srgb, #2778c1 32%, transparent)`                                    |
| `--cursor-stroke-cyan-primary`      | `color-mix(in oklab, #176c74 56%, transparent)`                                   |
| `--cursor-stroke-cyan-secondary`    | `color-mix(in oklab, #176c74 32%, transparent)`                                   |
| `--cursor-stroke-focused`           | `color-mix(in oklab, #2778c1 15%, transparent)`                                   |
| `--cursor-stroke-git-added`         | `color-mix(in oklab, #007041 56%, transparent)`                                   |
| `--cursor-stroke-git-modified`      | `color-mix(in srgb, #a46700 56%, transparent)`                                    |
| `--cursor-stroke-git-removed`       | `color-mix(in oklab, #be1744 56%, transparent)`                                   |
| `--cursor-stroke-git-untracked`     | `color-mix(in srgb, #176c74 56%, transparent)`                                    |
| `--cursor-stroke-green-primary`     | `color-mix(in oklab, #007041 56%, transparent)`                                   |
| `--cursor-stroke-green-secondary`   | `color-mix(in oklab, #007041 32%, transparent)`                                   |
| `--cursor-stroke-high-contrast`     | `color-mix(in srgb, #141414 0%, transparent)`                                     |
| `--cursor-stroke-magenta-primary`   | `color-mix(in oklab, #92156a 56%, transparent)`                                   |
| `--cursor-stroke-magenta-secondary` | `color-mix(in oklab, #92156a 32%, transparent)`                                   |
| `--cursor-stroke-orange-primary`    | `color-mix(in oklab, #cd4500 56%, transparent)`                                   |
| `--cursor-stroke-orange-secondary`  | `color-mix(in oklab, #cd4500 32%, transparent)`                                   |
| `--cursor-stroke-primary`           | `color-mix(in oklab, #141414 20%, transparent)`                                   |
| `--cursor-stroke-quaternary`        | `color-mix(in oklab, #141414 4%, transparent)`                                    |
| `--cursor-stroke-red-primary`       | `color-mix(in oklab, #be1744 56%, transparent)`                                   |
| `--cursor-stroke-red-secondary`     | `color-mix(in oklab, #be1744 32%, transparent)`                                   |
| `--cursor-stroke-secondary`         | `color-mix(in oklab, #141414 12%, transparent)`                                   |
| `--cursor-stroke-tertiary`          | `color-mix(in oklab, #141414 8%, transparent)`                                    |
| `--cursor-stroke-tertiary-opaque`   | `color-mix(in srgb, #141414 8%, #f8f8f8)`                                         |
| `--cursor-stroke-yellow-primary`    | `color-mix(in oklab, #a46700 56%, transparent)`                                   |
| `--cursor-stroke-yellow-secondary`  | `color-mix(in oklab, #a46700 32%, transparent)`                                   |

---

## 8. Buttons

| Token                                        | Valeur                                         |
| -------------------------------------------- | ---------------------------------------------- |
| `--cursor-button-background`                 | `#141414`                                      |
| `--cursor-button-foreground`                 | `#fcfcfc`                                      |
| `--cursor-button-hover-background`           | `color-mix(in oklab, #f8f8f8 10%, #141414)`    |
| `--cursor-button-secondary-background`       | `color-mix(in oklab, #141414 8%, transparent)` |
| `--cursor-button-secondary-foreground`       | `#141414`                                      |
| `--cursor-button-secondary-hover-background` | `color-mix(in oklab, #141414 6%, transparent)` |

---

## 9. Shadows & elevation

| Token                           | Valeur                                                                                                     |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `--color-theme-shadow-card`     | `0 0 2px 0 #0000000f, 0 6px 16px 0 #0000000f`                                                              |
| `--color-theme-shadow-command`  | `0 25px 50px -12px #00000040, 0 12px 24px -8px #00000026`                                                  |
| `--color-theme-shadow-dialog`   | `0 0 0 1px color-mix(in oklab, #141414 8%, transparent), 0 0 2px 0 #0000000f, 0 6px 16px 0 #0000000f`      |
| `--color-theme-shadow-elevated` | `0 8px 32px #0003`                                                                                         |
| `--color-theme-shadow-popover`  | `0 10px 15px -3px #0000001a, 0 4px 6px -2px #0000000d`                                                     |
| `--cursor-box-shadow-base`      | `0 0 0 1px color-mix(in oklab, #141414 8%, transparent), 0 0 4px 0px #00000009, 0 8px 24px -2px #00000009` |
| `--cursor-box-shadow-lg`        | `0 0 4px 0 rgba(255, 255, 255, 0.05) inset, 0 0 3px 0 #00000009, 0 16px 24px 0 #00000005`                  |
| `--cursor-box-shadow-popup`     | `0 8px 16px 0 rgba(20, 20, 20, 0.12)`                                                                      |
| `--cursor-box-shadow-sm`        | `0 2px 8px 0px #00000009`                                                                                  |
| `--cursor-box-shadow-soft`      | `0 0 8px 2px #00000005`                                                                                    |
| `--cursor-box-shadow-workbench` | `0 0 2px 0 #0000000f, 0 6px 16px 0 #0000000f`                                                              |
| `--cursor-box-shadow-xl`        | `0 0 4px 0 rgba(255, 255, 255, 0.05) inset, 0 0 6px 8px #00000009, 0 24px 16px 6px #00000005`              |
| `--cursor-elevation-1`          | `1`                                                                                                        |
| `--cursor-elevation-2`          | `2`                                                                                                        |
| `--cursor-scrollbar-shadow`     | `#0000000f`                                                                                                |
| `--cursor-shadow-primary`       | `#0000000f`                                                                                                |
| `--cursor-shadow-secondary`     | `#00000009`                                                                                                |
| `--cursor-shadow-tertiary`      | `#00000005`                                                                                                |
| `--cursor-shadow-workbench`     | `0px 0px 8px 2px color-mix(in srgb, #0000000f 40%, transparent)`                                           |
| `--shadow-primary`              | `#0000000f`                                                                                                |
| `--shadow-secondary`            | `#00000009`                                                                                                |
| `--shadow-tertiary`             | `#00000005`                                                                                                |
| `--tw-ring-offset-shadow`       | `0 0 #0000`                                                                                                |
| `--tw-ring-shadow`              | `0 0 #0000`                                                                                                |
| `--tw-shadow`                   | `0 0 #0000`                                                                                                |
| `--tw-shadow-colored`           | `0 0 #0000`                                                                                                |

---

## 10. Typography & layout chrome

| Token                           | Valeur                                                                                               |
| ------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `--cursor-font-family-mono`     | `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace` |
| `--cursor-font-family-sans`     | `-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`                                          |
| `--cursor-font-size-base`       | `13px`                                                                                               |
| `--cursor-font-size-lg`         | `14px`                                                                                               |
| `--cursor-font-size-sm`         | `12px`                                                                                               |
| `--cursor-font-size-xs`         | `11px`                                                                                               |
| `--cursor-font-weight-bold`     | `700`                                                                                                |
| `--cursor-font-weight-medium`   | `500`                                                                                                |
| `--cursor-font-weight-normal`   | `418`                                                                                                |
| `--cursor-font-weight-regular`  | `418`                                                                                                |
| `--cursor-font-weight-semibold` | `600`                                                                                                |
| `--cursor-height-base`          | `28px`                                                                                               |
| `--cursor-height-lg`            | `32px`                                                                                               |
| `--cursor-height-sm`            | `24px`                                                                                               |
| `--cursor-height-xs`            | `20px`                                                                                               |
| `--cursor-letter-spacing-2xl`   | `-0.46px`                                                                                            |
| `--cursor-letter-spacing-3xl`   | `-0.26px`                                                                                            |
| `--cursor-letter-spacing-base`  | `-0.08px`                                                                                            |
| `--cursor-letter-spacing-lg`    | `-0.15px`                                                                                            |
| `--cursor-letter-spacing-sm`    | `0px`                                                                                                |
| `--cursor-letter-spacing-xl`    | `0.08px`                                                                                             |
| `--cursor-letter-spacing-xs`    | `0.07px`                                                                                             |
| `--cursor-line-height-base`     | `18px`                                                                                               |
| `--cursor-line-height-lg`       | `22px`                                                                                               |
| `--cursor-line-height-sm`       | `16px`                                                                                               |
| `--cursor-line-height-xs`       | `14px`                                                                                               |
| `--diffs-font-family`           | `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace` |
| `--diffs-font-size`             | `12px`                                                                                               |
| `--dvh-safe`                    | `100dvh`                                                                                             |
| `--file-list-item-content-h`    | `1rem`                                                                                               |
| `--file-list-item-h`            | `calc(1rem + 2 * .25rem)`                                                                            |
| `--file-list-item-py`           | `.25rem`                                                                                             |
| `--file-list-max-vh`            | `30vh`                                                                                               |
| `--file-list-visible-count`     | `7.5`                                                                                                |
| `--font-size-base`              | `.8125rem`                                                                                           |
| `--font-size-lg`                | `1rem`                                                                                               |
| `--font-size-sm`                | `.75rem`                                                                                             |
| `--font-size-xl`                | `1.25rem`                                                                                            |
| `--font-size-xs`                | `.6875rem`                                                                                           |
| `--font-weight-bold`            | `700`                                                                                                |
| `--font-weight-medium`          | `500`                                                                                                |
| `--font-weight-normal`          | `418`                                                                                                |
| `--font-weight-semibold`        | `600`                                                                                                |
| `--font-width-normal`           | `4.7`                                                                                                |
| `--line-height-base`            | `1.125rem`                                                                                           |
| `--line-height-lg`              | `1.5rem`                                                                                             |
| `--line-height-sm`              | `1rem`                                                                                               |
| `--line-height-xl`              | `1.75rem`                                                                                            |
| `--line-height-xs`              | `.875rem`                                                                                            |
| `--navbar-height`               | `4rem`                                                                                               |
| `--text-base`                   | `1rem`                                                                                               |
| `--text-lg`                     | `2.25rem`                                                                                            |
| `--text-md`                     | `1.375rem`                                                                                           |
| `--text-xl`                     | `3.25rem`                                                                                            |
| `--text-xs`                     | `.75rem`                                                                                             |
| `--web-text-base`               | `.8125rem`                                                                                           |
| `--web-text-sm`                 | `.75rem`                                                                                             |

---

## 11. Spacing & radius

| Token                      | Valeur   |
| -------------------------- | -------- |
| `--cursor-radius-2xl`      | `14px`   |
| `--cursor-radius-3xl`      | `16px`   |
| `--cursor-radius-base`     | `6px`    |
| `--cursor-radius-full`     | `9999px` |
| `--cursor-radius-lg`       | `8px`    |
| `--cursor-radius-none`     | `0px`    |
| `--cursor-radius-sm`       | `4px`    |
| `--cursor-radius-xl`       | `12px`   |
| `--cursor-radius-xs`       | `2px`    |
| `--cursor-spacing-0-25`    | `1px`    |
| `--cursor-spacing-0-5`     | `2px`    |
| `--cursor-spacing-0-75`    | `3px`    |
| `--cursor-spacing-1`       | `4px`    |
| `--cursor-spacing-1-25`    | `5px`    |
| `--cursor-spacing-1-5`     | `6px`    |
| `--cursor-spacing-1-75`    | `7px`    |
| `--cursor-spacing-10`      | `40px`   |
| `--cursor-spacing-11`      | `44px`   |
| `--cursor-spacing-12`      | `48px`   |
| `--cursor-spacing-13`      | `52px`   |
| `--cursor-spacing-14`      | `56px`   |
| `--cursor-spacing-15`      | `60px`   |
| `--cursor-spacing-16`      | `64px`   |
| `--cursor-spacing-17`      | `68px`   |
| `--cursor-spacing-18`      | `72px`   |
| `--cursor-spacing-19`      | `76px`   |
| `--cursor-spacing-2`       | `8px`    |
| `--cursor-spacing-2-25`    | `9px`    |
| `--cursor-spacing-2-5`     | `10px`   |
| `--cursor-spacing-2-75`    | `11px`   |
| `--cursor-spacing-20`      | `80px`   |
| `--cursor-spacing-3`       | `12px`   |
| `--cursor-spacing-3-25`    | `13px`   |
| `--cursor-spacing-3-5`     | `14px`   |
| `--cursor-spacing-3-75`    | `15px`   |
| `--cursor-spacing-4`       | `16px`   |
| `--cursor-spacing-4-25`    | `17px`   |
| `--cursor-spacing-4-5`     | `18px`   |
| `--cursor-spacing-4-75`    | `19px`   |
| `--cursor-spacing-5`       | `20px`   |
| `--cursor-spacing-5-5`     | `22px`   |
| `--cursor-spacing-6`       | `24px`   |
| `--cursor-spacing-6-5`     | `26px`   |
| `--cursor-spacing-7`       | `28px`   |
| `--cursor-spacing-7-5`     | `30px`   |
| `--cursor-spacing-8`       | `32px`   |
| `--cursor-spacing-8-5`     | `34px`   |
| `--cursor-spacing-9`       | `36px`   |
| `--cursor-spacing-9-5`     | `38px`   |
| `--cursor-spacing-ne-0-25` | `-1px`   |
| `--cursor-spacing-ne-0-5`  | `-2px`   |
| `--cursor-spacing-ne-0-75` | `-3px`   |
| `--cursor-spacing-ne-1`    | `-4px`   |
| `--cursor-spacing-ne-1-25` | `-5px`   |
| `--cursor-spacing-ne-1-5`  | `-6px`   |
| `--cursor-spacing-ne-1-75` | `-7px`   |
| `--cursor-spacing-ne-2`    | `-8px`   |
| `--cursor-spacing-ne-2-25` | `-9px`   |
| `--cursor-spacing-ne-2-5`  | `-10px`  |
| `--cursor-spacing-ne-2-75` | `-11px`  |
| `--cursor-spacing-ne-3`    | `-12px`  |
| `--cursor-spacing-ne-3-25` | `-13px`  |
| `--cursor-spacing-ne-3-5`  | `-14px`  |
| `--cursor-spacing-ne-3-75` | `-15px`  |
| `--cursor-spacing-ne-4`    | `-16px`  |
| `--cursor-spacing-ne-4-25` | `-17px`  |
| `--cursor-spacing-ne-4-5`  | `-18px`  |
| `--cursor-spacing-ne-4-75` | `-19px`  |
| `--cursor-spacing-ne-5`    | `-20px`  |

---

## 12. Motion

| Token                           | Valeur                                   |
| ------------------------------- | ---------------------------------------- |
| `--cursor-duration-fast`        | `100ms`                                  |
| `--cursor-duration-instant`     | `50ms`                                   |
| `--cursor-duration-normal`      | `150ms`                                  |
| `--cursor-duration-slow`        | `200ms`                                  |
| `--cursor-duration-slower`      | `300ms`                                  |
| `--cursor-easing-default`       | `ease`                                   |
| `--cursor-easing-in`            | `ease-in`                                |
| `--cursor-easing-in-out`        | `ease-in-out`                            |
| `--cursor-easing-in-out-strong` | `cubic-bezier(0.77, 0, 0.175, 1)`        |
| `--cursor-easing-in-strong`     | `cubic-bezier(0.895, 0.03, 0.685, 0.22)` |
| `--cursor-easing-out`           | `ease-out`                               |
| `--cursor-easing-out-quint`     | `cubic-bezier(0.16, 1, 0.3, 1)`          |
| `--cursor-easing-out-strong`    | `cubic-bezier(0.165, 0.84, 0.44, 1)`     |
| `--rt-transition-closing-delay` | `0.15s`                                  |
| `--rt-transition-show-delay`    | `0.15s`                                  |

---

## 13. Syntax, diffs, terminal, editor chrome

| Token                                             | Valeur                                                                                               |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `--cursor-bg-diff-inserted`                       | `#00af6624`                                                                                          |
| `--cursor-bg-diff-removed`                        | `#ff617b38`                                                                                          |
| `--cursor-diff-added-line-background`             | `#3fa26633`                                                                                          |
| `--cursor-diff-added-text-background`             | `#3fa26622`                                                                                          |
| `--cursor-diff-removed-line-background`           | `#b8004933`                                                                                          |
| `--cursor-diff-removed-text-background`           | `#b8004922`                                                                                          |
| `--cursor-editor-bracket-match-background`        | `color-mix(in srgb, #007041 22%, transparent)`                                                       |
| `--cursor-editor-bracket-match-border`            | `color-mix(in srgb, #141414 52%, transparent)`                                                       |
| `--cursor-editor-cursor-foreground`               | `#141414`                                                                                            |
| `--cursor-editor-find-match-background`           | `color-mix(in srgb, #a46700 72%, transparent)`                                                       |
| `--cursor-editor-find-match-highlight-background` | `color-mix(in srgb, #a46700 32%, transparent)`                                                       |
| `--cursor-editor-foreground`                      | `#141414`                                                                                            |
| `--cursor-editor-gutter-background`               | `#fcfcfc`                                                                                            |
| `--cursor-editor-inactive-selection-background`   | `color-mix(in srgb, #2778c1 30%, transparent)`                                                       |
| `--cursor-editor-indent-guide-active-background`  | `color-mix(in srgb, #141414 40%, transparent)`                                                       |
| `--cursor-editor-indent-guide-background`         | `color-mix(in srgb, #141414 22%, transparent)`                                                       |
| `--cursor-editor-line-highlight-background`       | `color-mix(in srgb, #141414 8%, transparent)`                                                        |
| `--cursor-editor-line-number-active-foreground`   | `#141414`                                                                                            |
| `--cursor-editor-line-number-foreground`          | `color-mix(in oklab, #141414 60%, transparent)`                                                      |
| `--cursor-editor-selection-background`            | `color-mix(in srgb, #2778c1 42%, transparent)`                                                       |
| `--cursor-editor-selection-highlight-background`  | `color-mix(in srgb, #2778c1 32%, transparent)`                                                       |
| `--cursor-editor-whitespace-foreground`           | `color-mix(in srgb, #141414 22%, transparent)`                                                       |
| `--cursor-editor-widget-background`               | `#fcfcfc`                                                                                            |
| `--cursor-editor-widget-border`                   | `color-mix(in oklab, #141414 12%, transparent)`                                                      |
| `--cursor-editor-widget-foreground`               | `#141414`                                                                                            |
| `--cursor-syntax-background`                      | `#fcfcfc`                                                                                            |
| `--cursor-syntax-comment`                         | `#141414ad`                                                                                          |
| `--cursor-syntax-constant`                        | `#206595`                                                                                            |
| `--cursor-syntax-foreground`                      | `#141414eb`                                                                                          |
| `--cursor-syntax-function`                        | `#db704b`                                                                                            |
| `--cursor-syntax-keyword`                         | `#b3003f`                                                                                            |
| `--cursor-syntax-link`                            | `#3c7cab`                                                                                            |
| `--cursor-syntax-number`                          | `#b8448b`                                                                                            |
| `--cursor-syntax-parameter`                       | `#141414eb`                                                                                          |
| `--cursor-syntax-punctuation`                     | `#141414ad`                                                                                          |
| `--cursor-syntax-string`                          | `#8f84e0`                                                                                            |
| `--cursor-syntax-string-expression`               | `#8f84e0`                                                                                            |
| `--cursor-terminal-ansi-black`                    | `#242424`                                                                                            |
| `--cursor-terminal-ansi-blue`                     | `#81a1c1`                                                                                            |
| `--cursor-terminal-ansi-bright-black`             | `#f0f0f099`                                                                                          |
| `--cursor-terminal-ansi-bright-blue`              | `#87a6c4`                                                                                            |
| `--cursor-terminal-ansi-bright-cyan`              | `#88c0d0`                                                                                            |
| `--cursor-terminal-ansi-bright-green`             | `#70b489`                                                                                            |
| `--cursor-terminal-ansi-bright-magenta`           | `#b48ead`                                                                                            |
| `--cursor-terminal-ansi-bright-red`               | `#fc6b83`                                                                                            |
| `--cursor-terminal-ansi-bright-white`             | `#f0f0f0`                                                                                            |
| `--cursor-terminal-ansi-bright-yellow`            | `#f1b467`                                                                                            |
| `--cursor-terminal-ansi-cyan`                     | `#88c0d0`                                                                                            |
| `--cursor-terminal-ansi-green`                    | `#3fa266`                                                                                            |
| `--cursor-terminal-ansi-magenta`                  | `#b48ead`                                                                                            |
| `--cursor-terminal-ansi-red`                      | `#fc6b83`                                                                                            |
| `--cursor-terminal-ansi-white`                    | `#f0f0f0`                                                                                            |
| `--cursor-terminal-ansi-yellow`                   | `#d2943e`                                                                                            |
| `--cursor-terminal-background`                    | `#f8f8f8`                                                                                            |
| `--cursor-terminal-foreground`                    | `#141414`                                                                                            |
| `--cursor-terminal-selection-background`          | `color-mix(in srgb, #141414 12%, transparent)`                                                       |
| `--diff-added-line`                               | `#00af6624`                                                                                          |
| `--diff-added-text`                               | `#00b06838`                                                                                          |
| `--diff-removed-line`                             | `#ff617b38`                                                                                          |
| `--diff-removed-text`                             | `#ff617b57`                                                                                          |
| `--diffs-addition-color-override`                 | `#007041`                                                                                            |
| `--diffs-bg`                                      | `#fcfcfc`                                                                                            |
| `--diffs-bg-addition-override`                    | `#00af6624`                                                                                          |
| `--diffs-bg-deletion-override`                    | `#ff617b38`                                                                                          |
| `--diffs-bg-selection-background-override`        | `transparent`                                                                                        |
| `--diffs-bg-selection-number-background-override` | `transparent`                                                                                        |
| `--diffs-bg-selection-number-override`            | `transparent`                                                                                        |
| `--diffs-bg-selection-override`                   | `transparent`                                                                                        |
| `--diffs-deletion-color-override`                 | `#be1744`                                                                                            |
| `--diffs-font-family`                             | `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace` |
| `--diffs-font-size`                               | `12px`                                                                                               |
| `--diffs-selection-color-override`                | `transparent`                                                                                        |
| `--inactive-selection-background`                 | `#0000000f`                                                                                          |
| `--selection-background`                          | `color-mix(in oklab, #141414 14%, transparent)`                                                      |
| `--syntax-background`                             | `#fcfcfc`                                                                                            |
| `--syntax-comment`                                | `#141414ad`                                                                                          |
| `--syntax-constant`                               | `#206595`                                                                                            |
| `--syntax-foreground`                             | `#141414eb`                                                                                          |
| `--syntax-function`                               | `#db704b`                                                                                            |
| `--syntax-keyword`                                | `#b3003f`                                                                                            |
| `--syntax-link`                                   | `#3c7cab`                                                                                            |
| `--syntax-number`                                 | `#b8448b`                                                                                            |
| `--syntax-parameter`                              | `#141414eb`                                                                                          |
| `--syntax-punctuation`                            | `#141414ad`                                                                                          |
| `--syntax-string`                                 | `#8f84e0`                                                                                            |
| `--syntax-string-expression`                      | `#8f84e0`                                                                                            |
| `--terminal-ansi-blue`                            | `#055180`                                                                                            |
| `--terminal-ansi-green`                           | `#005c42`                                                                                            |
| `--terminal-ansi-red`                             | `#a33900`                                                                                            |
| `--terminal-ansi-yellow`                          | `#a16900`                                                                                            |

---

## 14. Dashboard analytics / bugbot / theme shadows

| Token                                    | Valeur                                                                                                |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `--color-dashboard-analytics-gray`       | `#8a7a6a`                                                                                             |
| `--color-dashboard-analytics-quaternary` | `#c25728e0`                                                                                           |
| `--color-dashboard-analytics-quinary`    | `#b89428e0`                                                                                           |
| `--color-dashboard-analytics-tertiary`   | `#e9b33be0`                                                                                           |
| `--color-dashboard-bugbot-legend-found`  | `#d06ba6`                                                                                             |
| `--color-dashboard-bugbot-legend-high`   | `#db704b`                                                                                             |
| `--color-dashboard-bugbot-legend-low`    | `#3c7cab`                                                                                             |
| `--color-dashboard-bugbot-legend-medium` | `#a16900`                                                                                             |
| `--color-dashboard-bugbot-primary`       | `#005c42`                                                                                             |
| `--color-dashboard-bugbot-quaternary`    | `#89045e`                                                                                             |
| `--color-dashboard-bugbot-quinary`       | `#1f8a65`                                                                                             |
| `--color-dashboard-bugbot-secondary`     | `#1f8a65`                                                                                             |
| `--color-dashboard-bugbot-status-merged` | `#8250df`                                                                                             |
| `--color-dashboard-bugbot-status-open`   | `#1f883d`                                                                                             |
| `--color-dashboard-bugbot-tertiary`      | `#a33900`                                                                                             |
| `--color-dashboard-chart-1`              | `#1f8a65e0`                                                                                           |
| `--color-dashboard-chart-1-muted`        | `#70b0d8e0`                                                                                           |
| `--color-dashboard-chart-10`             | `#4c566a`                                                                                             |
| `--color-dashboard-chart-2`              | `#81a1c1`                                                                                             |
| `--color-dashboard-chart-3`              | `#5e81ac`                                                                                             |
| `--color-dashboard-chart-4`              | `#b48ead`                                                                                             |
| `--color-dashboard-chart-5`              | `#a3be8c`                                                                                             |
| `--color-dashboard-chart-6`              | `#ebcb8b`                                                                                             |
| `--color-dashboard-chart-7`              | `#d08770`                                                                                             |
| `--color-dashboard-chart-8`              | `#bf616a`                                                                                             |
| `--color-dashboard-chart-9`              | `#8fbcbb`                                                                                             |
| `--color-dashboard-highlight`            | `#00000014`                                                                                           |
| `--color-dashboard-usage-accent`         | `#81a1c1`                                                                                             |
| `--color-dashboard-usage-accent-10`      | `color-mix(in oklab, #81a1c1 10%, transparent)`                                                       |
| `--color-dashboard-usage-accent-60`      | `color-mix(in oklab, #81a1c1 60%, transparent)`                                                       |
| `--color-theme-accent`                   | `#f54e00`                                                                                             |
| `--color-theme-accent-hover`             | `color-mix(in oklab, #f54e00 85%, black)`                                                             |
| `--color-theme-shadow-card`              | `0 0 2px 0 #0000000f, 0 6px 16px 0 #0000000f`                                                         |
| `--color-theme-shadow-command`           | `0 25px 50px -12px #00000040, 0 12px 24px -8px #00000026`                                             |
| `--color-theme-shadow-dialog`            | `0 0 0 1px color-mix(in oklab, #141414 8%, transparent), 0 0 2px 0 #0000000f, 0 6px 16px 0 #0000000f` |
| `--color-theme-shadow-elevated`          | `0 8px 32px #0003`                                                                                    |
| `--color-theme-shadow-popover`           | `0 10px 15px -3px #0000001a, 0 4px 6px -2px #0000000d`                                                |
| `--color-theme-tooltip-bg`               | `#fff`                                                                                                |
| `--dashboard-bg-error-primary`           | `#dc2626`                                                                                             |
| `--dashboard-bg-error-primary-hover`     | `#b91c1c`                                                                                             |
| `--dashboard-text-error-on-primary`      | `#fff`                                                                                                |
| `--dashboard-text-error-prominent`       | `#e06c75`                                                                                             |

---

## 15. Command center, titlebar, toolbar, progress, scrollbar, UI misc

| Token                                         | Valeur                                          |
| --------------------------------------------- | ----------------------------------------------- |
| `--cursor-command-center-active-background`   | `color-mix(in oklab, #141414 14%, transparent)` |
| `--cursor-command-center-active-border`       | `color-mix(in oklab, #141414 20%, transparent)` |
| `--cursor-command-center-active-foreground`   | `color-mix(in oklab, #141414 74%, transparent)` |
| `--cursor-command-center-background`          | `color-mix(in oklab, #141414 8%, transparent)`  |
| `--cursor-command-center-border`              | `color-mix(in oklab, #141414 12%, transparent)` |
| `--cursor-command-center-foreground`          | `color-mix(in oklab, #141414 74%, transparent)` |
| `--cursor-command-center-inactive-border`     | `color-mix(in oklab, #141414 12%, transparent)` |
| `--cursor-command-center-inactive-foreground` | `color-mix(in oklab, #141414 60%, transparent)` |
| `--cursor-progress-bar-background`            | `#2778c1`                                       |
| `--cursor-scrollbar-horizontal-size`          | `12px`                                          |
| `--cursor-scrollbar-shadow`                   | `#0000000f`                                     |
| `--cursor-scrollbar-thumb-active-background`  | `color-mix(in srgb, #141414 26%, transparent)`  |
| `--cursor-scrollbar-thumb-background`         | `color-mix(in srgb, #141414 14%, transparent)`  |
| `--cursor-scrollbar-thumb-hover-background`   | `color-mix(in srgb, #141414 22%, transparent)`  |
| `--cursor-scrollbar-vertical-size`            | `14px`                                          |
| `--cursor-titlebar-active-foreground`         | `color-mix(in oklab, #141414 74%, transparent)` |
| `--cursor-titlebar-inactive-foreground`       | `color-mix(in oklab, #141414 60%, transparent)` |
| `--cursor-toolbar-hover-background`           | `color-mix(in oklab, #141414 8%, transparent)`  |
| `--rt-arrow-size`                             | `8px`                                           |
| `--rt-color-dark`                             | `#222`                                          |
| `--rt-color-error`                            | `#be6464`                                       |
| `--rt-color-info`                             | `#337ab7`                                       |
| `--rt-color-success`                          | `#8dc572`                                       |
| `--rt-color-warning`                          | `#f0ad4e`                                       |
| `--rt-color-white`                            | `#fff`                                          |
| `--rt-opacity`                                | `0.9`                                           |
| `--ui-press-scale`                            | `.98`                                           |
| `--ui-tool-call-card-bg`                      | `#fcfcfc`                                       |

---

## 16. Cursor-* aliases (reste)

| Token                                             | Valeur                                                                                                     |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `--cursor-accent`                                 | `#2778c1`                                                                                                  |
| `--cursor-action-label`                           | `#fcfcfc`                                                                                                  |
| `--cursor-added`                                  | `#007041`                                                                                                  |
| `--cursor-base`                                   | `#141414`                                                                                                  |
| `--cursor-bg-accent`                              | `#2778c1`                                                                                                  |
| `--cursor-bg-accent-hover`                        | `color-mix(in oklab, #141414 10%, #2778c1)`                                                                |
| `--cursor-bg-accent-quaternary`                   | `color-mix(in srgb, #2778c1 8%, transparent)`                                                              |
| `--cursor-bg-accent-secondary`                    | `color-mix(in srgb, #2778c1 24%, transparent)`                                                             |
| `--cursor-bg-accent-tertiary`                     | `color-mix(in srgb, #2778c1 12%, transparent)`                                                             |
| `--cursor-bg-active`                              | `color-mix(in oklab, #141414 16%, transparent)`                                                            |
| `--cursor-bg-blue-primary`                        | `#2778c1`                                                                                                  |
| `--cursor-bg-blue-secondary`                      | `color-mix(in srgb, #2778c1 12%, transparent)`                                                             |
| `--cursor-bg-card`                                | `color-mix(in oklab, #141414 6%, transparent)`                                                             |
| `--cursor-bg-chrome`                              | `#f8f8f8`                                                                                                  |
| `--cursor-bg-cyan-primary`                        | `#176c74`                                                                                                  |
| `--cursor-bg-cyan-secondary`                      | `color-mix(in oklab, #176c74 12%, transparent)`                                                            |
| `--cursor-bg-diff-inserted`                       | `#00af6624`                                                                                                |
| `--cursor-bg-diff-removed`                        | `#ff617b38`                                                                                                |
| `--cursor-bg-editor`                              | `#fcfcfc`                                                                                                  |
| `--cursor-bg-elevated`                            | `#fcfcfc`                                                                                                  |
| `--cursor-bg-focused`                             | `color-mix(in oklab, #141414 22%, transparent)`                                                            |
| `--cursor-bg-git-added-hover`                     | `color-mix(in srgb, #141414 10%, #007041)`                                                                 |
| `--cursor-bg-git-added-primary`                   | `#007041`                                                                                                  |
| `--cursor-bg-git-added-quaternary`                | `color-mix(in srgb, #007041 8%, transparent)`                                                              |
| `--cursor-bg-git-added-secondary`                 | `color-mix(in srgb, #007041 24%, transparent)`                                                             |
| `--cursor-bg-git-added-tertiary`                  | `color-mix(in srgb, #007041 12%, transparent)`                                                             |
| `--cursor-bg-git-modified-hover`                  | `color-mix(in srgb, #141414 10%, #a46700)`                                                                 |
| `--cursor-bg-git-modified-primary`                | `#a46700`                                                                                                  |
| `--cursor-bg-git-modified-quaternary`             | `color-mix(in srgb, #a46700 8%, transparent)`                                                              |
| `--cursor-bg-git-modified-secondary`              | `color-mix(in srgb, #a46700 24%, transparent)`                                                             |
| `--cursor-bg-git-modified-tertiary`               | `color-mix(in srgb, #a46700 12%, transparent)`                                                             |
| `--cursor-bg-git-removed-hover`                   | `color-mix(in srgb, #141414 10%, #be1744)`                                                                 |
| `--cursor-bg-git-removed-primary`                 | `#be1744`                                                                                                  |
| `--cursor-bg-git-removed-quaternary`              | `color-mix(in srgb, #be1744 8%, transparent)`                                                              |
| `--cursor-bg-git-removed-secondary`               | `color-mix(in srgb, #be1744 24%, transparent)`                                                             |
| `--cursor-bg-git-removed-tertiary`                | `color-mix(in srgb, #be1744 12%, transparent)`                                                             |
| `--cursor-bg-git-untracked-hover`                 | `color-mix(in srgb, #141414 10%, #176c74)`                                                                 |
| `--cursor-bg-git-untracked-primary`               | `#176c74`                                                                                                  |
| `--cursor-bg-git-untracked-quaternary`            | `color-mix(in srgb, #176c74 8%, transparent)`                                                              |
| `--cursor-bg-git-untracked-secondary`             | `color-mix(in srgb, #176c74 24%, transparent)`                                                             |
| `--cursor-bg-git-untracked-tertiary`              | `color-mix(in srgb, #176c74 12%, transparent)`                                                             |
| `--cursor-bg-green-primary`                       | `#007041`                                                                                                  |
| `--cursor-bg-green-secondary`                     | `color-mix(in oklab, #007041 12%, transparent)`                                                            |
| `--cursor-bg-input`                               | `#fcfcfc`                                                                                                  |
| `--cursor-bg-input-surface`                       | `color-mix(in oklab, #141414 6%, transparent)`                                                             |
| `--cursor-bg-magenta-primary`                     | `#92156a`                                                                                                  |
| `--cursor-bg-magenta-secondary`                   | `color-mix(in oklab, #92156a 12%, transparent)`                                                            |
| `--cursor-bg-orange-primary`                      | `#cd4500`                                                                                                  |
| `--cursor-bg-orange-secondary`                    | `color-mix(in oklab, #cd4500 12%, transparent)`                                                            |
| `--cursor-bg-primary`                             | `color-mix(in oklab, #141414 20%, transparent)`                                                            |
| `--cursor-bg-purple-primary`                      | `#7565cc`                                                                                                  |
| `--cursor-bg-purple-secondary`                    | `color-mix(in oklab, #7565cc 12%, transparent)`                                                            |
| `--cursor-bg-purple-tertiary`                     | `color-mix(in oklab, #7565cc 8%, transparent)`                                                             |
| `--cursor-bg-quaternary`                          | `color-mix(in oklab, #141414 6%, transparent)`                                                             |
| `--cursor-bg-quinary`                             | `color-mix(in oklab, #141414 4%, transparent)`                                                             |
| `--cursor-bg-red-primary`                         | `#be1744`                                                                                                  |
| `--cursor-bg-red-secondary`                       | `color-mix(in oklab, #be1744 12%, transparent)`                                                            |
| `--cursor-bg-secondary`                           | `color-mix(in oklab, #141414 14%, transparent)`                                                            |
| `--cursor-bg-sidebar`                             | `#f3f3f3`                                                                                                  |
| `--cursor-bg-tertiary`                            | `color-mix(in oklab, #141414 8%, transparent)`                                                             |
| `--cursor-bg-yellow-primary`                      | `#a46700`                                                                                                  |
| `--cursor-bg-yellow-secondary`                    | `color-mix(in oklab, #a46700 12%, transparent)`                                                            |
| `--cursor-blue`                                   | `#2778c1`                                                                                                  |
| `--cursor-box-shadow-base`                        | `0 0 0 1px color-mix(in oklab, #141414 8%, transparent), 0 0 4px 0px #00000009, 0 8px 24px -2px #00000009` |
| `--cursor-box-shadow-lg`                          | `0 0 4px 0 rgba(255, 255, 255, 0.05) inset, 0 0 3px 0 #00000009, 0 16px 24px 0 #00000005`                  |
| `--cursor-box-shadow-popup`                       | `0 8px 16px 0 rgba(20, 20, 20, 0.12)`                                                                      |
| `--cursor-box-shadow-sm`                          | `0 2px 8px 0px #00000009`                                                                                  |
| `--cursor-box-shadow-soft`                        | `0 0 8px 2px #00000005`                                                                                    |
| `--cursor-box-shadow-workbench`                   | `0 0 2px 0 #0000000f, 0 6px 16px 0 #0000000f`                                                              |
| `--cursor-box-shadow-xl`                          | `0 0 4px 0 rgba(255, 255, 255, 0.05) inset, 0 0 6px 8px #00000009, 0 24px 16px 6px #00000005`              |
| `--cursor-brand`                                  | `#f54e00`                                                                                                  |
| `--cursor-button-background`                      | `#141414`                                                                                                  |
| `--cursor-button-foreground`                      | `#fcfcfc`                                                                                                  |
| `--cursor-button-hover-background`                | `color-mix(in oklab, #f8f8f8 10%, #141414)`                                                                |
| `--cursor-button-secondary-background`            | `color-mix(in oklab, #141414 8%, transparent)`                                                             |
| `--cursor-button-secondary-foreground`            | `#141414`                                                                                                  |
| `--cursor-button-secondary-hover-background`      | `color-mix(in oklab, #141414 6%, transparent)`                                                             |
| `--cursor-chrome`                                 | `#f8f8f8`                                                                                                  |
| `--cursor-command-center-active-background`       | `color-mix(in oklab, #141414 14%, transparent)`                                                            |
| `--cursor-command-center-active-border`           | `color-mix(in oklab, #141414 20%, transparent)`                                                            |
| `--cursor-command-center-active-foreground`       | `color-mix(in oklab, #141414 74%, transparent)`                                                            |
| `--cursor-command-center-background`              | `color-mix(in oklab, #141414 8%, transparent)`                                                             |
| `--cursor-command-center-border`                  | `color-mix(in oklab, #141414 12%, transparent)`                                                            |
| `--cursor-command-center-foreground`              | `color-mix(in oklab, #141414 74%, transparent)`                                                            |
| `--cursor-command-center-inactive-border`         | `color-mix(in oklab, #141414 12%, transparent)`                                                            |
| `--cursor-command-center-inactive-foreground`     | `color-mix(in oklab, #141414 60%, transparent)`                                                            |
| `--cursor-cyan`                                   | `#81a1c1`                                                                                                  |
| `--cursor-danger`                                 | `#be1744`                                                                                                  |
| `--cursor-diff-added-line-background`             | `#3fa26633`                                                                                                |
| `--cursor-diff-added-text-background`             | `#3fa26622`                                                                                                |
| `--cursor-diff-removed-line-background`           | `#b8004933`                                                                                                |
| `--cursor-diff-removed-text-background`           | `#b8004922`                                                                                                |
| `--cursor-duration-fast`                          | `100ms`                                                                                                    |
| `--cursor-duration-instant`                       | `50ms`                                                                                                     |
| `--cursor-duration-normal`                        | `150ms`                                                                                                    |
| `--cursor-duration-slow`                          | `200ms`                                                                                                    |
| `--cursor-duration-slower`                        | `300ms`                                                                                                    |
| `--cursor-easing-default`                         | `ease`                                                                                                     |
| `--cursor-easing-in`                              | `ease-in`                                                                                                  |
| `--cursor-easing-in-out`                          | `ease-in-out`                                                                                              |
| `--cursor-easing-in-out-strong`                   | `cubic-bezier(0.77, 0, 0.175, 1)`                                                                          |
| `--cursor-easing-in-strong`                       | `cubic-bezier(0.895, 0.03, 0.685, 0.22)`                                                                   |
| `--cursor-easing-out`                             | `ease-out`                                                                                                 |
| `--cursor-easing-out-quint`                       | `cubic-bezier(0.16, 1, 0.3, 1)`                                                                            |
| `--cursor-easing-out-strong`                      | `cubic-bezier(0.165, 0.84, 0.44, 1)`                                                                       |
| `--cursor-editor`                                 | `#fcfcfc`                                                                                                  |
| `--cursor-editor-bracket-match-background`        | `color-mix(in srgb, #007041 22%, transparent)`                                                             |
| `--cursor-editor-bracket-match-border`            | `color-mix(in srgb, #141414 52%, transparent)`                                                             |
| `--cursor-editor-cursor-foreground`               | `#141414`                                                                                                  |
| `--cursor-editor-find-match-background`           | `color-mix(in srgb, #a46700 72%, transparent)`                                                             |
| `--cursor-editor-find-match-highlight-background` | `color-mix(in srgb, #a46700 32%, transparent)`                                                             |
| `--cursor-editor-foreground`                      | `#141414`                                                                                                  |
| `--cursor-editor-gutter-background`               | `#fcfcfc`                                                                                                  |
| `--cursor-editor-inactive-selection-background`   | `color-mix(in srgb, #2778c1 30%, transparent)`                                                             |
| `--cursor-editor-indent-guide-active-background`  | `color-mix(in srgb, #141414 40%, transparent)`                                                             |
| `--cursor-editor-indent-guide-background`         | `color-mix(in srgb, #141414 22%, transparent)`                                                             |
| `--cursor-editor-line-highlight-background`       | `color-mix(in srgb, #141414 8%, transparent)`                                                              |
| `--cursor-editor-line-number-active-foreground`   | `#141414`                                                                                                  |
| `--cursor-editor-line-number-foreground`          | `color-mix(in oklab, #141414 60%, transparent)`                                                            |
| `--cursor-editor-selection-background`            | `color-mix(in srgb, #2778c1 42%, transparent)`                                                             |
| `--cursor-editor-selection-highlight-background`  | `color-mix(in srgb, #2778c1 32%, transparent)`                                                             |
| `--cursor-editor-whitespace-foreground`           | `color-mix(in srgb, #141414 22%, transparent)`                                                             |
| `--cursor-editor-widget-background`               | `#fcfcfc`                                                                                                  |
| `--cursor-editor-widget-border`                   | `color-mix(in oklab, #141414 12%, transparent)`                                                            |
| `--cursor-editor-widget-foreground`               | `#141414`                                                                                                  |
| `--cursor-elevation-1`                            | `1`                                                                                                        |
| `--cursor-elevation-2`                            | `2`                                                                                                        |
| `--cursor-focus`                                  | `#2778c1`                                                                                                  |
| `--cursor-font-family-mono`                       | `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace`       |
| `--cursor-font-family-sans`                       | `-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`                                                |
| `--cursor-font-size-base`                         | `13px`                                                                                                     |
| `--cursor-font-size-lg`                           | `14px`                                                                                                     |
| `--cursor-font-size-sm`                           | `12px`                                                                                                     |
| `--cursor-font-size-xs`                           | `11px`                                                                                                     |
| `--cursor-font-weight-bold`                       | `700`                                                                                                      |
| `--cursor-font-weight-medium`                     | `500`                                                                                                      |
| `--cursor-font-weight-normal`                     | `418`                                                                                                      |
| `--cursor-font-weight-regular`                    | `418`                                                                                                      |
| `--cursor-font-weight-semibold`                   | `600`                                                                                                      |
| `--cursor-foreground`                             | `#141414`                                                                                                  |
| `--cursor-green`                                  | `#3fa266`                                                                                                  |
| `--cursor-height-base`                            | `28px`                                                                                                     |
| `--cursor-height-lg`                              | `32px`                                                                                                     |
| `--cursor-height-sm`                              | `24px`                                                                                                     |
| `--cursor-height-xs`                              | `20px`                                                                                                     |
| `--cursor-icon-accent-primary`                    | `#2778c1`                                                                                                  |
| `--cursor-icon-accent-secondary`                  | `color-mix(in oklab, #2778c1 70%, transparent)`                                                            |
| `--cursor-icon-blue-primary`                      | `#2778c1`                                                                                                  |
| `--cursor-icon-blue-secondary`                    | `color-mix(in srgb, #2778c1 70%, transparent)`                                                             |
| `--cursor-icon-cyan-primary`                      | `#176c74`                                                                                                  |
| `--cursor-icon-cyan-secondary`                    | `color-mix(in oklab, #176c74 70%, transparent)`                                                            |
| `--cursor-icon-git-added-primary`                 | `#007041`                                                                                                  |
| `--cursor-icon-git-added-quaternary`              | `color-mix(in srgb, #007041 32%, transparent)`                                                             |
| `--cursor-icon-git-added-secondary`               | `color-mix(in srgb, #007041 70%, transparent)`                                                             |
| `--cursor-icon-git-added-tertiary`                | `color-mix(in srgb, #007041 56%, transparent)`                                                             |
| `--cursor-icon-git-modified-primary`              | `#a46700`                                                                                                  |
| `--cursor-icon-git-modified-quaternary`           | `color-mix(in srgb, #a46700 32%, transparent)`                                                             |
| `--cursor-icon-git-modified-secondary`            | `color-mix(in srgb, #a46700 70%, transparent)`                                                             |
| `--cursor-icon-git-modified-tertiary`             | `color-mix(in srgb, #a46700 56%, transparent)`                                                             |
| `--cursor-icon-git-removed-primary`               | `#be1744`                                                                                                  |
| `--cursor-icon-git-removed-quaternary`            | `color-mix(in srgb, #be1744 32%, transparent)`                                                             |
| `--cursor-icon-git-removed-secondary`             | `color-mix(in srgb, #be1744 70%, transparent)`                                                             |
| `--cursor-icon-git-removed-tertiary`              | `color-mix(in srgb, #be1744 56%, transparent)`                                                             |
| `--cursor-icon-git-untracked-primary`             | `#176c74`                                                                                                  |
| `--cursor-icon-git-untracked-quaternary`          | `color-mix(in srgb, #176c74 32%, transparent)`                                                             |
| `--cursor-icon-git-untracked-secondary`           | `color-mix(in srgb, #176c74 70%, transparent)`                                                             |
| `--cursor-icon-git-untracked-tertiary`            | `color-mix(in srgb, #176c74 56%, transparent)`                                                             |
| `--cursor-icon-green-primary`                     | `#007041`                                                                                                  |
| `--cursor-icon-green-secondary`                   | `color-mix(in oklab, #007041 70%, transparent)`                                                            |
| `--cursor-icon-magenta-primary`                   | `#92156a`                                                                                                  |
| `--cursor-icon-magenta-secondary`                 | `color-mix(in oklab, #92156a 70%, transparent)`                                                            |
| `--cursor-icon-orange-primary`                    | `#cd4500`                                                                                                  |
| `--cursor-icon-orange-secondary`                  | `color-mix(in oklab, #cd4500 70%, transparent)`                                                            |
| `--cursor-icon-primary`                           | `#141414`                                                                                                  |
| `--cursor-icon-purple-primary`                    | `#7565cc`                                                                                                  |
| `--cursor-icon-purple-secondary`                  | `color-mix(in oklab, #7565cc 70%, transparent)`                                                            |
| `--cursor-icon-quaternary`                        | `color-mix(in oklab, #141414 28%, transparent)`                                                            |
| `--cursor-icon-red-primary`                       | `#be1744`                                                                                                  |
| `--cursor-icon-red-secondary`                     | `color-mix(in oklab, #be1744 70%, transparent)`                                                            |
| `--cursor-icon-secondary`                         | `color-mix(in oklab, #141414 66%, transparent)`                                                            |
| `--cursor-icon-tertiary`                          | `color-mix(in oklab, #141414 52%, transparent)`                                                            |
| `--cursor-icon-yellow-primary`                    | `#a46700`                                                                                                  |
| `--cursor-icon-yellow-secondary`                  | `color-mix(in oklab, #a46700 70%, transparent)`                                                            |
| `--cursor-input-border`                           | `color-mix(in oklab, #141414 12%, transparent)`                                                            |
| `--cursor-input-placeholder-foreground`           | `color-mix(in oklab, #141414 36%, transparent)`                                                            |
| `--cursor-letter-spacing-2xl`                     | `-0.46px`                                                                                                  |
| `--cursor-letter-spacing-3xl`                     | `-0.26px`                                                                                                  |
| `--cursor-letter-spacing-base`                    | `-0.08px`                                                                                                  |
| `--cursor-letter-spacing-lg`                      | `-0.15px`                                                                                                  |
| `--cursor-letter-spacing-sm`                      | `0px`                                                                                                      |
| `--cursor-letter-spacing-xl`                      | `0.08px`                                                                                                   |
| `--cursor-letter-spacing-xs`                      | `0.07px`                                                                                                   |
| `--cursor-line-height-base`                       | `18px`                                                                                                     |
| `--cursor-line-height-lg`                         | `22px`                                                                                                     |
| `--cursor-line-height-sm`                         | `16px`                                                                                                     |
| `--cursor-line-height-xs`                         | `14px`                                                                                                     |
| `--cursor-magenta`                                | `#b48ead`                                                                                                  |
| `--cursor-modified`                               | `#a46700`                                                                                                  |
| `--cursor-orange`                                 | `#d08770`                                                                                                  |
| `--cursor-progress-bar-background`                | `#2778c1`                                                                                                  |
| `--cursor-purple`                                 | `#7565cc`                                                                                                  |
| `--cursor-radius-2xl`                             | `14px`                                                                                                     |
| `--cursor-radius-3xl`                             | `16px`                                                                                                     |
| `--cursor-radius-base`                            | `6px`                                                                                                      |
| `--cursor-radius-full`                            | `9999px`                                                                                                   |
| `--cursor-radius-lg`                              | `8px`                                                                                                      |
| `--cursor-radius-none`                            | `0px`                                                                                                      |
| `--cursor-radius-sm`                              | `4px`                                                                                                      |
| `--cursor-radius-xl`                              | `12px`                                                                                                     |
| `--cursor-radius-xs`                              | `2px`                                                                                                      |
| `--cursor-red`                                    | `#fc6b83`                                                                                                  |
| `--cursor-removed`                                | `#be1744`                                                                                                  |
| `--cursor-scrollbar-horizontal-size`              | `12px`                                                                                                     |
| `--cursor-scrollbar-shadow`                       | `#0000000f`                                                                                                |
| `--cursor-scrollbar-thumb-active-background`      | `color-mix(in srgb, #141414 26%, transparent)`                                                             |
| `--cursor-scrollbar-thumb-background`             | `color-mix(in srgb, #141414 14%, transparent)`                                                             |
| `--cursor-scrollbar-thumb-hover-background`       | `color-mix(in srgb, #141414 22%, transparent)`                                                             |
| `--cursor-scrollbar-vertical-size`                | `14px`                                                                                                     |
| `--cursor-shadow-primary`                         | `#0000000f`                                                                                                |
| `--cursor-shadow-secondary`                       | `#00000009`                                                                                                |
| `--cursor-shadow-tertiary`                        | `#00000005`                                                                                                |
| `--cursor-shadow-workbench`                       | `0px 0px 8px 2px color-mix(in srgb, #0000000f 40%, transparent)`                                           |
| `--cursor-sidebar`                                | `#181818`                                                                                                  |
| `--cursor-spacing-0-25`                           | `1px`                                                                                                      |
| `--cursor-spacing-0-5`                            | `2px`                                                                                                      |
| `--cursor-spacing-0-75`                           | `3px`                                                                                                      |
| `--cursor-spacing-1`                              | `4px`                                                                                                      |
| `--cursor-spacing-1-25`                           | `5px`                                                                                                      |
| `--cursor-spacing-1-5`                            | `6px`                                                                                                      |
| `--cursor-spacing-1-75`                           | `7px`                                                                                                      |
| `--cursor-spacing-10`                             | `40px`                                                                                                     |
| `--cursor-spacing-11`                             | `44px`                                                                                                     |
| `--cursor-spacing-12`                             | `48px`                                                                                                     |
| `--cursor-spacing-13`                             | `52px`                                                                                                     |
| `--cursor-spacing-14`                             | `56px`                                                                                                     |
| `--cursor-spacing-15`                             | `60px`                                                                                                     |
| `--cursor-spacing-16`                             | `64px`                                                                                                     |
| `--cursor-spacing-17`                             | `68px`                                                                                                     |
| `--cursor-spacing-18`                             | `72px`                                                                                                     |
| `--cursor-spacing-19`                             | `76px`                                                                                                     |
| `--cursor-spacing-2`                              | `8px`                                                                                                      |
| `--cursor-spacing-2-25`                           | `9px`                                                                                                      |
| `--cursor-spacing-2-5`                            | `10px`                                                                                                     |
| `--cursor-spacing-2-75`                           | `11px`                                                                                                     |
| `--cursor-spacing-20`                             | `80px`                                                                                                     |
| `--cursor-spacing-3`                              | `12px`                                                                                                     |
| `--cursor-spacing-3-25`                           | `13px`                                                                                                     |
| `--cursor-spacing-3-5`                            | `14px`                                                                                                     |
| `--cursor-spacing-3-75`                           | `15px`                                                                                                     |
| `--cursor-spacing-4`                              | `16px`                                                                                                     |
| `--cursor-spacing-4-25`                           | `17px`                                                                                                     |
| `--cursor-spacing-4-5`                            | `18px`                                                                                                     |
| `--cursor-spacing-4-75`                           | `19px`                                                                                                     |
| `--cursor-spacing-5`                              | `20px`                                                                                                     |
| `--cursor-spacing-5-5`                            | `22px`                                                                                                     |
| `--cursor-spacing-6`                              | `24px`                                                                                                     |
| `--cursor-spacing-6-5`                            | `26px`                                                                                                     |
| `--cursor-spacing-7`                              | `28px`                                                                                                     |
| `--cursor-spacing-7-5`                            | `30px`                                                                                                     |
| `--cursor-spacing-8`                              | `32px`                                                                                                     |
| `--cursor-spacing-8-5`                            | `34px`                                                                                                     |
| `--cursor-spacing-9`                              | `36px`                                                                                                     |
| `--cursor-spacing-9-5`                            | `38px`                                                                                                     |
| `--cursor-spacing-ne-0-25`                        | `-1px`                                                                                                     |
| `--cursor-spacing-ne-0-5`                         | `-2px`                                                                                                     |
| `--cursor-spacing-ne-0-75`                        | `-3px`                                                                                                     |
| `--cursor-spacing-ne-1`                           | `-4px`                                                                                                     |
| `--cursor-spacing-ne-1-25`                        | `-5px`                                                                                                     |
| `--cursor-spacing-ne-1-5`                         | `-6px`                                                                                                     |
| `--cursor-spacing-ne-1-75`                        | `-7px`                                                                                                     |
| `--cursor-spacing-ne-2`                           | `-8px`                                                                                                     |
| `--cursor-spacing-ne-2-25`                        | `-9px`                                                                                                     |
| `--cursor-spacing-ne-2-5`                         | `-10px`                                                                                                    |
| `--cursor-spacing-ne-2-75`                        | `-11px`                                                                                                    |
| `--cursor-spacing-ne-3`                           | `-12px`                                                                                                    |
| `--cursor-spacing-ne-3-25`                        | `-13px`                                                                                                    |
| `--cursor-spacing-ne-3-5`                         | `-14px`                                                                                                    |
| `--cursor-spacing-ne-3-75`                        | `-15px`                                                                                                    |
| `--cursor-spacing-ne-4`                           | `-16px`                                                                                                    |
| `--cursor-spacing-ne-4-25`                        | `-17px`                                                                                                    |
| `--cursor-spacing-ne-4-5`                         | `-18px`                                                                                                    |
| `--cursor-spacing-ne-4-75`                        | `-19px`                                                                                                    |
| `--cursor-spacing-ne-5`                           | `-20px`                                                                                                    |
| `--cursor-stroke-blue-primary`                    | `color-mix(in srgb, #2778c1 56%, transparent)`                                                             |
| `--cursor-stroke-blue-secondary`                  | `color-mix(in srgb, #2778c1 32%, transparent)`                                                             |
| `--cursor-stroke-cyan-primary`                    | `color-mix(in oklab, #176c74 56%, transparent)`                                                            |
| `--cursor-stroke-cyan-secondary`                  | `color-mix(in oklab, #176c74 32%, transparent)`                                                            |
| `--cursor-stroke-focused`                         | `color-mix(in oklab, #2778c1 15%, transparent)`                                                            |
| `--cursor-stroke-git-added`                       | `color-mix(in oklab, #007041 56%, transparent)`                                                            |
| `--cursor-stroke-git-modified`                    | `color-mix(in srgb, #a46700 56%, transparent)`                                                             |
| `--cursor-stroke-git-removed`                     | `color-mix(in oklab, #be1744 56%, transparent)`                                                            |
| `--cursor-stroke-git-untracked`                   | `color-mix(in srgb, #176c74 56%, transparent)`                                                             |
| `--cursor-stroke-green-primary`                   | `color-mix(in oklab, #007041 56%, transparent)`                                                            |
| `--cursor-stroke-green-secondary`                 | `color-mix(in oklab, #007041 32%, transparent)`                                                            |
| `--cursor-stroke-high-contrast`                   | `color-mix(in srgb, #141414 0%, transparent)`                                                              |
| `--cursor-stroke-magenta-primary`                 | `color-mix(in oklab, #92156a 56%, transparent)`                                                            |
| `--cursor-stroke-magenta-secondary`               | `color-mix(in oklab, #92156a 32%, transparent)`                                                            |
| `--cursor-stroke-orange-primary`                  | `color-mix(in oklab, #cd4500 56%, transparent)`                                                            |
| `--cursor-stroke-orange-secondary`                | `color-mix(in oklab, #cd4500 32%, transparent)`                                                            |
| `--cursor-stroke-primary`                         | `color-mix(in oklab, #141414 20%, transparent)`                                                            |
| `--cursor-stroke-quaternary`                      | `color-mix(in oklab, #141414 4%, transparent)`                                                             |
| `--cursor-stroke-red-primary`                     | `color-mix(in oklab, #be1744 56%, transparent)`                                                            |
| `--cursor-stroke-red-secondary`                   | `color-mix(in oklab, #be1744 32%, transparent)`                                                            |
| `--cursor-stroke-secondary`                       | `color-mix(in oklab, #141414 12%, transparent)`                                                            |
| `--cursor-stroke-tertiary`                        | `color-mix(in oklab, #141414 8%, transparent)`                                                             |
| `--cursor-stroke-tertiary-opaque`                 | `color-mix(in srgb, #141414 8%, #f8f8f8)`                                                                  |
| `--cursor-stroke-yellow-primary`                  | `color-mix(in oklab, #a46700 56%, transparent)`                                                            |
| `--cursor-stroke-yellow-secondary`                | `color-mix(in oklab, #a46700 32%, transparent)`                                                            |
| `--cursor-success`                                | `#007041`                                                                                                  |
| `--cursor-syntax-background`                      | `#fcfcfc`                                                                                                  |
| `--cursor-syntax-comment`                         | `#141414ad`                                                                                                |
| `--cursor-syntax-constant`                        | `#206595`                                                                                                  |
| `--cursor-syntax-foreground`                      | `#141414eb`                                                                                                |
| `--cursor-syntax-function`                        | `#db704b`                                                                                                  |
| `--cursor-syntax-keyword`                         | `#b3003f`                                                                                                  |
| `--cursor-syntax-link`                            | `#3c7cab`                                                                                                  |
| `--cursor-syntax-number`                          | `#b8448b`                                                                                                  |
| `--cursor-syntax-parameter`                       | `#141414eb`                                                                                                |
| `--cursor-syntax-punctuation`                     | `#141414ad`                                                                                                |
| `--cursor-syntax-string`                          | `#8f84e0`                                                                                                  |
| `--cursor-syntax-string-expression`               | `#8f84e0`                                                                                                  |
| `--cursor-terminal-ansi-black`                    | `#242424`                                                                                                  |
| `--cursor-terminal-ansi-blue`                     | `#81a1c1`                                                                                                  |
| `--cursor-terminal-ansi-bright-black`             | `#f0f0f099`                                                                                                |
| `--cursor-terminal-ansi-bright-blue`              | `#87a6c4`                                                                                                  |
| `--cursor-terminal-ansi-bright-cyan`              | `#88c0d0`                                                                                                  |
| `--cursor-terminal-ansi-bright-green`             | `#70b489`                                                                                                  |
| `--cursor-terminal-ansi-bright-magenta`           | `#b48ead`                                                                                                  |
| `--cursor-terminal-ansi-bright-red`               | `#fc6b83`                                                                                                  |
| `--cursor-terminal-ansi-bright-white`             | `#f0f0f0`                                                                                                  |
| `--cursor-terminal-ansi-bright-yellow`            | `#f1b467`                                                                                                  |
| `--cursor-terminal-ansi-cyan`                     | `#88c0d0`                                                                                                  |
| `--cursor-terminal-ansi-green`                    | `#3fa266`                                                                                                  |
| `--cursor-terminal-ansi-magenta`                  | `#b48ead`                                                                                                  |
| `--cursor-terminal-ansi-red`                      | `#fc6b83`                                                                                                  |
| `--cursor-terminal-ansi-white`                    | `#f0f0f0`                                                                                                  |
| `--cursor-terminal-ansi-yellow`                   | `#d2943e`                                                                                                  |
| `--cursor-terminal-background`                    | `#f8f8f8`                                                                                                  |
| `--cursor-terminal-foreground`                    | `#141414`                                                                                                  |
| `--cursor-terminal-selection-background`          | `color-mix(in srgb, #141414 12%, transparent)`                                                             |
| `--cursor-text-accent`                            | `#2778c1`                                                                                                  |
| `--cursor-text-active`                            | `#141414`                                                                                                  |
| `--cursor-text-blue-primary`                      | `#2778c1`                                                                                                  |
| `--cursor-text-blue-secondary`                    | `color-mix(in srgb, #2778c1 78%, transparent)`                                                             |
| `--cursor-text-code-block-background`             | `#fcfcfc`                                                                                                  |
| `--cursor-text-cyan-primary`                      | `#176c74`                                                                                                  |
| `--cursor-text-cyan-secondary`                    | `color-mix(in oklab, #176c74 78%, transparent)`                                                            |
| `--cursor-text-focused`                           | `#141414`                                                                                                  |
| `--cursor-text-git-added-primary`                 | `#007041`                                                                                                  |
| `--cursor-text-git-added-quaternary`              | `color-mix(in srgb, #007041 40%, transparent)`                                                             |
| `--cursor-text-git-added-secondary`               | `color-mix(in srgb, #007041 78%, transparent)`                                                             |
| `--cursor-text-git-added-tertiary`                | `color-mix(in srgb, #007041 64%, transparent)`                                                             |
| `--cursor-text-git-modified-primary`              | `#a46700`                                                                                                  |
| `--cursor-text-git-modified-quaternary`           | `color-mix(in srgb, #a46700 40%, transparent)`                                                             |
| `--cursor-text-git-modified-secondary`            | `color-mix(in srgb, #a46700 78%, transparent)`                                                             |
| `--cursor-text-git-modified-tertiary`             | `color-mix(in srgb, #a46700 64%, transparent)`                                                             |
| `--cursor-text-git-removed-primary`               | `#be1744`                                                                                                  |
| `--cursor-text-git-removed-quaternary`            | `color-mix(in srgb, #be1744 40%, transparent)`                                                             |
| `--cursor-text-git-removed-secondary`             | `color-mix(in srgb, #be1744 78%, transparent)`                                                             |
| `--cursor-text-git-removed-tertiary`              | `color-mix(in srgb, #be1744 64%, transparent)`                                                             |
| `--cursor-text-git-untracked-primary`             | `#176c74`                                                                                                  |
| `--cursor-text-git-untracked-quaternary`          | `color-mix(in srgb, #176c74 40%, transparent)`                                                             |
| `--cursor-text-git-untracked-secondary`           | `color-mix(in srgb, #176c74 78%, transparent)`                                                             |
| `--cursor-text-git-untracked-tertiary`            | `color-mix(in srgb, #176c74 64%, transparent)`                                                             |
| `--cursor-text-green-primary`                     | `#007041`                                                                                                  |
| `--cursor-text-green-secondary`                   | `color-mix(in oklab, #007041 78%, transparent)`                                                            |
| `--cursor-text-invert`                            | `#fcfcfc`                                                                                                  |
| `--cursor-text-link`                              | `#2778c1`                                                                                                  |
| `--cursor-text-link-active`                       | `#2778c1`                                                                                                  |
| `--cursor-text-magenta-primary`                   | `#92156a`                                                                                                  |
| `--cursor-text-magenta-secondary`                 | `color-mix(in oklab, #92156a 78%, transparent)`                                                            |
| `--cursor-text-orange-primary`                    | `#cd4500`                                                                                                  |
| `--cursor-text-orange-secondary`                  | `color-mix(in oklab, #cd4500 78%, transparent)`                                                            |
| `--cursor-text-primary`                           | `#141414`                                                                                                  |
| `--cursor-text-purple-primary`                    | `#7565cc`                                                                                                  |
| `--cursor-text-purple-secondary`                  | `color-mix(in srgb, #7565cc 78%, transparent)`                                                             |
| `--cursor-text-quaternary`                        | `color-mix(in oklab, #141414 36%, transparent)`                                                            |
| `--cursor-text-red-primary`                       | `#be1744`                                                                                                  |
| `--cursor-text-red-secondary`                     | `color-mix(in oklab, #be1744 78%, transparent)`                                                            |
| `--cursor-text-secondary`                         | `color-mix(in oklab, #141414 74%, transparent)`                                                            |
| `--cursor-text-tertiary`                          | `color-mix(in oklab, #141414 60%, transparent)`                                                            |
| `--cursor-text-yellow-primary`                    | `#a46700`                                                                                                  |
| `--cursor-text-yellow-secondary`                  | `color-mix(in oklab, #a46700 78%, transparent)`                                                            |
| `--cursor-titlebar-active-foreground`             | `color-mix(in oklab, #141414 74%, transparent)`                                                            |
| `--cursor-titlebar-inactive-foreground`           | `color-mix(in oklab, #141414 60%, transparent)`                                                            |
| `--cursor-toolbar-hover-background`               | `color-mix(in oklab, #141414 8%, transparent)`                                                             |
| `--cursor-untracked`                              | `#176c74`                                                                                                  |
| `--cursor-warn`                                   | `#a46700`                                                                                                  |
| `--cursor-yellow`                                 | `#f1b467`                                                                                                  |

---

## 17. Inventaire alphabétique complet

Total : **865** propriétés (hors `--tw-*` vides).

| Token                                             | Valeur                                                                                                     |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `--accent`                                        | `#2778c1`                                                                                                  |
| `--actionLabel`                                   | `#fcfcfc`                                                                                                  |
| `--added`                                         | `#007041`                                                                                                  |
| `--base`                                          | `#141414`                                                                                                  |
| `--bg-accent`                                     | `#2778c1`                                                                                                  |
| `--bg-accent-hover`                               | `color-mix(in oklab, #141414 10%, #2778c1)`                                                                |
| `--bg-accent-quaternary`                          | `color-mix(in oklab, #2778c1 8%, transparent)`                                                             |
| `--bg-accent-secondary`                           | `color-mix(in oklab, #2778c1 24%, transparent)`                                                            |
| `--bg-accent-tertiary`                            | `color-mix(in oklab, #2778c1 12%, transparent)`                                                            |
| `--bg-active`                                     | `color-mix(in oklab, #141414 16%, transparent)`                                                            |
| `--bg-added`                                      | `color-mix(in oklab, #007041 92%, transparent)`                                                            |
| `--bg-added-quaternary`                           | `color-mix(in oklab, #007041 8%, transparent)`                                                             |
| `--bg-added-secondary`                            | `color-mix(in oklab, #007041 24%, transparent)`                                                            |
| `--bg-added-tertiary`                             | `color-mix(in oklab, #007041 12%, transparent)`                                                            |
| `--bg-blue`                                       | `color-mix(in oklab, #2778c1 92%, transparent)`                                                            |
| `--bg-blue-quaternary`                            | `color-mix(in oklab, #2778c1 8%, transparent)`                                                             |
| `--bg-blue-secondary`                             | `color-mix(in oklab, #2778c1 24%, transparent)`                                                            |
| `--bg-blue-tertiary`                              | `color-mix(in oklab, #2778c1 12%, transparent)`                                                            |
| `--bg-brand`                                      | `#f54e00`                                                                                                  |
| `--bg-brand-hover`                                | `color-mix(in oklab, #141414 10%, #f54e00)`                                                                |
| `--bg-brand-quaternary`                           | `color-mix(in oklab, #f54e00 8%, transparent)`                                                             |
| `--bg-brand-secondary`                            | `color-mix(in oklab, #f54e00 24%, transparent)`                                                            |
| `--bg-brand-tertiary`                             | `color-mix(in oklab, #f54e00 12%, transparent)`                                                            |
| `--bg-chrome`                                     | `#f8f8f8`                                                                                                  |
| `--bg-cyan`                                       | `color-mix(in oklab, #176c74 92%, transparent)`                                                            |
| `--bg-cyan-quaternary`                            | `color-mix(in oklab, #176c74 8%, transparent)`                                                             |
| `--bg-cyan-secondary`                             | `color-mix(in oklab, #176c74 24%, transparent)`                                                            |
| `--bg-cyan-tertiary`                              | `color-mix(in oklab, #176c74 12%, transparent)`                                                            |
| `--bg-danger`                                     | `#be1744`                                                                                                  |
| `--bg-danger-hover`                               | `color-mix(in oklab, #141414 10%, #be1744)`                                                                |
| `--bg-danger-quaternary`                          | `color-mix(in oklab, #be1744 8%, transparent)`                                                             |
| `--bg-danger-secondary`                           | `color-mix(in oklab, #be1744 24%, transparent)`                                                            |
| `--bg-danger-tertiary`                            | `color-mix(in oklab, #be1744 12%, transparent)`                                                            |
| `--bg-editor`                                     | `#fcfcfc`                                                                                                  |
| `--bg-elevated`                                   | `#fcfcfc`                                                                                                  |
| `--bg-focused`                                    | `color-mix(in oklab, #141414 22%, transparent)`                                                            |
| `--bg-green`                                      | `color-mix(in oklab, #007041 92%, transparent)`                                                            |
| `--bg-green-quaternary`                           | `color-mix(in oklab, #007041 8%, transparent)`                                                             |
| `--bg-green-secondary`                            | `color-mix(in oklab, #007041 24%, transparent)`                                                            |
| `--bg-green-tertiary`                             | `color-mix(in oklab, #007041 12%, transparent)`                                                            |
| `--bg-luminous`                                   | `#fff`                                                                                                     |
| `--bg-luminous-quaternary`                        | `#ffffff0a`                                                                                                |
| `--bg-luminous-secondary`                         | `#fff3`                                                                                                    |
| `--bg-luminous-tertiary`                          | `#ffffff14`                                                                                                |
| `--bg-magenta`                                    | `color-mix(in oklab, #92156a 92%, transparent)`                                                            |
| `--bg-magenta-quaternary`                         | `color-mix(in oklab, #92156a 8%, transparent)`                                                             |
| `--bg-magenta-secondary`                          | `color-mix(in oklab, #92156a 24%, transparent)`                                                            |
| `--bg-magenta-tertiary`                           | `color-mix(in oklab, #92156a 12%, transparent)`                                                            |
| `--bg-neutral`                                    | `#141414`                                                                                                  |
| `--bg-neutral-hover`                              | `color-mix(in oklab, #f8f8f8 10%, #141414)`                                                                |
| `--bg-neutral-secondary`                          | `color-mix(in oklab, #141414 24%, transparent)`                                                            |
| `--bg-orange`                                     | `color-mix(in oklab, #cd4500 92%, transparent)`                                                            |
| `--bg-orange-quaternary`                          | `color-mix(in oklab, #cd4500 8%, transparent)`                                                             |
| `--bg-orange-secondary`                           | `color-mix(in oklab, #cd4500 24%, transparent)`                                                            |
| `--bg-orange-tertiary`                            | `color-mix(in oklab, #cd4500 12%, transparent)`                                                            |
| `--bg-primary`                                    | `color-mix(in oklab, #141414 20%, transparent)`                                                            |
| `--bg-primary-opaque`                             | `color-mix(in oklab, #141414 20%, #f8f8f8)`                                                                |
| `--bg-purple`                                     | `color-mix(in oklab, #7565cc 92%, transparent)`                                                            |
| `--bg-purple-quaternary`                          | `color-mix(in oklab, #7565cc 8%, transparent)`                                                             |
| `--bg-purple-secondary`                           | `color-mix(in oklab, #7565cc 24%, transparent)`                                                            |
| `--bg-purple-tertiary`                            | `color-mix(in oklab, #7565cc 12%, transparent)`                                                            |
| `--bg-quaternary`                                 | `color-mix(in oklab, #141414 6%, transparent)`                                                             |
| `--bg-quaternary-opaque`                          | `color-mix(in oklab, #141414 6%, #f8f8f8)`                                                                 |
| `--bg-quaternary-opaque-elevated`                 | `color-mix(in oklab, #141414 6%, #fcfcfc)`                                                                 |
| `--bg-quinary`                                    | `color-mix(in oklab, #141414 4%, transparent)`                                                             |
| `--bg-quinary-opaque`                             | `color-mix(in oklab, #141414 4%, #f8f8f8)`                                                                 |
| `--bg-red`                                        | `color-mix(in oklab, #be1744 92%, transparent)`                                                            |
| `--bg-red-quaternary`                             | `color-mix(in oklab, #be1744 8%, transparent)`                                                             |
| `--bg-red-secondary`                              | `color-mix(in oklab, #be1744 24%, transparent)`                                                            |
| `--bg-red-tertiary`                               | `color-mix(in oklab, #be1744 12%, transparent)`                                                            |
| `--bg-removed`                                    | `color-mix(in oklab, #be1744 92%, transparent)`                                                            |
| `--bg-removed-quaternary`                         | `color-mix(in oklab, #be1744 8%, transparent)`                                                             |
| `--bg-removed-secondary`                          | `color-mix(in oklab, #be1744 24%, transparent)`                                                            |
| `--bg-removed-tertiary`                           | `color-mix(in oklab, #be1744 12%, transparent)`                                                            |
| `--bg-scrim`                                      | `#0006`                                                                                                    |
| `--bg-secondary`                                  | `color-mix(in oklab, #141414 14%, transparent)`                                                            |
| `--bg-secondary-opaque`                           | `color-mix(in oklab, #141414 14%, #f8f8f8)`                                                                |
| `--bg-sidebar`                                    | `#f3f3f3`                                                                                                  |
| `--bg-success`                                    | `#007041`                                                                                                  |
| `--bg-success-hover`                              | `color-mix(in oklab, #141414 10%, #007041)`                                                                |
| `--bg-success-quaternary`                         | `color-mix(in oklab, #007041 8%, transparent)`                                                             |
| `--bg-success-secondary`                          | `color-mix(in oklab, #007041 24%, transparent)`                                                            |
| `--bg-success-tertiary`                           | `color-mix(in oklab, #007041 12%, transparent)`                                                            |
| `--bg-tertiary`                                   | `color-mix(in oklab, #141414 8%, transparent)`                                                             |
| `--bg-tertiary-opaque`                            | `color-mix(in oklab, #141414 8%, #f8f8f8)`                                                                 |
| `--bg-unified-elevated`                           | `#fcfcfc`                                                                                                  |
| `--bg-warn`                                       | `#a46700`                                                                                                  |
| `--bg-warn-hover`                                 | `color-mix(in oklab, #141414 10%, #a46700)`                                                                |
| `--bg-warn-quaternary`                            | `color-mix(in oklab, #a46700 8%, transparent)`                                                             |
| `--bg-warn-secondary`                             | `color-mix(in oklab, #a46700 24%, transparent)`                                                            |
| `--bg-warn-tertiary`                              | `color-mix(in oklab, #a46700 12%, transparent)`                                                            |
| `--bg-yellow`                                     | `color-mix(in oklab, #a46700 92%, transparent)`                                                            |
| `--bg-yellow-quaternary`                          | `color-mix(in oklab, #a46700 8%, transparent)`                                                             |
| `--bg-yellow-secondary`                           | `color-mix(in oklab, #a46700 24%, transparent)`                                                            |
| `--bg-yellow-tertiary`                            | `color-mix(in oklab, #a46700 12%, transparent)`                                                            |
| `--black`                                         | `#000`                                                                                                     |
| `--blue`                                          | `#2778c1`                                                                                                  |
| `--border-accent`                                 | `color-mix(in oklab, #2778c1 92%, transparent)`                                                            |
| `--border-accent-quaternary`                      | `color-mix(in oklab, #2778c1 28%, transparent)`                                                            |
| `--border-accent-secondary`                       | `color-mix(in oklab, #2778c1 56%, transparent)`                                                            |
| `--border-accent-tertiary`                        | `color-mix(in oklab, #2778c1 32%, transparent)`                                                            |
| `--border-added`                                  | `color-mix(in oklab, #007041 92%, transparent)`                                                            |
| `--border-added-quaternary`                       | `color-mix(in oklab, #007041 28%, transparent)`                                                            |
| `--border-added-secondary`                        | `color-mix(in oklab, #007041 56%, transparent)`                                                            |
| `--border-added-tertiary`                         | `color-mix(in oklab, #007041 32%, transparent)`                                                            |
| `--border-blue`                                   | `color-mix(in oklab, #2778c1 92%, transparent)`                                                            |
| `--border-blue-quaternary`                        | `color-mix(in oklab, #2778c1 28%, transparent)`                                                            |
| `--border-blue-secondary`                         | `color-mix(in oklab, #2778c1 56%, transparent)`                                                            |
| `--border-blue-tertiary`                          | `color-mix(in oklab, #2778c1 32%, transparent)`                                                            |
| `--border-brand`                                  | `color-mix(in oklab, #f54e00 92%, transparent)`                                                            |
| `--border-brand-quaternary`                       | `color-mix(in oklab, #f54e00 28%, transparent)`                                                            |
| `--border-brand-secondary`                        | `color-mix(in oklab, #f54e00 56%, transparent)`                                                            |
| `--border-brand-tertiary`                         | `color-mix(in oklab, #f54e00 32%, transparent)`                                                            |
| `--border-cyan`                                   | `color-mix(in oklab, #176c74 92%, transparent)`                                                            |
| `--border-cyan-quaternary`                        | `color-mix(in oklab, #176c74 28%, transparent)`                                                            |
| `--border-cyan-secondary`                         | `color-mix(in oklab, #176c74 56%, transparent)`                                                            |
| `--border-cyan-tertiary`                          | `color-mix(in oklab, #176c74 32%, transparent)`                                                            |
| `--border-danger`                                 | `color-mix(in oklab, #be1744 92%, transparent)`                                                            |
| `--border-danger-quaternary`                      | `color-mix(in oklab, #be1744 28%, transparent)`                                                            |
| `--border-danger-secondary`                       | `color-mix(in oklab, #be1744 56%, transparent)`                                                            |
| `--border-danger-tertiary`                        | `color-mix(in oklab, #be1744 32%, transparent)`                                                            |
| `--border-focus`                                  | `color-mix(in oklab, #2778c1 15%, transparent)`                                                            |
| `--border-green`                                  | `color-mix(in oklab, #007041 92%, transparent)`                                                            |
| `--border-green-quaternary`                       | `color-mix(in oklab, #007041 28%, transparent)`                                                            |
| `--border-green-secondary`                        | `color-mix(in oklab, #007041 56%, transparent)`                                                            |
| `--border-green-tertiary`                         | `color-mix(in oklab, #007041 32%, transparent)`                                                            |
| `--border-magenta`                                | `color-mix(in oklab, #92156a 92%, transparent)`                                                            |
| `--border-magenta-quaternary`                     | `color-mix(in oklab, #92156a 28%, transparent)`                                                            |
| `--border-magenta-secondary`                      | `color-mix(in oklab, #92156a 56%, transparent)`                                                            |
| `--border-magenta-tertiary`                       | `color-mix(in oklab, #92156a 32%, transparent)`                                                            |
| `--border-neutral`                                | `color-mix(in oklab, #141414 80%, transparent)`                                                            |
| `--border-orange`                                 | `color-mix(in oklab, #cd4500 92%, transparent)`                                                            |
| `--border-orange-quaternary`                      | `color-mix(in oklab, #cd4500 28%, transparent)`                                                            |
| `--border-orange-secondary`                       | `color-mix(in oklab, #cd4500 56%, transparent)`                                                            |
| `--border-orange-tertiary`                        | `color-mix(in oklab, #cd4500 32%, transparent)`                                                            |
| `--border-primary`                                | `color-mix(in oklab, #141414 20%, transparent)`                                                            |
| `--border-purple`                                 | `color-mix(in oklab, #7565cc 92%, transparent)`                                                            |
| `--border-purple-quaternary`                      | `color-mix(in oklab, #7565cc 28%, transparent)`                                                            |
| `--border-purple-secondary`                       | `color-mix(in oklab, #7565cc 56%, transparent)`                                                            |
| `--border-purple-tertiary`                        | `color-mix(in oklab, #7565cc 32%, transparent)`                                                            |
| `--border-quaternary`                             | `color-mix(in oklab, #141414 4%, transparent)`                                                             |
| `--border-quaternary-opaque`                      | `color-mix(in oklab, color-mix(in oklab, #141414 4%, transparent) 100%, #fcfcfc)`                          |
| `--border-red`                                    | `color-mix(in oklab, #be1744 92%, transparent)`                                                            |
| `--border-red-quaternary`                         | `color-mix(in oklab, #be1744 28%, transparent)`                                                            |
| `--border-red-secondary`                          | `color-mix(in oklab, #be1744 56%, transparent)`                                                            |
| `--border-red-tertiary`                           | `color-mix(in oklab, #be1744 32%, transparent)`                                                            |
| `--border-removed`                                | `color-mix(in oklab, #be1744 92%, transparent)`                                                            |
| `--border-removed-quaternary`                     | `color-mix(in oklab, #be1744 28%, transparent)`                                                            |
| `--border-removed-secondary`                      | `color-mix(in oklab, #be1744 56%, transparent)`                                                            |
| `--border-removed-tertiary`                       | `color-mix(in oklab, #be1744 32%, transparent)`                                                            |
| `--border-secondary`                              | `color-mix(in oklab, #141414 12%, transparent)`                                                            |
| `--border-success`                                | `color-mix(in oklab, #007041 92%, transparent)`                                                            |
| `--border-success-quaternary`                     | `color-mix(in oklab, #007041 28%, transparent)`                                                            |
| `--border-success-secondary`                      | `color-mix(in oklab, #007041 56%, transparent)`                                                            |
| `--border-success-tertiary`                       | `color-mix(in oklab, #007041 32%, transparent)`                                                            |
| `--border-tertiary`                               | `color-mix(in oklab, #141414 8%, transparent)`                                                             |
| `--border-tertiary-opaque`                        | `color-mix(in oklab, color-mix(in oklab, #141414 8%, transparent) 100%, #fcfcfc)`                          |
| `--border-warn`                                   | `color-mix(in oklab, #a46700 92%, transparent)`                                                            |
| `--border-warn-quaternary`                        | `color-mix(in oklab, #a46700 28%, transparent)`                                                            |
| `--border-warn-secondary`                         | `color-mix(in oklab, #a46700 56%, transparent)`                                                            |
| `--border-warn-tertiary`                          | `color-mix(in oklab, #a46700 32%, transparent)`                                                            |
| `--border-yellow`                                 | `color-mix(in oklab, #a46700 92%, transparent)`                                                            |
| `--border-yellow-quaternary`                      | `color-mix(in oklab, #a46700 28%, transparent)`                                                            |
| `--border-yellow-secondary`                       | `color-mix(in oklab, #a46700 56%, transparent)`                                                            |
| `--border-yellow-tertiary`                        | `color-mix(in oklab, #a46700 32%, transparent)`                                                            |
| `--borders`                                       | `#ccc`                                                                                                     |
| `--brand`                                         | `#f54e00`                                                                                                  |
| `--chrome`                                        | `#f8f8f8`                                                                                                  |
| `--color-dashboard-analytics-gray`                | `#8a7a6a`                                                                                                  |
| `--color-dashboard-analytics-quaternary`          | `#c25728e0`                                                                                                |
| `--color-dashboard-analytics-quinary`             | `#b89428e0`                                                                                                |
| `--color-dashboard-analytics-tertiary`            | `#e9b33be0`                                                                                                |
| `--color-dashboard-bugbot-legend-found`           | `#d06ba6`                                                                                                  |
| `--color-dashboard-bugbot-legend-high`            | `#db704b`                                                                                                  |
| `--color-dashboard-bugbot-legend-low`             | `#3c7cab`                                                                                                  |
| `--color-dashboard-bugbot-legend-medium`          | `#a16900`                                                                                                  |
| `--color-dashboard-bugbot-primary`                | `#005c42`                                                                                                  |
| `--color-dashboard-bugbot-quaternary`             | `#89045e`                                                                                                  |
| `--color-dashboard-bugbot-quinary`                | `#1f8a65`                                                                                                  |
| `--color-dashboard-bugbot-secondary`              | `#1f8a65`                                                                                                  |
| `--color-dashboard-bugbot-status-merged`          | `#8250df`                                                                                                  |
| `--color-dashboard-bugbot-status-open`            | `#1f883d`                                                                                                  |
| `--color-dashboard-bugbot-tertiary`               | `#a33900`                                                                                                  |
| `--color-dashboard-chart-1`                       | `#1f8a65e0`                                                                                                |
| `--color-dashboard-chart-1-muted`                 | `#70b0d8e0`                                                                                                |
| `--color-dashboard-chart-10`                      | `#4c566a`                                                                                                  |
| `--color-dashboard-chart-2`                       | `#81a1c1`                                                                                                  |
| `--color-dashboard-chart-3`                       | `#5e81ac`                                                                                                  |
| `--color-dashboard-chart-4`                       | `#b48ead`                                                                                                  |
| `--color-dashboard-chart-5`                       | `#a3be8c`                                                                                                  |
| `--color-dashboard-chart-6`                       | `#ebcb8b`                                                                                                  |
| `--color-dashboard-chart-7`                       | `#d08770`                                                                                                  |
| `--color-dashboard-chart-8`                       | `#bf616a`                                                                                                  |
| `--color-dashboard-chart-9`                       | `#8fbcbb`                                                                                                  |
| `--color-dashboard-highlight`                     | `#00000014`                                                                                                |
| `--color-dashboard-usage-accent`                  | `#81a1c1`                                                                                                  |
| `--color-dashboard-usage-accent-10`               | `color-mix(in oklab, #81a1c1 10%, transparent)`                                                            |
| `--color-dashboard-usage-accent-60`               | `color-mix(in oklab, #81a1c1 60%, transparent)`                                                            |
| `--color-theme-accent`                            | `#f54e00`                                                                                                  |
| `--color-theme-accent-hover`                      | `color-mix(in oklab, #f54e00 85%, black)`                                                                  |
| `--color-theme-shadow-card`                       | `0 0 2px 0 #0000000f, 0 6px 16px 0 #0000000f`                                                              |
| `--color-theme-shadow-command`                    | `0 25px 50px -12px #00000040, 0 12px 24px -8px #00000026`                                                  |
| `--color-theme-shadow-dialog`                     | `0 0 0 1px color-mix(in oklab, #141414 8%, transparent), 0 0 2px 0 #0000000f, 0 6px 16px 0 #0000000f`      |
| `--color-theme-shadow-elevated`                   | `0 8px 32px #0003`                                                                                         |
| `--color-theme-shadow-popover`                    | `0 10px 15px -3px #0000001a, 0 4px 6px -2px #0000000d`                                                     |
| `--color-theme-tooltip-bg`                        | `#fff`                                                                                                     |
| `--cursor-accent`                                 | `#2778c1`                                                                                                  |
| `--cursor-action-label`                           | `#fcfcfc`                                                                                                  |
| `--cursor-added`                                  | `#007041`                                                                                                  |
| `--cursor-base`                                   | `#141414`                                                                                                  |
| `--cursor-bg-accent`                              | `#2778c1`                                                                                                  |
| `--cursor-bg-accent-hover`                        | `color-mix(in oklab, #141414 10%, #2778c1)`                                                                |
| `--cursor-bg-accent-quaternary`                   | `color-mix(in srgb, #2778c1 8%, transparent)`                                                              |
| `--cursor-bg-accent-secondary`                    | `color-mix(in srgb, #2778c1 24%, transparent)`                                                             |
| `--cursor-bg-accent-tertiary`                     | `color-mix(in srgb, #2778c1 12%, transparent)`                                                             |
| `--cursor-bg-active`                              | `color-mix(in oklab, #141414 16%, transparent)`                                                            |
| `--cursor-bg-blue-primary`                        | `#2778c1`                                                                                                  |
| `--cursor-bg-blue-secondary`                      | `color-mix(in srgb, #2778c1 12%, transparent)`                                                             |
| `--cursor-bg-card`                                | `color-mix(in oklab, #141414 6%, transparent)`                                                             |
| `--cursor-bg-chrome`                              | `#f8f8f8`                                                                                                  |
| `--cursor-bg-cyan-primary`                        | `#176c74`                                                                                                  |
| `--cursor-bg-cyan-secondary`                      | `color-mix(in oklab, #176c74 12%, transparent)`                                                            |
| `--cursor-bg-diff-inserted`                       | `#00af6624`                                                                                                |
| `--cursor-bg-diff-removed`                        | `#ff617b38`                                                                                                |
| `--cursor-bg-editor`                              | `#fcfcfc`                                                                                                  |
| `--cursor-bg-elevated`                            | `#fcfcfc`                                                                                                  |
| `--cursor-bg-focused`                             | `color-mix(in oklab, #141414 22%, transparent)`                                                            |
| `--cursor-bg-git-added-hover`                     | `color-mix(in srgb, #141414 10%, #007041)`                                                                 |
| `--cursor-bg-git-added-primary`                   | `#007041`                                                                                                  |
| `--cursor-bg-git-added-quaternary`                | `color-mix(in srgb, #007041 8%, transparent)`                                                              |
| `--cursor-bg-git-added-secondary`                 | `color-mix(in srgb, #007041 24%, transparent)`                                                             |
| `--cursor-bg-git-added-tertiary`                  | `color-mix(in srgb, #007041 12%, transparent)`                                                             |
| `--cursor-bg-git-modified-hover`                  | `color-mix(in srgb, #141414 10%, #a46700)`                                                                 |
| `--cursor-bg-git-modified-primary`                | `#a46700`                                                                                                  |
| `--cursor-bg-git-modified-quaternary`             | `color-mix(in srgb, #a46700 8%, transparent)`                                                              |
| `--cursor-bg-git-modified-secondary`              | `color-mix(in srgb, #a46700 24%, transparent)`                                                             |
| `--cursor-bg-git-modified-tertiary`               | `color-mix(in srgb, #a46700 12%, transparent)`                                                             |
| `--cursor-bg-git-removed-hover`                   | `color-mix(in srgb, #141414 10%, #be1744)`                                                                 |
| `--cursor-bg-git-removed-primary`                 | `#be1744`                                                                                                  |
| `--cursor-bg-git-removed-quaternary`              | `color-mix(in srgb, #be1744 8%, transparent)`                                                              |
| `--cursor-bg-git-removed-secondary`               | `color-mix(in srgb, #be1744 24%, transparent)`                                                             |
| `--cursor-bg-git-removed-tertiary`                | `color-mix(in srgb, #be1744 12%, transparent)`                                                             |
| `--cursor-bg-git-untracked-hover`                 | `color-mix(in srgb, #141414 10%, #176c74)`                                                                 |
| `--cursor-bg-git-untracked-primary`               | `#176c74`                                                                                                  |
| `--cursor-bg-git-untracked-quaternary`            | `color-mix(in srgb, #176c74 8%, transparent)`                                                              |
| `--cursor-bg-git-untracked-secondary`             | `color-mix(in srgb, #176c74 24%, transparent)`                                                             |
| `--cursor-bg-git-untracked-tertiary`              | `color-mix(in srgb, #176c74 12%, transparent)`                                                             |
| `--cursor-bg-green-primary`                       | `#007041`                                                                                                  |
| `--cursor-bg-green-secondary`                     | `color-mix(in oklab, #007041 12%, transparent)`                                                            |
| `--cursor-bg-input`                               | `#fcfcfc`                                                                                                  |
| `--cursor-bg-input-surface`                       | `color-mix(in oklab, #141414 6%, transparent)`                                                             |
| `--cursor-bg-magenta-primary`                     | `#92156a`                                                                                                  |
| `--cursor-bg-magenta-secondary`                   | `color-mix(in oklab, #92156a 12%, transparent)`                                                            |
| `--cursor-bg-orange-primary`                      | `#cd4500`                                                                                                  |
| `--cursor-bg-orange-secondary`                    | `color-mix(in oklab, #cd4500 12%, transparent)`                                                            |
| `--cursor-bg-primary`                             | `color-mix(in oklab, #141414 20%, transparent)`                                                            |
| `--cursor-bg-purple-primary`                      | `#7565cc`                                                                                                  |
| `--cursor-bg-purple-secondary`                    | `color-mix(in oklab, #7565cc 12%, transparent)`                                                            |
| `--cursor-bg-purple-tertiary`                     | `color-mix(in oklab, #7565cc 8%, transparent)`                                                             |
| `--cursor-bg-quaternary`                          | `color-mix(in oklab, #141414 6%, transparent)`                                                             |
| `--cursor-bg-quinary`                             | `color-mix(in oklab, #141414 4%, transparent)`                                                             |
| `--cursor-bg-red-primary`                         | `#be1744`                                                                                                  |
| `--cursor-bg-red-secondary`                       | `color-mix(in oklab, #be1744 12%, transparent)`                                                            |
| `--cursor-bg-secondary`                           | `color-mix(in oklab, #141414 14%, transparent)`                                                            |
| `--cursor-bg-sidebar`                             | `#f3f3f3`                                                                                                  |
| `--cursor-bg-tertiary`                            | `color-mix(in oklab, #141414 8%, transparent)`                                                             |
| `--cursor-bg-yellow-primary`                      | `#a46700`                                                                                                  |
| `--cursor-bg-yellow-secondary`                    | `color-mix(in oklab, #a46700 12%, transparent)`                                                            |
| `--cursor-blue`                                   | `#2778c1`                                                                                                  |
| `--cursor-box-shadow-base`                        | `0 0 0 1px color-mix(in oklab, #141414 8%, transparent), 0 0 4px 0px #00000009, 0 8px 24px -2px #00000009` |
| `--cursor-box-shadow-lg`                          | `0 0 4px 0 rgba(255, 255, 255, 0.05) inset, 0 0 3px 0 #00000009, 0 16px 24px 0 #00000005`                  |
| `--cursor-box-shadow-popup`                       | `0 8px 16px 0 rgba(20, 20, 20, 0.12)`                                                                      |
| `--cursor-box-shadow-sm`                          | `0 2px 8px 0px #00000009`                                                                                  |
| `--cursor-box-shadow-soft`                        | `0 0 8px 2px #00000005`                                                                                    |
| `--cursor-box-shadow-workbench`                   | `0 0 2px 0 #0000000f, 0 6px 16px 0 #0000000f`                                                              |
| `--cursor-box-shadow-xl`                          | `0 0 4px 0 rgba(255, 255, 255, 0.05) inset, 0 0 6px 8px #00000009, 0 24px 16px 6px #00000005`              |
| `--cursor-brand`                                  | `#f54e00`                                                                                                  |
| `--cursor-button-background`                      | `#141414`                                                                                                  |
| `--cursor-button-foreground`                      | `#fcfcfc`                                                                                                  |
| `--cursor-button-hover-background`                | `color-mix(in oklab, #f8f8f8 10%, #141414)`                                                                |
| `--cursor-button-secondary-background`            | `color-mix(in oklab, #141414 8%, transparent)`                                                             |
| `--cursor-button-secondary-foreground`            | `#141414`                                                                                                  |
| `--cursor-button-secondary-hover-background`      | `color-mix(in oklab, #141414 6%, transparent)`                                                             |
| `--cursor-chrome`                                 | `#f8f8f8`                                                                                                  |
| `--cursor-command-center-active-background`       | `color-mix(in oklab, #141414 14%, transparent)`                                                            |
| `--cursor-command-center-active-border`           | `color-mix(in oklab, #141414 20%, transparent)`                                                            |
| `--cursor-command-center-active-foreground`       | `color-mix(in oklab, #141414 74%, transparent)`                                                            |
| `--cursor-command-center-background`              | `color-mix(in oklab, #141414 8%, transparent)`                                                             |
| `--cursor-command-center-border`                  | `color-mix(in oklab, #141414 12%, transparent)`                                                            |
| `--cursor-command-center-foreground`              | `color-mix(in oklab, #141414 74%, transparent)`                                                            |
| `--cursor-command-center-inactive-border`         | `color-mix(in oklab, #141414 12%, transparent)`                                                            |
| `--cursor-command-center-inactive-foreground`     | `color-mix(in oklab, #141414 60%, transparent)`                                                            |
| `--cursor-cyan`                                   | `#81a1c1`                                                                                                  |
| `--cursor-danger`                                 | `#be1744`                                                                                                  |
| `--cursor-diff-added-line-background`             | `#3fa26633`                                                                                                |
| `--cursor-diff-added-text-background`             | `#3fa26622`                                                                                                |
| `--cursor-diff-removed-line-background`           | `#b8004933`                                                                                                |
| `--cursor-diff-removed-text-background`           | `#b8004922`                                                                                                |
| `--cursor-duration-fast`                          | `100ms`                                                                                                    |
| `--cursor-duration-instant`                       | `50ms`                                                                                                     |
| `--cursor-duration-normal`                        | `150ms`                                                                                                    |
| `--cursor-duration-slow`                          | `200ms`                                                                                                    |
| `--cursor-duration-slower`                        | `300ms`                                                                                                    |
| `--cursor-easing-default`                         | `ease`                                                                                                     |
| `--cursor-easing-in`                              | `ease-in`                                                                                                  |
| `--cursor-easing-in-out`                          | `ease-in-out`                                                                                              |
| `--cursor-easing-in-out-strong`                   | `cubic-bezier(0.77, 0, 0.175, 1)`                                                                          |
| `--cursor-easing-in-strong`                       | `cubic-bezier(0.895, 0.03, 0.685, 0.22)`                                                                   |
| `--cursor-easing-out`                             | `ease-out`                                                                                                 |
| `--cursor-easing-out-quint`                       | `cubic-bezier(0.16, 1, 0.3, 1)`                                                                            |
| `--cursor-easing-out-strong`                      | `cubic-bezier(0.165, 0.84, 0.44, 1)`                                                                       |
| `--cursor-editor`                                 | `#fcfcfc`                                                                                                  |
| `--cursor-editor-bracket-match-background`        | `color-mix(in srgb, #007041 22%, transparent)`                                                             |
| `--cursor-editor-bracket-match-border`            | `color-mix(in srgb, #141414 52%, transparent)`                                                             |
| `--cursor-editor-cursor-foreground`               | `#141414`                                                                                                  |
| `--cursor-editor-find-match-background`           | `color-mix(in srgb, #a46700 72%, transparent)`                                                             |
| `--cursor-editor-find-match-highlight-background` | `color-mix(in srgb, #a46700 32%, transparent)`                                                             |
| `--cursor-editor-foreground`                      | `#141414`                                                                                                  |
| `--cursor-editor-gutter-background`               | `#fcfcfc`                                                                                                  |
| `--cursor-editor-inactive-selection-background`   | `color-mix(in srgb, #2778c1 30%, transparent)`                                                             |
| `--cursor-editor-indent-guide-active-background`  | `color-mix(in srgb, #141414 40%, transparent)`                                                             |
| `--cursor-editor-indent-guide-background`         | `color-mix(in srgb, #141414 22%, transparent)`                                                             |
| `--cursor-editor-line-highlight-background`       | `color-mix(in srgb, #141414 8%, transparent)`                                                              |
| `--cursor-editor-line-number-active-foreground`   | `#141414`                                                                                                  |
| `--cursor-editor-line-number-foreground`          | `color-mix(in oklab, #141414 60%, transparent)`                                                            |
| `--cursor-editor-selection-background`            | `color-mix(in srgb, #2778c1 42%, transparent)`                                                             |
| `--cursor-editor-selection-highlight-background`  | `color-mix(in srgb, #2778c1 32%, transparent)`                                                             |
| `--cursor-editor-whitespace-foreground`           | `color-mix(in srgb, #141414 22%, transparent)`                                                             |
| `--cursor-editor-widget-background`               | `#fcfcfc`                                                                                                  |
| `--cursor-editor-widget-border`                   | `color-mix(in oklab, #141414 12%, transparent)`                                                            |
| `--cursor-editor-widget-foreground`               | `#141414`                                                                                                  |
| `--cursor-elevation-1`                            | `1`                                                                                                        |
| `--cursor-elevation-2`                            | `2`                                                                                                        |
| `--cursor-focus`                                  | `#2778c1`                                                                                                  |
| `--cursor-font-family-mono`                       | `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace`       |
| `--cursor-font-family-sans`                       | `-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`                                                |
| `--cursor-font-size-base`                         | `13px`                                                                                                     |
| `--cursor-font-size-lg`                           | `14px`                                                                                                     |
| `--cursor-font-size-sm`                           | `12px`                                                                                                     |
| `--cursor-font-size-xs`                           | `11px`                                                                                                     |
| `--cursor-font-weight-bold`                       | `700`                                                                                                      |
| `--cursor-font-weight-medium`                     | `500`                                                                                                      |
| `--cursor-font-weight-normal`                     | `418`                                                                                                      |
| `--cursor-font-weight-regular`                    | `418`                                                                                                      |
| `--cursor-font-weight-semibold`                   | `600`                                                                                                      |
| `--cursor-foreground`                             | `#141414`                                                                                                  |
| `--cursor-green`                                  | `#3fa266`                                                                                                  |
| `--cursor-height-base`                            | `28px`                                                                                                     |
| `--cursor-height-lg`                              | `32px`                                                                                                     |
| `--cursor-height-sm`                              | `24px`                                                                                                     |
| `--cursor-height-xs`                              | `20px`                                                                                                     |
| `--cursor-icon-accent-primary`                    | `#2778c1`                                                                                                  |
| `--cursor-icon-accent-secondary`                  | `color-mix(in oklab, #2778c1 70%, transparent)`                                                            |
| `--cursor-icon-blue-primary`                      | `#2778c1`                                                                                                  |
| `--cursor-icon-blue-secondary`                    | `color-mix(in srgb, #2778c1 70%, transparent)`                                                             |
| `--cursor-icon-cyan-primary`                      | `#176c74`                                                                                                  |
| `--cursor-icon-cyan-secondary`                    | `color-mix(in oklab, #176c74 70%, transparent)`                                                            |
| `--cursor-icon-git-added-primary`                 | `#007041`                                                                                                  |
| `--cursor-icon-git-added-quaternary`              | `color-mix(in srgb, #007041 32%, transparent)`                                                             |
| `--cursor-icon-git-added-secondary`               | `color-mix(in srgb, #007041 70%, transparent)`                                                             |
| `--cursor-icon-git-added-tertiary`                | `color-mix(in srgb, #007041 56%, transparent)`                                                             |
| `--cursor-icon-git-modified-primary`              | `#a46700`                                                                                                  |
| `--cursor-icon-git-modified-quaternary`           | `color-mix(in srgb, #a46700 32%, transparent)`                                                             |
| `--cursor-icon-git-modified-secondary`            | `color-mix(in srgb, #a46700 70%, transparent)`                                                             |
| `--cursor-icon-git-modified-tertiary`             | `color-mix(in srgb, #a46700 56%, transparent)`                                                             |
| `--cursor-icon-git-removed-primary`               | `#be1744`                                                                                                  |
| `--cursor-icon-git-removed-quaternary`            | `color-mix(in srgb, #be1744 32%, transparent)`                                                             |
| `--cursor-icon-git-removed-secondary`             | `color-mix(in srgb, #be1744 70%, transparent)`                                                             |
| `--cursor-icon-git-removed-tertiary`              | `color-mix(in srgb, #be1744 56%, transparent)`                                                             |
| `--cursor-icon-git-untracked-primary`             | `#176c74`                                                                                                  |
| `--cursor-icon-git-untracked-quaternary`          | `color-mix(in srgb, #176c74 32%, transparent)`                                                             |
| `--cursor-icon-git-untracked-secondary`           | `color-mix(in srgb, #176c74 70%, transparent)`                                                             |
| `--cursor-icon-git-untracked-tertiary`            | `color-mix(in srgb, #176c74 56%, transparent)`                                                             |
| `--cursor-icon-green-primary`                     | `#007041`                                                                                                  |
| `--cursor-icon-green-secondary`                   | `color-mix(in oklab, #007041 70%, transparent)`                                                            |
| `--cursor-icon-magenta-primary`                   | `#92156a`                                                                                                  |
| `--cursor-icon-magenta-secondary`                 | `color-mix(in oklab, #92156a 70%, transparent)`                                                            |
| `--cursor-icon-orange-primary`                    | `#cd4500`                                                                                                  |
| `--cursor-icon-orange-secondary`                  | `color-mix(in oklab, #cd4500 70%, transparent)`                                                            |
| `--cursor-icon-primary`                           | `#141414`                                                                                                  |
| `--cursor-icon-purple-primary`                    | `#7565cc`                                                                                                  |
| `--cursor-icon-purple-secondary`                  | `color-mix(in oklab, #7565cc 70%, transparent)`                                                            |
| `--cursor-icon-quaternary`                        | `color-mix(in oklab, #141414 28%, transparent)`                                                            |
| `--cursor-icon-red-primary`                       | `#be1744`                                                                                                  |
| `--cursor-icon-red-secondary`                     | `color-mix(in oklab, #be1744 70%, transparent)`                                                            |
| `--cursor-icon-secondary`                         | `color-mix(in oklab, #141414 66%, transparent)`                                                            |
| `--cursor-icon-tertiary`                          | `color-mix(in oklab, #141414 52%, transparent)`                                                            |
| `--cursor-icon-yellow-primary`                    | `#a46700`                                                                                                  |
| `--cursor-icon-yellow-secondary`                  | `color-mix(in oklab, #a46700 70%, transparent)`                                                            |
| `--cursor-input-border`                           | `color-mix(in oklab, #141414 12%, transparent)`                                                            |
| `--cursor-input-placeholder-foreground`           | `color-mix(in oklab, #141414 36%, transparent)`                                                            |
| `--cursor-letter-spacing-2xl`                     | `-0.46px`                                                                                                  |
| `--cursor-letter-spacing-3xl`                     | `-0.26px`                                                                                                  |
| `--cursor-letter-spacing-base`                    | `-0.08px`                                                                                                  |
| `--cursor-letter-spacing-lg`                      | `-0.15px`                                                                                                  |
| `--cursor-letter-spacing-sm`                      | `0px`                                                                                                      |
| `--cursor-letter-spacing-xl`                      | `0.08px`                                                                                                   |
| `--cursor-letter-spacing-xs`                      | `0.07px`                                                                                                   |
| `--cursor-line-height-base`                       | `18px`                                                                                                     |
| `--cursor-line-height-lg`                         | `22px`                                                                                                     |
| `--cursor-line-height-sm`                         | `16px`                                                                                                     |
| `--cursor-line-height-xs`                         | `14px`                                                                                                     |
| `--cursor-magenta`                                | `#b48ead`                                                                                                  |
| `--cursor-modified`                               | `#a46700`                                                                                                  |
| `--cursor-orange`                                 | `#d08770`                                                                                                  |
| `--cursor-progress-bar-background`                | `#2778c1`                                                                                                  |
| `--cursor-purple`                                 | `#7565cc`                                                                                                  |
| `--cursor-radius-2xl`                             | `14px`                                                                                                     |
| `--cursor-radius-3xl`                             | `16px`                                                                                                     |
| `--cursor-radius-base`                            | `6px`                                                                                                      |
| `--cursor-radius-full`                            | `9999px`                                                                                                   |
| `--cursor-radius-lg`                              | `8px`                                                                                                      |
| `--cursor-radius-none`                            | `0px`                                                                                                      |
| `--cursor-radius-sm`                              | `4px`                                                                                                      |
| `--cursor-radius-xl`                              | `12px`                                                                                                     |
| `--cursor-radius-xs`                              | `2px`                                                                                                      |
| `--cursor-red`                                    | `#fc6b83`                                                                                                  |
| `--cursor-removed`                                | `#be1744`                                                                                                  |
| `--cursor-scrollbar-horizontal-size`              | `12px`                                                                                                     |
| `--cursor-scrollbar-shadow`                       | `#0000000f`                                                                                                |
| `--cursor-scrollbar-thumb-active-background`      | `color-mix(in srgb, #141414 26%, transparent)`                                                             |
| `--cursor-scrollbar-thumb-background`             | `color-mix(in srgb, #141414 14%, transparent)`                                                             |
| `--cursor-scrollbar-thumb-hover-background`       | `color-mix(in srgb, #141414 22%, transparent)`                                                             |
| `--cursor-scrollbar-vertical-size`                | `14px`                                                                                                     |
| `--cursor-shadow-primary`                         | `#0000000f`                                                                                                |
| `--cursor-shadow-secondary`                       | `#00000009`                                                                                                |
| `--cursor-shadow-tertiary`                        | `#00000005`                                                                                                |
| `--cursor-shadow-workbench`                       | `0px 0px 8px 2px color-mix(in srgb, #0000000f 40%, transparent)`                                           |
| `--cursor-sidebar`                                | `#181818`                                                                                                  |
| `--cursor-spacing-0-25`                           | `1px`                                                                                                      |
| `--cursor-spacing-0-5`                            | `2px`                                                                                                      |
| `--cursor-spacing-0-75`                           | `3px`                                                                                                      |
| `--cursor-spacing-1`                              | `4px`                                                                                                      |
| `--cursor-spacing-1-25`                           | `5px`                                                                                                      |
| `--cursor-spacing-1-5`                            | `6px`                                                                                                      |
| `--cursor-spacing-1-75`                           | `7px`                                                                                                      |
| `--cursor-spacing-10`                             | `40px`                                                                                                     |
| `--cursor-spacing-11`                             | `44px`                                                                                                     |
| `--cursor-spacing-12`                             | `48px`                                                                                                     |
| `--cursor-spacing-13`                             | `52px`                                                                                                     |
| `--cursor-spacing-14`                             | `56px`                                                                                                     |
| `--cursor-spacing-15`                             | `60px`                                                                                                     |
| `--cursor-spacing-16`                             | `64px`                                                                                                     |
| `--cursor-spacing-17`                             | `68px`                                                                                                     |
| `--cursor-spacing-18`                             | `72px`                                                                                                     |
| `--cursor-spacing-19`                             | `76px`                                                                                                     |
| `--cursor-spacing-2`                              | `8px`                                                                                                      |
| `--cursor-spacing-2-25`                           | `9px`                                                                                                      |
| `--cursor-spacing-2-5`                            | `10px`                                                                                                     |
| `--cursor-spacing-2-75`                           | `11px`                                                                                                     |
| `--cursor-spacing-20`                             | `80px`                                                                                                     |
| `--cursor-spacing-3`                              | `12px`                                                                                                     |
| `--cursor-spacing-3-25`                           | `13px`                                                                                                     |
| `--cursor-spacing-3-5`                            | `14px`                                                                                                     |
| `--cursor-spacing-3-75`                           | `15px`                                                                                                     |
| `--cursor-spacing-4`                              | `16px`                                                                                                     |
| `--cursor-spacing-4-25`                           | `17px`                                                                                                     |
| `--cursor-spacing-4-5`                            | `18px`                                                                                                     |
| `--cursor-spacing-4-75`                           | `19px`                                                                                                     |
| `--cursor-spacing-5`                              | `20px`                                                                                                     |
| `--cursor-spacing-5-5`                            | `22px`                                                                                                     |
| `--cursor-spacing-6`                              | `24px`                                                                                                     |
| `--cursor-spacing-6-5`                            | `26px`                                                                                                     |
| `--cursor-spacing-7`                              | `28px`                                                                                                     |
| `--cursor-spacing-7-5`                            | `30px`                                                                                                     |
| `--cursor-spacing-8`                              | `32px`                                                                                                     |
| `--cursor-spacing-8-5`                            | `34px`                                                                                                     |
| `--cursor-spacing-9`                              | `36px`                                                                                                     |
| `--cursor-spacing-9-5`                            | `38px`                                                                                                     |
| `--cursor-spacing-ne-0-25`                        | `-1px`                                                                                                     |
| `--cursor-spacing-ne-0-5`                         | `-2px`                                                                                                     |
| `--cursor-spacing-ne-0-75`                        | `-3px`                                                                                                     |
| `--cursor-spacing-ne-1`                           | `-4px`                                                                                                     |
| `--cursor-spacing-ne-1-25`                        | `-5px`                                                                                                     |
| `--cursor-spacing-ne-1-5`                         | `-6px`                                                                                                     |
| `--cursor-spacing-ne-1-75`                        | `-7px`                                                                                                     |
| `--cursor-spacing-ne-2`                           | `-8px`                                                                                                     |
| `--cursor-spacing-ne-2-25`                        | `-9px`                                                                                                     |
| `--cursor-spacing-ne-2-5`                         | `-10px`                                                                                                    |
| `--cursor-spacing-ne-2-75`                        | `-11px`                                                                                                    |
| `--cursor-spacing-ne-3`                           | `-12px`                                                                                                    |
| `--cursor-spacing-ne-3-25`                        | `-13px`                                                                                                    |
| `--cursor-spacing-ne-3-5`                         | `-14px`                                                                                                    |
| `--cursor-spacing-ne-3-75`                        | `-15px`                                                                                                    |
| `--cursor-spacing-ne-4`                           | `-16px`                                                                                                    |
| `--cursor-spacing-ne-4-25`                        | `-17px`                                                                                                    |
| `--cursor-spacing-ne-4-5`                         | `-18px`                                                                                                    |
| `--cursor-spacing-ne-4-75`                        | `-19px`                                                                                                    |
| `--cursor-spacing-ne-5`                           | `-20px`                                                                                                    |
| `--cursor-stroke-blue-primary`                    | `color-mix(in srgb, #2778c1 56%, transparent)`                                                             |
| `--cursor-stroke-blue-secondary`                  | `color-mix(in srgb, #2778c1 32%, transparent)`                                                             |
| `--cursor-stroke-cyan-primary`                    | `color-mix(in oklab, #176c74 56%, transparent)`                                                            |
| `--cursor-stroke-cyan-secondary`                  | `color-mix(in oklab, #176c74 32%, transparent)`                                                            |
| `--cursor-stroke-focused`                         | `color-mix(in oklab, #2778c1 15%, transparent)`                                                            |
| `--cursor-stroke-git-added`                       | `color-mix(in oklab, #007041 56%, transparent)`                                                            |
| `--cursor-stroke-git-modified`                    | `color-mix(in srgb, #a46700 56%, transparent)`                                                             |
| `--cursor-stroke-git-removed`                     | `color-mix(in oklab, #be1744 56%, transparent)`                                                            |
| `--cursor-stroke-git-untracked`                   | `color-mix(in srgb, #176c74 56%, transparent)`                                                             |
| `--cursor-stroke-green-primary`                   | `color-mix(in oklab, #007041 56%, transparent)`                                                            |
| `--cursor-stroke-green-secondary`                 | `color-mix(in oklab, #007041 32%, transparent)`                                                            |
| `--cursor-stroke-high-contrast`                   | `color-mix(in srgb, #141414 0%, transparent)`                                                              |
| `--cursor-stroke-magenta-primary`                 | `color-mix(in oklab, #92156a 56%, transparent)`                                                            |
| `--cursor-stroke-magenta-secondary`               | `color-mix(in oklab, #92156a 32%, transparent)`                                                            |
| `--cursor-stroke-orange-primary`                  | `color-mix(in oklab, #cd4500 56%, transparent)`                                                            |
| `--cursor-stroke-orange-secondary`                | `color-mix(in oklab, #cd4500 32%, transparent)`                                                            |
| `--cursor-stroke-primary`                         | `color-mix(in oklab, #141414 20%, transparent)`                                                            |
| `--cursor-stroke-quaternary`                      | `color-mix(in oklab, #141414 4%, transparent)`                                                             |
| `--cursor-stroke-red-primary`                     | `color-mix(in oklab, #be1744 56%, transparent)`                                                            |
| `--cursor-stroke-red-secondary`                   | `color-mix(in oklab, #be1744 32%, transparent)`                                                            |
| `--cursor-stroke-secondary`                       | `color-mix(in oklab, #141414 12%, transparent)`                                                            |
| `--cursor-stroke-tertiary`                        | `color-mix(in oklab, #141414 8%, transparent)`                                                             |
| `--cursor-stroke-tertiary-opaque`                 | `color-mix(in srgb, #141414 8%, #f8f8f8)`                                                                  |
| `--cursor-stroke-yellow-primary`                  | `color-mix(in oklab, #a46700 56%, transparent)`                                                            |
| `--cursor-stroke-yellow-secondary`                | `color-mix(in oklab, #a46700 32%, transparent)`                                                            |
| `--cursor-success`                                | `#007041`                                                                                                  |
| `--cursor-syntax-background`                      | `#fcfcfc`                                                                                                  |
| `--cursor-syntax-comment`                         | `#141414ad`                                                                                                |
| `--cursor-syntax-constant`                        | `#206595`                                                                                                  |
| `--cursor-syntax-foreground`                      | `#141414eb`                                                                                                |
| `--cursor-syntax-function`                        | `#db704b`                                                                                                  |
| `--cursor-syntax-keyword`                         | `#b3003f`                                                                                                  |
| `--cursor-syntax-link`                            | `#3c7cab`                                                                                                  |
| `--cursor-syntax-number`                          | `#b8448b`                                                                                                  |
| `--cursor-syntax-parameter`                       | `#141414eb`                                                                                                |
| `--cursor-syntax-punctuation`                     | `#141414ad`                                                                                                |
| `--cursor-syntax-string`                          | `#8f84e0`                                                                                                  |
| `--cursor-syntax-string-expression`               | `#8f84e0`                                                                                                  |
| `--cursor-terminal-ansi-black`                    | `#242424`                                                                                                  |
| `--cursor-terminal-ansi-blue`                     | `#81a1c1`                                                                                                  |
| `--cursor-terminal-ansi-bright-black`             | `#f0f0f099`                                                                                                |
| `--cursor-terminal-ansi-bright-blue`              | `#87a6c4`                                                                                                  |
| `--cursor-terminal-ansi-bright-cyan`              | `#88c0d0`                                                                                                  |
| `--cursor-terminal-ansi-bright-green`             | `#70b489`                                                                                                  |
| `--cursor-terminal-ansi-bright-magenta`           | `#b48ead`                                                                                                  |
| `--cursor-terminal-ansi-bright-red`               | `#fc6b83`                                                                                                  |
| `--cursor-terminal-ansi-bright-white`             | `#f0f0f0`                                                                                                  |
| `--cursor-terminal-ansi-bright-yellow`            | `#f1b467`                                                                                                  |
| `--cursor-terminal-ansi-cyan`                     | `#88c0d0`                                                                                                  |
| `--cursor-terminal-ansi-green`                    | `#3fa266`                                                                                                  |
| `--cursor-terminal-ansi-magenta`                  | `#b48ead`                                                                                                  |
| `--cursor-terminal-ansi-red`                      | `#fc6b83`                                                                                                  |
| `--cursor-terminal-ansi-white`                    | `#f0f0f0`                                                                                                  |
| `--cursor-terminal-ansi-yellow`                   | `#d2943e`                                                                                                  |
| `--cursor-terminal-background`                    | `#f8f8f8`                                                                                                  |
| `--cursor-terminal-foreground`                    | `#141414`                                                                                                  |
| `--cursor-terminal-selection-background`          | `color-mix(in srgb, #141414 12%, transparent)`                                                             |
| `--cursor-text-accent`                            | `#2778c1`                                                                                                  |
| `--cursor-text-active`                            | `#141414`                                                                                                  |
| `--cursor-text-blue-primary`                      | `#2778c1`                                                                                                  |
| `--cursor-text-blue-secondary`                    | `color-mix(in srgb, #2778c1 78%, transparent)`                                                             |
| `--cursor-text-code-block-background`             | `#fcfcfc`                                                                                                  |
| `--cursor-text-cyan-primary`                      | `#176c74`                                                                                                  |
| `--cursor-text-cyan-secondary`                    | `color-mix(in oklab, #176c74 78%, transparent)`                                                            |
| `--cursor-text-focused`                           | `#141414`                                                                                                  |
| `--cursor-text-git-added-primary`                 | `#007041`                                                                                                  |
| `--cursor-text-git-added-quaternary`              | `color-mix(in srgb, #007041 40%, transparent)`                                                             |
| `--cursor-text-git-added-secondary`               | `color-mix(in srgb, #007041 78%, transparent)`                                                             |
| `--cursor-text-git-added-tertiary`                | `color-mix(in srgb, #007041 64%, transparent)`                                                             |
| `--cursor-text-git-modified-primary`              | `#a46700`                                                                                                  |
| `--cursor-text-git-modified-quaternary`           | `color-mix(in srgb, #a46700 40%, transparent)`                                                             |
| `--cursor-text-git-modified-secondary`            | `color-mix(in srgb, #a46700 78%, transparent)`                                                             |
| `--cursor-text-git-modified-tertiary`             | `color-mix(in srgb, #a46700 64%, transparent)`                                                             |
| `--cursor-text-git-removed-primary`               | `#be1744`                                                                                                  |
| `--cursor-text-git-removed-quaternary`            | `color-mix(in srgb, #be1744 40%, transparent)`                                                             |
| `--cursor-text-git-removed-secondary`             | `color-mix(in srgb, #be1744 78%, transparent)`                                                             |
| `--cursor-text-git-removed-tertiary`              | `color-mix(in srgb, #be1744 64%, transparent)`                                                             |
| `--cursor-text-git-untracked-primary`             | `#176c74`                                                                                                  |
| `--cursor-text-git-untracked-quaternary`          | `color-mix(in srgb, #176c74 40%, transparent)`                                                             |
| `--cursor-text-git-untracked-secondary`           | `color-mix(in srgb, #176c74 78%, transparent)`                                                             |
| `--cursor-text-git-untracked-tertiary`            | `color-mix(in srgb, #176c74 64%, transparent)`                                                             |
| `--cursor-text-green-primary`                     | `#007041`                                                                                                  |
| `--cursor-text-green-secondary`                   | `color-mix(in oklab, #007041 78%, transparent)`                                                            |
| `--cursor-text-invert`                            | `#fcfcfc`                                                                                                  |
| `--cursor-text-link`                              | `#2778c1`                                                                                                  |
| `--cursor-text-link-active`                       | `#2778c1`                                                                                                  |
| `--cursor-text-magenta-primary`                   | `#92156a`                                                                                                  |
| `--cursor-text-magenta-secondary`                 | `color-mix(in oklab, #92156a 78%, transparent)`                                                            |
| `--cursor-text-orange-primary`                    | `#cd4500`                                                                                                  |
| `--cursor-text-orange-secondary`                  | `color-mix(in oklab, #cd4500 78%, transparent)`                                                            |
| `--cursor-text-primary`                           | `#141414`                                                                                                  |
| `--cursor-text-purple-primary`                    | `#7565cc`                                                                                                  |
| `--cursor-text-purple-secondary`                  | `color-mix(in srgb, #7565cc 78%, transparent)`                                                             |
| `--cursor-text-quaternary`                        | `color-mix(in oklab, #141414 36%, transparent)`                                                            |
| `--cursor-text-red-primary`                       | `#be1744`                                                                                                  |
| `--cursor-text-red-secondary`                     | `color-mix(in oklab, #be1744 78%, transparent)`                                                            |
| `--cursor-text-secondary`                         | `color-mix(in oklab, #141414 74%, transparent)`                                                            |
| `--cursor-text-tertiary`                          | `color-mix(in oklab, #141414 60%, transparent)`                                                            |
| `--cursor-text-yellow-primary`                    | `#a46700`                                                                                                  |
| `--cursor-text-yellow-secondary`                  | `color-mix(in oklab, #a46700 78%, transparent)`                                                            |
| `--cursor-titlebar-active-foreground`             | `color-mix(in oklab, #141414 74%, transparent)`                                                            |
| `--cursor-titlebar-inactive-foreground`           | `color-mix(in oklab, #141414 60%, transparent)`                                                            |
| `--cursor-toolbar-hover-background`               | `color-mix(in oklab, #141414 8%, transparent)`                                                             |
| `--cursor-untracked`                              | `#176c74`                                                                                                  |
| `--cursor-warn`                                   | `#a46700`                                                                                                  |
| `--cursor-yellow`                                 | `#f1b467`                                                                                                  |
| `--cyan`                                          | `#176c74`                                                                                                  |
| `--danger`                                        | `#be1744`                                                                                                  |
| `--dashboard-bg-error-primary`                    | `#dc2626`                                                                                                  |
| `--dashboard-bg-error-primary-hover`              | `#b91c1c`                                                                                                  |
| `--dashboard-text-error-on-primary`               | `#fff`                                                                                                     |
| `--dashboard-text-error-prominent`                | `#e06c75`                                                                                                  |
| `--diff-added-line`                               | `#00af6624`                                                                                                |
| `--diff-added-text`                               | `#00b06838`                                                                                                |
| `--diff-removed-line`                             | `#ff617b38`                                                                                                |
| `--diff-removed-text`                             | `#ff617b57`                                                                                                |
| `--diffs-addition-color-override`                 | `#007041`                                                                                                  |
| `--diffs-bg`                                      | `#fcfcfc`                                                                                                  |
| `--diffs-bg-addition-override`                    | `#00af6624`                                                                                                |
| `--diffs-bg-deletion-override`                    | `#ff617b38`                                                                                                |
| `--diffs-bg-selection-background-override`        | `transparent`                                                                                              |
| `--diffs-bg-selection-number-background-override` | `transparent`                                                                                              |
| `--diffs-bg-selection-number-override`            | `transparent`                                                                                              |
| `--diffs-bg-selection-override`                   | `transparent`                                                                                              |
| `--diffs-deletion-color-override`                 | `#be1744`                                                                                                  |
| `--diffs-font-family`                             | `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`       |
| `--diffs-font-size`                               | `12px`                                                                                                     |
| `--diffs-selection-color-override`                | `transparent`                                                                                              |
| `--dvh-safe`                                      | `100dvh`                                                                                                   |
| `--editor`                                        | `#fcfcfc`                                                                                                  |
| `--file-list-item-content-h`                      | `1rem`                                                                                                     |
| `--file-list-item-h`                              | `calc(1rem + 2 * .25rem)`                                                                                  |
| `--file-list-item-py`                             | `.25rem`                                                                                                   |
| `--file-list-max-vh`                              | `30vh`                                                                                                     |
| `--file-list-visible-count`                       | `7.5`                                                                                                      |
| `--focus`                                         | `#2778c1`                                                                                                  |
| `--font-size-base`                                | `.8125rem`                                                                                                 |
| `--font-size-lg`                                  | `1rem`                                                                                                     |
| `--font-size-sm`                                  | `.75rem`                                                                                                   |
| `--font-size-xl`                                  | `1.25rem`                                                                                                  |
| `--font-size-xs`                                  | `.6875rem`                                                                                                 |
| `--font-weight-bold`                              | `700`                                                                                                      |
| `--font-weight-medium`                            | `500`                                                                                                      |
| `--font-weight-normal`                            | `418`                                                                                                      |
| `--font-weight-semibold`                          | `600`                                                                                                      |
| `--font-width-normal`                             | `4.7`                                                                                                      |
| `--green`                                         | `#007041`                                                                                                  |
| `--icon-accent`                                   | `#2778c1`                                                                                                  |
| `--icon-accent-quaternary`                        | `color-mix(in oklab, #2778c1 32%, transparent)`                                                            |
| `--icon-accent-secondary`                         | `color-mix(in oklab, #2778c1 70%, transparent)`                                                            |
| `--icon-accent-tertiary`                          | `color-mix(in oklab, #2778c1 56%, transparent)`                                                            |
| `--icon-actionLabel`                              | `#fcfcfc`                                                                                                  |
| `--icon-actionLabel-quaternary`                   | `color-mix(in oklab, #fcfcfc 24%, transparent)`                                                            |
| `--icon-actionLabel-secondary`                    | `color-mix(in oklab, #fcfcfc 62%, transparent)`                                                            |
| `--icon-actionLabel-tertiary`                     | `color-mix(in oklab, #fcfcfc 40%, transparent)`                                                            |
| `--icon-blue`                                     | `#2778c1`                                                                                                  |
| `--icon-blue-quaternary`                          | `color-mix(in oklab, #2778c1 32%, transparent)`                                                            |
| `--icon-blue-secondary`                           | `color-mix(in oklab, #2778c1 70%, transparent)`                                                            |
| `--icon-blue-tertiary`                            | `color-mix(in oklab, #2778c1 56%, transparent)`                                                            |
| `--icon-brand`                                    | `#f54e00`                                                                                                  |
| `--icon-brand-quaternary`                         | `color-mix(in oklab, #f54e00 32%, transparent)`                                                            |
| `--icon-brand-secondary`                          | `color-mix(in oklab, #f54e00 70%, transparent)`                                                            |
| `--icon-brand-tertiary`                           | `color-mix(in oklab, #f54e00 56%, transparent)`                                                            |
| `--icon-cyan`                                     | `#176c74`                                                                                                  |
| `--icon-cyan-quaternary`                          | `color-mix(in oklab, #176c74 32%, transparent)`                                                            |
| `--icon-cyan-secondary`                           | `color-mix(in oklab, #176c74 70%, transparent)`                                                            |
| `--icon-cyan-tertiary`                            | `color-mix(in oklab, #176c74 56%, transparent)`                                                            |
| `--icon-danger`                                   | `#be1744`                                                                                                  |
| `--icon-danger-quaternary`                        | `color-mix(in oklab, #be1744 32%, transparent)`                                                            |
| `--icon-danger-secondary`                         | `color-mix(in oklab, #be1744 70%, transparent)`                                                            |
| `--icon-danger-tertiary`                          | `color-mix(in oklab, #be1744 56%, transparent)`                                                            |
| `--icon-green`                                    | `#007041`                                                                                                  |
| `--icon-green-quaternary`                         | `color-mix(in oklab, #007041 32%, transparent)`                                                            |
| `--icon-green-secondary`                          | `color-mix(in oklab, #007041 70%, transparent)`                                                            |
| `--icon-green-tertiary`                           | `color-mix(in oklab, #007041 56%, transparent)`                                                            |
| `--icon-inverted`                                 | `#fcfcfc`                                                                                                  |
| `--icon-inverted-quaternary`                      | `color-mix(in oklab, #fcfcfc 24%, transparent)`                                                            |
| `--icon-inverted-secondary`                       | `color-mix(in oklab, #fcfcfc 62%, transparent)`                                                            |
| `--icon-inverted-tertiary`                        | `color-mix(in oklab, #fcfcfc 40%, transparent)`                                                            |
| `--icon-luminous`                                 | `#fff`                                                                                                     |
| `--icon-luminous-quaternary`                      | `#ffffff3d`                                                                                                |
| `--icon-luminous-secondary`                       | `#ffffff9e`                                                                                                |
| `--icon-luminous-tertiary`                        | `#fff6`                                                                                                    |
| `--icon-magenta`                                  | `#92156a`                                                                                                  |
| `--icon-magenta-quaternary`                       | `color-mix(in oklab, #92156a 32%, transparent)`                                                            |
| `--icon-magenta-secondary`                        | `color-mix(in oklab, #92156a 70%, transparent)`                                                            |
| `--icon-magenta-tertiary`                         | `color-mix(in oklab, #92156a 56%, transparent)`                                                            |
| `--icon-orange`                                   | `#cd4500`                                                                                                  |
| `--icon-orange-quaternary`                        | `color-mix(in oklab, #cd4500 32%, transparent)`                                                            |
| `--icon-orange-secondary`                         | `color-mix(in oklab, #cd4500 70%, transparent)`                                                            |
| `--icon-orange-tertiary`                          | `color-mix(in oklab, #cd4500 56%, transparent)`                                                            |
| `--icon-primary`                                  | `#141414`                                                                                                  |
| `--icon-purple`                                   | `#7565cc`                                                                                                  |
| `--icon-purple-quaternary`                        | `color-mix(in oklab, #7565cc 32%, transparent)`                                                            |
| `--icon-purple-secondary`                         | `color-mix(in oklab, #7565cc 70%, transparent)`                                                            |
| `--icon-purple-tertiary`                          | `color-mix(in oklab, #7565cc 56%, transparent)`                                                            |
| `--icon-quaternary`                               | `color-mix(in oklab, #141414 28%, transparent)`                                                            |
| `--icon-red`                                      | `#be1744`                                                                                                  |
| `--icon-red-quaternary`                           | `color-mix(in oklab, #be1744 32%, transparent)`                                                            |
| `--icon-red-secondary`                            | `color-mix(in oklab, #be1744 70%, transparent)`                                                            |
| `--icon-red-tertiary`                             | `color-mix(in oklab, #be1744 56%, transparent)`                                                            |
| `--icon-secondary`                                | `color-mix(in oklab, #141414 66%, transparent)`                                                            |
| `--icon-success`                                  | `#007041`                                                                                                  |
| `--icon-success-quaternary`                       | `color-mix(in oklab, #007041 32%, transparent)`                                                            |
| `--icon-success-secondary`                        | `color-mix(in oklab, #007041 70%, transparent)`                                                            |
| `--icon-success-tertiary`                         | `color-mix(in oklab, #007041 56%, transparent)`                                                            |
| `--icon-tertiary`                                 | `color-mix(in oklab, #141414 52%, transparent)`                                                            |
| `--icon-warn`                                     | `#a46700`                                                                                                  |
| `--icon-warn-quaternary`                          | `color-mix(in oklab, #a46700 32%, transparent)`                                                            |
| `--icon-warn-secondary`                           | `color-mix(in oklab, #a46700 70%, transparent)`                                                            |
| `--icon-warn-tertiary`                            | `color-mix(in oklab, #a46700 56%, transparent)`                                                            |
| `--icon-yellow`                                   | `#a46700`                                                                                                  |
| `--icon-yellow-quaternary`                        | `color-mix(in oklab, #a46700 32%, transparent)`                                                            |
| `--icon-yellow-secondary`                         | `color-mix(in oklab, #a46700 70%, transparent)`                                                            |
| `--icon-yellow-tertiary`                          | `color-mix(in oklab, #a46700 56%, transparent)`                                                            |
| `--inactive-selection-background`                 | `#0000000f`                                                                                                |
| `--light-grey-wash`                               | `#f5f5f5`                                                                                                  |
| `--line-height-base`                              | `1.125rem`                                                                                                 |
| `--line-height-lg`                                | `1.5rem`                                                                                                   |
| `--line-height-sm`                                | `1rem`                                                                                                     |
| `--line-height-xl`                                | `1.75rem`                                                                                                  |
| `--line-height-xs`                                | `.875rem`                                                                                                  |
| `--magenta`                                       | `#92156a`                                                                                                  |
| `--modified`                                      | `#a46700`                                                                                                  |
| `--navbar-height`                                 | `4rem`                                                                                                     |
| `--orange`                                        | `#cd4500`                                                                                                  |
| `--purple`                                        | `#7565cc`                                                                                                  |
| `--red`                                           | `#be1744`                                                                                                  |
| `--removed`                                       | `#be1744`                                                                                                  |
| `--rt-arrow-size`                                 | `8px`                                                                                                      |
| `--rt-color-dark`                                 | `#222`                                                                                                     |
| `--rt-color-error`                                | `#be6464`                                                                                                  |
| `--rt-color-info`                                 | `#337ab7`                                                                                                  |
| `--rt-color-success`                              | `#8dc572`                                                                                                  |
| `--rt-color-warning`                              | `#f0ad4e`                                                                                                  |
| `--rt-color-white`                                | `#fff`                                                                                                     |
| `--rt-opacity`                                    | `0.9`                                                                                                      |
| `--rt-transition-closing-delay`                   | `0.15s`                                                                                                    |
| `--rt-transition-show-delay`                      | `0.15s`                                                                                                    |
| `--selection-background`                          | `color-mix(in oklab, #141414 14%, transparent)`                                                            |
| `--shadow-primary`                                | `#0000000f`                                                                                                |
| `--shadow-secondary`                              | `#00000009`                                                                                                |
| `--shadow-tertiary`                               | `#00000005`                                                                                                |
| `--sidebar`                                       | `#f3f3f3`                                                                                                  |
| `--success`                                       | `#007041`                                                                                                  |
| `--syntax-background`                             | `#fcfcfc`                                                                                                  |
| `--syntax-comment`                                | `#141414ad`                                                                                                |
| `--syntax-constant`                               | `#206595`                                                                                                  |
| `--syntax-foreground`                             | `#141414eb`                                                                                                |
| `--syntax-function`                               | `#db704b`                                                                                                  |
| `--syntax-keyword`                                | `#b3003f`                                                                                                  |
| `--syntax-link`                                   | `#3c7cab`                                                                                                  |
| `--syntax-number`                                 | `#b8448b`                                                                                                  |
| `--syntax-parameter`                              | `#141414eb`                                                                                                |
| `--syntax-punctuation`                            | `#141414ad`                                                                                                |
| `--syntax-string`                                 | `#8f84e0`                                                                                                  |
| `--syntax-string-expression`                      | `#8f84e0`                                                                                                  |
| `--terminal-ansi-blue`                            | `#055180`                                                                                                  |
| `--terminal-ansi-green`                           | `#005c42`                                                                                                  |
| `--terminal-ansi-red`                             | `#a33900`                                                                                                  |
| `--terminal-ansi-yellow`                          | `#a16900`                                                                                                  |
| `--text-accent`                                   | `#2778c1`                                                                                                  |
| `--text-accent-quaternary`                        | `color-mix(in oklab, #2778c1 40%, transparent)`                                                            |
| `--text-accent-secondary`                         | `color-mix(in oklab, #2778c1 78%, transparent)`                                                            |
| `--text-accent-tertiary`                          | `color-mix(in oklab, #2778c1 64%, transparent)`                                                            |
| `--text-actionLabel`                              | `#fcfcfc`                                                                                                  |
| `--text-actionLabel-quaternary`                   | `color-mix(in oklab, #fcfcfc 32%, transparent)`                                                            |
| `--text-actionLabel-secondary`                    | `color-mix(in oklab, #fcfcfc 70%, transparent)`                                                            |
| `--text-actionLabel-tertiary`                     | `color-mix(in oklab, #fcfcfc 48%, transparent)`                                                            |
| `--text-added`                                    | `#007041`                                                                                                  |
| `--text-added-quaternary`                         | `color-mix(in oklab, #007041 40%, transparent)`                                                            |
| `--text-added-secondary`                          | `color-mix(in oklab, #007041 78%, transparent)`                                                            |
| `--text-added-tertiary`                           | `color-mix(in oklab, #007041 64%, transparent)`                                                            |
| `--text-base`                                     | `1rem`                                                                                                     |
| `--text-blue`                                     | `#2778c1`                                                                                                  |
| `--text-blue-quaternary`                          | `color-mix(in oklab, #2778c1 40%, transparent)`                                                            |
| `--text-blue-secondary`                           | `color-mix(in oklab, #2778c1 78%, transparent)`                                                            |
| `--text-blue-tertiary`                            | `color-mix(in oklab, #2778c1 64%, transparent)`                                                            |
| `--text-brand`                                    | `#f54e00`                                                                                                  |
| `--text-brand-quaternary`                         | `color-mix(in oklab, #f54e00 40%, transparent)`                                                            |
| `--text-brand-secondary`                          | `color-mix(in oklab, #f54e00 78%, transparent)`                                                            |
| `--text-brand-tertiary`                           | `color-mix(in oklab, #f54e00 64%, transparent)`                                                            |
| `--text-cyan`                                     | `#176c74`                                                                                                  |
| `--text-cyan-quaternary`                          | `color-mix(in oklab, #176c74 40%, transparent)`                                                            |
| `--text-cyan-secondary`                           | `color-mix(in oklab, #176c74 78%, transparent)`                                                            |
| `--text-cyan-tertiary`                            | `color-mix(in oklab, #176c74 64%, transparent)`                                                            |
| `--text-danger`                                   | `#be1744`                                                                                                  |
| `--text-danger-quaternary`                        | `color-mix(in oklab, #be1744 40%, transparent)`                                                            |
| `--text-danger-secondary`                         | `color-mix(in oklab, #be1744 78%, transparent)`                                                            |
| `--text-danger-tertiary`                          | `color-mix(in oklab, #be1744 64%, transparent)`                                                            |
| `--text-gray-100`                                 | `#e6e6e6`                                                                                                  |
| `--text-gray-200`                                 | `#ccc`                                                                                                     |
| `--text-gray-300`                                 | `#b3b3b3`                                                                                                  |
| `--text-gray-400`                                 | `#999`                                                                                                     |
| `--text-gray-500`                                 | `#888`                                                                                                     |
| `--text-gray-600`                                 | `#666`                                                                                                     |
| `--text-gray-700`                                 | `#4d4d4d`                                                                                                  |
| `--text-gray-800`                                 | `#333`                                                                                                     |
| `--text-gray-900`                                 | `#1a1a1a`                                                                                                  |
| `--text-green`                                    | `#007041`                                                                                                  |
| `--text-green-quaternary`                         | `color-mix(in oklab, #007041 40%, transparent)`                                                            |
| `--text-green-secondary`                          | `color-mix(in oklab, #007041 78%, transparent)`                                                            |
| `--text-green-tertiary`                           | `color-mix(in oklab, #007041 64%, transparent)`                                                            |
| `--text-inverted`                                 | `#fcfcfc`                                                                                                  |
| `--text-inverted-quaternary`                      | `color-mix(in oklab, #fcfcfc 32%, transparent)`                                                            |
| `--text-inverted-secondary`                       | `color-mix(in oklab, #fcfcfc 70%, transparent)`                                                            |
| `--text-inverted-tertiary`                        | `color-mix(in oklab, #fcfcfc 48%, transparent)`                                                            |
| `--text-lg`                                       | `2.25rem`                                                                                                  |
| `--text-luminous`                                 | `#fff`                                                                                                     |
| `--text-luminous-quaternary`                      | `#ffffff52`                                                                                                |
| `--text-luminous-secondary`                       | `#ffffffb3`                                                                                                |
| `--text-luminous-tertiary`                        | `#ffffff7a`                                                                                                |
| `--text-magenta`                                  | `#92156a`                                                                                                  |
| `--text-magenta-quaternary`                       | `color-mix(in oklab, #92156a 40%, transparent)`                                                            |
| `--text-magenta-secondary`                        | `color-mix(in oklab, #92156a 78%, transparent)`                                                            |
| `--text-magenta-tertiary`                         | `color-mix(in oklab, #92156a 64%, transparent)`                                                            |
| `--text-md`                                       | `1.375rem`                                                                                                 |
| `--text-orange`                                   | `#cd4500`                                                                                                  |
| `--text-orange-quaternary`                        | `color-mix(in oklab, #cd4500 40%, transparent)`                                                            |
| `--text-orange-secondary`                         | `color-mix(in oklab, #cd4500 78%, transparent)`                                                            |
| `--text-orange-tertiary`                          | `color-mix(in oklab, #cd4500 64%, transparent)`                                                            |
| `--text-primary`                                  | `#141414`                                                                                                  |
| `--text-purple`                                   | `#7565cc`                                                                                                  |
| `--text-purple-quaternary`                        | `color-mix(in oklab, #7565cc 40%, transparent)`                                                            |
| `--text-purple-secondary`                         | `color-mix(in oklab, #7565cc 78%, transparent)`                                                            |
| `--text-purple-tertiary`                          | `color-mix(in oklab, #7565cc 64%, transparent)`                                                            |
| `--text-quaternary`                               | `color-mix(in oklab, #141414 36%, transparent)`                                                            |
| `--text-red`                                      | `#be1744`                                                                                                  |
| `--text-red-quaternary`                           | `color-mix(in oklab, #be1744 40%, transparent)`                                                            |
| `--text-red-secondary`                            | `color-mix(in oklab, #be1744 78%, transparent)`                                                            |
| `--text-red-tertiary`                             | `color-mix(in oklab, #be1744 64%, transparent)`                                                            |
| `--text-removed`                                  | `#be1744`                                                                                                  |
| `--text-removed-quaternary`                       | `color-mix(in oklab, #be1744 40%, transparent)`                                                            |
| `--text-removed-secondary`                        | `color-mix(in oklab, #be1744 78%, transparent)`                                                            |
| `--text-removed-tertiary`                         | `color-mix(in oklab, #be1744 64%, transparent)`                                                            |
| `--text-secondary`                                | `color-mix(in oklab, #141414 74%, transparent)`                                                            |
| `--text-success`                                  | `#007041`                                                                                                  |
| `--text-success-quaternary`                       | `color-mix(in oklab, #007041 40%, transparent)`                                                            |
| `--text-success-secondary`                        | `color-mix(in oklab, #007041 78%, transparent)`                                                            |
| `--text-success-tertiary`                         | `color-mix(in oklab, #007041 64%, transparent)`                                                            |
| `--text-tertiary`                                 | `color-mix(in oklab, #141414 60%, transparent)`                                                            |
| `--text-warn`                                     | `#a46700`                                                                                                  |
| `--text-warn-quaternary`                          | `color-mix(in oklab, #a46700 40%, transparent)`                                                            |
| `--text-warn-secondary`                           | `color-mix(in oklab, #a46700 78%, transparent)`                                                            |
| `--text-warn-tertiary`                            | `color-mix(in oklab, #a46700 64%, transparent)`                                                            |
| `--text-xl`                                       | `3.25rem`                                                                                                  |
| `--text-xs`                                       | `.75rem`                                                                                                   |
| `--text-yellow`                                   | `#a46700`                                                                                                  |
| `--text-yellow-quaternary`                        | `color-mix(in oklab, #a46700 40%, transparent)`                                                            |
| `--text-yellow-secondary`                         | `color-mix(in oklab, #a46700 78%, transparent)`                                                            |
| `--text-yellow-tertiary`                          | `color-mix(in oklab, #a46700 64%, transparent)`                                                            |
| `--tw-border-spacing-x`                           | `0`                                                                                                        |
| `--tw-border-spacing-y`                           | `0`                                                                                                        |
| `--tw-ring-color`                                 | `#3b82f680`                                                                                                |
| `--tw-ring-offset-color`                          | `#fff`                                                                                                     |
| `--tw-ring-offset-shadow`                         | `0 0 #0000`                                                                                                |
| `--tw-ring-offset-width`                          | `0px`                                                                                                      |
| `--tw-ring-shadow`                                | `0 0 #0000`                                                                                                |
| `--tw-rotate`                                     | `0`                                                                                                        |
| `--tw-scale-x`                                    | `1`                                                                                                        |
| `--tw-scale-y`                                    | `1`                                                                                                        |
| `--tw-scroll-snap-strictness`                     | `proximity`                                                                                                |
| `--tw-shadow`                                     | `0 0 #0000`                                                                                                |
| `--tw-shadow-colored`                             | `0 0 #0000`                                                                                                |
| `--tw-skew-x`                                     | `0`                                                                                                        |
| `--tw-skew-y`                                     | `0`                                                                                                        |
| `--tw-translate-x`                                | `0`                                                                                                        |
| `--tw-translate-y`                                | `0`                                                                                                        |
| `--ui-press-scale`                                | `.98`                                                                                                      |
| `--ui-tool-call-card-bg`                          | `#fcfcfc`                                                                                                  |
| `--untracked`                                     | `#176c74`                                                                                                  |
| `--warn`                                          | `#a46700`                                                                                                  |
| `--web-text-base`                                 | `.8125rem`                                                                                                 |
| `--web-text-sm`                                   | `.75rem`                                                                                                   |
| `--white`                                         | `#fff`                                                                                                     |
| `--yellow`                                        | `#a46700`                                                                                                  |

---

## 18. Do / Don’t

**Do**

- Shell light : `--bg-sidebar` `#f3f3f3`, `--bg-chrome` `#f8f8f8`, panels `--bg-elevated` `#fcfcfc`
- CTA : `--cursor-button-*` (noir / clair)
- Focus : `--focus` `#2778c1`
- Brand orange rare : `--brand`
- Borders : `--border-tertiary` / `--border-secondary` / `--border-primary`

**Don’t**

- Utiliser `--cursor-sidebar: #181818` pour le light shell
- Remplir les surfaces en `--brand`
- Réintroduire crème marketing `#f7f7f4` / ink `#26251e` à la place de ces tokens
- Traiter les `--tw-*` vides comme tokens design

---

_Source : collage navigateur `:root` — archivé dans `cursor/product-tokens-light.css`._
