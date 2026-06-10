import { HttpContext } from '@adonisjs/core/http'

export default class PlanningBoardController {
  async index({}: HttpContext) { return { ofs: [], total: 0 } }
  async show({ params }: HttpContext) { return { numOf: params.numOf } }
  async update({ params }: HttpContext) { return { numOf: params.numOf, updated: true } }
  async resetOverride({ params }: HttpContext) { return { numOf: params.numOf, reset: true } }
  async listOverrides({}: HttpContext) { return { overrides: [], total: 0 } }
  async resetAll({}: HttpContext) { return { deleted: 0 } }
  async feasibility({}: HttpContext) { return { results: {}, stats: {} } }
  async whatif({}: HttpContext) { return { simulated: true } }
  async orderImpacts({}: HttpContext) { return { impacts: [] } }
  async listEvents({}: HttpContext) { return { events: [] } }
}
