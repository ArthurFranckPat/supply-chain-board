---
name: Supply Chain Board
description: Design system Cursor PRODUIT light — tokens CSS extraits live (2026-08-11)
source: product-css-extract
extracted: '2026-08-11'
authority: product
# ── Surfaces & chrome ──
colors:
  sidebar: '#f3f3f3'
  chrome: '#f8f8f8'
  editor: '#fcfcfc'
  base: '#141414'
  accent: '#2778c1'
  actionLabel: '#fcfcfc'
  brand: '#f54e00'
  focus: '#2778c1'
  success: '#007041'
  warn: '#a46700'
  danger: '#be1744'
  added: '#007041'
  modified: '#a46700'
  removed: '#be1744'
  untracked: '#176c74'
  red: '#be1744'
  orange: '#cd4500'
  yellow: '#a46700'
  green: '#007041'
  cyan: '#176c74'
  blue: '#2778c1'
  magenta: '#92156a'
  purple: '#7565cc'
  diff-added-line: '#00af6624'
  diff-added-text: '#00b06838'
  diff-removed-line: '#ff617b38'
  diff-removed-text: '#ff617b57'
  shadow-primary: '#0000000f'
  shadow-secondary: '#00000009'
  shadow-tertiary: '#00000005'
  # react-tooltip (rt-*) présents dans le même extrait
  rt-white: '#ffffff'
  rt-dark: '#222222'
  rt-success: '#8dc572'
  rt-error: '#be6464'
  rt-warning: '#f0ad4e'
  rt-info: '#337ab7'
typography:
  sans: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
  mono: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace"
  diffs: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace"
  weight-normal: 418
  weight-medium: 500
  weight-semibold: 600
  weight-bold: 700
  width-normal: 4.7
  size-xs: '0.6875rem'
  size-sm: '0.75rem'
  size-base: '0.8125rem'
  size-lg: '1rem'
  size-xl: '1.25rem'
  line-height-xs: '0.875rem'
  line-height-sm: '1rem'
  line-height-base: '1.125rem'
  line-height-lg: '1.5rem'
  line-height-xl: '1.75rem'
  letter-spacing-xs: '0.07px'
  letter-spacing-sm: '0px'
  letter-spacing-base: '-0.08px'
  letter-spacing-lg: '-0.15px'
  letter-spacing-xl: '0.08px'
  letter-spacing-2xl: '-0.46px'
  letter-spacing-3xl: '-0.26px'
  web-text-sm: '0.75rem'
  web-text-base: '0.8125rem'
  text-xs: '0.75rem'
  text-base: '1rem'
  text-md: '1.375rem'
  text-lg: '2.25rem'
  text-xl: '3.25rem'
  diffs-font-size: '12px'
rounded:
  none: '0px'
  xs: '2px'
  sm: '4px'
  base: '6px'
  lg: '8px'
  xl: '12px'
  '2xl': '14px'
  '3xl': '16px'
  full: '9999px'
spacing:
  '0-25': '1px'
  '0-5': '2px'
  '0-75': '3px'
  '1': '4px'
  '1-25': '5px'
  '1-5': '6px'
  '1-75': '7px'
  '2': '8px'
  '2-25': '9px'
  '2-5': '10px'
  '2-75': '11px'
  '3': '12px'
  '3-25': '13px'
  '3-5': '14px'
  '3-75': '15px'
  '4': '16px'
  '4-25': '17px'
  '4-5': '18px'
  '4-75': '19px'
  '5': '20px'
  '5-5': '22px'
  '6': '24px'
  '6-5': '26px'
  '7': '28px'
  '7-5': '30px'
  '8': '32px'
  '8-5': '34px'
  '9': '36px'
  '9-5': '38px'
  '10': '40px'
  '11': '44px'
  '12': '48px'
  '13': '52px'
  '14': '56px'
  '15': '60px'
  '16': '64px'
  '17': '68px'
  '18': '72px'
  '19': '76px'
  '20': '80px'
height:
  xs: '20px'
  sm: '24px'
  base: '28px'
  lg: '32px'
