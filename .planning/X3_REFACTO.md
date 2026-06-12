# Diagnostic : X3 éparpillé dans 6 emplacements

## État actuel

```
api/app/
├── x3/                          ← scripts SOAP (connection, soap-client, sql-*)
├── database/
│   ├── x3_client.ts             ← Knex dialect custom
│   ├── x3_database.ts            ← Knex wrapper
│   └── x3_dialect.ts            ← Lucid dialect
├── repositories/
│   ├── x3_connection.ts         ← X3Adapter (wrapper around app/x3/connection)
│   ├── of_repository.ts        ← uses X3Connection
│   ├── stock_repository.ts      ← uses X3Connection
│   ├── reception_repository.ts  ← uses X3Connection
│   └── besoin_client_repository.ts
├── models/x3/                   ← 16 modèles Lucid (SORDER, SORDERQ, MFGHEAD, etc.)
├── providers/
│   ├── x3_provider.ts           ← enregistre x3 + x3db dans le container
│   └── x3_database_provider.ts  ← patche Lucid internals
└── config/x3.ts                ← getX3EnvConfig
```

## Problèmes

1. **Scripts X3 nucleus** (`connection`, `soap-client`, `sql-*`, `response-parser`, `types`) sont dans `app/x3/` — OK comme destination, mais le reste n'y est pas regroupé
2. **`x3_connection.ts`** dans `repositories/` fait juste proxy vers `app/x3/connection` — redondant
3. **`x3_database.ts`** et **`x3_client.ts`** (Knex) sont dans `database/` — devrait être dans `app/x3/` avec les autres utilitaires X3
4. **`x3_dialect.ts`** (Lucid) dans `database/` — même remarque
5. **Models** (`models/x3/`) — ok, mais le provider (`x3_provider.ts`) qui les instrumente est dans `providers/`
6. **6 répertoires différents** pour une même feature "X3" — maintenance difficile

## Plan de refacto proposé

Regrouper tout le code X3 sous `api/app/x3/` :

```
api/app/x3/
├── connection.ts          ← X3Connection (SOAP client haut niveau)
├── soap_client.ts        ← sendSoap + callSoap
├── sql_builder.ts        ← bindParams, buildConcatSql
├── sql_parser.ts         ← splitUnion, extractColumns, topToRownum
├── response_parser.ts    ← parseResponse, formatResults
├── types.ts             ← X3QueryResult, SoapResponse
├── client/              ← couche Knex/Lucid
│   ├── index.ts         ← X3Database (export principal)
│   ├── knex_client.ts   ← X3Client (dialect Knex)
│   └── lucid_dialect.ts← X3Dialect (Lucid dialect)
├── models/              ← tous les modèles X3 (déplacés de app/models/x3/)
│   ├── sorder.ts
│   ├── sorderq.ts
│   ├── mfghead.ts
│   └── ... (16 fichiers)
├── repositories/         ← tous les repositories X3 (déplacés de app/repositories/)
│   ├── of_repository.ts
│   ├── stock_repository.ts
│   └── ...
├── providers/           ← providers X3 (déplacés de providers/)
│   ├── index.ts        ← exporte tout
│   └── database_provider.ts
└── config/
    └── x3.ts            ← getX3EnvConfig (déplacé de config/)
```

## Impact

- `app/repositories/x3_connection.ts` → supprimé (remplacé par `app/x3/connection.ts`)
- `app/database/x3_*.ts` → déplacés vers `app/x3/client/`
- `app/models/x3/` → déplacés vers `app/x3/models/`
- `app/repositories/*_repository.ts` → déplacés vers `app/x3/repositories/`
- `providers/x3_*.ts` → déplacés vers `app/x3/providers/`
- `config/x3.ts` → déplacé vers `app/x3/config/`
- `config/database.ts` → met à jour les imports
- Tous les imports dans le codebase doivent pointer vers `app/x3/*`

## Étapes

1. Créer `app/x3/` avec sous-répertoires
2. Déplacer les fichiers un par un en mettant à jour les imports
3. Commiter chaque déplacement individuellement
4. Supprimer les anciens emplacements
5. Mettre à jour `config/database.ts` (imports X3Client)
6. Mettre à jour `package.json` (path aliases si besoin)
7. Vérifier que les 93 tests passent
