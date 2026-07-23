import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import { getX3EnvConfig } from '#config/x3'
import printService, { docLabel, type DocType } from '#services/print_service'

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

  @flags.string({ description: 'Code document configuré (défaut : le premier du dossier)' })
  declare doc: string

  @flags.string({ description: 'Atelier STOLOC (défaut : règle par défaut)' })
  declare atelier: string

  @flags.boolean({ description: 'Réimpression explicite (incrémente le rang du tirage)' })
  declare force: boolean

  @flags.boolean({ description: 'Résout le routage et le verrou sans appeler X3' })
  declare dry: boolean

  @flags.boolean({
    description: 'Dossier complet (bon de travail + bon matière), atelier résolu depuis l’article',
  })
  declare folder: boolean

  @flags.string({ description: 'Article de l’OF — sert à résoudre l’atelier avec --folder' })
  declare article: string

  async run() {
    if (this.folder) return this.runFolder()
    return this.runSingle()
  }

  /** Dossier complet : la chaîne exacte utilisée par l'affermissement. */
  private async runFolder() {
    const ofNum = (this.of ?? '').trim()
    const site = (this.site ?? '').trim()
    if (!ofNum || !site) {
      this.logger.error('--of et --site sont requis.')
      this.exitCode = 1
      return
    }
    const res = await printService.printFolder({
      ofNum,
      stofcy: site,
      itmref: (this.article ?? '').trim(),
      stoloc: (this.atelier ?? '').trim() || undefined,
      force: this.force,
      origin: 'test',
      requestedBy: 'cli',
      config: getX3EnvConfig('test'),
    })
    const labels = await printService.docLabels()
    this.logger.info(`Atelier : ${res.atelier.label || res.atelier.code || 'aucun (règle par défaut)'}`)
    for (const d of res.documents) {
      const line = `${docLabel(labels, d.docType)} → ${d.destCode || '—'} · X3 ${d.status} · serveur ${d.serverVerdict}${d.jobRank ? ` (tâche ${d.jobRank})` : ''}`
      if (d.serverVerdict === 'error' || d.status === 'failed') {
        this.logger.error(`${line} · ${d.error || d.jobDetail}`)
      } else if (d.status === 'locked') {
        this.logger.warning(`${line} · ${d.message}`)
      } else {
        this.logger.success(line)
      }
    }
    if (!res.ok) this.exitCode = 1
  }

  private async runSingle() {
    const ofNum = (this.of ?? '').trim()
    const site = (this.site ?? '').trim()
    // Défaut = premier document configuré, pas un code écrit en dur : le couple
    // d'états dépend du dossier X3.
    const configured = await printService.docTypes()
    const labels = await printService.docLabels()
    const docType = ((this.doc ?? '').trim().toUpperCase() || configured[0] || '') as DocType
    const stoloc = (this.atelier ?? '').trim()

    if (!ofNum || !site) {
      this.logger.error('--of et --site sont requis.')
      this.exitCode = 1
      return
    }
    if (!configured.includes(docType)) {
      this.logger.error(
        `--doc invalide : ${docType || '(aucun)'} (configurés : ${configured.join(' | ') || 'aucun'}).`
      )
      this.exitCode = 1
      return
    }

    const routed = await printService.resolveDestination(stoloc, docType)
    if (!routed) {
      this.logger.error(
        `Aucune destination configurée pour ${docLabel(labels, docType)}${stoloc ? ` (atelier ${stoloc})` : ''}.`
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

    // Second verdict. Un `submitted` avec `error` côté serveur d'édition est la
    // panne partielle de l'issue : X3 a dit oui, rien n'est sorti.
    const rank = res.jobRank ? ` (tâche ${res.jobRank}` + (res.jobPhase ? `, ${res.jobPhase})` : ')') : ''
    if (res.serverVerdict === 'error') {
      this.logger.error(`Serveur d'édition : ÉCHEC${rank}. ${res.jobDetail}`)
      this.exitCode = 1
      return
    }
    if (res.serverVerdict === 'ok') {
      this.logger.success(
        `Serveur d'édition : remis à la file${rank}` +
          (res.verdictInferred ? ' — succès déduit de la disparition de la tâche' : '')
      )
      return
    }
    this.logger.warning(`Serveur d'édition : sans verdict${rank}. ${res.jobDetail}`)
  }
}
