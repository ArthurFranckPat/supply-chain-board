import type { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'
import { cacheNs } from '#services/cache_ns'
import { stamped } from '#services/computed_age'
import { getX3EnvConfig } from '#config/x3'
import { loadLogisticsAnalysis } from '#services/logistics_analysis_loader'
import { DateTime } from 'luxon'

const cache = () => cacheNs('logistics-analysis')

export default class LogisticsAnalysisController {
  async index({ inertia }: HttpContext) {
    return inertia.render('analyse-logistique', {
      rowsHref: '/api/v1/logistique/analyse',
    })
  }

  async rows({ request }: HttpContext) {
    const environment = getX3EnvConfig().pool
    const day = DateTime.now().setZone('Europe/Paris').toISODate()
    const key = `zperfsc2-v1:${environment}:${day}`
    if (request.input('refresh')) await cache().delete({ key })
    try {
      const result = await cache().getOrSet({
        key,
        ttl: 15 * 60 * 1000,
        timeout: 0,
        factory: stamped(() => loadLogisticsAnalysis()),
      })
      return { ...result, x3Error: null }
    } catch (error) {
      logger.error({ err: error }, '[logistics-analysis] échec chargement X3')
      return {
        rows: [],
        site: 'AE1',
        from: '',
        to: '',
        calendarDays: 0,
        x3Error: 'Données X3 momentanément indisponibles.',
      }
    }
  }
}
