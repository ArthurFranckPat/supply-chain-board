import env from '#start/env'
import { defineConfig } from '@adonisjs/core/app'

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

const ENVIRONMENTS: Record<string, () => X3EnvConfig> = {
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

export function getX3EnvConfig(envName?: string): X3EnvConfig {
  const name = envName ?? env.get('X3_ENV', 'test')
  const factory = ENVIRONMENTS[name]
  if (!factory) throw new Error(`Unknown X3 environment: ${name}`)
  return factory()
}

export default defineConfig({})
