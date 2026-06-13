import { HttpContext } from '@adonisjs/core/http'
import { OverrideStore } from '#services/override_store'
import { mergeOfWithOverride, type OfFromErp } from '#app/domain/planning_board'
import { checkFeasibility, type FeasibilityResult } from '#app/domain/feasibility'
import { matchOrders } from '#app/domain/orders'
import { evaluateOrderImpacts } from '#app/domain/order-impacts'
import { X3OfRepository } from '#repositories/of_repository'
import { X3GammeRepository } from '#repositories/gamme_repository'
import { X3StockRepository } from '#repositories/stock_repository'
import { X3ReceptionRepository } from '#repositories/reception_repository'
import { X3BesoinClientRepository } from '#repositories/besoin_client_repository'
import { X3NomenclatureRepository } from '#repositories/nomenclature_repository'
import type { Flow } from '#app/domain/models/flow'
import type { Article } from '#app/domain/models/article'
import type { Nomenclature } from '#app/domain/models/nomenclature'

export default class PlanningBoardController {
  private get store() {
    return new OverrideStore()
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

  /**
   * Tableau d'ordonnancement (drag & drop), façon Gantt.
   * Lignes = postes de charge (gamme), colonnes = jours.
   * Chaque OF s'étend de sa date de début à sa date de fin.
   * Rend la vue `board.edge`.
   */
  async board(ctx: HttpContext) {
    const startParam = ctx.request.input('start') as string | undefined
    const daysParam = Number.parseInt(ctx.request.input('days', '14'), 10)
    const horizon = Number.isFinite(daysParam) && daysParam > 0 && daysParam <= 90 ? daysParam : 14

    const windowStart = startParam ? new Date(startParam) : new Date()
    windowStart.setHours(0, 0, 0, 0)

    const [mos, gammeOps, overrides] = await Promise.all([
      new X3OfRepository().getManufacturingOrders(),
      new X3GammeRepository().getFirstOperations().catch(() => []),
      this.store.getAll(),
    ])

    const overrideMap = new Map(overrides.map((o) => [o.numOf, o]))
    const gammeMap = new Map(gammeOps.map((g) => [g.article, g]))

    const wstLabels = new Map<string, string>()
    for (const g of gammeOps) {
      if (g.workstation) wstLabels.set(g.workstation, g.workstationLabel || g.workstation)
    }

    const DAY = 86400000
    const isoDay = (d: Date) => {
      const y = d.getFullYear()
      const m = String(d.getMonth() + 1).padStart(2, '0')
      const da = String(d.getDate()).padStart(2, '0')
      return `${y}-${m}-${da}`
    }
    const atMidnight = (d: Date) => {
      const x = new Date(d)
      x.setHours(0, 0, 0, 0)
      return x
    }
    const diffDays = (a: Date, b: Date) =>
      Math.round((atMidnight(a).getTime() - atMidnight(b).getTime()) / DAY)

    const isoWeek = (d: Date) => {
      const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
      const dow = t.getUTCDay() || 7
      t.setUTCDate(t.getUTCDate() + 4 - dow)
      const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
      return Math.ceil(((t.getTime() - yearStart.getTime()) / DAY + 1) / 7)
    }

    // Colonnes = jours ouvrés seulement (week-ends exclus).
    const colDates: Date[] = []
    for (let i = 0; i < horizon; i++) {
      const d = atMidnight(windowStart)
      d.setDate(windowStart.getDate() + i)
      const dow = d.getDay()
      if (dow !== 0 && dow !== 6) colDates.push(d)
    }

    const dayHours = new Array<number>(colDates.length).fill(0)

    const days: {
      idx: number
      iso: string
      weekday: string
      dayNum: string
      weekNum: number
      weekStart: boolean
      hours: number
    }[] = colDates.map((d, idx) => {
      const wk = isoWeek(d)
      return {
        idx,
        iso: isoDay(d),
        weekday: d.toLocaleDateString('fr-FR', { weekday: 'short' }),
        dayNum: d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }),
        weekNum: wk,
        weekStart: idx === 0 || isoWeek(colDates[idx - 1]) !== wk,
        hours: 0,
      }
    })

