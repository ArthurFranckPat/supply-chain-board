# Plan de migration frontend — Alpine.js + Tailwind v4 + Edge components

## Contexte

`board.edge` est un monolithe de 1076 lignes : ~265 lignes CSS inline, ~156 lignes
de template Edge, ~640 lignes de JS vanilla. Le système de composants Edge.js
n'est pas utilisé. Aucun build pipeline frontend n'existe.

**Objectif** : décomposer en composants Edge réutilisables, migrer vers Tailwind
CSS v4 pour le styling, Alpine.js pour la réactivité client, tout en conservant
Unpoly pour la navigation SPA côté serveur.

---

## Architecture cible

```
resources/
├── css/
│   └── app.css                    # Entry point Tailwind v4 (@import + @theme)
├── js/
│   └── app.ts                     # Entry point Alpine (data components, plugins)
└── views/
    ├── layouts/
    │   └── board_layout.edge      # Shell HTML : <head>, scripts, CSS, layout
    ├── pages/
    │   └── board.edge             # Assemblage des composants (orchestration)
    └── components/
        ├── board/
        │   ├── header.edge        # Titre + meta + légende + form date/horizon
        │   ├── toolbar.edge       # Search + boutons + toggle mode/span
        │   ├── gantt/
        │   │   ├── grid.edge      # Conteneur Gantt (.gantt + .ghead + rows)
        │   │   ├── day_header.edge# En-tête semaines + jours (colonnes)
        │   │   ├── track.edge     # Une ligne de production (row + track)
        │   │   └── bar.edge       # Une barre OF (.bar)
        │   ├── panels/
        │   │   ├── detail.edge    # Panneau détail OF (côté droit)
        │   │   ├── backlog.edge   # Panneau OF en retard (côté gauche)
        │   │   └── feasibility.edge # Panneau résultats faisabilité
        │   └── toast.edge         # Notification toast
        └── ui/
            ├── button.edge        # Bouton réutilisable (variantes)
            ├── badge.edge         # Badge de statut (✓/✕/?)
            └── stat_card.edge     # Carte statistique (pour feas panel)
public/
├── css/
│   └── app.css                    # Tailwind compilé (output du CLI)
└── js/
    └── app.js                     # Alpine bundle (copié depuis node_modules ou build)
```

---

## Phase 0 — Infrastructure

### 0.1 Installation des dépendances

```bash
npm install -D tailwindcss @tailwindcss/cli
npm install alpinejs
```

> Tailwind v4 ne nécessite **pas** de `tailwind.config.js` — la config se fait
> directement en CSS via `@theme`. C'est un changement majeur vs v3.

### 0.2 Middleware static files

Installer `@adonisjs/static` pour servir `public/` :

```bash
node ace configure @adonisjs/static
```

Si refus d'ajouter une dépendance, alternative : garder le pattern route-based
actuel (comme unpoly.js) pour servir CSS/JS. Moins performant (pas de cache
navigateur 304) mais fonctionne sans config supplémentaire.

### 0.3 Entry points

**`resources/css/app.css`** — Tailwind v4 :
```css
@import "tailwindcss";

@theme {
  --color-aldes: #0069B4;
  --color-aldes-soft: rgba(0, 105, 180, 0.10);
  --color-st-ferme: #2e9e00;
  --color-st-planifie: #0069B4;
  --color-st-suggere: #d98200;
  --color-line: #d3d8e0;
  --color-line-soft: #e7eaf0;
  --color-bg: #eef1f5;
  --color-panel: #ffffff;
  --color-txt: #1f2733;
  --color-muted: #6b7480;
  --color-wk: #8b97a8;
}
```

**`resources/js/app.ts`** — Alpine entry :
```ts
import Alpine from 'alpinejs'
import board from './alpine/board'

window.Alpine = Alpine

Alpine.data('board', board)

document.addEventListener('alpine:init', () => {
  // Plugins / globals si besoin
})

Alpine.start()
```

### 0.4 Scripts npm

```json
{
  "css:dev": "@tailwindcss/cli -i resources/css/app.css -o public/css/app.css --watch",
  "css:build": "@tailwindcss/cli -i resources/css/app.css -o public/css/app.css --minify",
  "js:build": "node ace bundle:js resources/js/app.ts public/js/app.js"
}
```