motion:
  duration-instant: '50ms'
  duration-fast: '100ms'
  duration-normal: '150ms'
  duration-slow: '200ms'
  duration-slower: '300ms'
  easing-default: 'ease'
  easing-in: 'ease-in'
  easing-out: 'ease-out'
  easing-in-out: 'ease-in-out'
  easing-in-strong: 'cubic-bezier(0.895, 0.03, 0.685, 0.22)'
  easing-out-strong: 'cubic-bezier(0.165, 0.84, 0.44, 1)'
  easing-out-quint: 'cubic-bezier(0.16, 1, 0.3, 1)'
  easing-in-out-strong: 'cubic-bezier(0.77, 0, 0.175, 1)'
---

# Design System: Supply Chain Board

**Autorité :** tokens CSS **produit Cursor light** collés par l’utilisateur (2026-08-11).  
**Hors scope :** marketing getdesign (`cursor/DESIGN.md`), DESIGN éditoriaux tiers, approximations.

Implémentation runtime : `.theme-cursor` dans `inertia-react/styles/app.css`, activé sur le dashboard via `theme="cursor"`.

---

## 1. Visual Theme & Atmosphere

Interface produit light, dense, système. Fond chrome clair, sidebar légèrement plus grise, surfaces éditeur quasi-blanches. Encre `--base` `#141414` (pas le warm `#26251e` marketing). Accent UI bleu `--accent` `#2778c1` pour focus/liens. Marque orange `--brand` `#f54e00` rare. Typo UI système 13 px (`--font-size-base`), poids normal atypique **418**. Radius compacts (6–8 px). Ombres très légères via `--shadow-*`.

**Key Characteristics:**

- Trois surfaces structurantes : `sidebar` / `chrome` / `editor`
- CTA filled = `base` + `actionLabel` (noir / clair), pas brand orange
- Focus ring = `focus` / `accent` bleu `#2778c1`
- Brand orange `#f54e00` = marque, pas fill de surface
- Échelle spacing 4 px + sous-pas 1 px ; radius xs→3xl + full

---

## 2. Color Palette & Roles

### Chrome & surfaces (extrait résolu)

| Token CSS       | Hex       | Rôle                            |
| --------------- | --------- | ------------------------------- |
| `--sidebar`     | `#f3f3f3` | Fond sidebar                    |
| `--chrome`      | `#f8f8f8` | Chrome app / fond page          |
| `--editor`      | `#fcfcfc` | Surface éditeur / cards content |
| `--base`        | `#141414` | Encre primaire, CTA filled bg   |
| `--actionLabel` | `#fcfcfc` | Texte sur CTA filled            |
| `--accent`      | `#2778c1` | Accent UI (liens, highlights)   |
| `--brand`       | `#f54e00` | Marque Cursor                   |
| `--focus`       | `#2778c1` | Focus ring                      |

### Sémantique produit

| Token         | Hex       | Rôle            |
| ------------- | --------- | --------------- |
| `--success`   | `#007041` | Succès          |
| `--warn`      | `#a46700` | Avertissement   |
| `--danger`    | `#be1744` | Danger / erreur |
| `--added`     | `#007041` | Git added       |
| `--modified`  | `#a46700` | Git modified    |
| `--removed`   | `#be1744` | Git removed     |
| `--untracked` | `#176c74` | Git untracked   |

### Couleurs nommées

| Token       | Hex       |
| ----------- | --------- |
| `--red`     | `#be1744` |
| `--orange`  | `#cd4500` |
| `--yellow`  | `#a46700` |
| `--green`   | `#007041` |
| `--cyan`    | `#176c74` |
| `--blue`    | `#2778c1` |
| `--magenta` | `#92156a` |
| `--purple`  | `#7565cc` |

### Diffs

| Token                 | Hex         |
| --------------------- | ----------- |
| `--diff-added-line`   | `#00af6624` |
| `--diff-added-text`   | `#00b06838` |
| `--diff-removed-line` | `#ff617b38` |
| `--diff-removed-text` | `#ff617b57` |

### Shadows (hex alpha)

| Token                | Hex         |
| -------------------- | ----------- |
| `--shadow-primary`   | `#0000000f` |
| `--shadow-secondary` | `#00000009` |
| `--shadow-tertiary`  | `#00000005` |

### React-tooltip (`--rt-*`) — même extrait page

| Token                           | Hex       |
| ------------------------------- | --------- |
| `--rt-color-white`              | `#ffffff` |
| `--rt-color-dark`               | `#222222` |
| `--rt-color-success`            | `#8dc572` |
| `--rt-color-error`              | `#be6464` |
| `--rt-color-warning`            | `#f0ad4e` |
| `--rt-color-info`               | `#337ab7` |
| `--rt-opacity`                  | `0.9`     |
| `--rt-transition-show-delay`    | `0.15s`   |
| `--rt-transition-closing-delay` | `0.15s`   |
| `--rt-arrow-size`               | `8px`     |

