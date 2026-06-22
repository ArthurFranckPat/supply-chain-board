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