> Pour le JS : deux options. (A) Utiliser `esbuild` directement pour bundler
> Alpine + composants → `public/js/app.js`. (B) Charger Alpine depuis CDN et
> mettre les composants dans un `<script>` dans le layout. L'option A est
> préférable (offline, pas de CDN, tree-shaking).

### 0.5 metaFiles dans adonisrc.ts

```ts
metaFiles: [
  { pattern: 'resources/views/**/*.edge', reloadServer: false },
  { pattern: 'public/css/**/*.css', reloadServer: false },
  { pattern: 'public/js/**/*.js', reloadServer: false },
],
```

---

## Phase 1 — Layout & Design System

### 1.1 Créer `layouts/board_layout.edge`

```edge
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>@!yield('title', 'Ordonnancement OF')</title>
  <link rel="stylesheet" href="/css/app.css">
  <script src="/vendor/unpoly.js" defer></script>
  <link rel="stylesheet" href="/vendor/unpoly.css">
  <script src="/js/app.js" defer></script>
  @!yield('head')
</head>
<body>
  @!yield('body')
</body>
</html>
```

### 1.2 Migration CSS variables → Tailwind `@theme`

Les variables CSS actuelles (`--aldes`, `--st1`, `--bg`, etc.) deviennent des
tokens Tailwind via `@theme`. Usage : `text-aldes`, `bg-st-ferme`, `border-line`, etc.

### 1.3 CSS qui reste custom (Gantt positioning)

Le Gantt utilise du positioning absolu avec `calc()` dynamique — **non
exprimable** en utilities Tailwind. Ce CSS reste dans `app.css` sous
`@layer components` :

```css
@layer components {
  .gantt { /* --day-w calc, overflow auto */ }
  .gantt .track { /* repeating-linear-gradient */ }
  .gantt .bar { /* absolute positioning, left/width calc */ }
  .gantt .wksep { /* absolute week separator */ }
}
```

Règle : si la valeur dépend d'une variable dynamique (`var(--cols)`,
`var(--lane-h)`, `calc(N * ...)`), elle reste en CSS custom. Tout le reste
passe en utilities Tailwind.

---

## Phase 2 — Décomposition en composants Edge

### 2.1 Composants UI réutilisables

**`components/ui/button.edge`** :
```edge
@props({
  variant: 'primary',    // primary | secondary | danger | ghost
  size: 'md',
  type: 'button',
  disabled: false,
})
<button type="{{ type }}" {{ disabled ? 'disabled' : '' }}
  @class([
    'inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium cursor-pointer transition',
    'bg-aldes text-white hover:brightness-110' : variant === 'primary',
    'bg-white text-txt border border-line hover:border-aldes hover:text-aldes' : variant === 'secondary',
    'bg-white text-[#b42318] border border-[#f1bcb6]' : variant === 'danger',
    'bg-transparent text-muted hover:text-txt' : variant === 'ghost',
  ])
  ...$attrs
>
  {{$slot}}
</button>
```

> `@props` et `@class` sont des helpers Edge.js intégrés.
> `$attrs` forward les attributs non déclarés (id, data-*, @click, etc.).

### 2.2 Composants board

**`components/board/header.edge`** :
```edge
@props({ totalOf, lineCount, horizon, start })
<header class="flex flex-wrap items-center gap-4 border-b border-line bg-panel px-4 py-2.5">
  <h1 class="text-sm font-medium text-txt">
    Ordonnancement <b class="text-aldes">OF</b>
  </h1>
  <span class="text-xs text-muted" id="board-meta">
    {{ totalOf }} OF · {{ lineCount }} lignes · {{ horizon }} j
  </span>
  <div class="flex items-center gap-3 text-[11px] text-muted">
    <span class="flex items-center gap-1"><i class="w-2 h-2 rounded-sm bg-st-ferme"></i>Ferme</span>
    <span class="flex items-center gap-1"><i class="w-2 h-2 rounded-sm bg-st-planifie"></i>Planifié</span>
    <span class="flex items-center gap-1"><i class="w-2 h-2 rounded-sm bg-st-suggere"></i>Suggéré</span>
  </div>
  @!component('components/board/date_form', { start, horizon })
</header>
```

### 2.3 Tableau de correspondance extraction

