import { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'
import {
  ExpeditionRepository,
  CAMION_GAP_MINUTES,
  MAX_PALETTES_CAMION,
  CAMION_CAPACITE_PALETTES,
  type ExpeditionKpi,
} from '#repositories/expedition_repository'

/**
 * Page « Expéditions » (issue #44) — onglet dédié à la gestion des expéditions client
 * (livraisons STOJOU TRSTYP_0=4), remplace la carte dashboard initiale jugée
 * insuffisante pour un usage opérationnel (retour terrain : besoin de filtrer/vérifier
 * les camions un par un, pas juste un résumé).
 *
 * Même motif que /suivi : coquille Inertia instantanée, calcul lourd (X3 + clustering
 * camion) chargé en différé via /api/v1/expeditions/rows.
 */
export default class ExpeditionsController {
  /** GET /expeditions — coquille de la page. */
  async index(ctx: HttpContext) {
    const referenceDate =
      (ctx.request.input('referenceDate') as string | undefined) || new Date().toISOString().slice(0, 10)
    return ctx.inertia.render('expeditions', {
      referenceDate,
      rowsHref: `/api/v1/expeditions/rows?referenceDate=${encodeURIComponent(referenceDate)}`,
      defaultGapMinutes: CAMION_GAP_MINUTES,
      maxPalettesCamion: MAX_PALETTES_CAMION,
    })
  }

  /** GET /api/v1/expeditions/rows — expéditions client (calcul lourd différé). Défaut : J-1. */
  async rows(ctx: HttpContext) {
    const referenceDate = ctx.request.input('referenceDate')
    const refDate = referenceDate ? new Date(referenceDate) : new Date()

    const expFromParam = ctx.request.input('expFrom')
    const expToParam = ctx.request.input('expTo')
    const fmtD = (d: Date) =>
      `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`

    let from: Date
    let to: Date
    let label: string

    if (expFromParam && expToParam) {
      from = new Date(expFromParam)
      to = new Date(expToParam)
      label = expFromParam === expToParam ? fmtD(from) : `${fmtD(from)} → ${fmtD(to)}`
    } else {
      const y = refDate.getUTCFullYear()
      const m = refDate.getUTCMonth()
      const dom = refDate.getUTCDate()
      from = new Date(Date.UTC(y, m, dom - 1))
      to = from
      label = 'J-1'
    }

    // Tolérance de regroupement « camion » surchargeable par requête (calibration VPN, #44).
    const gapMinParam = Number.parseInt(ctx.request.input('expGapMin'), 10)
    const gapMinutes = Number.isFinite(gapMinParam) && gapMinParam > 0 ? gapMinParam : CAMION_GAP_MINUTES

    let expeditions: ExpeditionKpi = {
      label,
      totalUc: 0,
      nbCamions: 0,
      gapMinutes,
      maxPalettesCamion: MAX_PALETTES_CAMION,
      camionCapacitePalettes: CAMION_CAPACITE_PALETTES,
      camions: [],
    }
    let x3Error: string | null = null

    try {
      expeditions = await new ExpeditionRepository().getExpeditions(from, to, label, gapMinutes)
    } catch (e) {
      logger.error({ err: e }, '[expeditions] rows — échec chargement X3')
      x3Error = 'Données X3 indisponibles — expéditions momentanément incalculables.'
    }

    return { expeditions, x3Error }
  }
}
