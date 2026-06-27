import { HttpContext } from '@adonisjs/core/http'
import { X3OfRepository } from '#repositories/of_repository'
import { X3StockRepository } from '#repositories/stock_repository'
import { X3BesoinClientRepository } from '#repositories/besoin_client_repository'
import boardDataset from '#services/board_dataset'
import { matchOrders } from '#app/domain/orders'
import { assignStatuses, type OrderLine, type StockBreakdown, type SuiviStatus, type TypeCommande } from '#app/domain/suivi'
import { snapshot } from '#app/domain/availability'
import type { Flow } from '#app/domain/models/flow'
import type { Article } from '#app/domain/models/article'

export default class PipelineController {

  async supplyBoard(ctx: HttpContext) {
    const { articles: articlesInput, horizonDate } = ctx.request.only(['articles', 'horizonDate'])
    const horizon = horizonDate ? new Date(horizonDate) : new Date(Date.now() + 30 * 24 * 3600 * 1000)

    const [ofFlows, stockFlows, receptionFlows, demandFlows] = await Promise.all([
      new X3OfRepository().getSupplyFlows(),
      new X3StockRepository().getStockFlows(),
      boardDataset.getReceptions(),
      new X3BesoinClientRepository().getDemandFlows(),
    ])

    const articles = new Map<string, Article>(
      (articlesInput ?? []).map((a: Article) => [a.code, a])
    )

    const allFlows = [...ofFlows, ...stockFlows, ...receptionFlows]
    const allArticles = new Set(allFlows.map((f) => f.article))

    const snapshots = Array.from(allArticles).map((article) =>
      snapshot(allFlows, article, horizon)
    )

    const matches = matchOrders(demandFlows, allFlows, articles)

    return {
      timestamp: new Date().toISOString(),
      horizon: horizon.toISOString().slice(0, 10),
      articles: snapshots,
      orderMatching: {
        total: matches.length,
        covered: matches.filter((m) => m.uncovered === 0).length,
        partial: matches.filter((m) => m.uncovered > 0 && m.coveredByOf.length > 0).length,
        uncovered: matches.filter((m) => m.method === 'none').length,
      },
    }
  }

  /**
   * POST /api/v1/pipeline/suivi-status
   * Combined suivi status from X3 data.
   * Body: { referenceDate?: string }
   */
  async suiviStatus(ctx: HttpContext) {
    const referenceDate = ctx.request.input('referenceDate')
    const refDate = referenceDate ? new Date(referenceDate) : new Date()

    const [demandFlows, stockFlows] = await Promise.all([
      new X3BesoinClientRepository().getDemandFlows(),
      new X3StockRepository().getStockFlows(),
    ])

    const orderFlows = demandFlows.filter((f) => f.origin.type === 'order')

    const lines: OrderLine[] = orderFlows.map((f) => {
      const origin = f.origin as Extract<Flow['origin'], { type: 'order' }>
      return {
        numCommande: origin.id,
        ligne: String(origin.ligne ?? '').trim(),
        article: f.article,
        designation: '',
        nomClient: origin.customer,
        typeCommande: (origin.orderType ?? 'NOR') as TypeCommande,
        dateExpedition: f.date,
        dateLivPrevu: null,
        qteCommandee: f.quantity,
        qteAllouee: 0,
        qteRestante: f.quantity,
        isFabrique: false,
        isHardPegged: origin.orderType === 'MTS',
        emplacements: [],
      }
    })

    const stock = new Map<string, StockBreakdown>()
    for (const f of stockFlows) {
      const existing = stock.get(f.article) ?? { strict: 0, qc: 0, total: 0 }
      const origin = f.origin as any
      if (origin.subType === 'qc') {
        existing.qc += f.quantity
      } else {
        existing.strict += f.quantity
      }
      existing.total += f.quantity
      stock.set(f.article, existing)
    }

    const assignments = assignStatuses(lines, stock, refDate)

    const statusCounts: Record<SuiviStatus, number> = {
      A_EXPEDIER: 0,
      ALLOCATION_A_FAIRE: 0,
      RETARD_PROD: 0,
      RAS: 0,
    }
    for (const a of assignments) {
      statusCounts[a.status]++
    }

    return {
      timestamp: new Date().toISOString(),
      total_rows: assignments.length,
      status_counts: statusCounts,
    }
  }
}