    type Common = {
      numOf: string
      article: string
      designation: string
      qty: number
      status: number
      statutLabel: string
      modified: boolean
      note: string | null
      spanDays: number
      startIso: string
      endIso: string
      hours: number
    }
    type Bar = Common & { startIdx: number; span: number; contLeft: boolean; contRight: boolean }
    type Card = Common & { workstation: string | null }

    const barsByLine = new Map<string, Bar[]>()
    const backlog: Card[] = []
    const ofData: Record<string, unknown> = {}

    for (const mo of mos) {
      const ov = overrideMap.get(mo.numOf) ?? null
      const wst = ov?.workstation ?? gammeMap.get(mo.article)?.workstation ?? null
      if (wst && !wstLabels.has(wst)) wstLabels.set(wst, wst)

      let start = ov?.dateDebut ? new Date(ov.dateDebut) : mo.startDate
      let end = ov?.dateFin ? new Date(ov.dateFin) : mo.endDate
      if (!start && end) start = end
      if (!end && start) end = start
      if (start && end && end < start) end = start

      const status = ov?.status ?? mo.status
      const spanDays = start && end ? Math.max(1, diffDays(end, start) + 1) : 1
      const rate = gammeMap.get(mo.article)?.rate ?? 0
      const hours = rate > 0 ? mo.quantity / rate : 0

      const startIso = start ? isoDay(start) : ''
      const endIso = end ? isoDay(end) : ''

      const common: Common = {
        numOf: mo.numOf,
        article: mo.article,
        designation: mo.designation ?? '',
        qty: mo.quantity,
        status,
        statutLabel: mo.statutLabel ?? String(status),
        modified: !!ov,
        note: ov?.note ?? null,
        spanDays,
        startIso,
        endIso,
        hours: Math.round(hours * 10) / 10,
      }

      // Détails OF pour le panneau (tous les OF, placés ou non).
      ofData[mo.numOf] = {
        numOf: mo.numOf,
        article: mo.article,
        designation: mo.designation ?? '',
        statutLabel: mo.statutLabel ?? String(status),
        typeOfLabel: mo.typeOfLabel ?? null,
        workstation: wst,
        workstationLabel: wst ? (wstLabels.get(wst) ?? wst) : null,
        startIso,
        endIso,
        spanDays,
        qtyLaunched: mo.quantityLaunched,
        qtyDone: mo.quantityDone,
        qtyRemaining: mo.quantity,
        unit: mo.unit,
        hours: Math.round(hours * 10) / 10,
        status,
        modified: !!ov,
        note: ov?.note ?? null,
      }

      // Colonnes (jours ouvrés) couvertes par [start, end].
      const startMid = start ? atMidnight(start).getTime() : 0
      const endMid = end ? atMidnight(end).getTime() : 0
      let startIdx = -1
      let endIdx = -1
      if (wst && start && end) {
        for (let c = 0; c < colDates.length; c++) {
          const t = colDates[c].getTime()
          if (t >= startMid && t <= endMid) {
            if (startIdx < 0) startIdx = c
            endIdx = c
          }
        }
      }

      if (startIdx < 0) {
        // Aucun jour ouvré visible → hors tableau.
        backlog.push({ ...common, workstation: wst })
        continue
      }

      const contLeft = startMid < colDates[0].getTime()
      const contRight = endMid > colDates[colDates.length - 1].getTime()
      const span = endIdx - startIdx + 1

      const bar: Bar = { ...common, startIdx, span, contLeft, contRight }
      const arr = barsByLine.get(wst!) ?? []
      arr.push(bar)
      barsByLine.set(wst!, arr)

      // Charge (heures) imputée au jour de début (jour de planification de l'OF).
      if (hours > 0) dayHours[startIdx] += hours
    }

    for (const d of days) d.hours = Math.round(dayHours[d.idx])

