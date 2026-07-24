/**
 * Détail d'un article pour la sheet du KPI stock — historique 52 semaines
 * (rembobinage STOJOU, cf. StockValuationRepository.getArticleStockHistory)
 * + projection 52 semaines du stock à partir des besoins et ressources à
 * venir. Même motif que charge_detail_loader : aucune requête X3 dédiée, tout
 * passe par les caches SWR partagés de boardDataset (historique article,
 * demande/réceptions par fenêtre, OF ouverts) ; seul l'article cliqué est
 * filtré et assemblé ici.
 *
 * Conventions de projection :
 *  - Besoins : demande client à livrer, fermes (WIPSTA 1) + prévisions
 *    (WIPSTA 3) — ce que getDemandAndReception remonte déjà.
 *  - Ressources : réceptions attendues (achats) + OF ouverts fermes/planifiés
 *    (suggérés exclus — trop de bruit pour une projection stock).
 *  - Seaux : S+1 … S+52 (lundis ISO) ; les flux datés avant S+1 (retards)
 *    sont clampés en S+1 — ils restent à passer et joueront sous peu.
 *  - stockProjeté(S+k) = stockActuel + Σ_{j≤k} (ressources − besoins), borné
 *    à 0 chaque semaine (le stock physique ne peut pas être négatif — même
 *    plancher que l'historique).
 *  - Valorisation au PMP actuel (même convention que l'historique).
 */

import cache from '@adonisjs/cache/services/main'
import boardDataset from '#services/board_dataset'
import type { Flow } from '#app/domain/models/flow'
import {
  isoWeekKey,
  type StockArticleHistory,
} from '#repositories/stock_valuation_repository'

/** Point hebdomadaire de la projection (seaux S+1 … S+52). */
export interface StockFuturePoint {
  periode: string // clé YYYY-Www (semaine ISO)
  label: string
  besoinQte: number
  besoinVal: number
  ressourceQte: number
  ressourceVal: number
  stockQte: number // stock projeté fin de semaine (borné ≥ 0)
  stockVal: number
}

export interface StockArticleDetail extends StockArticleHistory {
  future: StockFuturePoint[]
}

export interface StockArticleDetailResult {
  detail: StockArticleDetail | null
  x3Error: string | null
}

export interface StockArticleDetailParams {
  article: string
  referenceDate?: Date
}

/** Erreur de paramètre — le contrôleur la traduit en 400. */
export class StockDetailBadRequest extends Error {}

const WEEKS = 52

const isoDay = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** Recule `d` au lundi de sa semaine (UTC). */
const toMonday = (d: Date): Date => {
  const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  m.setUTCDate(m.getUTCDate() + 1 - (m.getUTCDay() || 7))
  return m
}

export async function loadStockArticleDetail(
  params: StockArticleDetailParams
): Promise<StockArticleDetailResult> {
  const article = params.article.trim()
  if (!article) throw new StockDetailBadRequest('Article manquant')
  const refDate = params.referenceDate ?? new Date()

  const cacheKey = `detail:stock-article:${article}:${isoDay(refDate)}`
  return cache.namespace('stock').getOrSet({
    key: cacheKey,
    ttl: 2 * 60 * 1000,
    timeout: 0,
    factory: async (): Promise<StockArticleDetailResult> => {
      const history = await boardDataset.getStockArticleHistory(article, refDate)
      if (!history) return { detail: null, x3Error: null }

      // --- Flux futurs depuis les caches partagés (tous sites) ---
      const fromIso = isoDay(refDate)
      const horizon = new Date(refDate.getTime() + WEEKS * 7 * 86_400_000)
      const toIso = isoDay(horizon)

      let x3Error: string | null = null
      let demandFlows: Flow[] = []
      let receptionFlows: Flow[] = []
      let ofFlows: Flow[] = []

      try {
        const dr = await boardDataset.getDemandAndReception(fromIso, toIso)
        demandFlows = dr.demand.filter((f) => f.article === article)
        receptionFlows = dr.reception.filter((f) => f.article === article)
      } catch {
        x3Error =
          'Données X3 indisponibles — projection des besoins/réceptions momentanément incalculable.'
      }
      try {
        const orders = await boardDataset.getOrders()
        ofFlows = orders.supply.filter(
          (f) =>
            f.article === article &&
            f.origin.type === 'of' &&
            (f.origin.status === 1 || f.origin.status === 2)
        )
      } catch {
        if (!x3Error) {
          x3Error = 'Données X3 indisponibles — projection des OF momentanément incalculable.'
        }
      }

      // --- Seaux hebdomadaires S+1 … S+52 ---
      const firstMonday = new Date(toMonday(refDate).getTime() + 7 * 86_400_000)
      const weeks: Array<{ key: string; label: string }> = []
      for (let i = 0; i < WEEKS; i++) {
        const monday = new Date(firstMonday.getTime() + i * 7 * 86_400_000)
        const key = isoWeekKey(monday)
        weeks.push({ key, label: `sem. ${key.slice(-2)}` })
      }
      const firstKey = weeks[0].key
      const lastKey = weeks[weeks.length - 1].key

      const byWeek = new Map<string, { besoin: number; ressource: number }>()
      for (const w of weeks) byWeek.set(w.key, { besoin: 0, ressource: 0 })

      // Seau d'un flux : sa semaine ISO, les retards (avant S+1) clampés en S+1.
      const bucketOf = (d: Date | null): string | null => {
        const k = d ? isoWeekKey(d) : firstKey
        if (k > lastKey) return null // au-delà de l'horizon
        return k < firstKey ? firstKey : k
      }

      for (const f of demandFlows) {
        const k = bucketOf(f.date)
        if (k) byWeek.get(k)!.besoin += f.quantity
      }
      for (const f of [...receptionFlows, ...ofFlows]) {
        const k = bucketOf(f.date)
        if (k) byWeek.get(k)!.ressource += f.quantity
      }

      // --- Projection cumulée depuis le stock actuel, bornée à 0 ---
      const pmp = history.pmp
      const round2 = (v: number) => Math.round(v * 100) / 100
      let running = history.stock
      const future: StockFuturePoint[] = weeks.map((w) => {
        const { besoin, ressource } = byWeek.get(w.key)!
        running = Math.max(0, running + ressource - besoin)
        return {
          periode: w.key,
          label: w.label,
          besoinQte: round2(besoin),
          besoinVal: round2(besoin * pmp),
          ressourceQte: round2(ressource),
          ressourceVal: round2(ressource * pmp),
          stockQte: round2(running),
          stockVal: round2(running * pmp),
        }
      })

      return { detail: { ...history, future }, x3Error }
    },
  })
}
