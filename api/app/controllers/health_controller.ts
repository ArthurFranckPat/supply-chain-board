import { HttpContext } from '@adonisjs/core/http'

export default class HealthController {
  async index({ response }: HttpContext) {
    return response.ok({ status: 'ok', service: 'supply-chain-board', timestamp: new Date().toISOString() })
  }
}
