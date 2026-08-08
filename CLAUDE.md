# CLAUDE.md

_Profil agent du projet — commun à tous les agents (`AGENTS.md` est un lien vers ce fichier).
Français strict ; commandes, noms de fichiers et mots-clés verbatim._

## Stack et pièges structurants

- AdonisJS 7 + Inertia + React 19, TypeScript.
- **Toutes les queries X3 passent par SOAP**, Lucid ORM inclus — jamais de SQL direct.
  Chaque appel coûte `ZSOAPSQL` en O(n²) : le nombre de lignes rendues ne dit rien du coût
  (3 lignes ont déjà pris 19,7 s).
- `REPLICA_READS` choisit une **architecture**, pas une option : `true` = lectures sur la
  réplique SQLite, et alors **aucun préchauffage de cache** ; `false` = direct X3.
  Les deux modes sont exclusifs.
- Dates affichées en **jj/mm/aaaa**. L'ISO reste côté machine.

## Worktrees

Jamais à l'intérieur du repo : le watcher (`node ace serve --hmr`) descend dans tout l'arbre
sans honorer aucune exclusion, sature `kern.maxfilesperproc` et meurt en `EMFILE`.
Toujours dans le dossier frère :

```bash
git worktree add ../supply-chain-board-worktrees/<branche> <branche>
```

Puis copier depuis le worktree source `.env` et `tmp/db.sqlite3` (gitignorés, indispensables),
et lancer `npm ci`. Sous Claude Code, le skill `worktree-setup` enchaîne ces étapes.

## Workflow : code → commit → push → CI verte

Après chaque tâche terminée (feature, fix, refacto), dans cet ordre :

1. **Gate** : `npm run typecheck` **et** `npm run lint`. Les deux, systématiquement.
2. **Commit** en français, préfixe `feat(scope):` / `fix(scope):`, terminé par un trailer
   `Co-Authored-By:` **nommant le modèle qui a réellement fait le travail** — p. ex.
   `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
   Non négociable : sans lui, le travail de l'agent est attribué en totalité à l'utilisateur
   dans `git log`, `git blame` et sur GitHub. Et un trailer qui nomme le mauvais modèle est
   pire que pas de trailer : il attribue le travail à un tiers.
3. **Push**. Le hook `pre-push` rejoue typecheck + lint en ~3 s et refuse le push s'ils
   échouent. Il est versionné et actif via `core.hooksPath=scripts/hooks` — rien à installer,
   y compris dans un nouveau worktree. Échappatoire assumée : `git push --no-verify`.
4. **Surveiller la CI** : `gh run watch` jusqu'à conclusion. Un push n'est pas une tâche
   terminée — master n'a aucun garde-fou GitHub (`enforce_admins=false`), la CI tourne après
   coup, et le hook ne couvre pas les tests.
   - Job rouge : `gh run view <id> --log-failed`, corriger, repousser.
   - Annoncer l'état réel : « poussé, CI en cours », puis le résultat. Jamais « poussé »
     présenté comme un aboutissement.

Vérifier l'état de la CI **avant** de merger dans master : merger dans une branche déjà rouge
rend indémêlable ce qu'on vient de casser.

Ne jamais accumuler de travail non commité — working tree propre entre deux tâches.
Exceptions : l'utilisateur dit explicitement « ne commit pas » ou « attends avant de pousser ».

## Périmètre : ses propres fichiers uniquement

Erreur de lint préexistante, test rouge ou CI déjà cassée dans un fichier qu'on ne touche pas :
c'est un autre chantier. Le dire, ne pas le reprendre.

## Tests

- **Jamais la suite complète en local** : ni `npm test` (= `node ace test` sans filtre), ni
  `node ace test`, ni `jest`. La suite `unit` tourne en CI, c'est son rôle.
- Tests ciblés seulement, noms de fichiers en **snake_case** (convention AdonisJS) :

  ```bash
  npm test -- --files="recursive_diagnostic_checker"
  ```

- Piège : `--suite=unit` **n'existe pas**. Les suites sont des arguments positionnels
  (`node ace test unit`) ; écrit en flag il est ignoré en silence et toutes les suites
  tournent, `functional` comprise.

## Lint et formatage

- Diff petit : `npx eslint <fichiers touchés>`.
- Formatage : `npx prettier --write <fichiers touchés>` — jamais `npm run format`, qui
  réécrit tout le repo, travail des autres compris.
- Le typecheck ne voit ni prettier ni les règles ESLint (`no-shadow`…) : la CI a un job
  `Lint` séparé qui bloque dessus.

## Build

Le gate par défaut reste typecheck + lint. Un build local n'est justifié que pour ce que le
typecheck ne voit pas (assets Vite, `metaFiles`, résolution ESM au packaging), et il faut
nettoyer derrière :

```bash
npm run build && rm -rf build public/assets
```

Jamais de build par réflexe « pour vérifier que ça compile ».

## Interdit

**Playwright** — ni `npx playwright`, ni `playwright install`, ni screenshot ou preview
headless. Pour valider un rendu visuel : le navigateur de l'utilisateur. Si un skill externe
le recommande, ne pas suivre cette partie.
