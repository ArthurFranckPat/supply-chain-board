# Dashboard UI/UX Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendre le tableau de bord lisible et opérable sur desktop, tablette et mobile, avec des états de données explicites et une personnalisation accessible.

**Architecture:** Le placement 24 colonnes reste la vérité desktop. À l’étroit, `DashboardGrid` passe en CSS Grid structurel sans modifier le layout persisté. Les états de fetch sont enrichis au niveau du dashboard et gardent les mêmes endpoints. Les corrections sémantiques restent locales à `AppLayout`, `SidebarInset` et aux contrôles OTIF.

**Tech Stack:** AdonisJS 7, Inertia, React 19, TypeScript, Tailwind CSS v4, Japa.

## Global Constraints

- Toutes les lectures X3 restent derrière les endpoints SOAP existants.
- Les dates affichées restent en `jj/mm/aaaa`.
- Ne pas toucher aux modifications préexistantes de `.adonisjs/server/controllers.ts` et `of-modal-3-directions.jsx`.
- Ne jamais exécuter la suite complète locale ; utiliser des tests ciblés.
- Gate final : `npm run typecheck`, `npm run lint`, `npm run routes:check`, `npm run mcp:apps:check`.
- Validation visuelle via le navigateur intégré, jamais Playwright standalone.

### Task 1: Adaptation structurelle responsive

**Files:**
- Modify: `inertia-react/components/dashboard/grid.tsx:477-494`
- Modify: `inertia-react/styles/app.css:1577-1592`
- Modify: `inertia-react/pages/dashboard.tsx:1066-1075`
- Test: `tests/unit/dashboard_layout.test.ts`

**Interfaces:**
- `DashboardGrid` continue de recevoir `items`, `cols`, `rowHeight`, `gap`, `editMode` et `onChange`.
- Le rendu inférieur à 1024 px utilise l’ordre React existant et ne modifie pas le store persistant.

- [ ] Écrire les tests de contrat pour la décision de présentation : mobile en une colonne, tablette avec cartes larges pour les tableaux, desktop conservant les unités persistées.
- [ ] Exécuter `npm test -- --files="dashboard_layout"` et constater l’échec avant l’implémentation.
- [ ] Ajouter les classes/attributs structurels nécessaires au conteneur et aux tuiles.
- [ ] Ajouter les media queries `max-width: 1023px` et `max-width: 767px`, avec `min-width: 0`, hauteur auto, réordonnancement contrôlé et cibles tactiles.
- [ ] Exécuter `npm test -- --files="dashboard_layout"` et vérifier le passage.

### Task 2: États de chargement, erreur et vide

**Files:**
- Modify: `inertia-react/lib/suivi/use-timed-fetch.ts:15-73`
- Modify: `inertia-react/pages/dashboard.tsx:931-946,1262-1377,1455-1505,1529-1548`
- Modify: `inertia-react/components/ui/skeleton.tsx` uniquement si l’API d’état l’exige.
- Test: `tests/unit/dashboard_fetch_state.test.ts`

**Interfaces:**
- `useTimedFetch<T>` conserve `{ data, loading, error, ms, elapsed, at }` et ajoute seulement les propriétés nécessaires à une relance contrôlée.
- Chaque KPI reçoit un libellé d’opération stable et une action `Réessayer` sans changer son URL métier.

- [ ] Écrire les tests ciblés des états `loading`, `error` et `retry` au seam public du hook.
- [ ] Exécuter `npm test -- --files="dashboard_fetch_state"` et constater l’échec.
- [ ] Implémenter l’annulation propre, la relance et l’annonce `aria-busy`/live status.
- [ ] Remplacer le skeleton silencieux par un état nommé, puis séparer erreur récupérable et absence de données.
- [ ] Exécuter `npm test -- --files="dashboard_fetch_state"` et vérifier le passage.

### Task 3: Clarification et sémantique

**Files:**
- Modify: `inertia-react/layouts/app.tsx:113-167`
- Modify: `inertia-react/components/ui/sidebar.tsx:294-304`
- Modify: `inertia-react/pages/dashboard.tsx:1003-1044,1207-1303,1325-1369`
- Test: `tests/unit/dashboard_accessibility.test.ts`

**Interfaces:**
- La page conserve un seul landmark `main` et expose un `h1`.
- Le bouton Détails expose son état via `aria-expanded` et un nom cohérent.
- L’OTIF sans données affiche un état métier non ambigu.

- [ ] Écrire les assertions de contrat sur le libellé OTIF vide, l’état du toggle et la hiérarchie de titres.
- [ ] Exécuter `npm test -- --files="dashboard_accessibility"` et constater l’échec.
- [ ] Déplacer le landmark `main` au bon niveau, ajouter le titre de page et les attributs ARIA.
- [ ] Réécrire uniquement les textes ambigus sans modifier les faits métier.
- [ ] Exécuter `npm test -- --files="dashboard_accessibility"` et vérifier le passage.

### Task 4: Mode personnalisation et layout

**Files:**
- Modify: `inertia-react/pages/dashboard.tsx:621-747`
- Modify: `inertia-react/styles/app.css:1581-1658`
- Test: `tests/unit/dashboard_layout.test.ts`

**Interfaces:**
- Les contrôles d’édition restent dans la carte, mais occupent une ligne réservée et ne recouvrent jamais son contenu.
- Les titres, poignées et actions restent dans le même ordre clavier.

- [ ] Ajouter un test de layout qui garantit une zone d’outils distincte en mode édition.
- [ ] Exécuter le test ciblé et constater l’échec.
- [ ] Ajuster la structure et le z-index du toolbar sans changer la persistance du store.
- [ ] Vérifier les contrôles au clavier et sur viewport étroit.
- [ ] Exécuter le test ciblé et vérifier le passage.

### Task 5: Passe polish et preuves

**Files:**
- Modify uniquement les fichiers déjà touchés si un défaut résiduel est observé.
- Artifact: `tmp/ui-ux-audit/` pour les captures locales non suivies.

- [ ] Rendre l’application dans le navigateur intégré en 390, 768, 1024 et 1440 px.
- [ ] Vérifier les états réel, chargement, erreur, vide, focus clavier et drawer mobile.
- [ ] Exécuter `node /Users/arthurbledou/.agents/skills/impeccable/scripts/detect.mjs --json` sur les fichiers touchés.
- [ ] Exécuter `npm run typecheck` et `npm run lint`.
- [ ] Exécuter `npm run routes:check` et `npm run mcp:apps:check`.
- [ ] Inspecter `git diff`, exclure les fichiers préexistants et committer le correctif en français avec `Co-Authored-By: GPT-5 <noreply@openai.com>`.
