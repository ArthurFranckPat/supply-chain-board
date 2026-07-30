/*
|--------------------------------------------------------------------------
| Environment variables service
|--------------------------------------------------------------------------
|
| Dotenvx loads encrypted env vars BEFORE AdonisJS Env validation.
| Run with: dotenvx run -- node ace serve --hmr
|
*/

import '@dotenvx/dotenvx/config'

import { Env } from '@adonisjs/core/env'

export default await Env.create(new URL('../', import.meta.url), {
  // Node
  NODE_ENV: Env.schema.enum(['development', 'production', 'test'] as const),
  PORT: Env.schema.number(),
  HOST: Env.schema.string({ format: 'host' }),
  LOG_LEVEL: Env.schema.string(),

  // App
  APP_KEY: Env.schema.secret(),
  APP_URL: Env.schema.string({ format: 'url', tld: false }),

  // Session
  SESSION_DRIVER: Env.schema.enum(['cookie', 'memory', 'database'] as const),

  // Redis (utilisé par le cache distribué quand CACHE_STORE=redis)
  REDIS_HOST: Env.schema.string({ format: 'host' }),
  REDIS_PORT: Env.schema.number(),
  REDIS_PASSWORD: Env.schema.string.optional(),
  REDIS_DB: Env.schema.number.optional(),

  // Cache (config/cache.ts) : `file` en dev (L2 fichier, survit aux redémarrages),
  // `redis` en prod, `memory` en test (forcé par config/cache.ts).
  CACHE_STORE: Env.schema.enum(['memory', 'file', 'redis'] as const),

  // Réplique X3 locale (#98). `true` autorise les lectures depuis la réplique ;
  // toute autre valeur, ou l'absence, garde TOUTES les lectures sur la voie
  // directe X3 (cf. app/services/replica_gate.ts).
  //
  // Optionnel et défaut fermé : les deux stratégies coexistent volontairement, le
  // choix se tranchera au déploiement. Un défaut ouvert basculerait la production
  // sur une source dont l'équivalence avec la voie directe n'est pas démontrée.
  REPLICA_READS: Env.schema.enum.optional(['true', 'false'] as const),

  // X3
  X3_ENV: Env.schema.enum(['test', 'prod'] as const),
  X3_TEST_HOST: Env.schema.string({ format: 'host' }),
  X3_TEST_PORT: Env.schema.string(),
  X3_TEST_USERNAME: Env.schema.string.optional(),
  X3_TEST_PASSWORD: Env.schema.string.optional(),
  X3_TEST_POOL: Env.schema.string(),
  X3_PROD_HOST: Env.schema.string.optional({ format: 'host' }),
  X3_PROD_PORT: Env.schema.string.optional(),
  X3_PROD_USERNAME: Env.schema.string.optional(),
  X3_PROD_PASSWORD: Env.schema.string.optional(),
  X3_PROD_POOL: Env.schema.string.optional(),

  // Serveur d'édition par défaut, au format `hote:port` (issue #85). Sert quand
  // la destination `APRINTER` ne déclare pas de `PRTSRV` — X3 se rabat alors sur
  // le serveur du dossier, que rien en base ne nomme.
  X3_TEST_PRINT_SERVER: Env.schema.string.optional(),
  X3_PROD_PRINT_SERVER: Env.schema.string.optional(),

  // Couche agentique v1 — provider Z.AI / GLM 5.2 (pi-ai `zai`).
  // Optionnel au boot (les pages non-agent restent utilisables) ;
  // requis dès POST /api/v1/agent/chat.
  ZAI_API_KEY: Env.schema.string.optional(),
})
