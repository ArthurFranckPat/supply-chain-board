import { type HttpContext } from '@adonisjs/core/http'
import { isoLocalDay } from '#app/domain/shortages'
import {
  DEFAULT_HORIZON_DAYS,
  loadReceptionCriticite,
  loadReceptionPayloadSafe,
  spanDays,
  type DayChargeDisplay,
  type ReceptionCriticite,
  type ReceptionDisplayRow,
  type ReceptionsPayloadStats,
} from '#services/reception_payload_loader'

/**
 * Page « Réceptions fournisseurs » : planning des réceptions attendues + charge palettes
 * par jour pour anticiper la charge du service réception.
 *
 * Même motif que /ruptures : coquille Inertia instantanée, calcul lourd
 * (X3 + calcul palette + agrégation) chargé en différé via /api/v1/receptions/rows.
 *
 * Le calcul lui-même vit dans `#services/reception_payload_loader` — partagé avec le
 * tool agent `listerReceptions` pour que l'écran et le copilote ne puissent pas
 * diverger.
 */

// Ré-exports de compatibilité : les types du payload appartiennent au loader, mais
// restent importables depuis le controller (point d'entrée historique).
export type {
  DayChargeDisplay,
  ReceptionCriticite,
  ReceptionDisplayRow,
} from '#services/reception_payload_loader'

export interface ReceptionsCriticiteResponse {
  items: ReceptionCriticite[]
  /** Fenêtre effective du calcul ruptures (OF démarrant dans les N jours). */
  horizonDays: number
  x3Error: string | null
}

export interface ReceptionsRowsResponse {
  rows: ReceptionDisplayRow[]
  chargeByDay: DayChargeDisplay[]
  stats: ReceptionsPayloadStats
  range: { from: string; to: string; horizonDays: number }
  x3Error: string | null
}

export default class ReceptionsController {
  /** GET /receptions — coquille Inertia (instantanée, aucun calcul X3). */
  async index(ctx: HttpContext) {
    const today = isoLocalDay()
    const from = (ctx.request.input('from') as string | undefined) || today
    const horizon = Number(ctx.request.input('horizon')) || DEFAULT_HORIZON_DAYS

    // Calcule `to` côté serveur pour le shell (cohérent avec l'endpoint rows).
    const toMs = Date.parse(`${from}T00:00:00Z`)
    const to =
      Number.isFinite(toMs) && horizon > 0
        ? new Date(toMs + horizon * 86_400_000).toISOString().slice(0, 10)
        : new Date(Date.now() + horizon * 86_400_000).toISOString().slice(0, 10)

    const params = new URLSearchParams({ from, to })
    const rowsHref = `/api/v1/receptions/rows?${params.toString()}`

    return ctx.inertia.render('receptions', {
      from,
      to,
      horizon,
      rowsHref,
      // Second fragment différé, indépendant : criticité (jointure ruptures).
      criticiteHref: `/api/v1/receptions/criticite?${params.toString()}`,
      todayHref: `/receptions?from=${today}&horizon=${DEFAULT_HORIZON_DAYS}`,
      defaultHorizon: DEFAULT_HORIZON_DAYS,
    })
  }

  /** GET /api/v1/receptions/rows — planning réceptions (calcul lourd différé + cache SWR). */
  async rows(ctx: HttpContext) {
    const today = isoLocalDay()
    const from = (ctx.request.input('from') as string | undefined) || today
    const to = (ctx.request.input('to') as string | undefined) || from
    const force = ctx.request.input('refresh') === '1'

    const { rows, chargeByDay, stats, x3Error } = await loadReceptionPayloadSafe({
      from,
      to,
      force,
    })

    const response: ReceptionsRowsResponse = {
      rows,
      chargeByDay,
      stats,
      // Horizon dérivé (pour les KPI/affichage).
      range: { from, to, horizonDays: spanDays(from, to) },
      x3Error,
    }
    return response
  }

  /**
   * GET /api/v1/receptions/criticite — quelles réceptions attendues débloquent une
   * rupture, et avec quelle marge (issue #82, ouvre la voie à #76).
   *
   * Endpoint SÉPARÉ de /rows, délibérément : le pipeline ruptures est lourd (~18 s
   * à froid) là où /receptions est tenu rapide. Ici le board s'affiche d'abord, les
   * badges arrivent après ; en cas d'échec il reste pleinement utilisable, badges en
   * moins.
   */
  async criticite(ctx: HttpContext) {
    const today = isoLocalDay()
    const from = (ctx.request.input('from') as string | undefined) || today
    const to = (ctx.request.input('to') as string | undefined) || from
    const force = ctx.request.input('refresh') === '1'

    // Horizon ruptures aligné sur la plage du board : le moteur scope les OF par date
    // de DÉBUT, donc une réception ne peut être dite critique que vis-à-vis des OF
    // démarrant dans cette fenêtre.
    const response: ReceptionsCriticiteResponse = await loadReceptionCriticite({
      from,
      horizonDays: spanDays(from, to),
      force,
    })
    return response
  }
}
