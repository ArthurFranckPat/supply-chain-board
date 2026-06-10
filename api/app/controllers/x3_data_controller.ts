import { HttpContext } from '@adonisjs/core/http'

export default class X3DataController {
  async load({}: HttpContext) { return { status: 'loaded' } }
}
