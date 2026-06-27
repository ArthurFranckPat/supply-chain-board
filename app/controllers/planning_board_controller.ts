import { HttpContext } from '@adonisjs/core/http'
import { OverrideStore } from '#services/override_store'
import { FeasibilityLoaderAdapter, buildStocksMap, buildReceptionsMap, buildNomenclatureMap } from '#services/feasibility-loader-adapter'
import { whatifOrder } from '#app/domain/planning-board-feasibility'
import type { OfRecord, StockRecord, ReceptionRecord } from '#app/domain/recursive-checker'
import boardDataset from '#services/board_dataset'
import { mergeOfWithOverride, type OfFromErp } from '#app/domain/planning_board'
import { FeasibilityService } from '#app/domain/feasibility-service'
import { matchOrders } from '#app/domain/orders'
import { loadOrderImpacts } from '#services/order_impacts_loader'
import { buildShortageRows } from '#app/domain/shortages'
import { evaluateMfgFeasibility, buildStrictQcStock, type MfgMaterialInput } from '#app/domain/of-feasibility'
import { RecursiveDiagnosticChecker, type DiagnosticLoader } from '#app/domain/recursive-diagnostic-checker'
import type { Flow } from '#app/domain/models/flow'
import { X3OfRepository, type ManufacturingOrder } from '#repositories/of_repository'
import type { GammeOperation } from '#app/domain/models/gamme'
import { X3StockRepository } from '#repositories/stock_repository'
import { X3BesoinClientRepository } from '#repositories/besoin_client_repository'
import { X3NomenclatureRepository } from '#repositories/nomenclature_repository'
import { X3MfgmatRepository } from '#repositories/mfgmat_repository'
import type { Article } from '#app/domain/models/article'
import type { Nomenclature } from '#app/domain/models/nomenclature'

/** Borne basse par défaut pour la fenêtre de suggestions CBN (CBNDET) : aujourd'hui - 30 j. */
function defaultPoolFrom(): string {
  const d = new Date()
  d.setDate(d.getDate() - 30)
  return d.toISOString().split('T')[0]
}

/** Borne haute par défaut pour la fenêtre de suggestions CBN (CBNDET) : aujourd'hui + 1 an. */
function defaultPoolTo(): string {
  const d = new Date()
  d.setFullYear(d.getFullYear() + 1)
  return d.toISOString().split('T')[0]
}

export default class PlanningBoardController {
  private get store() {
    return new OverrideStore()
  }


  async index(ctx: HttpContext) {
    const windowStart = ctx.request.input('windowStart') as string | undefined
    const windowEnd = ctx.request.input('windowEnd') as string | undefined

    const poolFrom = windowStart ?? defaultPoolFrom()
    const poolTo = windowEnd ?? defaultPoolTo()

    const [pool, overrides] = await Promise.all([
      boardDataset.getPool(poolFrom, poolTo),
      this.store.getAll(),
    ])
    const overrideMap = new Map(overrides.map((o) => [o.numOf, o]))

    // Pool unifié : supply (1/2) + suggestions (3) — même forme Flow, conversion identique.
    const allFlows: Flow[] = [...pool.supply]
    const erpOfs: OfFromErp[] = allFlows.map((f) => ({
      numOf: (f.origin as any).id,
      article: f.article,
      description: (f.origin as any).designation ?? '',
      statutNum: (f.origin as any).status ?? 3,
      dateDebut: new Date(f.date ?? Date.now()),
      dateFin: f.date ?? new Date(),
      qteRestante: f.quantity,
    }))

    const merged = erpOfs.map((of) => mergeOfWithOverride(of, overrideMap.get(of.numOf) ?? null))

    const filtered =
      windowStart && windowEnd
        ? merged.filter((of) => {
            const end = new Date(of.dateFin)
            return end >= new Date(windowStart) && end <= new Date(windowEnd)
          })
        : merged

    return { ofs: filtered, total: filtered.length }
  }