### Syntax highlighting

| Token                        | Valeur      |
| ---------------------------- | ----------- |
| `--syntax-foreground`        | `#141414eb` |
| `--syntax-background`        | `#fcfcfc`   |
| `--syntax-keyword`           | `#b3003f`   |
| `--syntax-string`            | `#8f84e0`   |
| `--syntax-function`          | `#db704b`   |
| `--syntax-number`            | `#b8448b`   |
| `--syntax-comment`           | `#141414ad` |
| `--syntax-constant`          | `#206595`   |
| `--syntax-parameter`         | `#141414eb` |
| `--syntax-punctuation`       | `#141414ad` |
| `--syntax-link`              | `#3c7cab`   |
| `--syntax-string-expression` | `#8f84e0`   |

### Mapping alias `--cursor-*` → tokens produit

Extrait structurel (alias) — les hex viennent des tokens résolus ci-dessus.

| Alias Cursor                                                        | Résout vers                    | Hex (light)                                                        |
| ------------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------ |
| `--cursor-bg-sidebar`                                               | `--bg-sidebar` / `--sidebar`   | `#f3f3f3`                                                          |
| `--cursor-bg-chrome`                                                | `--bg-chrome` / `--chrome`     | `#f8f8f8`                                                          |
| `--cursor-bg-editor` / `--cursor-bg-elevated` / `--cursor-bg-input` | `--bg-elevated` / `--editor`   | `#fcfcfc`                                                          |
| `--cursor-bg-card`                                                  | `--bg-quaternary`              | _(alias — surface card = editor `#fcfcfc` en pratique board)_      |
| `--cursor-bg-primary` … `--cursor-bg-quinary`                       | `--bg-primary` …               | _(non résolus dans le collé hex — utiliser chrome/sidebar/editor)_ |
| `--cursor-bg-active` / `--cursor-bg-focused`                        | `--bg-active` / `--bg-focused` | _(alias)_                                                          |
| `--cursor-text-primary` / active / focused                          | `--text-primary`               | ≈ `--base` `#141414`                                               |
| `--cursor-text-secondary` … quaternary                              | `--text-secondary` …           | _(alias)_                                                          |
| `--cursor-text-invert`                                              | `--text-inverted`              | ≈ `--actionLabel` `#fcfcfc`                                        |
| `--cursor-text-link`                                                | `--text-blue`                  | ≈ `--blue` `#2778c1`                                               |
| `--cursor-accent`                                                   | `--accent`                     | `#2778c1`                                                          |
| `--cursor-base`                                                     | `--base`                       | `#141414`                                                          |
| `--cursor-blue` / purple / success / warn / danger / focus          | tokens homonymes               | voir tables                                                        |
| `--cursor-stroke-*`                                                 | `--border-*`                   | _(alias)_                                                          |
| `--cursor-shadow-*`                                                 | `--shadow-*`                   | voir shadows                                                       |
| `--cursor-button-background`                                        | `--bg-neutral`                 | ≈ `--base`                                                         |
| `--cursor-button-foreground`                                        | `--text-inverted`              | `#fcfcfc`                                                          |
| `--cursor-button-hover-background`                                  | `--bg-neutral-hover`           | _(alias)_                                                          |
| `--cursor-button-secondary-background`                              | `--bg-tertiary`                | _(alias)_                                                          |
| `--cursor-button-secondary-foreground`                              | `--text-primary`               | `#141414`                                                          |
| `--cursor-button-secondary-hover-background`                        | `--bg-quaternary`              | _(alias)_                                                          |

**Note board :** quand un alias n’a pas de hex collé, on mappe aux trois surfaces résolues (`sidebar` / `chrome` / `editor`) + `base` / `brand` / `accent`.

---

## 3. Typography

### Families

```text
--cursor-font-family-sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif
--cursor-font-family-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace
--diffs-font-family: (même stack mono)
--diffs-font-size: 12px
```

### Weights & width