    // Regroupement des jours par semaine ISO (entête).
    const weeks: { num: number; span: number }[] = []
    for (const d of days) {
      const last = weeks[weeks.length - 1]
      if (last && last.num === d.weekNum) last.span++
      else weeks.push({ num: d.weekNum, span: 1 })
    }

    // Lane packing: stack overlapping OFs of a same line on separate sub-rows.
    const lines = [...barsByLine.entries()]
      .map(([code, bars]) => {
        bars.sort((a, b) => a.startIdx - b.startIdx || b.span - a.span)
        const laneEnds: number[] = []
        const lanes: Bar[][] = []
        for (const bar of bars) {
          let lane = laneEnds.findIndex((e) => e < bar.startIdx)
          if (lane === -1) {
            lane = lanes.length
            lanes.push([])
            laneEnds.push(-1)
          }
          lanes[lane].push(bar)
          laneEnds[lane] = bar.startIdx + bar.span - 1
        }
        return {
          code,
          label: wstLabels.get(code) ?? code,
          laneCount: lanes.length,
          lanes: lanes.map((bars, idx) => ({ idx, bars })),
        }
      })
      .sort((a, b) => a.code.localeCompare(b.code))

    return await ctx.view.render('board', {
      days,
      weeks,
      cols: days.length,
      boardDataJson: JSON.stringify({
        days: days.map((d) => d.iso),
        cols: days.length,
        ofData,
      }),
      lines,
      backlog,
      start: isoDay(windowStart),
      horizon,
      totalOf: mos.length,
      backlogCount: backlog.length,
      lineCount: lines.length,
    })
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
    const { dateDebut, dateFin, status, workstation, note } = ctx.request.only([
      'dateDebut', 'dateFin', 'status', 'workstation', 'note',
    ])
    await this.store.save(ctx.params.numOf, { dateDebut, dateFin, status, workstation, note })

