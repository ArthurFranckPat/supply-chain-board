import { type ApplicationService } from '@adonisjs/core/types'
import cachePreheatService from '#services/cache_preheat_service'

/**
 * Démarre le préchauffage / maintien à chaud du cache X3.
 *
 * Toute la logique — décision du mode, préchauffage, warmer, liste des entrées —
 * vit dans `#services/cache_preheat_service`. Ce provider ne fait que la brancher
 * au cycle de vie de l'app, pour une raison : le mode de données se commute
 * DÉSORMAIS à chaud depuis `/configuration/donnees`, et le contrôleur doit
 * pouvoir réveiller le préchauffage sans attendre le tick suivant. Un provider
 * n'est pas adressable (l'app le jette après la phase `ready`), un singleton de
 * service l'est.
 *
 * NB : le hook `ready()` (pas `boot()`) est utilisé car `cache` (@adonisjs/cache
 * services/main) n'est assigné qu'après les hooks `app.booted()`, exécutés
 * après le `boot()` de tous les providers — l'appeler depuis `boot()` lève
 * "Cannot read properties of undefined (reading 'namespace')".
 *
 * Ce provider doit rester APRÈS `system_settings_provider` dans `adonisrc.ts` :
 * le premier cycle lit `data_mode`, qui n'est en mémoire qu'une fois chargé.
 */
export default class CachePreheatProvider {
  constructor(protected app: ApplicationService) {}

  async ready() {
    // Pas de préchauffage en repl/test.
    if (!this.app.getEnvironment().startsWith('web')) return

    // ATTENTION au timing : `cache` (@adonisjs/cache/services/main) n'est
    // instancié qu'à l'intérieur d'un hook `app.booted()`. L'appeler pendant
    // boot() d'un provider → cache encore `undefined` →
    // "Cannot read properties of undefined (reading 'namespace')".
    // On reporte donc le démarrage APRÈS le boot complet de l'app.
    void this.app.booted(async () => {
      const logger = await this.app.container.make('logger')
      cachePreheatService.start(logger)
    })
  }

  async shutdown() {
    cachePreheatService.stop()
  }
}
