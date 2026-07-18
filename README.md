# Supply Chain Board

App AdonisJS (Inertia + SolidJS) qui regroupe le programme d'ordonnancement, le suivi des commandes, les ruptures, la charge, les expéditions/réceptions et un tableau de bord KPI. S'appuie sur SQLite en local et interroge Sage X3 via SOAP/SQL.

## Stack

- **Backend** : [AdonisJS](https://adonisjs.com/) v7 + TypeScript
- **Frontend** : [Inertia.js](https://inertiajs.com/) + [SolidJS](https://www.solidjs.com/) + Tailwind CSS + Kobalte (design system « Papier »)
- **ORM** : Lucid (SQLite locale)
- **Cache** : Redis (`@adonisjs/cache`), namespace par user
- **Base distante** : Sage X3 Oracle via web-services SOAP (ZSOAPSQL + objets CAdxWebServiceXmlCC)

## Structure

```text
app/
  controllers/         # Contrôleurs HTTP (Inertia pages + API JSON)
  domain/               # Logique métier pure (faisabilité, rupture-engine, matching OF↔commande, etc.)
  domain/models/        # Types métiers (Flow, Article, Gamme, Nomenclature, etc.)
  models/                # Modèles Lucid (SQLite)
  models/x3/             # Modèles Lucid branchés sur le dialecte X3 SOAP
  repositories/          # Accès données X3
  services/              # Services applicatifs (cache, sync statique, overrides)
  x3/                    # Client SOAP, dialecte Knex, parseur SQL, write-back objet
  validators/            # Schémas Vine
config/                  # Configuration AdonisJS (DB, X3, CORS, inertia, etc.)
database/
  migrations/            # Schémas SQLite (overrides, menus, tables statiques, scénarios)
  schema.ts              # Généré par AdonisJS
inertia/
  pages/                 # Pages SolidJS (dashboard, programme, suivi, ruptures, config, auth, ...)
  lib/                   # Store board, routes-manifest, helpers UI
start/
  routes.ts              # Déclaration des routes
  env.ts                  # Validation des variables d'environnement
```

## Prérequis

- Node.js 20+
- npm
- Accès réseau à l'instance Sage X3 (test et/ou prod)

## Configuration

Copier le fichier d'exemple et renseigner les variables :

```bash
cp .env.example .env
```

Variables obligatoires :

```text
NODE_ENV=development
HOST=0.0.0.0
PORT=3333
LOG_LEVEL=info
APP_KEY=your-app-key-here
APP_URL=http://localhost:3333
SESSION_DRIVER=memory

X3_ENV=test
X3_TEST_HOST=your-x3-host
X3_TEST_PORT=8124
X3_TEST_USERNAME=your-username
X3_TEST_PASSWORD=your-password
X3_TEST_POOL=your-pool
```

Pour la production, définir également les variables `X3_PROD_*`. Voir aussi les identifiants X3 par utilisateur (issue #13) — l'auth native pose le contexte X3 sur chaque requête via `x3Context` middleware.

## Démarrage

```bash
# Installation des dépendances
npm install

# Démarrage en mode dev avec HMR
npm run dev

# Build de production
npm run build
npm start
```

Le serveur écoute par défaut sur `http://localhost:3333`.

## Routes principales

Toutes les routes (hors `/login`, `/health`, assets) sont protégées par `auth` + `x3Context`.

### Pages (Inertia)

- `GET /` — Tableau de bord (KPI charge en retard, valorisation stock)
- `GET /programme` — Board OF, vue experte haute densité (fusion ordonnancement/planification)
- `GET /suivi` — Suivi des commandes
- `GET /ruptures` — Suivi des ruptures
- `GET /charge` — Charge par atelier/poste
- `GET /expeditions` — Expéditions
- `GET /receptions` — Réceptions fournisseurs
- `GET /conditionnements` — Coefs de conditionnement manquants
- `GET /configuration/calendrier` — Calendrier usine (fériés, fermetures par ligne)
- `GET /programme/scenarios/comparer` — Comparateur de scénarios de plan
- `GET /design-system` — Showcase des composants UI « Papier »

### API JSON — Planning (`/api/v1/planning`)

- `GET/PATCH/DELETE /order-lines...` — Lignes de commande (overrides de date)
- `PATCH /ofs/:of`, `POST /board-feasibility` — Board OF
- `GET /search/poste|of|pf`, `GET /articles-by-component/:component`
- `GET /of-materials/:of/diagnostic` — Diagnostic récursif rupture
- `POST /suggestions/:sugNum/firm`, `POST /orders/:orderNum/firm` — Affermissement write-back X3
- `GET/POST/PATCH/DELETE /scenarios...`, `POST /scenarios/diff` — Mode scénario
- `GET /ofs/:of/detail`, `GET /postes/:poste/engagement`, `GET /shortages/rows`

### API JSON — autres domaines

- `POST /api/v1/status/{assign,from-latest-export,palette,retard-charge}`, `GET /rows`, `GET /proactive-rows`
- `GET /api/v1/dashboard/{kpis,otd,stock}`
- `GET /api/v1/expeditions/rows`, `GET /api/v1/receptions/rows`
- `GET /api/v1/conditionnements/{rows,estimations}`
- `GET /api/v1/static/status`, `POST /api/v1/static/sync` — Sync X3 → SQLite
- `POST /api/v1/config/holidays/toggle`, `POST/PATCH/DELETE /api/v1/config/closures...`
- `POST /api/v1/data/load` — SQL raw via SOAP (debug)
- `GET/POST /api/v1/x3/writeback/{describe,read,save,modify,delete,list,run}` — Objet X3 (issue #29)
- `GET /api/v1/_perf` — Baseline perf P50/P95 par route

## Architecture données

### Moteur de rupture unique (`app/domain/rupture-engine.ts`)

Seul moteur de faisabilité/contention (photo + stock strict), consommé par badge board, diagnostic et panneau composants via `createDiagnosticLoader`. Contrat verrouillé par `feasibility-contract.test.ts`.

### Cache Redis (namespace par user)

Caches SWR `board:*` sur les couches lourdes (référentiel, OF ouverts, live besoins/réceptions, MFGMAT, peg, stock) pour limiter les appels SOAP. Le stock reste toujours scopé aux articles demandés.

### Sync statique

Les tables `static_articles`, `static_gammes`, `static_nomenclatures` et `static_workstations` sont alimentées depuis X3 par `POST /api/v1/static/sync`. Elles servent à la faisabilité et au planning sans solliciter X3 à chaque requête.

### Overrides & scénarios

Les modifications locales sur les OF/lignes de commande (dates, statut, poste, note) sont stockées en SQLite et fusionnées avec les données X3. Le mode scénario (issue #57) empile des mutations sans PATCH réel tant qu'il n'est pas appliqué.

### Connexion X3

Le dialecte personnalisé dans `app/x3/client/` transforme les requêtes Lucid en appels SOAP vers le web-service `ZSOAPSQL` de Syracuse (lecture). Le write-back (création/modification d'objets X3) passe par `app/x3/object-client.ts` (SOAP objet `save`/`modify`/`read`) et `app/x3/run-client.ts` (subprograms L4G).

## Tests

**Ne jamais lancer la suite complète.** Tests ciblés uniquement :

```bash
npx node ace test --files="nom-du-fichier"

# Vérification des types (gate rapide)
npm run typecheck

# Lint / format
npm run lint
npm run format
```

Les tests couvrent les domaines métier (`tests/domain/`), les repositories et les routes fonctionnelles (`tests/functional/`).

## Commandes utiles

```bash
# Lancer les migrations SQLite
node ace migration:run

# Vider et recréer la base de dev
node ace migration:fresh

# Régénérer le manifest de routes typées (Inertia)
npm run routes:gen
```

## Notes

- Ce repo est **uniquement** l'app AdonisJS. Le monorepo Python/FastAPI décrit dans les anciennes versions du README n'est plus présent ici.
- Le frontend Edge.js/Unpoly a été remplacé par Inertia + SolidJS (design system « Papier »). Une migration vers React + Carbon est en cours sur une branche séparée (issue #77), pas encore mergée.
- Les variables X3 peuvent être chiffrées avec `@dotenvx/dotenvx` ; le démarrage utilise `dotenvx run --`.

## MCP server (usage hors app)

Le serveur MCP `supply-board` (`bin/mcp_supply.ts`, issue #80) expose les **17
primitives** agent de l'app (getVerdict, descendreBOM, getPromise, listerOF,
listerRuptures, listerCommandesStatut, getStock, getCharge, …) en serveur MCP
**stdio autonome**, consommable depuis Claude Code, Claude Desktop ou tout agent
compatible MCP. C'est une **façade** sur le même code que le copilote `/copilote`
— aucun chiffre ne vient d'une réimplémentation (parité structurelle app vs MCP).

### Prérequis

- Le repo cloné + `npm install`
- Un fichier `.env` avec les creds X3 (comme pour l'app, cf. `.env.example`) —
  chiffré dotenvx ou non, les deux fonctionnent (déchiffrement in-process au
  boot, pas besoin de `dotenvx run --` dans la commande `claude mcp add`)
- Node.js — pas de Redis requis (`CACHE_STORE=memory`)
- Accès réseau à Sage X3

Au premier boot, le binaire **auto-migre** la SQLite locale (`tmp/db.sqlite3`,
idempotent — scénarios, tables statiques). Pour peupler les référentiels
locaux (rechercherArticle, labels de statuts, classification des verdicts),
une sync X3 initiale est nécessaire — sinon ces tools tournent en mode dégradé
(un warning stderr le signale au boot) :

```bash
node ace sync:x3 && node ace sync:local-menus
```

### Enregistrement Claude Code

```bash
claude mcp add supply-board -- node --import @poppinss/ts-exec bin/mcp_supply.ts
```

Le binaire boot Adonis en mode console (conteneur monté : cache + Lucid + X3),
construit les 17 tools via `buildAgentTools()` puis les sert en JSON-RPC sur
stdio. Premier appel = cold start (chargement pool X3), ensuite chaud.

### Test manuel

```bash
npm run mcp:start   # démarre le serveur stdio (logs sur stderr)
```

### Doctrine d'usage

Charger le skill `.claude/skills/supply-board/SKILL.md` (Lot 2 de l'issue) — il
documente la sémantique des moteurs (verdict prime, getPromise isolé, raison
`stock` ≠ absence de PO), le référentiel familles (PP 830 → `ESH`, `BDH60`,
`BDH10`) et les workflows d'orchestration. Sans cette doctrine, un client externe
refait les erreurs déjà corrigées dans le copilote intégré.

