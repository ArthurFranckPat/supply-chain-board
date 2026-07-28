# CLAUDE.md

_Agent profile for this project._

## Quick Start

See `.planning/PROJECT.md` for project overview.

## Création de worktree

**JAMAIS de worktree à l'intérieur du repo** (donc jamais sous `.claude/worktrees/`).
Les worktrees vivent dans le dossier frère :

```bash
git worktree add ../supply-chain-board-worktrees/<branche> <branche>
```

Pourquoi : le watcher du dev server (`node ace serve --hmr`) parcourt tout l'arbre
depuis la racine et n'honore aucune exclusion — l'`ignored` de l'assembler répond
« ne pas ignorer » quand chokidar l'appelle sans `stats`, y compris pour
`node_modules`. Deux worktrees dans le repo = 16 576 dossiers en plus, le watcher
sature `kern.maxfilesperproc` et meurt en `EMFILE: too many open files, watch`.
Hors du repo : 577 watchers au lieu de 30 579.

Après `git worktree add`, **toujours** :

1. Copier depuis le worktree source : `.env` et `tmp/db.sqlite3` (gitignorés, indispensables).
2. Lancer `npm ci` dans le nouveau worktree.

## Workflow obligatoire : code → commit → push

**OBLIGATOIRE** : après chaque tâche terminée (feature, fix, refacto), tu DOIS :

1. **Commiter** avec un message clair (français, préfixe `feat(scope):` / `fix(scope):`).
2. **Pousser** immédiatement (`git push`).

Ne JAMAIS accumuler du travail non commité. Le working tree doit rester propre
entre les tâches. Si l'utilisateur demande une nouvelle feature, le travail
précédent doit déjà être commité et poussé.

Exceptions : si l'utilisateur dit explicitement « ne commit pas » ou « attends
avant de pousser ».

## Tests

**NEVER run the full test suite** en local (`node ace test` sans filtre, `jest`, etc.).

- Gate rapide : `npm run typecheck` **ET** `npm run lint`.
  - Les deux, systématiquement, avant tout commit. Le typecheck ne voit ni le
    formatage prettier ni les règles ESLint (`no-shadow`, etc.) : la CI a un job
    `Lint` séparé qui bloque sur ces erreurs-là.
  - Lint ciblé quand le diff est petit : `npx eslint <fichiers touchés>`.
  - Corriger le formatage : `npx prettier --write <fichiers touchés>` — jamais
    `npm run format` (réécrit tout le repo, y compris le travail des autres).
  - Ne corriger QUE ses propres fichiers. Une erreur de lint préexistante dans un
    fichier qu'on ne touche pas appartient à un autre chantier.
- Tests ciblés uniquement : un seul fichier ou un grep précis.
  - Ex. : `npx node ace test --files="recursive_diagnostic_checker"` (noms de
    fichiers en **snake_case**, convention AdonisJS).
- Pas de run global en local, même pour vérifier une régression.
- La suite `unit` complète tourne **en CI**, c'est son rôle. Au premier run elle
  a d'ailleurs levé 2 tests périmés depuis des semaines.
- Piège : `--suite=unit` **n'existe pas**. Les suites sont des arguments
  positionnels (`node ace test unit`) ; écrit en flag il est ignoré en silence
  et toutes les suites tournent, `functional` comprise.

## Build

`npm run typecheck` + `npm run lint` restent le gate par défaut : le dev server
tourne déjà, et un build ne dit rien de plus dans la grande majorité des cas.

Un build local est **autorisé quand il apporte ce que le typecheck ne voit pas**
(assets Vite, `metaFiles`, résolution ESM au packaging) — à condition de
**nettoyer derrière** :

```bash
npm run build && rm -rf build public/assets
```

- `node ace build` écrit dans `build/`, Vite dans `public/assets/` : les deux
  sont gitignorés, mais les laisser traîner pollue le working tree et fausse le
  dev server suivant.
- Ne jamais lancer un build par réflexe « pour vérifier que ça compile ».

## Outils interdits

**JAMAIS de Playwright** — ni `npx playwright`, ni `playwright install`, ni screenshot/preview via Playwright.

- Règle non négociable : l'utilisateur ne veut plus de cet outil dans ce projet.
- Pour valider un rendu visuel : passer par le navigateur du user, pas par un headless.
- Si un skill externe (huashu-design, etc.) recommande Playwright, **ne pas suivre cette partie**.
