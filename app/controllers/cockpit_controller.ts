import type { HttpContext } from '@adonisjs/core/http'
import {
  loadCockpitPostes,
  loadCockpitPoste,
  loadCockpitAnomaliesUsine,
} from '#services/cockpit_loader'

/**
 * Cockpit poste (#119) — ce que le poste a réellement produit (passé constaté)
 * et ce qui lui est promis (engagement futur, pipeline #46).
 *
 * Coquille Inertia instantanée + payloads différés en JSON, calque /controle-prod :
 * le sélecteur de postes est léger, le détail d'un poste (identité + engagement)
 * n'est chargé qu'une fois le poste choisi.
 */
export default class CockpitController {
  /** GET /cockpit — coquille Inertia. `?poste=` présélectionne (liens séquenceur
   *  et /charge), validé côté client contre la liste venue de la réplique. */
  async index(ctx: HttpContext) {
    const force = !!ctx.request.input('refresh')
    const q = force ? '?refresh=1' : ''
    const posteInitial = ctx.request.input('poste') ?? null
    return ctx.inertia.render('cockpit/poste', {
      postesHref: `/api/v1/planning/cockpit/postes${q}`,
      posteInitial: typeof posteInitial === 'string' ? posteInitial : null,
    })
  }

  /** GET /api/v1/planning/cockpit/postes — sélecteur (liste + défaut). */
  async postes(ctx: HttpContext) {
    const force = !!ctx.request.input('refresh')
    return loadCockpitPostes(force)
  }

  /** GET /api/v1/planning/cockpit/postes/:poste — identité + engagement. */
  async poste(ctx: HttpContext) {
    const force = !!ctx.request.input('refresh')
    const code = ctx.params.poste ?? ''
    return loadCockpitPoste(code, force)
  }

  /**
   * GET /api/v1/planning/cockpit/postes/:poste/anomalies-usine — écarts de
   * déclaration (#95) et OF à solder. Endpoint séparé : ces deux familles
   * viennent d'X3 en direct, le reste de la page tient sur la réplique (#119).
   */
  async anomaliesUsine(ctx: HttpContext) {
    const force = !!ctx.request.input('refresh')
    const code = ctx.params.poste ?? ''
    return loadCockpitAnomaliesUsine(code, force)
  }
}