| Token                                                              | Valeur |
| ------------------------------------------------------------------ | ------ |
| `--font-weight-normal` / `--cursor-font-weight-normal` / `regular` | `418`  |
| `--font-weight-medium`                                             | `500`  |
| `--font-weight-semibold`                                           | `600`  |
| `--font-weight-bold`                                               | `700`  |
| `--font-width-normal`                                              | `4.7`  |

### UI sizes (rem)

| Token              | rem         | px ≈ |
| ------------------ | ----------- | ---- |
| `--font-size-xs`   | `0.6875rem` | 11   |
| `--font-size-sm`   | `0.75rem`   | 12   |
| `--font-size-base` | `0.8125rem` | 13   |
| `--font-size-lg`   | `1rem`      | 16   |
| `--font-size-xl`   | `1.25rem`   | 20   |

### Line heights

| Token                | Valeur     |
| -------------------- | ---------- |
| `--line-height-xs`   | `0.875rem` |
| `--line-height-sm`   | `1rem`     |
| `--line-height-base` | `1.125rem` |
| `--line-height-lg`   | `1.5rem`   |
| `--line-height-xl`   | `1.75rem`  |

### Cursor component type scale

| Token                       | Valeur |
| --------------------------- | ------ |
| `--cursor-font-size-xs`     | `11px` |
| `--cursor-font-size-sm`     | `12px` |
| `--cursor-font-size-base`   | `13px` |
| `--cursor-font-size-lg`     | `14px` |
| `--cursor-line-height-xs`   | `14px` |
| `--cursor-line-height-sm`   | `16px` |
| `--cursor-line-height-base` | `18px` |
| `--cursor-line-height-lg`   | `22px` |

### Letter-spacing

| Token                          | Valeur    |
| ------------------------------ | --------- |
| `--cursor-letter-spacing-xs`   | `0.07px`  |
| `--cursor-letter-spacing-sm`   | `0px`     |
| `--cursor-letter-spacing-base` | `-0.08px` |
| `--cursor-letter-spacing-lg`   | `-0.15px` |
| `--cursor-letter-spacing-xl`   | `0.08px`  |
| `--cursor-letter-spacing-2xl`  | `-0.46px` |
| `--cursor-letter-spacing-3xl`  | `-0.26px` |

### Web / marketing-adjacent text tokens (même extrait)

| Token             | Valeur                                |
| ----------------- | ------------------------------------- |
| `--web-text-sm`   | `var(--font-size-sm)` → `0.75rem`     |
| `--web-text-base` | `var(--font-size-base)` → `0.8125rem` |
| `--text-xs`       | `0.75rem`                             |
| `--text-base`     | `1rem`                                |
| `--text-md`       | `1.375rem`                            |
| `--text-lg`       | `2.25rem`                             |
| `--text-xl`       | `3.25rem`                             |

### Principles

- UI courante = **13 px** / weight **418–500** / tracking **-0.08px**
- Mono pour diffs / code = stack système, **12 px**
- Pas de CursorGothic / jjannon dans cet extrait produit — stack système uniquement

---

## 4. Spacing

### Layout chrome

| Token                        | Valeur                     |
| ---------------------------- | -------------------------- |
| `--navbar-height`            | `2.75rem`                  |
| `--file-list-item-py`        | `0.25rem`                  |
| `--file-list-item-content-h` | `1rem`                     |
| `--file-list-item-h`         | `calc(content-h + 2 * py)` |
| `--file-list-visible-count`  | `7.5`                      |
| `--file-list-max-vh`         | `30vh`                     |

### `--cursor-spacing-*` (positif)

| Token           | px                                         |
| --------------- | ------------------------------------------ |
| `0-25` … `0-75` | 1, 2, 3                                    |
| `1` … `1-75`    | 4, 5, 6, 7                                 |
| `2` … `2-75`    | 8, 9, 10, 11                               |
| `3` … `3-75`    | 12, 13, 14, 15                             |
| `4` … `4-75`    | 16, 17, 18, 19                             |
| `5` / `5-5`     | 20 / 22                                    |
| `6` / `6-5`     | 24 / 26                                    |
| `7` / `7-5`     | 28 / 30                                    |
| `8` / `8-5`     | 32 / 34                                    |
| `9` / `9-5`     | 36 / 38                                    |
| `10` … `20`     | 40, 44, 48, 52, 56, 60, 64, 68, 72, 76, 80 |

### `--cursor-spacing-ne-*` (négatif)

Miroir négatif : `ne-0-25` = `-1px` … `ne-5` = `-20px` (tous les pas collés dans l’extrait).

