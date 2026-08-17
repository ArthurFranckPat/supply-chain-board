import { type ApplicationService } from '@adonisjs/core/types'
import systemSettingsRepository from '#repositories/system_settings_repository'

/**
 * Charge `system_settings` en mémoire AVANT que quiconque lise un réglage.
 *
 * ## Pourquoi ce provider existe
 *
 * `replicaReadsEnabled()` est SYNCHRONE — elle est appelée sur le chemin chaud
 * des lectures, une fois par verdict de table — donc elle lit un cache mémoire
 * (`SystemSettingsRepository`) et ne peut pas aller chercher la ligne en SQLite
 * elle-même.
 *
 * Sans chargement au boot, ce cache reste VIDE au démarrage : `data_mode` est
 * bien persisté en base, mais `getSync()` rend `undefined` et toute l'app repart
 * sur `REPLICA_READS` du `.env`. Le mode choisi à l'écran était donc annulé par
 * chaque redémarrage, jusqu'à ce qu'un visiteur ouvre `/configuration/donnees`
 * — la page appelle `loadAll()` pour s'afficher, et réparait l'état en le
 * montrant. Aucun autre écran ne signalait rien : les chiffres venaient de
 * l'autre architecture, plausibles et faux.
 *
 * ## Pourquoi `ready()` et pas `boot()`
 *
 * `db` (@adonisjs/lucid/services/db) n'est assigné que dans un hook
 * `app.booted()`, exécuté APRÈS le `boot()` de tous les providers — l'utiliser
 * dans `boot()` lèverait sur un `db` encore `undefined`, exactement le piège
 * documenté dans `cache_preheat_provider`.
 *
 * ## Pourquoi AVANT `cache_preheat_provider` dans `adonisrc.ts`
 *
 * Les `ready()` sont invoqués en séquence, dans l'ordre du tableau `providers`,
 * chacun attendu. Le préchauffage décide de son propre sort d'après le mode
 * (mode réplique = pas de préchauffage) : il doit donc voir le mode CHARGÉ, pas
 * le défaut `.env`. Ne pas remonter ce provider après lui.
 */
export default class SystemSettingsProvider {
  constructor(protected app: ApplicationService) {}

  async ready() {
    // `loadAll()` avale ses erreurs (table absente avant migration, base
    // injoignable) : un réglage indisponible retombe sur le défaut `.env`, ce
    // qui est le comportement voulu — jamais un boot bloqué.
    await systemSettingsRepository.loadAll()
  }
}