  /** Vide le cache board:* (référentiel + OF + fenêtres) → prochain accès = données X3 fraîches. */
  async reloadData(_ctx: HttpContext) {
    await boardDataset.reloadAll()
    return { reloaded: true }
  }

  async show(ctx: HttpContext) {
    const pool = await boardDataset.getPool(defaultPoolFrom(), defaultPoolTo())
    const allFlows: Flow[] = [...pool.supply]
    const match = allFlows.find((f) => (f.origin as any).id === ctx.params.of)
    if (!match) {
      return ctx.response.notFound({ message: `OF ${ctx.params.of} not found` })
    }

    const erpOf: OfFromErp = {
      numOf: ctx.params.of,
      article: match.article,
      description: (match.origin as any).designation ?? '',
      statutNum: (match.origin as any).status ?? 3,
      dateDebut: new Date(match.date ?? Date.now()),
      dateFin: match.date ?? new Date(),
      qteRestante: match.quantity,
    }

    const override = await this.store.get(ctx.params.of)
    return mergeOfWithOverride(erpOf, override)
  }

  async update(ctx: HttpContext) {
    const { dateDebut, dateFin, status, workstation, note } = ctx.request.only([
      'dateDebut', 'dateFin', 'status', 'workstation', 'note',
    ])
    await this.store.save(ctx.params.of, { dateDebut, dateFin, status, workstation, note })

    return {
      numOf: ctx.params.of,
      dateDebut: dateDebut ?? null,
      dateFin: dateFin ?? null,
      status: status ?? null,
      workstation: workstation ?? null,
      note: note ?? null,
      modified: true,
    }
  }

  async resetOverride(ctx: HttpContext) {
    const deleted = await this.store.delete(ctx.params.of)
    return ctx.response.ok({ numOf: ctx.params.of, reset: deleted })
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
      boardDataset.getReceptions(),
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
      boardDataset.getReceptions(),
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
      boardDataset.getReceptions(),
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
    const windowStart = ctx.request.input('windowStart') as string | undefined
    const windowEnd = ctx.request.input('windowEnd') as string | undefined

    const poolFrom = windowStart ?? defaultPoolFrom()
    const poolTo = windowEnd ?? defaultPoolTo()

    const [pool, overrides] = await Promise.all([
      boardDataset.getPool(poolFrom, poolTo),
      this.store.getAll(),
    ])
    const overrideMap = new Map(overrides.map((o) => [o.numOf, o]))
    const allFlows: Flow[] = [...pool.supply]

    const events = allFlows
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

    // Pipeline partagé (issue #11) — voir app/services/order_impacts_loader.ts.
    const { result } = await loadOrderImpacts({
      from: windowFrom,
      to: windowTo,
      workstation: workstationFilter,
      mode: mode as 'immediate' | 'sequential' | undefined,
      force: !!ctx.request.input('refresh'),
    })

    return result
  }

  /**
   * GET /api/v1/planning/shortages
   * Tableau de suivi des ruptures (issue #15) : pivot composant-centrique des OF bloqués.
   * Réutilise le pipeline de faisabilité (loadOrderImpacts) + réceptions d'achat plein
   * horizon, pivotées par `buildShortageRows`.
   */
  async shortages(ctx: HttpContext) {
    const startParam = ctx.request.input('start') as string | undefined
    const daysParam = Number.parseInt(ctx.request.input('days', '14'), 10)
    const horizon = Number.isFinite(daysParam) && daysParam > 0 && daysParam <= 90 ? daysParam : 14
    const workstationFilter = ctx.request.input('workstation') as string | undefined

    const windowFrom = startParam ? new Date(startParam) : new Date()
    windowFrom.setHours(0, 0, 0, 0)
    const windowTo = new Date(windowFrom)
    windowTo.setDate(windowTo.getDate() + horizon)
    windowTo.setHours(23, 59, 59, 999)

    const force = !!ctx.request.input('refresh')

    const { result, articles } = await loadOrderImpacts({
      from: windowFrom,
      to: windowTo,
      workstation: workstationFilter,
      force,
    })

    // Réceptions d'achat PLEIN HORIZON (pas seulement la fenêtre board) — l'anticipation
    // suppose des arrivées au-delà de la fenêtre affichée.
    const receptionFlows = await boardDataset.getReceptions()
    const receptionsByArticle = buildReceptionsMap(
      receptionFlows.map((f) => ({
        article: f.article,
        id: (f.origin as { id?: string }).id,
        supplier: (f.origin as { supplier?: string }).supplier,
        quantity: f.quantity,
        date: f.date,
      })),
    )

    const { rows, stats } = buildShortageRows(result, receptionsByArticle, articles)
    return { rows, stats, window: result.window }
  }

