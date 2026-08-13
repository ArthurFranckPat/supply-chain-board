# Critique UI/UX profonde — Page Programme

**Date** : 2026-07-10
**Fichier** : `inertia/pages/scheduler/programme.tsx` (985 lignes)
**Composants analysés** : programme.tsx, programme-toolbar.tsx, masthead.tsx, app.css (852 lignes)
**Skills** : shadcn/ui + ui-ux-pro-max

---

## 1. LAYOUT & STRUCTURE

### ROUGE — Monolithe de 985 lignes

`Programme` gère en un seul fichier :

- 2 board stores (OF + commandes)
- 1 scenario store (mutations, diff, apply, discard)
- Drag & drop OF (optimiste + intercepteur scénario)
- Drag & drop commande (optimiste + persistance)
- Calcul d'impacts en live (verdicts, delta jours, traduction dateFin)
- Calendar picker (range, application fenêtre)
- Faisabilité (mode allocation + déclencheur)
- Virtual orders (injection, déplacement, suppression)
- Overlay SVG mesuré au DOM (ResizeObserver + querySelector)
- Tooltips de drag (verdict prévisionnel)
- 5 sheet/drawer (OfDetail, PosteEngagement, ScenarioDiff, etc.)

**Impact** : ingérable pour la maintenance, impossible à tester isolément, impossible pour un nouveau dev d'avoir une vue d'ensemble.

**Recommandation** : découper en au moins 4 sous-composants :

- `<ProgrammeBoard>` — board stores + drag & drop + grid rendering
- `<ProgrammeScenario>` — scenario store + mutations + diff + apply/discard
- `<ProgrammeImpacts>` — calcul d'impacts + overlay SVG + tooltips
- `<ProgrammeCalendar>` — range picker + fenêtre navigation

### ROUGE — Toolbar surchargée (flex-wrap → CLS)

La `ProgrammeToolbar` contient jusqu'à 11 contrôles sur une seule rangée :

1. Sélecteur de mode (3 boutons)
2. Filtre statut OF (3 chips) — mode ≠ planification
3. Filtre atelier (variable) — mode planification
4. Filtre besoin (2 chips) — mode planification
5. Compteur retards — mode combined
6. Toggle scénario — mode combined
7. Calendrier (range picker)
8. Mode stock allocation (2 boutons)
9. Actualiser
10. Faisabilité
11. Sélection (batch firm)

En mode `combined` avec scénario actif, on dépasse la largeur du viewport.
`flex-wrap` fait sauter des contrôles à la ligne suivante → décalage vertical du board.