| Section actuelle (board.edge) | Nouveau composant | Lignes |
|-------------------------------|-------------------|--------|
| `<style>` L9-273 | `resources/css/app.css` + `@layer` | 265 → tokenisé |
| `<header>` L276-290 | `board/header.edge` | 14 |
| `.toolbar` L292-306 | `board/toolbar.edge` | 14 |
| `#board-main` + `.gantt` L308-367 | `board/gantt/grid.edge` + sub | 59 |
| `.bar` template L351-360 | `board/gantt/bar.edge` | 9 |
| `#panel` L371-411 | `board/panels/detail.edge` | 40 |
| `#backlog` L413-420 | `board/panels/backlog.edge` | 7 |
| `#feas-panel` L422-432 | `board/panels/feasibility.edge` | 10 |
| `<script>` L434-1073 | `resources/js/alpine/*.ts` | 640 |

---

## Phase 3 — Architecture Alpine.js

### 3.1 État centralisé

Le JS vanilla actuel gère ~10 morceaux d'état dispersés en variables globales
(`DAYS`, `OFDATA`, `COLS`, `feasResults`, `matCache`, `panelNum`, `dragged`,
etc.). Avec Alpine, tout converge dans un `Alpine.data('board', ...)`.

**`resources/js/alpine/board.ts`** :
```ts
export default () => ({
  // --- État ---
  days: [] as string[],
  ofData: {} as Record<string, any>,
  cols: 0,
  search: '',
  searchMatches: 0,
  spanMode: localStorage.getItem('board-span') === '1',
  feasMode: 'immediate' as 'immediate' | 'sequential',
  selectedOf: null as string | null,
  feasResults: null as any,
  matCache: {} as Record<string, any>,
  toast: { show: false, msg: '', err: false },
  loadingFeas: false,
  loadingReload: false,

  // --- Init ---
  init() {
    this.loadBoardData()
    this.$watch('search', () => this.applyFilter())
    this.$watch('spanMode', (v) => localStorage.setItem('board-span', v ? '1' : '0'))
  },

  loadBoardData() {
    const el = document.getElementById('board-data')
    if (!el) return
    const d = JSON.parse(el.textContent)
    this.days = d.days || []
    this.ofData = d.ofData || {}
    this.cols = d.cols || this.days.length
  },

  // --- Drag & drop ---
  // Les events natifs drag&drop restent, mais pilotent l'état Alpine
  // au lieu de manipuler le DOM directement.

  // --- Faisabilité ---
  async computeFeasibility() { /* fetch + setState */ },

  // --- Panneau détail ---
  openDetail(numOf: string) { this.selectedOf = numOf },
  closeDetail() { this.selectedOf = null },

  // ... etc
})
```

### 3.2 Migration du markup vers directives Alpine

**Avant** (vanilla, `getElementById` + `innerHTML`) :
```html
<dl class="p-grid">
  <dt>Statut</dt><dd id="p-statut">—</dd>
</dl>
```
```js
setTxt('p-statut', d.statutLabel || '—')
```

**Après** (Alpine, réactif) :
```edge
<dl class="grid grid-cols-2 text-xs">
  <dt class="text-muted py-1.5 border-b border-line-soft">Statut</dt>
  <dd class="text-right font-semibold py-1.5 border-b border-line-soft tabular-nums">
    {{ selectedOfData?.statutLabel || '—' }}
  </dd>
</dl>
```

Pas de `getElementById`, pas de `innerHTML`. Alpine met à jour le DOM
automatiquement quand `selectedOfData` change.

### 3.3 Faisabilité panel — fin du `innerHTML` de 60 lignes

Le code actuel (L997-1017) construit le HTML du panel de faisabilité par
concaténation de strings dans une template literal. Avec Alpine + Edge :

```edge
@each(o in feasResults.orders)
  <div class="bg-white rounded border-l-[3px] p-2.5 text-xs"
       :style="`border-left-color: ${statutColor(o.statut)}`">
    <div class="flex justify-between items-center">
      <span class="font-semibold">{{ o.numCommande }}</span>
      <span class="text-white rounded-sm px-1.5 text-[10px]"
            :style="`background: ${statutColor(o.statut)}`">
        {{ statutLabel(o.statut) }}
      </span>
    </div>
    <div class="text-aldes text-[11px] mt-0.5">
      {{ o.article }} · {{ o.client }} · {{ o.qteRestante }}p · {{ o.dateExpedition }}
    </div>
    @if(o.joursRetard > 0)
      <div class="text-[#b42318] text-[10px] mt-0.5">+{{ o.joursRetard }}j retard</div>
    @end
  </div>
@end
```

