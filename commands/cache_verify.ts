import { BaseCommand } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import env from '#start/env'
import cache from '@adonisjs/cache/services/main'

/**
 * `node ace cache:verify` — confirme que le cache (config/cache.ts) fonctionne :
 * roundtrip set/get/delete sur le store par défaut + contrôle du serializer superjson
 * (Date/Map préservées). En CACHE_STORE=redis, le get traverse la couche L2 → valide
 * la connectivité Redis (issue #20, critère d'acceptation).
 */
export default class CacheVerify extends BaseCommand {
  static commandName = 'cache:verify'
  static description = 'Vérifie le cache : roundtrip set/get/delete + serializer (Redis si CACHE_STORE=redis)'

  static options: CommandOptions = { startApp: true }

  async run() {
    const storeName = env.get('CACHE_STORE')
    this.logger.info(`Store par défaut : ${storeName}`)

    const ns = cache.namespace('cache:verify')
    const key = `probe_${Date.now()}`
    const payload = {
      date: new Date('2026-01-02T03:04:05.000Z'),
      map: new Map<string, number>([['a', 1]]),
    }

    try {
      await ns.set({ key, value: payload, ttl: '1m' })
      const out = await ns.get<typeof payload>({ key })
      await ns.delete({ key })

      if (!out) {
        this.logger.error('Échec : valeur absente après set (roundtrip KO).')
        this.exitCode = 1
        return
      }

      const dateOk = out.date instanceof Date && out.date.toISOString() === payload.date.toISOString()
      const mapOk = out.map instanceof Map && out.map.get('a') === 1

      if (!dateOk || !mapOk) {
        this.logger.error(`Serializer KO (date=${dateOk}, map=${mapOk}) — superjson mal câblé ?`)
        this.exitCode = 1
        return
      }

      this.logger.success(`Cache OK (${storeName}) : roundtrip + Date/Map préservées.`)
    } catch (err) {
      this.logger.error(`Cache KO (${storeName}) : ${err instanceof Error ? err.message : String(err)}`)
      if (storeName === 'redis') {
        this.logger.info('Vérifier que Redis est joignable (REDIS_HOST/PORT) et que le serveur tourne.')
      }
      this.exitCode = 1
    }
  }
}