### Control heights

| Token                  | Valeur |
| ---------------------- | ------ |
| `--cursor-height-xs`   | `20px` |
| `--cursor-height-sm`   | `24px` |
| `--cursor-height-base` | `28px` |
| `--cursor-height-lg`   | `32px` |

---

## 5. Radius

| Token                  | Valeur   |
| ---------------------- | -------- |
| `--cursor-radius-none` | `0px`    |
| `--cursor-radius-xs`   | `2px`    |
| `--cursor-radius-sm`   | `4px`    |
| `--cursor-radius-base` | `6px`    |
| `--cursor-radius-lg`   | `8px`    |
| `--cursor-radius-xl`   | `12px`   |
| `--cursor-radius-2xl`  | `14px`   |
| `--cursor-radius-3xl`  | `16px`   |
| `--cursor-radius-full` | `9999px` |

**Board :** boutons `base` 6px ; cards `lg` 8px.

---

## 6. Elevation, shadows & strokes

### Box shadows (extrait)

```css
--cursor-box-shadow-sm: 0 2px 8px 0px var(--cursor-shadow-secondary);
--cursor-box-shadow-base:
  0 0 0 1px var(--border-tertiary), 0 0 4px 0px var(--shadow-secondary),
  0 8px 24px -2px var(--shadow-secondary);
--cursor-box-shadow-soft: 0 0 8px 2px var(--cursor-shadow-tertiary);
--cursor-box-shadow-popup: 0 8px 16px 0 var(--widget-shadow, rgba(20, 20, 20, 0.12));
--cursor-box-shadow-lg:
  0 0 4px 0 rgba(255, 255, 255, 0.05) inset, 0 0 3px 0 var(--cursor-shadow-secondary),
  0 16px 24px 0 var(--cursor-shadow-tertiary);
--cursor-box-shadow-xl:
  0 0 4px 0 rgba(255, 255, 255, 0.05) inset, 0 0 6px 8px var(--cursor-shadow-secondary),
  0 24px 16px 6px var(--cursor-shadow-tertiary);
--cursor-box-shadow-workbench: var(--color-theme-shadow-card);
```

### Stroke aliases

`--cursor-stroke-primary|secondary|tertiary|quaternary|focused` → `--border-*`  
Strokes sémantiques rouge/jaune/vert/magenta/cyan/orange → `--border-*-secondary|tertiary`  
Git strokes → `--border-added-secondary` / `--border-removed-secondary`

### Elevations

| Token                  | Valeur |
| ---------------------- | ------ |
| `--cursor-elevation-1` | `1`    |
| `--cursor-elevation-2` | `2`    |

**Board :** cards KPI = flat + hairline `#e8e8e8` (dérivé chrome) ; overlays = `box-shadow-popup` / `base`.

---

## 7. Motion

| Token                           | Valeur                                   |
| ------------------------------- | ---------------------------------------- |
| `--cursor-duration-instant`     | `50ms`                                   |
| `--cursor-duration-fast`        | `100ms`                                  |
| `--cursor-duration-normal`      | `150ms`                                  |
| `--cursor-duration-slow`        | `200ms`                                  |
| `--cursor-duration-slower`      | `300ms`                                  |
| `--cursor-easing-default`       | `ease`                                   |
| `--cursor-easing-in`            | `ease-in`                                |
| `--cursor-easing-out`           | `ease-out`                               |
| `--cursor-easing-in-out`        | `ease-in-out`                            |
| `--cursor-easing-in-strong`     | `cubic-bezier(0.895, 0.03, 0.685, 0.22)` |
| `--cursor-easing-out-strong`    | `cubic-bezier(0.165, 0.84, 0.44, 1)`     |
| `--cursor-easing-out-quint`     | `cubic-bezier(0.16, 1, 0.3, 1)`          |
| `--cursor-easing-in-out-strong` | `cubic-bezier(0.77, 0, 0.175, 1)`        |

---

## 8. Scrollbar

| Token                                        | Valeur                                             |
| -------------------------------------------- | -------------------------------------------------- |
| `--cursor-scrollbar-vertical-size`           | `14px`                                             |
| `--cursor-scrollbar-horizontal-size`         | `12px`                                             |
| `--cursor-scrollbar-thumb-background`        | `color-mix(in srgb, var(--base) 14%, transparent)` |
| `--cursor-scrollbar-thumb-hover-background`  | `color-mix(in srgb, var(--base) 22%, transparent)` |
| `--cursor-scrollbar-thumb-active-background` | `color-mix(in srgb, var(--base) 26%, transparent)` |