Le rendu se fait côté serveur (Edge) à l'initial load, puis Alpine met à jour
quand `feasResults` change.

### 3.4 Bridge Unpoly ↔ Alpine

**Problème** : Unpoly remplace `#board-main` après un form submit. Les composants
Alpine dans la région remplacée doivent être réinitialisés.

**Solution** : `up.compiler()` qui appelle `Alpine.initTree()`.

Dans `resources/js/app.ts` :
```ts
// Bridge Unpoly → Alpine
// up.compiler s'exécute au boot ET après chaque swap de fragment
window.up?.compiler('[data-alpine-bridge]', (el: HTMLElement) => {
  // Alpine détecte et initialise automatiquement les nouveaux x-data
  // dans le subtree inséré par Unpoly
  window.Alpine.initTree(el)
  // Pas de cleanup nécessaire : Alpine nettoie quand le DOM est retiré
})
```

Sur le `#board-main` :
```edge
<div id="board-main" data-alpine-bridge x-data="board" data-start="{{ start }}" data-horizon="{{ horizon }}">
```

**Règle de coexistence** :
- **Unpoly** gère : navigation entre pages, form submits qui changent le scope
  (dates, horizon), reload de données depuis X3
- **Alpine** gère : tout l'interactif client (drag&drop, panels, search, toggle,
  faisabilité, toast) — sans rechargement serveur

---

## Phase 4 — Migration Tailwind CSS

### 4.1 Ordre de migration

1. **Tokens** : migrer les variables CSS `:root` vers `@theme` dans `app.css`
2. **Layout utilities** : `display: flex` → `flex`, `padding: 10px 18px` → `px-4 py-2.5`, etc.
3. **Composants** : les classes complexes (`.bar`, `.card`, `.track`) → `@layer components`
4. **Inline styles** : tous les `style="..."` inline dans le template → classes Tailwind

### 4.2 Mapping des couleurs

| Variable CSS | Token Tailwind | Usage |
|---|---|---|
| `--bg: #eef1f5` | `bg-bg` | Background page |
| `--panel: #fff` | `bg-panel` | Headers, panels |
| `--txt: #1f2733` | `text-txt` | Texte principal |
| `--muted: #6b7480` | `text-muted` | Texte secondaire |
| `--aldes: #0069B4` | `text-aldes`, `bg-aldes` | Brand Aldes |
| `--line: #d3d8e0` | `border-line` | Bordures |
| `--line-soft: #e7eaf0` | `border-line-soft` | Bordures légères |
| `--st1: #2e9e00` | `bg-st-ferme` | Statut Ferme |
| `--st2: #0069B4` | `bg-st-planifie` | Statut Planifié |
| `--st3: #d98200` | `bg-st-suggere` | Statut Suggéré |

### 4.3 CSS qui reste custom

```css
/* resources/css/app.css — après @import "tailwindcss" et @theme */

@layer components {
  /* Gantt : positioning dynamique calc() — pas exprimable en utilities */
  .gantt {
    --label-w: 180px;
    --lane-h: 30px;
    --day-w: max(48px, calc((100vw - var(--label-w) - 18px) / var(--cols)));
    overflow: auto;
    height: 100vh;
  }
  .gantt .track {
    position: relative;
    background: repeating-linear-gradient(to right,
      transparent 0, transparent calc(var(--day-w) - 1px),
      var(--color-line-soft) calc(var(--day-w) - 1px),
      var(--color-line-soft) var(--day-w));
  }
  .gantt .bar {
    position: absolute;
    /* left, width, top sont set dynamiquement par JS — pas des classes */
  }
  .gantt.compact { --lane-h: 48px; }
}
```

---

## Phase 5 — Séquence de migration (sans casser)

Stratégie : migration incrémentale, le board reste fonctionnel à chaque étape.

### Étape 1 : Infrastructure (Phase 0)
- Installer deps, créer `public/`, configurer static serving
- Créer `resources/css/app.css` et `resources/js/app.ts`
- **Ne pas toucher au board.edge existant**
- Vérifier : `npm run css:dev` compile, `public/css/app.css` est servi

