import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import { getX3EnvConfig } from '#config/x3'
import printService, { DOC_LABELS, DOC_TYPES, type DocType } from '#services/print_service'

/**
 * `node ace print:of --of=F126-47558 --site=AE1` — imprime un document d'OF en
 * passant par le routage et le journal (issue #85, lot 2).
 *
 * Sert à éprouver la chaîne complète hors navigateur : résolution de la
 * destination, verrou d'idempotence, verdict X3, ligne de journal. La commande
 * n'accepte aucune destination en argument — router, c'est le rôle de la table
 * de configuration, pas d'un flag de CLI.
 *
 * ⚠️ Une règle pointant une imprimante d'atelier sort du papier. `--dry` montre
 * ce qui serait fait sans appeler X3.
 */
export default class PrintOf extends BaseCommand {
  static commandName = 'print:of'
  static description = 'Imprime un document d’OF via le routage configuré (issue #85)'
  static options: CommandOptions = { startApp: true }

  @flags.string({ description: 'Numéro d’OF (ex. F126-47558)' })
  declare of: string

  @flags.string({ description: 'Site de production (ex. AE1)' })
  declare site: string

  @flags.string({ description: `Document : ${DOC_TYPES.join(' | ')} (défaut BONTRV)` })
  declare doc: string

  @flags.string({ description: 'Atelier STOLOC (défaut : règle par défaut)' })
  declare atelier: string

  @flags.boolean({ description: 'Réimpression explicite (incrémente le rang du tirage)' })
  declare force: boolean

  @flags.boolean({ description: 'Résout le routage et le verrou sans appeler X3' })
  declare dry: boolean

  async run() {
    const ofNum = (this.of ?? '').trim()
    const site = (this.site ?? '').trim()
    const docType = ((this.doc ?? 'BONTRV').trim().toUpperCase() || 'BONTRV') as DocType
    const stoloc = (this.atelier ?? '').trim()

    if (!ofNum || !site) {
      this.logger.error('--of et --site sont requis.')
      this.exitCode = 1
      return
    }
    if (!DOC_TYPES.includes(docType)) {
      this.logger.error(`--doc invalide : ${docType} (attendu ${DOC_TYPES.join(' | ')}).`)
      this.exitCode = 1
      return
    }

    const routed = await printService.resolveDestination(stoloc, docType)
    if (!routed) {
      this.logger.error(
        `Aucune destination configurée pour ${DOC_LABELS[docType]}${stoloc ? ` (atelier ${stoloc})` : ''}.`
      )
      this.exitCode = 1
      return
    }
    this.logger.info(
      `Routage ${routed.source} → ${routed.destCode} (${routed.destLabel || 'sans libellé'})` +
        (routed.sandbox ? ' · sans effet physique' : ' · SORT DU PAPIER')
    )

    const past = (await printService.jobsForOf(ofNum)).filter(
      (j) => j.docType === docType && j.status === 'submitted'
    )
    if (past.length > 0) {
      this.logger.info(`Déjà imprimé ${past.length}× (dernier tirage : rang ${past[0].attempt}).`)
    }

    if (this.dry) {
      this.logger.info('--dry : aucun appel X3.')
      return
    }

    const res = await printService.printOf({
      ofNum,
      docType,
      stofcy: site,
      stoloc,
      force: this.force,
      origin: 'test',
      requestedBy: 'cli',
      config: getX3EnvConfig('test'),
    })

    if (res.status === 'locked') {
      this.logger.warning(`${res.message} Relancer avec --force pour une réimpression explicite.`)
      this.exitCode = 1
      return
    }
    if (!res.ok) {
      this.logger.error(`Échec : ${res.error}`)
      this.exitCode = 1
      return
    }
    this.logger.success(
      `Tirage ${res.attempt} soumis à X3 → ${res.destCode} · job #${res.jobId}` +
        (res.message ? ` · ${res.message}` : '')
    )
  }
}