---

## 9. Text / icon / bg semantic aliases (structure)

Tous présents dans l’extrait alias (hex via tables §2 quand résolus) :

- **Text :** `--cursor-text-primary|secondary|tertiary|quaternary|invert|active|focused` + `text-{red,yellow,green,magenta,cyan,orange}-{primary,secondary}` + `text-link`
- **Icon :** `--cursor-icon-primary|secondary|tertiary|quaternary` + mêmes familles couleur + `icon-accent-*` + `icon-purple-*`
- **Bg :** `--cursor-bg-primary` … `quinary`, `elevated`, `card`, `input`, `editor`, `sidebar`, `diff-*`, `active`, `focused`, `chrome`, + `bg-{color}-primary|secondary|tertiary`
- **Git / diffs bg :** `--cursor-bg-diff-inserted` / `removed` → overrides diffs

---

## 10. Component mapping — Supply Chain Board

| Élément board                     | Token produit                             | Hex                   |
| --------------------------------- | ----------------------------------------- | --------------------- |
| AppSidebar fond                   | `--sidebar`                               | `#f3f3f3`             |
| Page / TopBar                     | `--chrome`                                | `#f8f8f8`             |
| Card KPI                          | `--editor`                                | `#fcfcfc`             |
| Texte / chiffres                  | `--base`                                  | `#141414`             |
| CTA filled                        | `--base` + `--actionLabel`                | `#141414` / `#fcfcfc` |
| Wordmark AERECO / pastille alerte | `--brand`                                 | `#f54e00`             |
| Focus / ring                      | `--focus`                                 | `#2778c1`             |
| OK / planifié                     | `--success` / `--green`                   | `#007041`             |
| Warning                           | `--warn`                                  | `#a46700`             |
| Erreur                            | `--danger`                                | `#be1744`             |
| Radius bouton                     | `--cursor-radius-base`                    | `6px`                 |
| Radius card                       | `--cursor-radius-lg`                      | `8px`                 |
| Type UI                           | `--font-size-base` + weight normal/medium | `13px` / `418`–`500`  |

---

## 11. Do / Don’t

**Do**

- Utiliser `sidebar` / `chrome` / `editor` pour les trois plans
- CTA noir `base`, brand orange rare
- Focus bleu `accent`/`focus`
- Radius 6/8, type 13 px système

**Don’t**

- Substituer le crème marketing `#f7f7f4` / ink `#26251e` à ces tokens produit
- Remplir les surfaces en orange brand
- Inventer des hex non présents dans les collages (sauf dérivés hairline documentés dans le code comme `#e8e8e8` / `#eeeeee` pour hover/selected à partir de chrome/sidebar)

---

## 12. Inventory — extrait brut (checklist)

### Résolus hex collés

`sidebar`, `chrome`, `editor`, `base`, `accent`, `actionLabel`, `brand`, `focus`, `success`, `warn`, `danger`, `added`, `modified`, `removed`, `untracked`, `red`, `orange`, `yellow`, `green`, `cyan`, `blue`, `magenta`, `purple`, `diff-added-line|text`, `diff-removed-line|text`, `shadow-primary|secondary|tertiary`, syntax `*`, `rt-color-*`

### Typo / layout collés

`font-weight-*`, `font-width-normal`, `font-size-*`, `line-height-*`, `web-text-*`, `text-*`, `diffs-font-*`, `navbar-height`, `file-list-*`

### Échelles Cursor collées

`cursor-spacing-*` (pos + ne), `cursor-radius-*`, `cursor-height-*`, `cursor-font-size-*`, `cursor-line-height-*`, `cursor-letter-spacing-*`, `cursor-duration-*`, `cursor-easing-*`, `cursor-box-shadow-*`, `cursor-scrollbar-*`, `cursor-elevation-*`, `cursor-font-family-*`

### Alias structurels collés (sans hex)

Toute la famille `--cursor-bg|text|icon|stroke|shadow|button|syntax|*` pointant vers `--bg-*`, `--text-*`, `--border-*`, `--icon-*`, etc.

---

_Fin du DESIGN.md — produit Cursor light uniquement, tel que collé._
