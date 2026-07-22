import { BaseCommand } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import { getX3EnvConfig } from '#config/x3'
import { fetchJobs } from '#app/x3/print_server_client'
import PrintJob from '#models/print_job'

/**
 * `node ace print:reconcile` — reprend les tirages restés sans verdict (#85).
 *
 * Le suivi synchrone échoue quand la tâche est trop brève ou le sondage trop
 * lent. Cette commande relit le serveur d'édition et tranche les tirages dont
 * on connaît le numéro de tâche.
 *
 * ⚠️ N'a de sens que si la rétention est activée côté console du serveur
 * d'édition (« Time before deleting print job status », 0 par défaut = les
 * tâches disparaissent à leur fin). Sans elle, une tâche absente ne prouve
 * rien, et la commande le dit au lieu de conclure.
 */
export default class PrintReconcile extends BaseCommand {
  static commandName = 'print:reconcile'
  static description = 'Relit le serveur d’édition pour les tirages sans verdict (issue #85)'
  static options: CommandOptions = { startApp: true }

  async run() {
    const config = getX3EnvConfig('test')
    const pending = await PrintJob.query()
      .where('status', 'submitted')
      .whereIn('server_verdict', ['pending', 'unknown'])
      .where('job_rank', '>', 0)
      .orderBy('id', 'desc')
      .limit(200)

    if (pending.length === 0) {
      this.logger.info('Aucun tirage en attente de verdict.')
      return
    }

    const jobs = await fetchJobs(config, config.printServer)
    if ('error' in jobs) {
      this.logger.error(`Serveur d’édition injoignable : ${jobs.error}`)
      this.exitCode = 1
      return
    }
    if (jobs.length === 0) {
      this.logger.warning(
        `${pending.length} tirage(s) sans verdict, mais le serveur d’édition ne conserve aucune tâche. ` +
          'Activer « Time before deleting print job status » côté console pour pouvoir trancher.'
      )
      return
    }

    const byRank = new Map(jobs.map((j) => [j.rank, j]))
    let resolved = 0
    for (const row of pending) {
      const j = byRank.get(row.jobRank)
      if (!j) continue
      row.serverVerdict = j.status === 'OK' ? 'ok' : 'error'
      row.jobPhase = j.phase ?? row.jobPhase
      row.jobDetail = j.status === 'OK' ? '' : j.status
      row.verdictInferred = false
      await row.save()
      resolved++
      this.logger.info(`Tâche ${row.jobRank} (${row.ofNum}/${row.docType}) → ${row.serverVerdict}`)
    }

    this.logger.success(`${resolved} tirage(s) tranché(s) sur ${pending.length} en attente.`)
  }
}
