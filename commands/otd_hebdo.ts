import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import { construireEtatExport, formaterEtatTexte } from '#services/export_causes_service'

/**
 * `node ace otd:hebdo` — état des commandes EXPORT dues la semaine précédente.
 *
 * Socle de l'état transmis chaque lundi (skill `etat-commandes-export`). Toute
 * la logique vit dans `export_causes_service` : cette commande n'est qu'une
 * façade.
 *
 * ⚠️ Inutilisable en l'état sur ce worktree : le chargeur de commandes d'ace
 * échoue sous Node 26 (« Invalid command exported … Invalid URL ») pour TOUTES
 * les commandes locales, y compris une sonde vide. En attendant sa réparation,
 * le point d'entrée réel est `bin/etat_export.ts`.
 */
export default class OtdHebdo extends BaseCommand {
  static commandName = 'otd:hebdo'
  static description = 'État hebdomadaire des commandes export dues (ponctualité + causes)'

  static options: CommandOptions = { startApp: true }

  @flags.number({ description: 'Nombre de semaines de recul (1 = semaine dernière)' })
  declare recul?: number

  @flags.boolean({ description: 'Sortie JSON brute, pour consommation par le skill' })
  declare json?: boolean

  async run() {
    const complet = await construireEtatExport(this.recul ?? 1)

    if (this.json) {
      this.logger.log(
        JSON.stringify(
          {
            ...complet.etat,
            causes: Object.fromEntries(complet.causes),
          },
          null,
          2
        )
      )
      return
    }

    for (const ligne of formaterEtatTexte(complet)) this.logger.log(ligne)
  }
}
