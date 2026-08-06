import { BaseCommand } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import demandSnapshotService, { SOURCE, SOURCES_ATTENDUES } from '#services/demand_snapshot_service'
import type { CouverturePhotos } from '#app/domain/snapshot_couverture'

/**
 * `node ace snapshot:diagnose` — état de l'historique des photos (#138 lot 0).
 *
 * Le lot 0 est invisible côté UI : rien, sur aucun écran, ne dit si l'horloge
 * de maturation tourne. Cette commande est le seul moyen de le vérifier avant
 * que le moteur d'explication (lot 1) n'existe — et donc le seul critère de
 * validation opérationnel du lot.
 *
 * Lecture SEULE, aucun appel X3.
 */
export default class SnapshotDiagnose extends BaseCommand {
  static commandName = 'snapshot:diagnose'
  static description = "État de l'historique des photos du besoin et des messages CBN"

  static options: CommandOptions = { startApp: true }

  async run() {
    const { besoin, messages } = await demandSnapshotService.diagnostic()

    this.section('Photo du besoin (demand_snapshots)', besoin)
    this.logger.log('')
    this.section('Messages CBN (appro_message_snapshots)', messages)

    // Les populations vivent dans deux tables : `appro_message` est présente si
    // la photo des messages porte le même jour que celle du besoin, les huit
    // autres si elles figurent au décompte du dernier jour.
    const manquantes = SOURCES_ATTENDUES.filter((s) =>
      s === SOURCE.MESSAGE ? messages.dernier !== besoin.dernier : besoin.derniere[s] === undefined
    )
    if (besoin.jours > 0 && manquantes.length > 0) {
      this.logger.log('')
      // C'est LA question que `snapshot:run` renvoie ici : la dernière photo
      // est-elle complète, ou une population a-t-elle été perdue en silence ?
      this.logger.warning(
        `Dernière photo incomplète — source(s) absente(s) : ${manquantes.join(', ')}`
      )
    }

    if (messages.jours === 0) {
      this.logger.log('')
      this.logger.warning(
        'Aucune photo des messages : le moteur d’explication (#138 lot 1) reste aveugle.'
      )
    } else if (messages.jours === 1) {
      this.logger.log('')
      this.logger.info(
        'Une seule photo des messages — il en faut DEUX pour un diff. Revenir demain.'
      )
    }

    // Cf. `snapshot_run.ts` : sortie explicite, le pool knex ne rendrait pas la
    // main au shell.
    process.exit(0)
  }

  private section(titre: string, c: CouverturePhotos) {
    this.logger.info(titre)
    if (c.jours === 0) {
      this.logger.log('  aucune photo')
      return
    }
    this.logger.log(`  ${c.jours} jour(s) : ${fr(c.premier)} → ${fr(c.dernier)}`)
    this.logger.log(
      `  dernière photo (${fr(c.dernier)}) : ${c.derniereTotal} lignes` +
        (c.derniereTotal === 0
          ? ''
          : `\n${Object.entries(c.derniere)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([k, n]) => `    ${k.padEnd(18)} ${n}`)
              .join('\n')}`)
    )
    if (c.manquants.length === 0) {
      this.logger.log('  aucun jour manqué')
    } else {
      // Un trou est définitif — X3 ne permet aucun rattrapage rétroactif. Le
      // dire fort, sans le noyer dans une liste de 200 dates.
      const apercu = c.manquants.slice(0, 10).map(fr).join(', ')
      const reste = c.manquants.length > 10 ? `, … (+${c.manquants.length - 10})` : ''
      this.logger.log(
        `  ${c.manquants.length} jour(s) manqué(s), irrécupérable(s) : ${apercu}${reste}`
      )
    }
    if (c.antidates.length > 0) {
      // `--date` n'est pas un backfill : ces jours-là racontent l'état du jour
      // du run, pas celui de leur propre date. Le lot 1 les diffuserait comme
      // du réel.
      const apercu = c.antidates.slice(0, 10).map(fr).join(', ')
      const reste = c.antidates.length > 10 ? `, … (+${c.antidates.length - 10})` : ''
      this.logger.log(
        `  ${c.antidates.length} jour(s) écrit(s) à une autre date : ${apercu}${reste}`
      )
    }
  }
}

/** Dates à l'écran en jj/mm/aaaa — l'ISO reste côté machine. */
const fr = (iso: string | null): string => {
  if (iso === null) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}
