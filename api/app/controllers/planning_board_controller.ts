import { HttpContext } from '@adonisjs/core/http'
import { OverrideStore } from '#services/override_store'
import { mergeOfWithOverride, type OfFromErp } from '#app/domain/planning_board'
import { checkFeasibility, type FeasibilityResult } from '#app/domain/feasibility'
import { matchOrders } from '#app/domain/orders'
import { X3OfRepository } from '#repositories/of_repository'
import { X3StockRepository } from '#repositories/stock_repository'
import { X3ReceptionRepository } from '#repositories/reception_repository'
import { X3BesoinClientRepository } from '#repositories/besoin_client_repository'
import type { X3Queryable } from '#app/x3/types'
import type { Flow } from '#app/domain/models/flow'
import type { Article } from '#app/domain/models/article'
import type { Nomenclature } from '#app/domain/models/nomenclature'

export default class PlanningBoardController {
  private get store() {
    return new OverrideStore()
  }

  private async getX3(ctx: HttpContext): Promise<X3Queryable> {
    return ctx.containerResolver.make('x3')
  }

  async index(ctx: HttpContext) {
    const windowStart = ctx.request.input('windowStart')
    const windowEnd = ctx.request.input('windowEnd')

    const ofFlows = await new X3OfRepository().getSupplyFlows()

    const overrides = await this.store.getAll()
    const overrideMap = new Map(overrides.map((o) => [o.numOf, o]))

    const erpOfs: OfFromErp[] = ofFlows.map((f) => ({
      numOf: (f.origin as any).id,
      article: f.article,
      description: '',
      statutNum: (f.origin as any).status ?? 3,
      dateDebut: new Date(f.date ?? Date.now()),
      dateFin: f.date ?? new Date(),
      qteRestante: f.quantity,
    }))

    const merged = erpOfs.map((of) => mergeOfWithOverride(of, overrideMap.get(of.numOf) ?? null))

    const filtered = windowStart && windowEnd
      ? merged.filter((of) => {
          const end = new Date(of.dateFin)
          return end >= new Date(windowStart) && end <= new Date(windowEnd)
        })
      : merged

    return { ofs: filtered, total: filtered.length }
  }

  async show(ctx: HttpContext) {
    const ofFlows = await new X3OfRepository().getSupplyFlows()

    const match = ofFlows.find((f) => (f.origin as any).id === ctx.params.numOf)
    if (!match) {
      return ctx.response.notFound({ message: `OF ${ctx.params.numOf} not found` })
    }

    const erpOf: OfFromErp = {
      numOf: ctx.params.numOf,
      article: match.article,
      description: '',
      statutNum: (match.origin as any).status ?? 3,
      dateDebut: new Date(match.date ?? Date.now()),
      dateFin: match.date ?? new Date(),
      qteRestante: match.quantity,
    }

    const override = await this.store.get(ctx.params.numOf)
    return mergeOfWithOverride(erpOf, override)
  }

  async update(ctx: HttpContext) {
    const { dateDebut, dateFin, status, note } = ctx.request.only(['dateDebut', 'dateFin', 'status', 'note'])
    await this.store.save(ctx.params.numOf, { dateDebut, dateFin, status, note })

    return {
      numOf: ctx.params.numOf,
      dateDebut: dateDebut ?? null,
      dateFin: dateFin ?? null,
      status: status ?? null,
      note: note ?? null,
      modified: true,
    }
  }

  async resetOverride(ctx: HttpContext) {
    const deleted = await this.store.delete(ctx.params.numOf)
    return ctx.response.ok({ numOf: ctx.params.numOf, reset: deleted })
  }

  async listOverrides(_ctx: HttpContext) {
    const overrides = await this.store.getAll()
    return { overrides, total: overrides.length }
  }

  async resetAll(_ctx: HttpContext) {
    const deleted = await this.store.deleteAll()
    return { deleted }
  }

  async feasibility(ctx: HttpContext) {
    const { articles: articlesInput, nomenclatures: nomInput, upToDate } = ctx.request.only([
      'articles', 'nomenclatures', 'upToDate',
    ])

    const x3 = await this.getX3(ctx)
    const [ofFlows, stockFlows, receptionFlows] = await Promise.all([
      new X3OfRepository().getSupplyFlows(),
      new X3StockRepository(x3).getStockFlows(),
      new X3ReceptionRepository(x3).getReceptionFlows(),
    ])

    const allFlows: Flow[] = [...ofFlows, ...stockFlows, ...receptionFlows]

    const articles = new Map<string, Article>(
      (articlesInput ?? []).map((a: Article) => [a.code, a])
    )
    const nomenclatures = new Map<string, Nomenclature>(
      (nomInput ?? []).map((n: Nomenclature) => [n.article, n])
    )

    const ofsToCheck = ofFlows.map((f) => ({
      article: f.article,
      quantity: f.quantity,
    }))

    const upToDateDate = upToDate ? new Date(upToDate) : undefined

    const results: Record<string, FeasibilityResult> = {}
    let feasibleCount = 0
    let blockedCount = 0

    for (const of of ofsToCheck) {
      const key = `${of.article} (${of.quantity})`
      const result = checkFeasibility(of.article, of.quantity, allFlows, nomenclatures, articles, upToDateDate)
      results[key] = result
      if (result.feasible) feasibleCount++
      else blockedCount++
    }

    return {
      results,
      stats: { total: ofsToCheck.length, feasible: feasibleCount, blocked: blockedCount },
    }
  }

