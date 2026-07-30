/**
 * Charge la prévision de charge transport (issue #104).
 *
 * Fenêtre data : [J − lookback, J + horizon] pour capturer les retards ouverts
 * dont la dateExpedition est passée mais qui glisseront dans l'horizon d'affichage.
 * Affichage : J → J+horizon−1.
 */

import logger from '@adonisjs/core/services/logger'
import boardDataset from '#services/board_dataset'
import { loadOrderImpacts } from '#services/order_impacts_loader'
import { buildExpeditionForecast, type ExpeditionForecast } from '#app/domain/expedition_forecast'
import {
  ExpeditionRepository,
  CAMION_CAPACITE_PALETTES,
  NB_DEPARTS_QUOTIDIENS,
  CAPACITE_JOUR_PALETTES,
} from '#repositories/expedition_repository'

/** Lookback pour inclure les commandes en retard encore ouvertes (jours). */
export const FORECAST_LOOKBACK_DAYS = Number(process.env.EXPEDITION_FORECAST_LOOKBACK) || 30

/** Horizon d'affichage par défaut (jours, J inclus). */
export const FORECAST_DEFAULT_HORIZON = 7

function isoLocal(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export interface LoadExpeditionForecastOptions {
  /** Jour J (défaut : aujourd'hui local). */
  start?: Date
  /** Nombre de jours affichés (1–90, défaut 7). */
  days?: number
  force?: boolean
}

export async function loadExpeditionForecast(
  opts: LoadExpeditionForecastOptions = {}
): Promise<{ forecast: ExpeditionForecast; x3Error: string | null }> {
  const horizon =
    Number.isFinite(opts.days) && (opts.days as number) > 0 && (opts.days as number) <= 90
      ? (opts.days as number)
      : FORECAST_DEFAULT_HORIZON

  const today = opts.start ? new Date(opts.start) : new Date()
  today.setHours(0, 0, 0, 0)
  const todayIso = isoLocal(today)

  const windowFrom = new Date(today)
  windowFrom.setDate(windowFrom.getDate() - FORECAST_LOOKBACK_DAYS)
  windowFrom.setHours(0, 0, 0, 0)

  const windowTo = new Date(today)
  windowTo.setDate(windowTo.getDate() + horizon)
  windowTo.setHours(23, 59, 59, 999)

  const force = !!opts.force

  try {
    const [{ result }, { demand: rawDemands }] = await Promise.all([
      loadOrderImpacts({
        from: windowFrom,
        to: windowTo,
        pipeline: 'programme',
        force,
      }),
      boardDataset.getDemandAndReception(isoLocal(windowFrom), isoLocal(windowTo), force),
    ])

    const articles = [
      ...new Set([...result.orders.map((o) => o.article), ...rawDemands.map((d) => d.article)]),
    ]
    const coefs = await new ExpeditionRepository().getVolumeCoefs(articles)

    const forecast = buildExpeditionForecast({
      impacts: result.orders,
      rawDemands,
      coefs,
      today: todayIso,
      horizonDays: horizon,
      capaciteJour: CAPACITE_JOUR_PALETTES,
      nbDepartsQuotidiens: NB_DEPARTS_QUOTIDIENS,
      camionCapacitePalettes: CAMION_CAPACITE_PALETTES,
      commandesOnly: true,
    })

    return { forecast, x3Error: null }
  } catch (e) {
    logger.error({ err: e }, '[expeditions] forecast — échec chargement')
    const empty = buildExpeditionForecast({
      impacts: [],
      rawDemands: [],
      coefs: new Map(),
      today: todayIso,
      horizonDays: horizon,
      capaciteJour: CAPACITE_JOUR_PALETTES,
      nbDepartsQuotidiens: NB_DEPARTS_QUOTIDIENS,
      camionCapacitePalettes: CAMION_CAPACITE_PALETTES,
    })
    return {
      forecast: empty,
      x3Error: 'Données X3 indisponibles — prévision momentanément incalculable.',
    }
  }
}
