/*
|--------------------------------------------------------------------------
| Environment variables service
|--------------------------------------------------------------------------
|
| The `Env.create` method creates an instance of the Env service. The
| service validates the environment variables and also cast values
| to JavaScript data types.
|
*/

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
})
