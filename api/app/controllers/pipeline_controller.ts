import { HttpContext } from '@adonisjs/core/http'

export default class PipelineController {
  async supplyBoard({}: HttpContext) { return { timestamp: new Date().toISOString() } }
  async suiviStatus({}: HttpContext) { return { total_rows: 0 } }
}
