# CLAUDE.md

_Agent profile for this project._

## Quick Start

See `.planning/PROJECT.md` for project overview.

## Création de worktree

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

**NEVER run the full test suite** (`node ace test` sans filtre, `--suite`, `jest`, etc.).

- Gate rapide : `npm run typecheck`.
- Tests ciblés uniquement : un seul fichier ou un grep précis.
  - Ex. : `npx node ace test --files="recursive_diagnostic_checker"` (noms de
    fichiers en **snake_case**, convention AdonisJS).
- Pas de `--suite="unit"` ni de run global, même pour vérifier une régression.
- La CI, elle, lance la suite `unit` complète — c'est son rôle, pas celui de
  l'agent en local.

## Build

`npm run typecheck` reste le gate par défaut : le dev server tourne déjà, et un
build ne dit rien de plus dans 95 % des cas.

Un build local est **autorisé quand il apporte quelque chose que le typecheck ne
voit pas** (assets Vite, `metaFiles`, résolution ESM au packaging) — à condition
de **nettoyer derrière** :

```bash
npm run build && rm -rf build public/assets
```

- Les deux dossiers sont gitignorés ; les laisser traîner pollue le working tree
  et fausse le dev server suivant.
- Ne jamais laisser un build en place « au cas où ».

## Outils interdits

**JAMAIS de Playwright** — ni `npx playwright`, ni `playwright install`, ni screenshot/preview via Playwright.

- Règle non négociable : l'utilisateur ne veut plus de cet outil dans ce projet.
- Pour valider un rendu visuel : passer par le navigateur du user, pas par un headless.
- Si un skill externe (huashu-design, etc.) recommande Playwright, **ne pas suivre cette partie**.
