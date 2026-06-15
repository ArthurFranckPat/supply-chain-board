import { HttpContext } from '@adonisjs/core/http'
import { OverrideStore } from '#services/override_store'
import { FeasibilityLoaderAdapter, buildStocksMap, buildReceptionsMap } from '#services/feasibility-loader-adapter'
import { whatifOrder } from '#app/domain/planning-board-feasibility'
import type { OfRecord } from '#app/domain/recursive-checker'
import boardDataset from '#services/board_dataset'
import { mergeOfWithOverride, type OfFromErp } from '#app/domain/planning_board'
import { FeasibilityService } from '#app/domain/feasibility-service'
import { matchOrders } from '#app/domain/orders'
import { evaluateOrderImpacts } from '#app/domain/order-impacts'
import { X3OfRepository, type ManufacturingOrder } from '#repositories/of_repository'
import type { GammeOperation } from '#app/domain/models/gamme'
import { X3StockRepository } from '#repositories/stock_repository'
import { X3ReceptionRepository } from '#repositories/reception_repository'
import { X3BesoinClientRepository } from '#repositories/besoin_client_repository'
import { X3NomenclatureRepository } from '#repositories/nomenclature_repository'
import { X3MfgmatRepository } from '#repositories/mfgmat_repository'
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

    // Données servies par le loader mémoire (BoardDataset) ; ?refresh=1 recharge.
    const force = !!ctx.request.input('refresh')
    let mos: ManufacturingOrder[] = []
    let gammeOps: GammeOperation[] = []
    let x3Error: string | null = null

    try {
      const [ref, ord] = await Promise.all([
        boardDataset.getReferential(force),
        boardDataset.getOrders(force),
      ])
      gammeOps = ref.gamme
      mos = ord.mos
    } catch (e) {
      x3Error = (e as Error).message
    }

    // Overrides toujours frais (SQLite, peu coûteux).
    const overrides = await this.store.getAll()
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
      x3Error,
      cached: boardDataset.status().ordersAt
        ? new Date(boardDataset.status().ordersAt!).toLocaleTimeString('fr-FR')
        : null,
    })
  }

  /** Vide le cache mémoire (référentiel + OF + fenêtres) → prochain accès = données X3 fraîches. */
  async reloadData(_ctx: HttpContext) {
    boardDataset.reloadAll()
    return { reloaded: true }
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
    const { articles: articlesInput, nomenclatures: nomInput, upToDate, useReceptions } = ctx.request.only([
      'articles', 'nomenclatures', 'upToDate', 'useReceptions',
    ])
    const includeReceptions = useReceptions !== false
    const upToDateDate = upToDate ? new Date(upToDate) : undefined

    const [ofFlows, stockFlows, receptionFlows] = await Promise.all([
      new X3OfRepository().getSupplyFlows(),
      new X3StockRepository().getStockFlows(),
      new X3ReceptionRepository().getReceptionFlows(),
    ])

    const articles = new Map<string, Article>(
      (articlesInput ?? []).map((a: Article) => [a.code, a])
    )
    const nomenclatures = new Map<string, Nomenclature>(
      (nomInput ?? []).map((n: Nomenclature) => [n.article, n])
    )

    const stocksMap = buildStocksMap(
      stockFlows.map((f) => ({ article: f.article, origin: f.origin as { subType?: string }, quantity: f.quantity })),
    )
    const receptionsMap = buildReceptionsMap(
      receptionFlows.map((f) => ({ article: f.article, id: (f.origin as { id?: string }).id, supplier: (f.origin as { supplier?: string }).supplier, quantity: f.quantity, date: f.date })),
    )

    const adapter = new FeasibilityLoaderAdapter({
      articles,
      nomenclatures,
      stocks: stocksMap,
      receptions: receptionsMap,
      ofs: [],
    })
    const service = new FeasibilityService(adapter)

    const OF_ORIGIN_SUBSTR = 'of'
    const ofArticles = new Map<string, number>()
    for (const f of ofFlows) {
      if ((f.origin as { type?: string }).type !== OF_ORIGIN_SUBSTR) continue
      const article = f.article
      ofArticles.set(article, (ofArticles.get(article) ?? 0) + f.quantity)
    }

    const results: Record<string, unknown> = {}
    let feasibleCount = 0
    let blockedCount = 0
    for (const [article, quantity] of ofArticles) {
      const key = `${article} (${quantity})`
      const result = service.check(article, quantity, upToDateDate ?? new Date(), { useReceptions: includeReceptions })
      results[key] = {
        feasible: result.feasible,
        blockingComponents: result.componentGaps.map((g) => ({
          article: g.article,
          needed: g.quantityNeeded,
          available: g.quantityAvailable,
          shortage: g.quantityGap,
        })),
        componentGaps: result.componentGaps,
        feasibleDate: result.feasibleDate,
      }
      if (result.feasible) feasibleCount++
      else blockedCount++
    }

    return {
      results,
      stats: { total: ofArticles.size, feasible: feasibleCount, blocked: blockedCount },
    }
  }

  async whatif(ctx: HttpContext) {
    const body = ctx.request.only(['overrides', 'articles'])
    const whatifOverrides = (body.overrides ?? []) as Array<{ numOf: string; dateFin?: string; status?: number }>
    const articlesInput = body.articles

    const [ofFlows, stockFlows, receptionFlows] = await Promise.all([
      new X3OfRepository().getSupplyFlows(),
      new X3StockRepository().getStockFlows(),
      new X3ReceptionRepository().getReceptionFlows(),
    ])

    const articles = new Map<string, Article>(
      (articlesInput ?? []).map((a: Article) => [a.code, a])
    )

    // Build overrides map in format expected by whatifOrder
    const overrides: Record<string, Partial<OfRecord>> = {}
    for (const ov of whatifOverrides) {
      overrides[ov.numOf] = {}
      if (ov.dateFin) overrides[ov.numOf].dateFin = new Date(ov.dateFin)
      if (ov.status !== undefined) overrides[ov.numOf].statutNum = ov.status
    }

    // Build adapter from fetched data using helpers
    const stocksMap = buildStocksMap(
      stockFlows.map((f) => ({ article: f.article, origin: f.origin as { subType?: string }, quantity: f.quantity })),
    )
    const receptionsMap = buildReceptionsMap(
      receptionFlows.map((f) => ({ article: f.article, id: (f.origin as { id?: string }).id, supplier: (f.origin as { supplier?: string }).supplier, quantity: f.quantity, date: f.date })),
    )
    const ofs: OfRecord[] = ofFlows
      .filter((f) => (f.origin as { type?: string }).type === 'of')
      .map((f) => {
        const origin = f.origin as { id: string; status?: number }
        return { numOf: origin.id, article: f.article, statutNum: origin.status ?? 3, qteRestante: f.quantity, dateFin: f.date ?? undefined }
      })

    const adapter = new FeasibilityLoaderAdapter({
      articles,
      nomenclatures: new Map(),
      stocks: stocksMap,
      receptions: receptionsMap,
      ofs,
    })

    // Basic window: last 7 days to next 42 days
    const now = new Date()
    const fromD = new Date(now)
    fromD.setDate(now.getDate() - 7)
    const toD = new Date(now)
    toD.setDate(now.getDate() + 42)

    const result = whatifOrder(adapter, overrides, '', 0, now, fromD, toD)

    return {
      simulated: true,
      overrideCount: whatifOverrides.length,
      whatif: result,
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
    const mode = ctx.request.input('mode') as string | undefined

    const windowFrom = new Date(fromParam ?? '')
    const windowTo = new Date(toParam ?? '')
    windowFrom.setHours(0, 0, 0, 0)
    windowTo.setHours(23, 59, 59, 999)

    if (isNaN(windowFrom.getTime()) || isNaN(windowTo.getTime()) || windowTo <= windowFrom) {
      return ctx.response.badRequest({ error: 'Dates invalides' })
    }

    const force = !!ctx.request.input('refresh')

    // Données via le loader : OF (supply) + référentiel cachés, demande/réception
    // scopées à l'horizon, stock scopé aux articles concernés.
    const [{ supply: ofFlows }, { demand: demandFlows, reception: receptionFlows }, { gamme }, nomenclatureEntries, articlesList] =
      await Promise.all([
        boardDataset.getOrders(force),
        boardDataset.getLive(fromParam ?? '', toParam ?? '', force),
        boardDataset.getReferential(force),
        boardDataset.getNomenclature(force),
        boardDataset.getArticles(),
      ])

    const overrides = await this.store.getAll()

    // Filtrer les OF à l'horizon du board
    const filteredOfFlows = ofFlows.filter((f) => {
      if (!f.date) return true
      return f.date >= windowFrom && f.date <= windowTo
    })

    // Filtrer par workstation si demandé (gammes du référentiel caché)
    let finalOfFlows = filteredOfFlows
    if (workstationFilter) {
      const wstByArticle = new Map<string, string>()
      for (const g of gamme) {
        if (g.workstation && g.article) wstByArticle.set(g.article, g.workstation)
      }
      finalOfFlows = filteredOfFlows.filter((f) => {
        const wst = wstByArticle.get(f.article) ?? ''
        return wst.toLowerCase().includes(workstationFilter)
      })
    }

    // Demandes déjà scopées par X3 ; re-filtre défensif sur l'horizon exact.
    const filteredDemands = demandFlows.filter((f) => {
      if (!f.date) return false
      return f.date >= windowFrom && f.date <= windowTo
    })

    // Stock vivant, scopé aux articles de la fenêtre + composants BOM ACHAT (tous niveaux).
    const articleSet = new Set<string>()
    for (const f of finalOfFlows) if (f.article) articleSet.add(f.article)
    for (const f of filteredDemands) if (f.article) articleSet.add(f.article)
    for (const f of receptionFlows) if (f.article) articleSet.add(f.article)

    // Expand récursivement à TOUS les composants (ACHETE + FABRIQUE) de tous les niveaux BOM.
    // Sans ça, checkFeasibility descend dans un sous-ensemble fabriqué sans OF et trouve 0 stock
    // pour ses composants ACHETE car ils n'ont pas été chargés.
    let added = true
    while (added) {
      added = false
      for (const entry of nomenclatureEntries) {
        if (articleSet.has(entry.parentArticle) && !articleSet.has(entry.componentArticle)) {
          articleSet.add(entry.componentArticle)
          added = true
        }
      }
    }
    const stockFlows = await boardDataset.getStock([...articleSet])

    // Nomenclatures : chargées via boardDataset.getNomenclature() ci-dessus (TTL 2h, tier séparé).

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

    const articles = new Map<string, Article>(articlesList.map((a) => [a.code, a]))
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
      mode as 'immediate' | 'sequential' | undefined,
    )

    return result
  }

  async ofMaterials(ctx: HttpContext) {
    const numOf = ctx.params.numOf
    if (!numOf) return ctx.response.badRequest({ error: 'numOf requis' })

    // Déterminer le statut de l'OF (ferme = pas de calcul faisabilité)
    const ofFlows = await new X3OfRepository().getSupplyFlows().catch(() => [])
    const targetFlow = ofFlows.find((f) => (f.origin as { id?: string }).id === numOf)
    const isFirm = (targetFlow?.origin as { status?: number }).status === 1

    // 1. MFGMAT (X3) — données réelles de l'OF
    const materials = await new X3MfgmatRepository().getMaterials(numOf)
    if (materials.length === 0) {
      return this.ofMaterialsFromBom(numOf, isFirm)
    }

    // MFGMAT → ajoute disponibilité stock par composant
    const articles = [...new Set(materials.map((m) => m.article).filter(Boolean))]
    const stockFlows = await boardDataset.getStock(articles).catch(() => [])

    const stockByArticle = new Map<string, number>()
    for (const f of stockFlows) {
      const sub = (f.origin as any)?.subType
      if (sub === 'strict' || sub === 'qc') {
        stockByArticle.set(f.article, (stockByArticle.get(f.article) ?? 0) + f.quantity)
      }
    }

    const result = materials.map((m) => {
      const available = stockByArticle.get(m.article) ?? null
      const needed = m.remaining
      // OF ferme : toujours faisable, pas de calcul stock
      // Sinon : stock disponible + allocation ERP >= besoin (même calcul que checkFeasibility)
      const feasible = isFirm ? true : (available !== null ? available + m.allocated >= needed : null)
      return { ...m, available, feasible, missing: feasible === false ? Math.max(0, needed - (available ?? 0)) : 0 }
    })

    const blocked = result.filter((m) => m.feasible === false).length
    return { numOf, materials: result, feasible: blocked === 0, blockedCount: blocked }
  }

  /**
   * Fallback BOM — utilisé quand MFGMAT n'a pas de données pour cet OF.
   */
  private async ofMaterialsFromBom(numOf: string, isFirm?: boolean) {
    const ofFlows = await new X3OfRepository().getSupplyFlows().catch(() => [])
    const targetFlow = ofFlows.find((f) => {
      const id = (f.origin as { id?: string }).id
      return id === numOf
    })
    if (!targetFlow) {
      return { numOf, materials: [], message: "OF introuvable — impossible de déterminer l'article" }
    }
    const article = targetFlow.article

    // Récupérer la nomenclature
    const nomEntries = await new X3NomenclatureRepository().getNomenclatureEntries().catch(() => [])
    const bomComponents = nomEntries.filter((e) => e.parentArticle === article)
    if (!bomComponents.length) {
      return { numOf, article, materials: [], message: `Aucune nomenclature trouvée pour ${article}` }
    }

    // Stock pour tous les composants
    const compArticles = [...new Set(bomComponents.map((c) => c.componentArticle))]
    const stockFlows = await boardDataset.getStock(compArticles).catch(() => [])

    const stockByArticle = new Map<string, number>()
    for (const f of stockFlows) {
      const sub = (f.origin as any)?.subType
      if (sub === 'strict' || sub === 'qc') {
        stockByArticle.set(f.article, (stockByArticle.get(f.article) ?? 0) + f.quantity)
      }
    }

    const receptionFlows = await new X3ReceptionRepository().getReceptionFlows().catch(() => [])
    const now = new Date()
    const nFr = (n: number) => Math.round(n * 100) / 100

    const materials = bomComponents.map((comp) => {
      const remaining = comp.linkQuantity * targetFlow.quantity
      let stockTotal = stockByArticle.get(comp.componentArticle) ?? 0
      for (const rec of receptionFlows) {
        if (rec.article === comp.componentArticle && rec.date && rec.date <= now) {
          stockTotal += rec.quantity
        }
      }
      const stockFeasible = stockTotal >= remaining
      const feasible = isFirm ? true : stockFeasible
      return {
        article: comp.componentArticle,
        description: comp.componentDescription,
        remaining: nFr(remaining),
        unit: '',
        available: nFr(stockTotal),
        feasible,
        missing: feasible ? 0 : nFr(remaining - stockTotal),
      }
    })

    const blocked = materials.filter((m) => !m.feasible).length
    return { numOf, article, materials, feasible: blocked === 0, blockedCount: blocked }
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

  /**
   * GET /api/v1/planning-board/articles-by-component/:component
   * Retourne les articles parents (PF) qui consomment le composant donné dans
   * leur nomenclature. Utilisé par la recherche "composant" du board pour
   * remonter les OFs qui consomment ce composant.
   */
  async articlesByComponent(ctx: HttpContext) {
    const component = String(ctx.params.component ?? '').trim().toUpperCase()
    if (!component) {
      return ctx.response.badRequest({ error: 'Paramètre "component" requis' })
    }

    const allEntries = await boardDataset.getNomenclature().catch(() => [])
    const q = component.toLowerCase()
    const parents = new Set<string>()
    for (const entry of allEntries) {
      const compCode = (entry.componentArticle ?? '').toLowerCase()
      const compDesc = (entry.componentDescription ?? '').toLowerCase()
      if (compCode.includes(q) || compDesc.includes(q)) {
        if (entry.parentArticle) parents.add(entry.parentArticle)
      }
    }

    return { component, articles: [...parents] }
  }

  /**
   * GET /api/v1/planning-board/search/poste?q=…
   * Postes de charge dont le code ou le libellé matchent q (dataset complet via
   * les gammes, pas seulement la fenêtre affichée). Sert la recherche par scope
   * « poste » du board.
   */
  async searchPoste(ctx: HttpContext) {
    const q = String(ctx.request.input('q') ?? '').trim().toLowerCase()
    if (!q) return ctx.response.badRequest({ error: 'Paramètre "q" requis' })
    let gamme: GammeOperation[] = []
    try {
      gamme = (await boardDataset.getReferential()).gamme
    } catch {
      /* référentiel indisponible → réponse vide */
    }
    const wsts = new Set<string>()
    for (const g of gamme) {
      const code = (g.workstation ?? '').toLowerCase()
      const label = (g.workstationLabel ?? '').toLowerCase()
      if (code.includes(q) || label.includes(q)) wsts.add(g.workstation)
    }
    return { workstations: [...wsts] }
  }

  /**
   * GET /api/v1/planning-board/search/of?q=…
   * Numéros d'OF dont le numéro, l'article ou la désignation matchent q
   * (dataset complet des ordres de fabrication).
   */
  async searchOf(ctx: HttpContext) {
    const q = String(ctx.request.input('q') ?? '').trim().toLowerCase()
    if (!q) return ctx.response.badRequest({ error: 'Paramètre "q" requis' })
    let mos: ManufacturingOrder[] = []
    try {
      mos = (await boardDataset.getOrders()).mos
    } catch {
      /* ordres indisponibles → réponse vide */
    }
    const ofs = new Set<string>()
    for (const mo of mos) {
      const hay = `${mo.numOf} ${mo.article} ${mo.designation ?? ''}`.toLowerCase()
      if (hay.includes(q)) ofs.add(mo.numOf)
    }
    return { ofs: [...ofs] }
  }

  /**
   * GET /api/v1/planning-board/search/pf?q=…
   * Articles (produits finis) dont le code ou la désignation matchent q
   * (dataset complet des ordres de fabrication).
   */
  async searchPf(ctx: HttpContext) {
    const q = String(ctx.request.input('q') ?? '').trim().toLowerCase()
    if (!q) return ctx.response.badRequest({ error: 'Paramètre "q" requis' })
    let mos: ManufacturingOrder[] = []
    try {
      mos = (await boardDataset.getOrders()).mos
    } catch {
      /* ordres indisponibles → réponse vide */
    }
    const articles = new Set<string>()
    for (const mo of mos) {
      const hay = `${mo.article} ${mo.designation ?? ''}`.toLowerCase()
      if (hay.includes(q)) articles.add(mo.article)
    }
    return { articles: [...articles] }
  }
}
