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

## Branches opératoires

Deux branches longues. `dev` est un **surensemble** de `master`, jamais l'inverse.

- `master` — production. Uniquement le **socle** :
  Tableau de bord (`/`), Programme (`/programme`), Séquenceur (`/sequenceur`),
  Ruptures composants (`/ruptures`), Suivi commandes (`/suivi`), Planification
  (`/charge`), Config (`/configuration/*`, `/impressions`).
- `dev` — le socle plus les surfaces pas encore en prod : logistique (expéditions,
  réceptions, approvisionnements, évolution des besoins, conditionnements),
  promesse, copilote, contrôle prod, cockpit, pages de lab.

| Travail                                              | Part de                                        | PR `--base` |
| ---------------------------------------------------- | ---------------------------------------------- | ----------- |
| Surface hors socle                                   | `origin/dev`                                   | `dev`       |
| Correctif ou évolution du socle déjà en prod         | `origin/master`                                | `master`    |
| Première entrée d'une surface de `dev` dans le socle | branche dédiée, diff = cette surface seulement | `master`    |

Après chaque merge dans `master` : merger `master` dans `dev` tout de suite.
`dev` reste le surensemble.

**Exception — commit d'allégeage** (socle seulement : l'arbre `master` a perdu
les surfaces hors socle). Un merge normal appliquerait ces suppressions et
effacerait copilote, logistique, etc. sur `dev`. Pour **ce commit seulement**,
dans le worktree `dev` :

```bash
git fetch origin
git merge -s ours origin/master -m "merge: enregistrer l'allégeage master sans appliquer les suppressions"
git push origin dev
```

`-s ours` enregistre `master` comme mergé et **garde l'arbre de `dev`**.
Les hotfixes socle suivants se mergent ensuite `master` → `dev` normalement.

Une PR vers `master` n'ajoute que du socle. La promotion n'est pas un merge
`dev` → `master` : ce merge réintroduirait toutes les surfaces hors socle.

Push direct vers `master` : refusé par le hook `pre-push`.

Le checkout principal (`supply-chain-board/`) reste sur `master` et propre. Le
travail hors socle se fait dans le worktree frère
`../supply-chain-board-worktrees/dev`. Le watcher (`node ace serve --hmr`) se
lance dans le worktree de la branche qu'on sert.

## Worktrees

Jamais à l'intérieur du repo : le watcher descend dans tout l'arbre sans honorer aucune
exclusion, sature `kern.maxfilesperproc` et meurt en `EMFILE`. Toujours dans le dossier
frère :

```bash
# Hors socle : depuis origin/dev
git worktree add ../supply-chain-board-worktrees/<branche> -b feat/<issue>-<slug> origin/dev

# Socle / hotfix prod : depuis origin/master
git worktree add ../supply-chain-board-worktrees/<branche> -b hotfix/<issue>-<slug> origin/master
```

Puis copier depuis le worktree source `.env` et `tmp/db.sqlite3` (gitignorés, indispensables),
et lancer `npm ci`. Le skill `worktree-setup` enchaîne ces étapes et pose `--base` selon
la table ci-dessus.

## Workflow : code → commit → push → CI verte

Après chaque tâche terminée (feature, fix, refacto), dans cet ordre :

1. **Gate** : `npm run typecheck` **et** `npm run lint`, systématiquement. Plus
   `npm run routes:gen` dès que `start/routes.ts` a bougé — le manifeste de routes est
   généré, et son décalage est invisible au typecheck comme au lint (voir « Fichiers
   générés » plus bas).
2. **Commit** en français, préfixe `feat(scope):` / `fix(scope):`, terminé par un trailer
   `Co-Authored-By:` **nommant le modèle qui a réellement fait le travail** — p. ex.
   `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
   Non négociable : sans lui, le travail de l'agent est attribué en totalité à l'utilisateur
   dans `git log`, `git blame` et sur GitHub. Et un trailer qui nomme le mauvais modèle est
   pire que pas de trailer : il attribue le travail à un tiers.
3. **Push** de la branche de travail, jamais de `master`. Le hook `pre-push` refuse un
   push direct vers `master`, rejoue typecheck, lint et fraîcheur du manifeste de routes
   en ~3,6 s, et refuse le push s'ils échouent. Il est versionné et actif via
   `core.hooksPath=scripts/hooks` — rien à installer, y compris dans un nouveau worktree.
   Échappatoire assumée : `git push --no-verify`.
4. **PR** : `--base` selon la table « Branches opératoires ». `gh pr create` sans
   `--base` vise `master` — à surcharger pour tout travail hors socle (`--base dev`).
5. **Surveiller la CI** : `gh run watch` jusqu'à conclusion. Un push n'est pas une tâche
   terminée — `enforce_admins=false` sur `master`, la CI tourne après coup, et le hook
   ne couvre pas les tests.
   - Job rouge : `gh run view <id> --log-failed`, corriger, repousser.
   - Annoncer l'état réel : « poussé, CI en cours », puis le résultat. Jamais « poussé »
     présenté comme un aboutissement.

Vérifier l'état de la CI **avant** de merger dans `dev` ou `master` : merger dans une
branche déjà rouge rend indémêlable ce qu'on vient de casser. Un merge dans `master`
n'ajoute que du socle ; enchaîner ensuite le merge `master` → `dev`.

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

## Fichiers générés

Deux fichiers sont dérivés d'une source et vérifiés en CI par « régénère puis
`git diff --exit-code` ». Les modifier à la main ne sert à rien : le prochain run écrase.

| Fichier généré                         | Source                       | Régénérer            |
| -------------------------------------- | ---------------------------- | -------------------- |
| `inertia-react/lib/routes-manifest.ts` | `start/routes.ts`            | `npm run routes:gen` |
| `resources/mcp-apps/`                  | `scripts/build-mcp-apps.mjs` | `npm run mcp:apps`   |

Le job CI `Quality` lance **quatre** contrôles : `lint`, `typecheck`, `routes:check`,
`mcp:apps:check`. Le hook `pre-push` en couvre trois — `mcp:apps:check` (4,4 s) est laissé
à la CI. Un oubli de `routes:gen` est la seule cause de CI rouge jamais observée sur master.

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
