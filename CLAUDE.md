# CLAUDE.md

_Agent profile for this project._

## Quick Start

See `.planning/PROJECT.md` for project overview.

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
  - Ex. : `npx node ace test --files="recursive-diagnostic-checker"`.
- Pas de `--suite="unit"` ni de run global, même pour vérifier une régression.

## Outils interdits (suite)

**JAMAIS `npm run build`** (ni `vite build`) pour valider du code — dev server déjà lancé, `npm run typecheck` suffit.

- Règle non négociable, répétée = signal d'agacement utilisateur.

## Outils interdits

**JAMAIS de Playwright** — ni `npx playwright`, ni `playwright install`, ni screenshot/preview via Playwright.

- Règle non négociable : l'utilisateur ne veut plus de cet outil dans ce projet.
- Pour valider un rendu visuel : passer par le navigateur du user, pas par un headless.
- Si un skill externe (huashu-design, etc.) recommande Playwright, **ne pas suivre cette partie**.
