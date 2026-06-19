import env from '#start/env'
import { defineConfig } from '@adonisjs/core/app'
import { HttpContext } from '@adonisjs/core/http'

export type X3EnvName = 'test' | 'prod'

export interface X3EnvConfig {
  host: string
  port: string
  user: string | undefined
  password: string | undefined
  pool: string
  ws: string
  grpSql: string
  grpRes: string
  grpCount: string
}

/** Identifiants X3 d'une session authentifiée (env choisi + creds utilisateur). */
export interface X3Credentials {
  env: X3EnvName
  user: string
  password: string
}

const ENVIRONMENTS: Record<X3EnvName, () => X3EnvConfig> = {
  test: () => ({
    host: env.get('X3_TEST_HOST', ''),
    port: env.get('X3_TEST_PORT', '8124'),
    user: env.get('X3_TEST_USERNAME'),
    password: env.get('X3_TEST_PASSWORD'),
    pool: env.get('X3_TEST_POOL', 'X3TEST'),
    ws: 'ZSOAPSQL',
    grpSql: 'GRP1',
    grpRes: 'GRP2',
    grpCount: 'GRP3',
  }),
  prod: () => ({
    host: env.get('X3_PROD_HOST', ''),
    port: env.get('X3_PROD_PORT', '8124'),
    user: env.get('X3_PROD_USERNAME'),
    password: env.get('X3_PROD_PASSWORD'),
    pool: env.get('X3_PROD_POOL', 'X3PROD'),
    ws: 'ZSOAPSQL',
    grpSql: 'GRP1',
    grpRes: 'GRP2',
    grpCount: 'GRP3',
  }),
}

/** Config de base d'un environnement (host/pool/ws), creds du compte `.env`. */
export function baseX3Config(envName: X3EnvName): X3EnvConfig {
  const factory = ENVIRONMENTS[envName]
  if (!factory) throw new Error(`Unknown X3 environment: ${envName}`)
  return factory()
}

/** Config d'un environnement avec les identifiants utilisateur surchargés. */
export function buildX3Config(creds: X3Credentials): X3EnvConfig {
  return { ...baseX3Config(creds.env), user: creds.user, password: creds.password }
}

/**
 * Résout la config X3 active.
 *
 * Priorité :
 *  1. `envName` explicite → config `.env` de cet environnement (hors requête :
 *     CLI, boot, sync planifié avec un compte de service).
 *  2. Requête HTTP authentifiée → identifiants de l'utilisateur (env choisi +
 *     creds déchiffrés), posés sur le `HttpContext` par `x3_context_middleware`.
 *  3. Fallback `.env` (`X3_ENV`) — démarrage / contextes hors session.
 *
 * Chokepoint unique des credentials X3 : toute connexion (pool Lucid partagé
 * `x3` comme instances `X3Database`) passe par ici via `X3Connection`.
 */
export function getX3EnvConfig(envName?: X3EnvName): X3EnvConfig {
  if (envName) return baseX3Config(envName)

  const ctxCreds = HttpContext.get()?.x3Credentials
  if (ctxCreds) return buildX3Config(ctxCreds)

  const fallback = (env.get('X3_ENV', 'test') as X3EnvName) ?? 'test'
  return baseX3Config(fallback)
}

export default defineConfig({})
