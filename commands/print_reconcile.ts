import { BaseCommand } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import { getX3EnvConfig } from '#config/x3'
import printService from '#services/print_service'

/**
 * `node ace print:reconcile` — reprend les tirages restés sans verdict (#85).
 *
 * Enveloppe CLI de `printService.reconcilePending`, partagée avec le bouton de
 * la page `/impressions` : une seule règle de réconciliation, deux façons de la
 * déclencher.
 *
 * ⚠️ N'a de prise que si la rétention est activée côté console du serveur
 * d'édition (« Time before deleting print job status », 0 par défaut). Sans
 * elle, une tâche absente ne prouve rien, et la commande le dit au lieu de
 * conclure.
 */
export default class PrintReconcile extends BaseCommand {
  static commandName = 'print:reconcile'
  static description = 'Relit le serveur d’édition pour les tirages sans verdict (issue #85)'
  static options: CommandOptions = { startApp: true }

  async run() {
    const res = await printService.reconcilePending(getX3EnvConfig('test'))
    if (res.pending === 0) {
      this.logger.info(res.note)
      return
    }
    if (res.resolved === 0) {
      this.logger.warning(`${res.pending} tirage(s) sans verdict. ${res.note}`)
      return
    }
    this.logger.success(res.note)
  }
}
