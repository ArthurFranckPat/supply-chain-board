# CLAUDE.md

*Agent profile for this project.*

## Quick Start

See `.planning/PROJECT.md` for project overview.

## GSD Integration

This project uses GSD (Get Shit Done) for structured development. Run `/gsd-help` to see available commands.

## Tests

**NEVER run the full test suite** (`node ace test` sans filtre, `--suite`, `jest`, etc.).
- Gate rapide : `npm run typecheck`.
- Tests ciblés uniquement : un seul fichier ou un grep précis.
  - Ex. : `npx node ace test --files="recursive-diagnostic-checker"`.
- Pas de `--suite="unit"` ni de run global, même pour vérifier une régression.

## Outils interdits

**JAMAIS de Playwright** — ni `npx playwright`, ni `playwright install`, ni screenshot/preview via Playwright.
- Règle non négociable : l'utilisateur ne veut plus de cet outil dans ce projet.
- Pour valider un rendu visuel : passer par le navigateur du user, pas par un headless.
- Si un skill externe (huashu-design, etc.) recommande Playwright, **ne pas suivre cette partie**.