    return {
      numOf: ctx.params.numOf,
      dateDebut: dateDebut ?? null,
      dateFin: dateFin ?? null,
      status: status ?? null,
      workstation: workstation ?? null,
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

    const [ofFlows, stockFlows, receptionFlows] = await Promise.all([
      new X3OfRepository().getSupplyFlows(),
      new X3StockRepository().getStockFlows(),
      new X3ReceptionRepository().getReceptionFlows(),
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

    const [ofFlows, stockFlows, receptionFlows, demandFlows] = await Promise.all([
      new X3OfRepository().getSupplyFlows(),
      new X3StockRepository().getStockFlows(),
      new X3ReceptionRepository().getReceptionFlows(),
      new X3BesoinClientRepository().getDemandFlows(),
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

    const [ofFlows, stockFlows, receptionFlows, demandFlows] = await Promise.all([
      new X3OfRepository().getSupplyFlows(),
      new X3StockRepository().getStockFlows(),
      new X3ReceptionRepository().getReceptionFlows(),
      new X3BesoinClientRepository().getDemandFlows(),
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

  async boardFeasibility(ctx: HttpContext) {
    const fromParam = ctx.request.input('from') as string | undefined
    const toParam = ctx.request.input('to') as string | undefined
    const workstationFilter = ctx.request.input('workstation') as string | undefined

    if (!fromParam || !toParam) {
      return ctx.response.badRequest({ error: 'Paramètres "from" et "to" requis (YYYY-MM-DD)' })
    }

    const windowFrom = new Date(fromParam)
    const windowTo = new Date(toParam)
    windowFrom.setHours(0, 0, 0, 0)
    windowTo.setHours(23, 59, 59, 999)

    if (isNaN(windowFrom.getTime()) || isNaN(windowTo.getTime()) || windowTo <= windowFrom) {
      return ctx.response.badRequest({ error: 'Dates invalides' })
    }

    const [ofFlows, stockFlows, receptionFlows, demandFlows, overrides] = await Promise.all([
      new X3OfRepository().getSupplyFlows(),
      new X3StockRepository().getStockFlows(),
      new X3ReceptionRepository().getReceptionFlows(),
      new X3BesoinClientRepository().getDemandFlows(),
      this.store.getAll(),
    ])

    // Filtrer les OF à l'horizon du board
    const filteredOfFlows = ofFlows.filter((f) => {
      if (!f.date) return true
      return f.date >= windowFrom && f.date <= windowTo
    })

    // Filtrer par workstation si demandé
    let finalOfFlows = filteredOfFlows
    if (workstationFilter) {
      const gammeOps = await new X3GammeRepository().getFirstOperations().catch(() => [])
      const wstByArticle = new Map<string, string>()
      for (const g of gammeOps) {
        if (g.workstation && g.article) wstByArticle.set(g.article, g.workstation)
      }
      finalOfFlows = filteredOfFlows.filter((f) => {
        const wst = wstByArticle.get(f.article) ?? ''
        return wst.toLowerCase().includes(workstationFilter)
      })
    }

    // Filtrer les demandes à l'horizon
    const filteredDemands = demandFlows.filter((f) => {
      if (!f.date) return false
      return f.date >= windowFrom && f.date <= windowTo
    })

    // Nomenclatures : lazy — pas de fetch X3 bloquant.
    // Le matching fonctionne sans nomenclatures.
    // La faisabilité composants sera calculée à la demande (clic OF → sidebar).
    const nomenclatureEntries: Awaited<ReturnType<X3NomenclatureRepository['getNomenclatureEntries']>> = []

    const allSupply = [...finalOfFlows, ...stockFlows, ...receptionFlows]

    const nomenclatures = new Map<string, Nomenclature>()
    for (const entry of nomenclatureEntries) {
      const existing = nomenclatures.get(entry.parentArticle)
      if (existing) {
        existing.components.push(entry)
      } else {
        nomenclatures.set(entry.parentArticle, {
          article: entry.parentArticle,
          description: entry.parentDescription,
          components: [entry],
        })
      }
    }

    const articles = new Map<string, Article>()
    for (const entry of nomenclatureEntries) {
      if (!articles.has(entry.parentArticle)) {
        articles.set(entry.parentArticle, {
          code: entry.parentArticle,
          description: entry.parentDescription,
          category: '',
          supplyType: 'FABRICATION',
          reorderDelay: 0,
          productFamily: null,
          pmp: null,
          economicLot: null,
          unitStock: null,
          unitPurchase: null,
          purchaseToStockRatio: 1,
          packagings: [],
        })
      }
      if (!articles.has(entry.componentArticle)) {
        articles.set(entry.componentArticle, {
          code: entry.componentArticle,
          description: entry.componentDescription,
          category: '',
          supplyType: entry.componentType === 'ACHETE' ? 'ACHAT' : 'FABRICATION',
          reorderDelay: 0,
          productFamily: null,
          pmp: null,
          economicLot: null,
          unitStock: null,
          unitPurchase: null,
          purchaseToStockRatio: 1,
          packagings: [],
        })
      }
    }

    const overrideMap = new Map(overrides.map((o) => [o.numOf, o]))

    const result = evaluateOrderImpacts(
      filteredDemands, allSupply, nomenclatures, articles, overrideMap,
      { from: windowFrom, to: windowTo },
    )

    return result
  }

  async nomenclature(ctx: HttpContext) {
    const article = ctx.params.article
    if (!article) {
      return ctx.response.badRequest({ error: 'Paramètre "article" requis' })
    }

    const allEntries = await new X3NomenclatureRepository().getNomenclatureEntries().catch(() => [])
    const components = allEntries.filter((e) => e.parentArticle === article)

    if (components.length === 0) {
      return { article, components: [], message: 'Nomenclature non disponible' }
    }

    return {
      article,
      components: components.map((c) => ({
        componentArticle: c.componentArticle,
        description: c.componentDescription,
        linkQuantity: c.linkQuantity,
        type: c.componentType,
        consumptionNature: c.consumptionNature,
        level: c.level,
      })),
    }
  }
}
