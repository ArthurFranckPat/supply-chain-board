import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import { loadChargePayloadData } from '#services/load_payload_loader'
import type { ShiftPlanPayload } from '#services/shift_plan_builder'

/**
 * `node ace charge:plan --postes=PP_830,PP_091` — imprime la proposition de schéma
 * horaire d'un ou plusieurs postes, semaine par semaine.
 *
 * Sert au calage métier des poids du moteur (cf. `DEFAULT_SHIFT_PLAN_OPTIONS`) :
 * lire le plan sur de vrais postes est le seul moyen de dire si une proposition
 * est bonne, et l'écran n'est pas nécessaire pour ça.
 */
export default class ShiftPlanShow extends BaseCommand {
  static commandName = 'charge:plan'
  static description = 'Affiche la proposition de schéma horaire par poste (page /charge)'
  static options: CommandOptions = { startApp: true }

  @flags.string({ description: 'Codes postes séparés par des virgules (défaut : tous)' })
  declare postes: string

  @flags.string({ description: 'Vue de charge : of | commande (défaut : commande)' })
  declare vue: string

  @flags.boolean({ description: 'Recalcule sans passer par le cache' })
  declare refresh: boolean

  async run() {
    const view = this.vue === 'of' ? 'of' : 'commande'
    const wanted = (this.postes ?? '')
      .split(',')
      .map((c) => c.trim().toUpperCase())
      .filter(Boolean)

    const payload = (await loadChargePayloadData({ force: !!this.refresh })) as {
      shiftPlan: ShiftPlanPayload
    }
    const { shiftPlan } = payload
    const labels = new Map(shiftPlan.catalog.map((s) => [s.code, s.label]))
    const lines = shiftPlan[view].filter((l) => !wanted.length || wanted.includes(l.code))

    this.logger.info(`Vue « ${view} » · ${shiftPlan.weekKeys.length} semaines`)
    if (!lines.length) {
      this.logger.warning('Aucun poste planifié pour ce filtre.')
      for (const s of shiftPlan.skipped.filter((k) => !wanted.length || wanted.includes(k.code))) {
        this.logger.warning(`  ${s.code} — écarté : ${s.reason}`)
      }
      return
    }

    for (const line of lines) {
      const courant = line.current ? (labels.get(line.current) ?? line.current) : '—'
      this.logger.log('')
      this.logger.log(`■ ${line.code} — schéma X3 actuel : ${courant}`)
      for (const p of line.plan.plateaus) {
        const weeks = shiftPlan.weekKeys.slice(p.from, p.to + 1)
        const gel = p.frozen ? ' [préavis]' : ''
        const dette = p.debtHours > 0 ? ` · dette ${p.debtHours} h` : ''
        const vide = p.idleHours > 0 ? ` · à vide ${p.idleHours} h` : ''
        this.logger.log(
          `  ${weeks[0]} → ${weeks[weeks.length - 1]} (${weeks.length} sem.) : ` +
            `${labels.get(p.schedule.code) ?? p.schedule.code}${gel}${dette}${vide}`
        )
      }
      const table = this.ui.table()
      table.head(['Semaine', 'Charge h', 'Capacité h', 'Taux', 'Équipes-jour', 'État'])
      for (const w of line.plan.weeks) {
        const taux = w.capacity > 0 ? `${Math.round((w.load / w.capacity) * 100)} %` : '—'
        table.row([
          shiftPlan.weekKeys[w.index] ?? String(w.index),
          String(w.load),
          String(w.capacity),
          taux,
          String(w.crewDays),
          w.state,
        ])
      }
      table.render()
    }

    const skipped = shiftPlan.skipped.filter((k) => wanted.includes(k.code))
    for (const s of skipped) this.logger.warning(`${s.code} — écarté : ${s.reason}`)
  }
}