  /**
   * Diagnostic récursif d'un OF (issue #25). Descend la chaîne des OF — MFGMAT d'abord
   * (OF fermes/planifiés éclatés), repli nomenclature théorique pour les OF suggérés sans
   * MFGMAT — pour désigner le VRAI composant bloquant, ou conclure qu'il n'y a qu'un OF de
   * sous-ensemble à lancer. Distinct du mode direct (ofMaterials, MFGMAT 1 niveau).
   */
  async ofMaterialsDiagnostic(ctx: HttpContext) {
    const numOf = ctx.params.of
    if (!numOf) return ctx.response.badRequest({ error: 'numOf requis' })

    const [poolData, nomEntries, articlesList] = await Promise.all([
      boardDataset.getPool(defaultPoolFrom(), defaultPoolTo()),
      boardDataset.getNomenclature().catch(() => []),
      boardDataset.getArticles().catch(() => []),
    ])

    // Pool unifié : tous les OF (1/2/3) depuis ORDERS via supply (#32).
    const pool: OfRecord[] = (poolData.supply as Flow[]).map((f) => {
      const o = f.origin as { id?: string; status?: number }
      return {
        numOf: o.id ?? '',
        article: f.article,
        statutNum: o.status ?? 3,
        qteRestante: f.quantity,
        dateFin: f.date ?? undefined,
      } as OfRecord
    })

    const head = pool.find((o) => o.numOf === numOf)
    if (!head) return ctx.response.notFound({ error: `OF ${numOf} introuvable dans le pool` })

    const articlesMap = new Map<string, Article>(articlesList.map((a) => [a.code, a]))
    const nomenclaturesMap = buildNomenclatureMap(nomEntries)

    // Chargements X3 vivants PARESSEUX + memoïsés : on ne touche que les OF/articles
    // réellement visités par la descente (la naïve « tout le pool » lisait 14k+ OF).
    const mfgmatRepo = new X3MfgmatRepository()
    const stockRepo = boardDataset

    const mfgmatCache = new Map<string, Promise<MfgMaterialInput[]>>()
    const stockCache = new Map<string, Promise<StockRecord | undefined>>()
    const receptionCache = new Map<string, Promise<ReceptionRecord[]>>()

    const loadMfgmat = (n: string): Promise<MfgMaterialInput[]> => {
      const hit = mfgmatCache.get(n)
      if (hit) return hit
      const p = mfgmatRepo.getMaterials(n).then((mats) =>
        mats.map((m) => ({
          article: m.article,
          description: m.description,
          unit: m.unit,
          remaining: m.remaining,
          allocated: m.allocated,
        })),
      )
      mfgmatCache.set(n, p)
      return p
    }
    const loadStock = (a: string): Promise<StockRecord | undefined> => {
      const hit = stockCache.get(a)
      if (hit) return hit
      const p = loadStocks([a]).then((m) => m.get(a))
      stockCache.set(a, p)
      return p
    }
    // Stock par LOT : une requête X3 pour tous les articles d'un nœud (clé perf).
    const loadStocks = async (articles: string[]): Promise<Map<string, StockRecord | undefined>> => {
      const flows = await stockRepo.getStock(articles).catch(() => [])
      const built = buildStocksMap(
        flows.map((f) => ({ article: f.article, origin: f.origin as { subType?: string }, quantity: f.quantity })),
      )
      const out = new Map<string, StockRecord | undefined>()
      for (const a of articles) out.set(a, built.get(a))
      return out
    }
    const loadReceptions = (a: string): Promise<ReceptionRecord[]> => {
      const hit = receptionCache.get(a)
      if (hit) return hit
      // Le repo réception n'est pas scopé par article ; on charge tout une fois puis filtre.
      const p = allReceptions().then((map) => map.get(a) ?? [])
      receptionCache.set(a, p)
      return p
    }
    let allReceptionsPromise: Promise<Map<string, ReceptionRecord[]>> | null = null
    const allReceptions = (): Promise<Map<string, ReceptionRecord[]>> => {
      if (allReceptionsPromise) return allReceptionsPromise
      allReceptionsPromise = boardDataset
        .getReceptions()
        .then((flows: Flow[]) =>
          buildReceptionsMap(
            flows.map((f) => ({
              article: f.article,
              id: (f.origin as { id?: string }).id,
              supplier: (f.origin as { supplier?: string }).supplier,
              quantity: f.quantity,
              date: f.date,
            })),
          ),
        )
        .catch(() => new Map<string, ReceptionRecord[]>())
      return allReceptionsPromise
    }

    const loader: DiagnosticLoader = {
      getArticle: (a) => articlesMap.get(a),
      getNomenclature: (a) => nomenclaturesMap.get(a),
      // Allocations ERP non chargées en v1 : la MFGMAT reflète déjà l'alloué (ALLQTY),
      // et evaluateMfgFeasibility en tient compte.
      getAllocationsOf: () => [],
      getStock: loadStock,
      getStocks: loadStocks,
      getReceptions: loadReceptions,
      getMfgmat: loadMfgmat,
      getOfsByArticle: (article, statut, dateBesoin) => {
        let f = pool.filter((o) => o.article === article)
        if (statut !== undefined) f = f.filter((o) => o.statutNum === statut)
        if (dateBesoin) f = f.filter((o) => !o.dateFin || o.dateFin <= dateBesoin)
        return f
      },
    }

    const checker = new RecursiveDiagnosticChecker(loader, { checkDate: new Date(), useReceptions: true })
    const result = await checker.diagnoseOf(head)

    // Debug (page de test #25) : confronte le verdict récursif au mode DIRECT classique
    // (ofMaterials : MFGMAT 1 niveau, stock strict/qc) sur l'OF de tête.
    const headMat = await loadMfgmat(head.numOf)
    const directStockArticles = [...new Set(headMat.map((m) => m.article).filter(Boolean))]
    const directStockFlows = await boardDataset.getStock(directStockArticles).catch(() => [])
    const directVerdict = evaluateMfgFeasibility(headMat, buildStrictQcStock(directStockFlows), head.statutNum === 1)
    return {
      ...result,
      _debug: {
        poolSize: pool.length,
        headStatut: head.statutNum,
        headSource: headMat.length > 0 ? 'MFGMAT' : 'NOMENCLATURE',
        headMaterialsCount: headMat.length,
        ofsVisited: mfgmatCache.size,
        direct: {
          feasible: directVerdict.feasible,
          blockedCount: directVerdict.blockedCount,
          shorts: directVerdict.materials
            .filter((m) => m.feasible === false)
            .map((m) => ({ article: m.article, remaining: m.remaining, available: m.available, missing: m.missing })),
          unknownStock: directVerdict.materials.filter((m) => m.available === null).map((m) => m.article),
        },
      },
    }
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
   * GET /api/v1/planning/articles-by-component/:component
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
   * GET /api/v1/planning/search/poste?q=…
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
   * GET /api/v1/planning/search/of?q=…
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
   * GET /api/v1/planning/search/pf?q=…
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
