# Sage X3 Design System — Recherche

> Recherche effectuée le 2026-04-25 sur le repo public GitHub `Sage/design-tokens`.
> Source : https://github.com/Sage/design-tokens

---

## Vue d'ensemble

Le **Sage Design System** est le système de design officiel utilisé par Sage X3 et les autres produits Sage. Il est basé sur des **design tokens** distribués via le package npm `@sage/design-tokens`.

L'architecture suit le pattern **Style Dictionary** d'Amazon :
- Tokens bruts (core) → Tokens sémantiques (mode light/dark) → Tokens de composants
- Distribution multi-plateforme : CSS, SCSS, JSON, iOS, Android, Figma

---

## 🎨 Système de couleurs

### Familles de couleurs (Core)

| Famille | Gamme | Usage |
|---------|-------|-------|
| **Brand** | `#00d639` → `#005e14` | Boutons primaires, logo, actions principales |
| **Azure** | `#58a2ff` → `#001932` | Liens, info, navigation secondaire |
| **Blush** | Rose | Accents marketing |
| **AI** | Pea / Aqua / Lilac | Gradients IA / Copilot |
| **Black/White/Transparent** | — | Mixers de base pour hover, borders, backgrounds |

### Architecture sémantique (mode light/dark)

Toutes les couleurs sont résolues via des tokens sémantiques. Exemples clés :

```
mode.color.generic.bg.nought      → fond principal
mode.color.generic.bg.delicate    → zebra stripes
mode.color.generic.bg.soft        → hover / selected
mode.color.generic.txt.extreme    → texte principal
mode.color.generic.txt.severe     → texte secondaire
mode.color.generic.fg.soft        → bordures, séparateurs
mode.color.generic.surface.trace  → header subtil
```

### Couleurs d'action

| Token | Usage |
|-------|-------|
| `action.main.default` | Boutons primaires |
| `action.main.hover` | Hover primaire |
| `action.danger.default` | Actions destructrices |
| `action.danger.hover` | Hover destructeur |
| `action.inactive.default` | États désactivés |
| `action.grayscale.default` | Actions neutres |

### Couleurs de statut

| Token | Usage |
|-------|-------|
| `status.warning.default` | Avertissements |
| `status.priority.default` | Urgent / prioritaire |
| `status.custom.green` | Succès |
| `status.custom.red` | Erreur |

---

## 🔤 Typographie

### Police
- **Sage UI** — Police propriétaire custom (Regular 400, Medium 500, Bold 700)
- Formats disponibles dans le repo : `.otf`, `.ttf`, `.woff`, `.woff2`
- Fichier CSS de chargement : `sageui.css`

### Échelle fluide (fluid typography)
- **Headings** : Medium 500 / Bold 700, line-height 400
- **Body** : Regular 400, line-height 500 (1.5x)
- Steps fluides : step-0 à step-6

---

## 📐 Espacement

### Espacement composants

| Token | Valeur |
|-------|--------|
| `space.comp.2XS` | 2px |
| `space.comp.XS` | 4px |
| `space.comp.S` | 8px |
| `space.comp.M` | 12px (padding input medium) |
| `space.comp.L` | 16px |
| `space.comp.XL` | 24px |

### Espacement layout

| Token | Valeur |
|-------|--------|
| `space.layout.S` | 16px |
| `space.layout.M` | 24px |
| `space.layout.L` | 32px |

---

## 🏗️ Tokens de composants

### Table (`table.json`)

| Token | Résolution sémantique | Usage |
|-------|----------------------|-------|
| `table.row.bg-default` | `generic.bg.nought` | Ligne normale |
| `table.row.bg-alt` | `generic.bg.delicate` | **Zebra stripes** |
| `table.row.bg-alt2` | `generic.bg.faint` | Sous-lignes / enfant |
| `table.row.bg-selected` | `generic.bg.soft` | Sélection |
| `table.row.border-default` | `generic.fg.soft` | Bordures |
| `table.header.subtle.bg-default` | `none` | Header transparent |
| `table.header.subtle.label-default` | `generic.txt.severe` | Label header |
| `table.header.harsh.bg-default` | `generic.surface.harsh` | Header opaque |
| `table.footer.bg-default` | `generic.bg.soft` | Footer |

### Button (`button.json`)
- Variantes : `typical` (primary/secondary), `destructive`, `ai`
- États par variante : default, hover, active, disabled

### Autres composants tokenisés
```
badge, container, dataviz, focus, input, link, logo,
message, nav, page, pill, popover, profile, progress, tab
```

---

## 📦 Distribution

### Installation npm
```bash
npm install @sage/design-tokens
```

### Import CSS
```css
@import url("@sage/design-tokens/css/light.css");
@import url("@sage/design-tokens/css/dark.css") (prefers-color-scheme: dark);
@import url("@sage/design-tokens/css/components/button.css");
```

### Formats supportés
- CSS custom properties
- SCSS variables
- JSON tokens (Style Dictionary)
- Fichiers CSS par composant

---

## 🎯 Alignement avec Ordo Cockpit

L'Ordo Cockpit n'est pas une app Sage X3 officielle, mais on peut s'aligner visuellement avec l'écosystème ERP :

| Ce qu'on a | Alignement Sage DS |
|------------|-------------------|
| `DataTable` zebra striping | ✅ Correspond à `table.row.bg-alt` |
| Header sticky avec blur | ✅ Match `table.header.subtle` |
| Badges colorés | ✅ Correspond à `badge.json` / `pill.json` |
| Font `Geist` | ❓ Sage utilise `Sage UI` (propriétaire) — garder Geist ou passer à Inter ? |
| Vert/orange/rouge | ✅ Brand=vert, danger=rouge, warning=orange — cohérent |

### Actions possibles
1. Mapper les tokens Tailwind (`--color-primary`, etc.) sur la sémantique Sage
2. Créer un `sage-theme.css` avec les variables CSS officielles
3. Adapter la typographie (headings, body sizes) sur les tokens Sage
4. Harmoniser les espacements sur la grille 8px/12px/16px

---

## Références

- **GitHub** : https://github.com/Sage/design-tokens
- **npm** : `@sage/design-tokens`
- **Docs** : https://developer.sage.com/x3/docs/latest/guides/sage-x3-builder/ui-framework-guide (protégé par Cloudflare)
