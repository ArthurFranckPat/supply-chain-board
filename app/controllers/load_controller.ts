import { type HttpContext } from '@adonisjs/core/http'
import { loadChargePayload } from '#services/load_payload_loader'

export default class LoadController {
  /** GET /charge — page Inertia de projection de charge long terme. Cf. loadChargePayload. */
  async index(ctx: HttpContext) {
    const props = await loadChargePayload(ctx)
    return ctx.inertia.render('scheduler/load', props)
  }
}
