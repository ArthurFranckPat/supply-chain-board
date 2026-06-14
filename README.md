# Supply Chain Board

API AdonisJS qui regroupe le tableau d'ordonnancement (planning board Gantt), le suivi des commandes et la faisabilité de production. Elle s'appuie sur une base SQLite locale et interroge Sage X3 via SOAP/SQL.

## Stack

- **Framework** : [AdonisJS](https://adonisjs.com/) v7 + TypeScript
- **ORM** : Lucid (SQLite locale)
- **Frontend embarqué** : Edge.js + [Unpoly](https://unpoly.com/) (servi depuis `node_modules`)
- **Base distante** : Sage X3 Oracle via web-services SOAP

## Structure

```text
app/
  controllers/        # Contrôleurs HTTP
  domain/             # Logique métier pure (faisabilité, disponibilité, matching, etc.)
  domain/models/      # Types métiers (Flow, Article, Gamme, Nomenclature, etc.)
  models/             # Modèles Lucid (SQLite)
  models/x3/          # Modèles Lucid branchés sur le dialecte X3 SOAP
  repositories/       # Accès données X3
  services/           # Services applicatifs (cache, sync statique, overrides)
  x3/                 # Client SOAP, dialecte Knex, parseur SQL
  middleware/         # Middlewares Unpoly et JSON
config/               # Configuration AdonisJS (DB, X3, CORS, etc.)
database/
  migrations/         # Schémas SQLite (overrides, menus, tables statiques)
  schema.ts           # Généré par AdonisJS
start/
  routes.ts           # Déclaration des routes
  env.ts              # Validation des variables d'environnement
resources/views/      # Templates Edge (board.edge, partials, debug X3)
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

Pour la production, définir également les variables `X3_PROD_*`.

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

### Health

- `GET /health`

### Tableau d'ordonnancement

- `GET /board` — Vue HTML Gantt interactive
- `GET /api/v1/planning-board/ofs` — Liste des OF ouverts
- `GET /api/v1/planning-board/ofs/:numOf` — Détail d'un OF
- `PATCH /api/v1/planning-board/ofs/:numOf` — Modification locale (dates, statut, poste)
- `DELETE /api/v1/planning-board/ofs/:numOf/override` — Suppression d'un override
- `GET /api/v1/planning-board/overrides`
- `DELETE /api/v1/planning-board/overrides`
- `POST /api/v1/planning-board/feasibility`
- `POST /api/v1/planning-board/whatif`
- `POST /api/v1/planning-board/order-impacts`
- `POST /api/v1/planning-board/board-feasibility`
- `GET /api/v1/planning-board/of-materials/:numOf`
- `GET /api/v1/planning-board/nomenclature/:article`
- `POST /api/v1/planning-board/reload` — Vide les caches mémoire

### Suivi commandes

- `POST /api/v1/status/assign`
- `POST /api/v1/status/from-latest-export`
- `GET /api/v1/status/status/:noCommande`
- `POST /api/v1/status/palette`
- `POST /api/v1/status/retard-charge`

### Pipeline

- `POST /api/v1/pipeline/supply-board`
- `POST /api/v1/pipeline/suivi-status`

### Données statiques (SQLite)

- `GET /api/v1/static/status`
- `POST /api/v1/static/sync` — Sync X3 → SQLite (articles, gammes, nomenclatures)

### Debug X3

- `GET /debug/x3`
- `POST /api/v1/data/load` — Exécution SQL raw via SOAP (debug)

## Architecture données

### Cache mémoire (`app/services/board_dataset.ts`)

Trois niveaux de cache pour limiter les appels SOAP :

- **Référentiel** (gammes, nomenclatures) : 2 h
- **OF ouverts** : 5 min
- **Live** (besoins clients + réceptions) : 2 min, scopé par fenêtre de dates

Le stock est toujours frais, scopé aux articles demandés.

### Sync statique

Les tables `static_articles`, `static_gammes` et `static_nomenclatures` sont alimentées depuis X3 par `POST /api/v1/static/sync`. Elles servent à la faisabilité et au planning sans solliciter X3 à chaque requête.

### Overrides

Les modifications locales sur les OF (dates, statut, poste, note) sont stockées dans la table SQLite `of_overrides` et fusionnées avec les données X3 dans `app/domain/planning_board.ts`.

### Connexion X3

Le dialecte personnalisé dans `app/x3/client/` transforme les requêtes Lucid en appels SOAP vers le web-service `ZSOAPSQL` de Syracuse. Le client SOAP est implémenté avec `curl` dans `app/x3/soap-client.ts` pour la compatibilité avec l'existant.

## Tests

```bash
# Tests complets
npm test

# Vérification des types
npm run typecheck

# Lint
npm run lint

# Format
npm run format
```

Les tests couvrent les domaines métier (`tests/domain/`), les repositories et les routes fonctionnelles (`tests/functional/`).

## Commandes utiles

```bash
# Lancer les migrations SQLite
node ace migration:run

# Vider et recréer la base de dev
node ace migration:fresh
```

## Notes

- Ce repo est **uniquement** l'API AdonisJS. Le monorepo Python/FastAPI décrit dans les anciennes versions du README n'est plus présent ici.
- Les variables X3 peuvent être chiffrées avec `@dotenvx/dotenvx` ; le démarrage utilise `dotenvx run --`.
