import type { HttpContext } from '@adonisjs/core/http'
import { loadControleProdData } from '#services/controle_prod_loader'
import { loadOfASolderData } from '#services/of_a_solder_loader'

/**
 * Page « Contrôle prod » (issue #95) — deux familles d'incohérence entre ce que
 * l'atelier a pointé et ce qu'ORDERS annonce :
 *  - onglet « Écarts déclaration » : déclaré > pointé (l'anomalie d'origine) ;
 *  - onglet « OF à solder » : pointé à 100 %, rien de déclaré (cf. of_a_solder_loader).
 *
 * Shell Inertia instantané ; les deux payloads X3 sont différés en JSON et chargés
 * à l'ouverture de leur onglet — le second déclenche le pipeline ruptures, on ne le
 * paie donc pas quand l'utilisateur ne le regarde pas.
 */
export default class ControleProdController {
  /** GET /controle-prod — coquille Inertia. */
  async index(ctx: HttpContext) {
    const force = !!ctx.request.input('refresh')
    const q = force ? '?refresh=1' : ''
    return ctx.inertia.render('scheduler/controle-prod', {
      rowsHref: `/api/v1/planning/controle-prod${q}`,
      solderHref: `/api/v1/planning/of-a-solder${q}`,
    })
  }

  /** GET /api/v1/planning/controle-prod — JSON (calcul lourd). */
  async rows(ctx: HttpContext) {
    const force = !!ctx.request.input('refresh')
    return loadControleProdData(force)
  }

  /** GET /api/v1/planning/of-a-solder — JSON (adossé au payload ruptures). */
  async ofASolder(ctx: HttpContext) {
    const force = !!ctx.request.input('refresh')
    return loadOfASolderData(force)
  }
}
