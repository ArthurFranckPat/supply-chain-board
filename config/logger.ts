import env from '#start/env'
import app from '@adonisjs/core/services/app'
import { defineConfig, stdSerializers, syncDestination, targets } from '@adonisjs/core/logger'
import { sanitizeSqlErrorMessage } from '#app/utils/sanitize_sql_error'

/**
 * Sérialiseur `err` : dernier rempart contre la fuite de données métier.
 *
 * Knex préfixe le message de toute erreur SQL par la requête compilée, bindings
 * interpolés — un `insert` de 400 lignes déverse alors 400 lignes de données dans
 * le log. Une quarantaine de sites appellent `logger.error({ err }, …)` ; les
 * assainir un par un laisserait le prochain passer. Le sérialiseur les couvre
 * tous, quelle que soit la forme de `err` (Error, chaîne, valeur quelconque).
 */
function serializeErr(value: unknown): unknown {
  if (typeof value === 'string') return sanitizeSqlErrorMessage(value)
  if (!(value instanceof Error)) return value

  const serialise = stdSerializers.err(value) as Record<string, unknown>
  const brut = serialise.message
  if (typeof brut !== 'string') return serialise

  const propre = sanitizeSqlErrorMessage(brut)
  if (propre === brut) return serialise

  serialise.message = propre
  // La stack rejoue le message en tête : l'assainir seul le laisserait fuiter.
  if (typeof serialise.stack === 'string') {
    serialise.stack = serialise.stack.split(brut).join(propre)
  }
  return serialise
}

const loggerConfig = defineConfig({
  /**
   * Default logger name used by ctx.logger and app logger calls.
   */
  default: 'app',

  loggers: {
    app: {
      /**
       * Toggle this logger on/off.
       */
      enabled: true,

      /**
       * Logger name shown in log records.
       */
      name: env.get('APP_NAME'),

      /**
       * Minimum level to output (trace, debug, info, warn, error, fatal).
       */
      level: env.get('LOG_LEVEL'),

      /**
       * Assainissement des erreurs journalisées (cf. `serializeErr` ci-dessus).
       */
      serializers: { err: serializeErr },

      /**
       * Use sync destination in non-production for immediate flush.
       */
      destination: !app.inProduction ? await syncDestination() : undefined,

      /**
       * Configure where logs are written.
       *
       * MCP stdio (bin/mcp_supply.ts, issue #80) : stdout appartient au
       * transport JSON-RPC — toute écriture parasite corrompt le protocole.
       * `SUPPLY_MCP=1` (positionné par le binaire) redirige donc vers stderr.
       * Serveur HTTP : SUPPLY_MCP non défini → stdout (comportement inchangé).
       */
      transport: {
        targets: [targets.file({ destination: process.env.SUPPLY_MCP === '1' ? 2 : 1 })],
      },
    },
  },
})

export default loggerConfig

/**
 * Inferring types for the list of loggers you have configured
 * in your application.
 */
declare module '@adonisjs/core/types' {
  export interface LoggersList extends InferLoggers<typeof loggerConfig> {}
}
