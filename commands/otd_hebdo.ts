import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import { OtdRepository, resolveSemainePrecedente } from '#app/repositories/otd_repository'
import type { EtatExportLigne } from '#app/repositories/otd_repository'
import { getX3EnvConfig } from '#config/x3'

/**
 * `node ace otd:hebdo` — état des commandes EXPORT dues la semaine précédente.
 *
 * Socle de l'état transmis chaque lundi (skill `etat-commandes-export`). La
 * définition de la ponctualité n'est pas ici : elle vit dans `otd_repository`,
 * partagée avec la carte OTD du dashboard.
 *
 * `--recul=2` remonte à S-2, S-3… pour rejouer une semaine passée.
 */
export default class OtdHebdo extends BaseCommand {
  static commandName = 'otd:hebdo'
  static description = 'État hebdomadaire des commandes export dues (ponctualité + retards)'

  static options: CommandOptions = { startApp: true }

  @flags.number({ description: 'Nombre de semaines de recul (1 = semaine dernière)' })
  declare recul?: number

  @flags.boolean({ description: 'Sortie JSON brute, pour consommation par le skill' })
  declare json?: boolean

  async run() {
    const recul = Math.max(1, this.recul ?? 1)
    const ref = new Date()
    // Chaque recul supplémentaire décale la référence d'une semaine.
    const refDecalee = new Date(ref.getTime() - (recul - 1) * 7 * 86_400_000)
    const { from, to } = resolveSemainePrecedente(refDecalee)

    if (!this.json) {
      const cfg = getX3EnvConfig()
      this.logger.info(
        `Env X3 : ${cfg.pool} · semaine du ${fmt(from)} au ${fmt(to)} · clients hors France`
      )
    }

    const etat = await new OtdRepository().getEtatExport(from, to)

    if (this.json) {
      this.logger.log(JSON.stringify(etat, null, 2))
      return
    }

    if (etat.nbDues === 0) {
      this.logger.warning('Aucune ligne export due sur cette semaine.')
      return
    }

    const retards = etat.lignes
      .filter((l) => l.statut !== 'ponctuel')
      .sort((a, b) => b.joursRetard - a.joursRetard)

    this.logger.success(
      `Semaine ${etat.isoSemaine}/${etat.isoAnnee} — ${etat.nbDues} lignes dues · ` +
        `${etat.nbPonctuelles} ponctuelles · ${etat.tauxPonctualite} % · ${retards.length} en retard`
    )

    if (retards.length === 0) return

    this.logger.log('')
    const table = this.ui
      .table()
      .head(['Pays', 'Client', 'Commande', 'Article', 'Acceptée', 'Réelle', 'Retard', 'Qté'])
    for (const ligne of retards) table.row(ligneToRow(ligne))
    table.render()

    const negocies = retards.filter((l) => l.delaiNegocie).length
    if (negocies > 0) {
      this.logger.info(
        `${negocies} de ces lignes portaient une date demandée antérieure à l'acceptée ` +
          `(délai négocié, retard commercial et non industriel).`
      )
    }
  }
}

function fmt(d: Date | null): string {
  if (!d) return '—'
  const jour = String(d.getUTCDate()).padStart(2, '0')
  const mois = String(d.getUTCMonth() + 1).padStart(2, '0')
  return `${jour}/${mois}/${d.getUTCFullYear()}`
}

function ligneToRow(l: EtatExportLigne): string[] {
  return [
    l.pays,
    l.client.slice(0, 24),
    l.numCommande,
    l.article,
    fmt(l.dateAcceptee),
    l.statut === 'retard_ouvert' ? 'non partie' : fmt(l.dateReelle),
    `${l.joursRetard} j`,
    `${l.qteLivree}/${l.qteCommandee}`,
  ]
}
