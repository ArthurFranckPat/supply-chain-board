import { type ApplicationService } from '@adonisjs/core/types'
import type { LoggerService } from '@adonisjs/core/types'
import boardDataset from '#services/board_dataset'

/**
 * Préchauffage du cache X3 au démarrage du serveur.
 *
 * Le calcul de l'estimateur de conditionnement (STOCK + STOJOU sur 6 mois) est
 * coûteux (plusieurs appels SOAP agrégeant beaucoup de lignes). Sans préchauffage,
 * le PREMIER utilisateur à ouvrir la page « Conditionnements » ou « Réceptions »
 * subit le cold start (jusqu'à 86s avant optimisation de la requête).
 *
 * Ce provider déclenche le calcul en arrière-plan dès que le serveur est prêt :
 * le cache se remplit, et le premier utilisateur réel trouve une réponse chaude.
 * L'appel est fire-and-forget (non bloquant) et log-only en cas d'échec (X3 peut
 * ne pas être joignable au boot, ce n'est pas fatal — le cache se remplira à la
 * première requête via SWR).
 *
 * En environnement `repl`/`test`, on ne préchauffe pas (inutile et ralentit les
 * tests).
 *
 * NB : le hook `ready()` (pas `boot()`) est utilisé car `cache` (@adonisjs/cache
 * services/main) n'est assigné qu'après les hooks `app.booted()`, exécutés
 * après le `boot()` de tous les providers — l'appeler depuis `boot()` lève
 * "Cannot read properties of undefined (reading 'namespace')".
 */
export default class CachePreheatProvider {
  constructor(protected app: ApplicationService) {}

  async ready() {
    // Pas de préchauffage en repl/test.
    if (!this.app.getEnvironment().startsWith('web')) return

    // Le logger est résolu via le conteneur (les imports statiques de services
    // ne sont pas encore disponibles pendant le boot). boardDataset est un
    // singleton exporté (pas un binding de conteneur) → import statique OK.
    const logger = await this.app.container.make('logger')

    // Fire-and-forget : on n'attend pas (le serveur doit rester responsive).
    void this.preheat(logger)
  }

  private async preheat(logger: LoggerService) {
    try {
      logger.info('[cache-preheat] préchauffage estimateur conditionnement…')
      await boardDataset.getConditionnementEstimator()
      logger.info('[cache-preheat] estimateur conditionnement prêt')
    } catch (e) {
      // Non fatal : X3 peut être indispo au boot. Le cache se remplira à la 1re requête.
      logger.warn({ err: e }, '[cache-preheat] échec préchauffage (non fatal)')
    }
  }
}