### Étape 2 : Layout shell (Phase 1)
- Créer `layouts/board_layout.edge`
- Lier le CSS et JS compilés dans le `<head>`
- `board.edge` utilise `@layout('layouts/board_layout')`
- L'ancien `<style>` inline reste pour l'instant (double CSS temporairement)
- **Vérifier** : le board s'affiche identique

### Étape 3 : Composants Edge — extraction statique (Phase 2)
- Extraire header, toolbar, panels en composants Edge
- Le board.edge devient un assemblage de `@!component()` calls
- Le JS vanilla reste inline (dans un `<script>` du layout ou un fichier séparé)
- **Vérifier** : toutes les interactions marchent

### Étape 4 : Alpine — migration progressive (Phase 3)
- Créer `resources/js/alpine/board.ts` avec l'état Alpine
- Migrer feature par feature :
  1. Toast (le plus simple, isolation complète)
  2. Panneau détail (open/close + data binding)
  3. Search/filter
  4. Toggle span/compact
  5. Backlog panel
  6. Faisabilité panel
  7. Drag & drop (le plus complexe — dernier)
- À chaque feature migrée, supprimer le JS vanilla correspondant
- **Vérifier** après chaque feature

### Étape 5 : Tailwind — migration CSS (Phase 4)
- Migrer les variables CSS → `@theme`
- Remplacer les classes custom par des utilities Tailwind dans les composants
- Garder uniquement le CSS Gantt dans `@layer components`
- Supprimer le `<style>` inline résiduel
- **Vérifier** : rendu visuel identique

### Étape 6 : Cleanup
- Supprimer les `console.log` debug (L1037-1042)
- Supprimer les styles inline dans le HTML (`style="..."`)
- Nettoyer les classes CSS mortes
- Documenter l'archi dans `resources/views/components/README.md`

---

## Risques & décisions

### Risque 1 : Drag & drop Gantt + Alpine
Le drag&drop natif HTML5 manipule le DOM directement (appendChild, style.top,
style.left). Alpine préfère un modèle déclaratif. **Décision** : garder le
drag&drop natif mais piloter l'état via Alpine (`@dragstart`, `@drop` sur les
éléments). Le re-layout des lanes reste en JS impératif car il calcule des
positions absolues.

### Risque 2 : Unpoly swap casse l'état Alpine
Si Unpoly remplace une région qui contient un `x-data` Alpine, l'état est
perdu. **Décision** : le `x-data="board"` est sur `#board-main` qui EST la
cible des swaps Unpoly. Après un swap, `up.compiler` appelle
`Alpine.initTree()` qui réinitialise. L'état volatil (OF sélectionné, cache
faisabilité) est explicitement reset dans `init()`.

### Risque 3 : Tailwind v4 sans config JS
Tailwind v4 supprime `tailwind.config.js`. Tout se configure en CSS. Si des
plugins tiers nécessitent une config JS, il faudra `@config`. **Vérifier** au
moment de l'installation quelle version exacte est pull.

### Décision : JS bundler
esbuild vs Vite vs CDN. **Recommandation** : esbuild (simple, un fichier
`resources/js/app.ts` → `public/js/app.js`). Ajouter :
```bash
npm install -D esbuild
```
Script : `"js:build": "esbuild resources/js/app.ts --bundle --minify --format=esm --outfile=public/js/app.js"`
Dev : `"js:dev": "esbuild resources/js/app.ts --bundle --format=esm --outfile=public/js/app.js --watch"`

---

## Livrables

- [ ] `public/css/app.css` — Tailwind v4 compilé
- [ ] `public/js/app.js` — Alpine bundle
- [ ] `resources/css/app.css` — Tailwind entry + @theme + @layer
- [ ] `resources/js/app.ts` + `resources/js/alpine/board.ts` — Alpine state
- [ ] `resources/views/layouts/board_layout.edge` — Layout shell
- [ ] `resources/views/pages/board.edge` — Page assemblée (≈30 lignes)
- [ ] `resources/views/components/board/*.edge` — 8 composants
- [ ] `resources/views/components/ui/*.edge` — 3 composants UI
- [ ] `board.edge` original supprimé ou archivé
- [ ] npm scripts: `css:dev`, `css:build`, `js:dev`, `js:build`
- [ ] `adonisrc.ts` metaFiles mis à jour
