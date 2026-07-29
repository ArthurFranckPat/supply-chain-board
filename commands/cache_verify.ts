import { BaseCommand } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import env from '#start/env'
import { cacheNs } from '#services/cache_ns'
import { superjsonSerializer } from '#config/cache'

/**
 * `node ace cache:verify` — confirme que le cache (config/cache.ts) fonctionne :
 * roundtrip set/get/delete sur le store par défaut + contrôle du serializer superjson
 * (Date/Map préservées). En CACHE_STORE=redis, le `set` écrit dans la couche L2 → un
 * Redis injoignable remonte en erreur (issue #20, critère d'acceptation).
 *
 * Le contrôle du serializer se fait sur `superjsonSerializer` DIRECTEMENT, et non
 * plus sur le retour du `get` : depuis `serialize: false` sur le L1, une lecture
 * servie par la mémoire ne traverse aucun serializer. Date et Map y survivent
 * nativement, donc les assertions passaient au vert sans rien exercer.
 */
export default class CacheVerify extends BaseCommand {
  static commandName = 'cache:verify'
  static description =
    'Vérifie le cache : roundtrip set/get/delete + serializer (Redis si CACHE_STORE=redis)'

  static options: CommandOptions = { startApp: true }

  async run() {
    const storeName = env.get('CACHE_STORE')
    this.logger.info(`Store par défaut : ${storeName}`)

    const ns = cacheNs('cache:verify')
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

      // Aller-retour explicite dans le serializer configuré : c'est ce que fera
      // la couche L2 (fichier en dev, Redis en prod) à chaque écriture.
      const revived = superjsonSerializer.deserialize(
        superjsonSerializer.serialize(payload)
      ) as typeof payload

      const dateOk =
        revived.date instanceof Date && revived.date.toISOString() === payload.date.toISOString()
      const mapOk = revived.map instanceof Map && revived.map.get('a') === 1

      if (!dateOk || !mapOk) {
        this.logger.error(`Serializer KO (date=${dateOk}, map=${mapOk}) — superjson mal câblé ?`)
        this.exitCode = 1
        return
      }

      // Le L1 ne sérialisant plus, la valeur lue doit être l'objet lui-même.
      // Si ce n'est pas le cas, `serialize: false` n'est pas honoré — patch
      // bentocache absent ou périmé.
      if (out !== payload) {
        this.logger.error(
          '`serialize: false` non honoré sur le L1 : la lecture rend une copie. ' +
            'Vérifier patches/bentocache+1.6.1.patch (npx patch-package).'
        )
        this.exitCode = 1
        return
      }

      this.logger.success(
        `Cache OK (${storeName}) : roundtrip, L1 sans sérialisation, Date/Map préservées.`
      )
    } catch (err) {
      this.logger.error(
        `Cache KO (${storeName}) : ${err instanceof Error ? err.message : String(err)}`
      )
      if (storeName === 'redis') {
        this.logger.info(
          'Vérifier que Redis est joignable (REDIS_HOST/PORT) et que le serveur tourne.'
        )
      }
      this.exitCode = 1
    }
  }
}
