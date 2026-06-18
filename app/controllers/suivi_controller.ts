import { HttpContext } from '@adonisjs/core/http'
import { assignStatuses, type OrderLine, type StockBreakdown, type SuiviStatus, type TypeCommande } from '#app/domain/suivi'
import { X3OfRepository } from '#repositories/of_repository'
import { X3StockRepository } from '#repositories/stock_repository'
import { X3ReceptionRepository } from '#repositories/reception_repository'
import { X3BesoinClientRepository } from '#repositories/besoin_client_repository'
import type { Flow } from '#app/domain/models/flow'

export default class SuiviController {

  /**
   * POST /api/v1/status/assign
   * Body: { lines: OrderLine[], stock: Record<string, StockBreakdown>, referenceDate?: string }
   */
  async assign({ request }: HttpContext) {
    const { lines: rawLines, stock: stockRaw, referenceDate } = request.only(['lines', 'stock', 'referenceDate'])

    const lines = ((rawLines ?? []) as any[]).map((l: any) => ({
      ...l,
      dateExpedition: l.dateExpedition ? new Date(l.dateExpedition) : null,
      dateLivPrevu: l.dateLivPrevu ? new Date(l.dateLivPrevu) : null,
    })) as OrderLine[]

    const stock = new Map<string, StockBreakdown>(
      Object.entries(stockRaw ?? {}).map(([article, bd]) => [article, bd as StockBreakdown])
    )

    const refDate = referenceDate ? new Date(referenceDate) : new Date()

    const assignments = assignStatuses(lines, stock, refDate)

    const statusCounts = buildStatusCounts(assignments.map((a) => a.status))

    return {
      total_rows: assignments.length,
      status_counts: statusCounts,
      assignments: assignments.map((a) => ({
        numCommande: a.line.numCommande,
        article: a.line.article,
        status: a.status,
        besoinNet: a.besoinNet,
        qteAlloueeVirtuelle: a.qteAlloueeVirtuelle,
        utiliseStockSousCq: a.utiliseStockSousCq,
      })),
    }
  }

  /**
   * POST /api/v1/status/from-latest-export
   * Fetch order lines + stock from X3, assign statuses automatically.
   */
  async fromLatestExport(ctx: HttpContext) {
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
    const statusCounts = buildStatusCounts(assignments.map((a) => a.status))

    return {
      total_rows: assignments.length,
      status_counts: statusCounts,
      assignments: assignments.map((a) => ({
        numCommande: a.line.numCommande,
        article: a.line.article,
        status: a.status,
        besoinNet: a.besoinNet,
        qteAlloueeVirtuelle: a.qteAlloueeVirtuelle,
        utiliseStockSousCq: a.utiliseStockSousCq,
      })),
    }
  }

  /**
   * GET /api/v1/status/status/:order
   * Fetch order detail + matching supply flows from X3.
   */
  async statusDetail(ctx: HttpContext) {
    const demandFlows = await new X3BesoinClientRepository().getDemandFlows()

    const orderLines = demandFlows.filter(
      (f) => f.origin.type === 'order' && (f.origin as any).id === ctx.params.order,
    )

    if (orderLines.length === 0) {
      return ctx.response.notFound({ message: `Commande ${ctx.params.order} non trouvee` })
    }

    const stockFlows = await new X3StockRepository().getStockFlows()
    const receptionFlows = await new X3ReceptionRepository().getReceptionFlows()
    const ofFlows = await new X3OfRepository().getSupplyFlows()

    const details = orderLines.map((demand) => {
      const origin = demand.origin as Extract<Flow['origin'], { type: 'order' }>
      const supplyFlows = [...stockFlows, ...receptionFlows, ...ofFlows].filter(
        (s) => s.article === demand.article && s.direction === 'supply',
      )

      return {
        article: demand.article,
        quantity: demand.quantity,
        dateExpedition: demand.date?.toISOString().slice(0, 10) ?? null,
        customer: origin.customer,
        orderType: origin.orderType,
        supply: supplyFlows.map((s) => ({
          type: s.origin.type,
          quantity: s.quantity,
          date: s.date?.toISOString().slice(0, 10) ?? null,
          id: (s.origin as any).id ?? '',
        })),
      }
    })

    return { no_commande: ctx.params.order, lines: details }
  }