**Impact** : Content Layout Shift (guideline UX #19, severity High).

**Recommandation** :

- Grouper les contrôles en 2 zones fixes : "Navigation/Filtres" (gauche) et "Actions" (droite)
- Utiliser un overflow horizontal ou un menu "Plus de filtres" plutôt que flex-wrap
- Fixer une hauteur de toolbar constante avec `min-h`

### ORANGE — BatchFirmBar mal positionné

```tsx
<Show when={mode() !== 'planification'}>
  <Show when={lineCount > 0} fallback={<div>Aucun OF…</div>}>
    <BoardGrid />
  </Show>
  <BatchFirmBar /> // ← visible même si lineCount === 0
</Show>
```

La barre d'affermissement s'affiche sous le message "Aucun OF dans l'horizon".

**Fix** : déplacer `<BatchFirmBar>` à l'intérieur du `<Show when={lineCount > 0}>`.

### ORANGE — Select de recherche change de largeur selon le mode

- Mode OF : `w-[92px]`
- Mode Cmdes : `w-[110px]`

Provoque un décalage horizontal au switch de mode.

### JAUNE — Z-index calendar (z-50) vs sheets (z-50)

Conflit potentiel si le calendrier est ouvert pendant un clic carte.

### JAUNE — 104px de chrome avant le board

Masthead (60px) + nav (44px) + toolbar (~40px) = ~144px.
Sur écran 13" (~800px utile), reste ~656px pour le board.

---

## 2. COHÉRENCE DESIGN SYSTEM

### ROUGE — Typographie sans échelle

Tailles utilisées (toutes en valeurs arbitraires `text-[Npx]`) :

- `text-[9px]` — labels de section toolbar
- `text-[10px]` — chips, toggles, mode selector
- `text-[11px]` — boutons, calendrier, compteur
- `text-[12px]` — meta, recherche
- `text-[14px]` — empty states, icônes
- `text-[15px]` — icônes boutons
- `text-[17px]` — icône recherche
- `text-[28px]` — titre Masthead

8 tailles, aucun ratio logique. Un design system pro utilise 4-5 niveaux max avec une échelle modulaire (1.125 ou 1.25).

**Recommandation** : remplacer par l'échelle Tailwind (`text-xs` = 12px, `text-sm` = 14px, `text-base` = 16px, `text-lg` = 18px, `text-2xl` = 24px). Ajouter si besoin une taille `text-2xs` custom (10px) pour les micro-labels.

### ROUGE — Trois thèmes CSS coexistent

| Thème           | Scope            | Primaire               | Background          |
| --------------- | ---------------- | ---------------------- | ------------------- |
| `.theme-papier` | Global default   | `#a8431f` (terracotta) | `#f3ece0` (crème)   |
| `.theme-navy`   | Programme page   | `#081061` (navy)       | `#f0f0ed` (gris)    |
| `.theme-m3`     | Scheduler legacy | `#000122` (noir)       | `#fbf8ff` (lavande) |

Le token `--color-terra` (nommé "terra" pour terracotta) vaut `#081061` (navy) sous `.theme-navy`. Toutes les classes `text-terra`, `bg-terra-soft`, `border-terra` portent un nom trompeur.

Le projet est en transition (Papier → Navy) sans nettoyage terminé.

**Recommandation** : terminer la migration vers Navy (ou Papier) et supprimer l'autre. Renommer `terra` en `brand` ou `accent` si le token doit changer de couleur selon le thème.

### ORANGE — Mix composants shadcn-solid + CSS custom

Le CSS définit des classes custom : `.btn`, `.btn-default`, `.btn-secondary`, `.input`, `.badge`, `.card-ui`, `.menu`, `.tooltip`, `.dialog`, `.slideover`, `.cmdk` (lignes 237-372).

En parallèle, le projet importe des composants shadcn-solid : `<Button>`, `<Select>`, `<TextField>`, `<Calendar>`, `<Sheet>`.

La toolbar utilise parfois `<Button>` (shadcn) et parfois `<button class="inline-flex rounded-full border…">` (HTML + classes custom). Incohérent.

**Recommandation** : standardiser sur shadcn-solid. Migrer les `<button>` raw vers `<Button variant="…">`. Supprimer les classes CSS custom `.btn-*`.

### ORANGE — Icônes Material Symbols au lieu d'une lib component

```tsx
<span class="material-symbols-outlined text-[14px]">search</span>
```

Problèmes :

- Toute la police Material Symbols est chargée (pas de tree-shaking)
- Pas de type safety sur les noms de glyphs (typo = icône manquante silencieuse)
- shadcn recommande de passer les icônes en objets component (`icon={SearchIcon}`)

**Recommandation** : migrer vers `lucide-react` (déjà dans les dépendances shadcn) ou `@tabler/icons-react`.

### ORANGE — Tokens dupliqués legacy + sémantiques

Le CSS maintient deux couches qui pointent vers les mêmes valeurs :

| Legacy          | Sémantique (shadcn)  | Valeur    |
| --------------- | -------------------- | --------- |
| `--color-bg`    | `--color-background` | `#f7f8fa` |
| `--color-panel` | `--color-card`       | `#ffffff` |
| `--color-line`  | `--color-border`     | `#e3e8ef` |
| `--color-txt`   | `--color-foreground` | `#0f172a` |
| `--color-muted` | `--color-muted-bg`   | `#f1f5f9` |

Double surface de maintenance.

### JAUNE — `font-mono` redéfini comme Inter

Sous `.theme-navy` : `--font-mono: "Inter", system-ui, sans-serif`.
C'est du sans-serif, pas du monospace. Le nom du token est trompeur.

---

## 3. UX & UTILISABILITÉ

### ROUGE — Touch targets sous le minimum

| Élément                          | Hauteur estimée        | Minimum WCAG/Apple |
| -------------------------------- | ---------------------- | ------------------ |
| Chips de filtre (statut, besoin) | ~24px                  | 44px               |
| Mode selector buttons            | ~26px                  | 44px               |
| Bouton "✕" clear atelier         | ~20px                  | 44px               |
| Labels de section "STATUT" etc.  | ~16px (non-cliquables) | N/A                |

Même en desktop avec souris, ces cibles sont petites. Sur trackpad, le taux d'erreur augmente.

### ROUGE — Labels de mode abbreviés

| Label actuel | Signification               | Clair ?                        |
| ------------ | --------------------------- | ------------------------------ |
| OF           | Ordres de Fabrication       | Non pour un nouvel utilisateur |
| Combiné      | Vue combinée OF + commandes | Moyennement                    |
| Cmdes        | Commandes                   | Non — abréviation non standard |

Pas de tooltip (`title=`) sur ces boutons, contrairement aux chips de statut.

### ROUGE — Pas de skeleton / loading state initial

Au montage de la page, si Inertia n'a pas pré-rendu les données (navigation directe, reload complet), le board affiche "Aucun OF dans l'horizon" au lieu d'un skeleton de chargement.

Le cache `board_dataset` a un TTL de 5 min pour les OF → le premier chargement peut prendre 5-10 secondes.

**Recommandation** : utiliser `<Skeleton>` (shadcn) pendant que `props.board === null` ou pendant que `refreshing()` est true au montage.

### ORANGE — Pas de raccourcis clavier

Aucun handler `keydown`, aucun `accesskey`.

Raccourcis recommandés pour un outil quotidien :

- `R` — Actualiser
- `F` — Faisabilité
- `1` / `2` / `3` — Switch mode (OF / Combiné / Cmdes)
- `S` — Toggle scénario
- `Esc` — Fermer calendar / sheets

### ORANGE — Toasts via CustomEvent

```tsx
window.dispatchEvent(new CustomEvent('sch-toast', { detail: '…' }))
```

Pattern fragile : pas de queue, pas de dedup, pas de types, coupling implicite avec un handler global non visible dans le composant.

shadcn recommande `sonner` : `toast.success('…')`, `toast.error('…')`.

### ORANGE — État vide sans guidage

```tsx
<div class="…italic text-muted-foreground">Aucun OF dans l'horizon.</div>
```

Pas de suggestion, pas de bouton d'action, pas de contexte.

shadcn a un composant `<Empty>` avec illustration + titre + description + CTA.

### JAUNE — Scénario bloqué en mode Combiné sans explication

Le bouton "Scénario" disparaît quand on quitte le mode Combiné. L'utilisateur ne sait pas pourquoi.

**Fix** : garder le bouton en `disabled` avec un tooltip "Disponible en mode Combiné uniquement".

### JAUNE — Compteur retards disparaît à 0

L'absence du compteur ne renseigne pas sur l'état. Un badge "✓ 0 retard" serait plus rassurant.

### JAUNE — "Jeter" le scénario sans confirmation

`discardScenario()` efface toutes les mutations sans `AlertDialog`. Sur 15 mutations non appliquées, perte totale en un clic.

---

## 4. ACCESSIBILITÉ

### ROUGE — Toggles sans `aria-pressed`

Boutons toggle concernés :

- Statut OF (Ferme / Planifié / Suggéré) — 3 boutons
- Atelier (variable)
- Besoin (Cmde / Prév) — 2 boutons
- Stock (Instantanée / Projetée) — 2 boutons
- Mode (OF / Combiné / Cmdes) — 3 boutons

Tous utilisent uniquement des classes CSS pour l'état actif. Aucun `aria-pressed`, aucun `role="switch"`.

Un lecteur d'écran annonce "bouton, Ferme" sans dire s'il est actif ou non.

### ORANGE — `aria-label` manquants

- Bouton "✕" clear atelier → pas de label
- Boutons de mode → texte abrégé, pas de `aria-label` descriptif
- Recherche → pas de label visible ni `aria-label`

### ORANGE — Calendrier sans gestion clavier

- Pas de handler `Escape` pour fermer
- Pas de focus trap dans le dropdown
- Le focus reste sur le bouton déclencheur

### ORANGE — Ordre de tabulation

La recherche est dans `Masthead.actions`, le reste des contrôles dans `ProgrammeToolbar`. Le tab order saute entre les deux zones.

### JAUNE — Hiérarchie de headings absente

Pas de `<h1>`, `<h2>`, etc. Le titre "Supply Chain AERECO" est dans un `<div>`.

### JAUNE — Contraste des micro-labels

`text-[9px] text-muted-foreground` (`#6c757d` sur `#ffffff`) → ratio ~4.8:1.
Passe AA pour texte normal (>4.5:1) mais limite pour la lisibilité à cette taille.

---

## 5. PERFORMANCE PERÇUE

### ORANGE — `measure()` parcourt tous les liens

```tsx
const measure = () => {
  for (const link of props.links) {
    const ofEl = content.querySelector(`[data-num-of="${link.ofId}"]`)
    const cmdEl = content.querySelector(`[data-link-cmd="…"]`)
    // …
  }
}
```

Sur 200 liens : 400 `querySelector` synchrones.
Déclenchée par : ResizeObserver, createEffect sur `[board, cmdMoved, ofShift]`, requestAnimationFrame après drag/drop.

**Recommandation** : utiliser `getElementById` (plus rapide que querySelector), ou pré-indexer les éléments dans un Map au rendu.

### ORANGE — Pas de debounce sur la recherche

`onInput` → `store.onQueryInput()` à chaque keystroke → filtrage complet du board.

**Recommandation** : debounce 150-200ms.

### JAUNE — `requestAnimationFrame(measure)` répété 7 fois

Centraliser dans un seul `createEffect`.

### JAUNE — Spinner sur Material Symbol

`animate-spin` fait tourner le glyph entier. Visuellement correct mais sémantiquement étrange.

---

## 6. COHÉRENCE shadcn/ui

### ORANGE — `<Button>` utilisé incohéremment

- shadcn `<Button size="sm">` : Faisabilité, Sélection
- HTML `<button type="button" class="inline-flex…">` : mode, statut, calendrier, actualiser, scénario

shadcn Critical Rule : "Use existing components before custom markup."

### ORANGE — Pas de `ToggleGroup`

Les groupes de toggles (statut, besoin, stock) devraient utiliser `<ToggleGroup type="single|multiple">`.

shadcn : "Option sets (2–7 choices) use ToggleGroup. Don't loop Button with manual active state."

### JAUNE — Pas de `Card` pour les panneaux

Tout est en `div` custom. shadcn recommande `Card`/`CardHeader`/`CardContent`.

### JAUNE — Pas de `Separator`

Séparations gérées par `border border-rule`. shadcn recommande `<Separator orientation="vertical" />`.

### JAUNE — Empty state sans composant `Empty`

shadcn a un composant dédié pour les états vides.

---

## RÉSUMÉ — PRIORITÉS

### ROUGE (cassant — corriger en premier)

1. Découper le monolithe de 985 lignes
2. Fixer le CLS du toolbar (hauteur fixe + regroupement contrôles)
3. Établir une échelle typographique (supprimer les `text-[Npx]`)
4. Nettoyer les 3 thèmes CSS → un seul
5. `aria-pressed` sur tous les toggles
6. Skeleton/loading state au montage
7. Touch targets ≥ 44px sur les chips

### ORANGE (à corriger)

8. Migrer les `<button>` raw vers `<Button variant="…">`
9. Utiliser `<ToggleGroup>` pour les sélecteurs binaires
10. Debounce sur la recherche
11. `sonner` pour les toasts
12. Composant `<Empty>` pour les états vides
13. AlertDialog pour "Jeter" le scénario
14. Migrer les icônes vers lucide-react
15. Optimiser `measure()` (Map index au lieu de querySelector)
16. Supprimer les tokens CSS legacy dupliqués
17. Raccourcis clavier de base
18. `aria-label` sur les boutons sans texte descriptif

### JAUNE (nitpick)

19. Fixer le z-index calendar vs sheets
20. Composant `<Separator>` shadcn
21. Composant `<Card>` pour les panneaux
22. Focus trap dans le calendrier
23. Hiérarchie de headings (`h1`, `h2`)
24. Renommer `terra` → `brand` ou `accent`
25. Compteur "0 retard" visible
26. Scénario disabled (pas caché) hors mode Combiné