  async whatif(ctx: HttpContext) {
    const body = ctx.request.only(['overrides', 'articles'])
    const whatifOverrides = (body.overrides ?? []) as Array<{ numOf: string; dateFin?: string; status?: number }>
    const articlesInput = body.articles

    const x3 = await this.getX3(ctx)
    const [ofFlows, stockFlows, receptionFlows, demandFlows] = await Promise.all([
      new X3OfRepository().getSupplyFlows(),
      new X3StockRepository(x3).getStockFlows(),
      new X3ReceptionRepository(x3).getReceptionFlows(),
      new X3BesoinClientRepository(x3).getDemandFlows(),
    ])

    const articles = new Map<string, Article>(
      (articlesInput ?? []).map((a: Article) => [a.code, a])
    )

    const overrideMap = new Map(whatifOverrides.map((o) => [o.numOf, o]))

    const modifiedFlows = ofFlows.map((f) => {
      const sim = overrideMap.get((f.origin as any).id)
      if (!sim) return f
      return {
        ...f,
        date: sim.dateFin ? new Date(sim.dateFin) : f.date,
        origin: { ...f.origin, status: sim.status ?? (f.origin as any).status },
      }
    })

    const allSupply = [...modifiedFlows, ...stockFlows, ...receptionFlows]
    const matches = matchOrders(demandFlows, allSupply, articles)

    return {
      simulated: true,
      overrideCount: overrideMap.size,
      orderMatching: {
        total: matches.length,
        covered: matches.filter((m) => m.uncovered === 0).length,
        partial: matches.filter((m) => m.uncovered > 0 && m.coveredByOf.length > 0).length,
        uncovered: matches.filter((m) => m.method === 'none').length,
      },
      details: matches.map((m) => ({
        article: m.demandFlow.article,
        method: m.method,
        coveredByStock: m.coveredByStock,
        coveredByOf: m.coveredByOf,
        uncovered: m.uncovered,
        alerts: m.alerts,
      })),
    }
  }

  async orderImpacts(ctx: HttpContext) {
    const { articles: articlesInput } = ctx.request.only(['articles'])

    const x3 = await this.getX3(ctx)
    const [ofFlows, stockFlows, receptionFlows, demandFlows] = await Promise.all([
      new X3OfRepository().getSupplyFlows(),
      new X3StockRepository(x3).getStockFlows(),
      new X3ReceptionRepository(x3).getReceptionFlows(),
      new X3BesoinClientRepository(x3).getDemandFlows(),
    ])

    const articles = new Map<string, Article>(
      (articlesInput ?? []).map((a: Article) => [a.code, a])
    )

    const allSupply = [...ofFlows, ...stockFlows, ...receptionFlows]
    const matches = matchOrders(demandFlows, allSupply, articles)

    const impacts = matches.map((m) => {
      const demand = m.demandFlow
      const origin = demand.origin as any
      return {
        article: demand.article,
        order: origin.id ?? '',
        customer: origin.customer ?? '',
        orderType: origin.orderType ?? 'NOR',
        quantity: demand.quantity,
        date: demand.date?.toISOString().slice(0, 10) ?? null,
        method: m.method,
        coveredByStock: m.coveredByStock,
        coveredByOf: m.coveredByOf,
        uncovered: m.uncovered,
        risk: m.uncovered > 0 ? 'shortage' : m.alerts.length > 0 ? 'warning' : 'ok',
      }
    })

    const shortages = impacts.filter((i) => i.risk === 'shortage')
    const warnings = impacts.filter((i) => i.risk === 'warning')

    return {
      impacts,
      summary: { total: impacts.length, ok: impacts.length - shortages.length - warnings.length, warnings: warnings.length, shortages: shortages.length },
    }
  }

  async listEvents(ctx: HttpContext) {
    const windowStart = ctx.request.input('windowStart')
    const windowEnd = ctx.request.input('windowEnd')

    const ofFlows = await new X3OfRepository().getSupplyFlows()

    const overrides = await this.store.getAll()
    const overrideMap = new Map(overrides.map((o) => [o.numOf, o]))

    const events = ofFlows
      .map((f) => {
        const override = overrideMap.get((f.origin as any).id)
        const dateStr = override?.dateFin ?? f.date?.toISOString().slice(0, 10) ?? null
        if (!dateStr) return null

        if (windowStart && windowEnd) {
          const d = new Date(dateStr)
          if (d < new Date(windowStart) || d > new Date(windowEnd)) return null
        }

        return {
          numOf: (f.origin as any).id,
          article: f.article,
          date: dateStr,
          quantity: f.quantity,
          status: override?.status ?? (f.origin as any).status ?? 3,
          modified: !!override,
        }
      })
      .filter(Boolean)
      .sort((a, b) => (a!.date > b!.date ? 1 : -1))

    return { events, total: events.length }
  }
}