  /**
   * POST /api/v1/status/palette
   * Group order lines by shipment palette.
   * Body: { lines: OrderLine[] } or fetch from X3.
   */
  async palette(ctx: HttpContext) {
    const { lines: inputLines } = ctx.request.only(['lines'])
    const demandFlows = await new X3BesoinClientRepository().getDemandFlows()

    const lines = inputLines ?? demandFlows.filter((f) => f.origin.type === 'order')

    const groups = new Map<string, { customer: string; articles: Map<string, number> }>()
    for (const line of lines) {
      const origin = line.origin ?? (line as any).origin
      const customer = origin?.customer ?? ''
      if (!groups.has(customer)) {
        groups.set(customer, { customer, articles: new Map() })
      }
      const article = line.article ?? (line as any).article
      const qty = line.quantity ?? (line as any).qteRestante ?? 0
      const group = groups.get(customer)!
      group.articles.set(article, (group.articles.get(article) ?? 0) + qty)
    }

    const lignes = Array.from(groups.values()).map((g) => ({
      customer: g.customer,
      articles: Array.from(g.articles.entries()).map(([article, quantity]) => ({ article, quantity })),
      total: Array.from(g.articles.values()).reduce((s, q) => s + q, 0),
    }))

    const totaux = {
      customers: groups.size,
      totalArticles: lignes.reduce((s, l) => s + l.articles.length, 0),
      totalQuantity: lignes.reduce((s, l) => s + l.total, 0),
    }

    return { lignes, totaux }
  }

  /**
   * POST /api/v1/status/retard-charge
   * Analyze late orders and compute charge impact.
   */
  async retardCharge(ctx: HttpContext) {
    const referenceDate = ctx.request.input('referenceDate')
    const refDate = referenceDate ? new Date(referenceDate) : new Date()

    const [demandFlows, ofFlows, stockFlows] = await Promise.all([
      new X3BesoinClientRepository().getDemandFlows(),
      new X3OfRepository().getSupplyFlows(),
      new X3StockRepository().getStockFlows(),
    ])

    const lateDemands = demandFlows.filter(
      (f) => f.origin.type === 'order' && f.date && f.date < refDate,
    )

    const stockMap = new Map<string, number>()
    for (const f of stockFlows) {
      stockMap.set(f.article, (stockMap.get(f.article) ?? 0) + f.quantity)
    }

    const items = lateDemands.map((demand) => {
      const origin = demand.origin as Extract<Flow['origin'], { type: 'order' }>
      const available = stockMap.get(demand.article) ?? 0
      const shortage = Math.max(0, demand.quantity - available)
      const relatedOfs = ofFlows.filter(
        (of) => of.article === demand.article && of.direction === 'supply',
      )

      return {
        order: origin.id,
        customer: origin.customer,
        article: demand.article,
        quantity: demand.quantity,
        available,
        shortage,
        dateExpedition: demand.date!.toISOString().slice(0, 10),
        relatedOfs: relatedOfs.map((of) => ({
          numOf: (of.origin as any).id,
          quantity: of.quantity,
          date: of.date?.toISOString().slice(0, 10) ?? null,
        })),
      }
    })

    return { items, total_heures: items.length, reference_date: refDate.toISOString().slice(0, 10) }
  }
}

function buildStatusCounts(statuses: SuiviStatus[]): Record<SuiviStatus, number> {
  const counts: Record<SuiviStatus, number> = {
    A_EXPEDIER: 0,
    ALLOCATION_A_FAIRE: 0,
    RETARD_PROD: 0,
    RAS: 0,
  }
  for (const s of statuses) {
    counts[s]++
  }
  return counts
}
