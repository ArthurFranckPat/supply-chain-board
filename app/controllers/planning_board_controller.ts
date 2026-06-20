import { HttpContext } from '@adonisjs/core/http'
import { OverrideStore } from '#services/override_store'
import { FeasibilityLoaderAdapter, buildStocksMap, buildReceptionsMap, buildNomenclatureMap } from '#services/feasibility-loader-adapter'
import { whatifOrder } from '#app/domain/planning-board-feasibility'
import type { OfRecord } from '#app/domain/recursive-checker'
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


  /** Vide le cache board:* (référentiel + OF + fenêtres) → prochain accès = données X3 fraîches. */
  async reloadData(_ctx: HttpContext) {
    await boardDataset.reloadAll()
    return { reloaded: true }
  }

  async show(ctx: HttpContext) {
    const ofFlows = await new X3OfRepository().getSupplyFlows()

    const match = ofFlows.find((f) => (f.origin as any).id === ctx.params.of)
    if (!match) {
      return ctx.response.notFound({ message: `OF ${ctx.params.of} not found` })
    }

    const erpOf: OfFromErp = {
      numOf: ctx.params.of,
      article: match.article,
      description: '',
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
    const receptionFlows = await new X3ReceptionRepository().getReceptionFlows()
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

  async ofMaterials(ctx: HttpContext) {
    const numOf = ctx.params.of
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

    const stockByArticle = buildStrictQcStock(stockFlows)

    // Faisabilité via le calcul partagé (même source que le badge du board, issue #11).
    const verdict = evaluateMfgFeasibility(materials, stockByArticle, !!isFirm)
    return { numOf, materials: verdict.materials, feasible: verdict.feasible, blockedCount: verdict.blockedCount }
  }

  /**
   * Diagnostic récursif d'un OF (issue #25). Descend la chaîne des OF — MFGMAT d'abord
   * (OF fermes/planifiés éclatés), repli nomenclature théorique pour les OF suggérés sans
   * MFGMAT — pour désigner le VRAI composant bloquant, ou conclure qu'il n'y a qu'un OF de
   * sous-ensemble à lancer. Distinct du mode direct (ofMaterials, MFGMAT 1 niveau).
   *
   * Pool d'OF unifié : orders (statut 1/2, MFGHEAD) + suggestions CBN (statut 3, CBNDET).
   * En attendant #27 (pool unifié canonique), assemblé inline ici.
   */
  async ofMaterialsDiagnostic(ctx: HttpContext) {
    const numOf = ctx.params.of
    if (!numOf) return ctx.response.badRequest({ error: 'numOf requis' })

    // Fenêtre large pour capter les suggestions (CBNDET) couvrantes autour de l'OF.
    const from = new Date()
    from.setDate(from.getDate() - 30)
    const to = new Date()
    to.setFullYear(to.getFullYear() + 1)
    const fromIso = from.toISOString().split('T')[0]
    const toIso = to.toISOString().split('T')[0]

    const [orders, live, nomEntries, articlesList] = await Promise.all([
      boardDataset.getOrders(),
      boardDataset.getLive(fromIso, toIso).catch(
        (): { demand: Flow[]; reception: Flow[]; suggestion: Flow[]; at: number } => ({
          demand: [],
          reception: [],
          suggestion: [],
          at: 0,
        }),
      ),
      boardDataset.getNomenclature().catch(() => []),
      boardDataset.getArticles().catch(() => []),
    ])

    // Pool unifié : OF affermis/planifiés (1/2) + suggestions CBN (3).
    const pool: OfRecord[] = ([...orders.supply, ...live.suggestion] as Flow[]).map((f) => {
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

    // MFGMAT de tous les OF du pool (batch) → source réelle de descente par OF.
    const mfgmatByOf = await new X3MfgmatRepository().getMaterialsForOfs(pool.map((o) => o.numOf))
    const mfgmatMap = new Map<string, MfgMaterialInput[]>()
    for (const [n, mats] of mfgmatByOf) {
      mfgmatMap.set(
        n,
        mats.map((m) => ({
          article: m.article,
          description: m.description,
          unit: m.unit,
          remaining: m.remaining,
          allocated: m.allocated,
        })),
      )
    }

    const articlesMap = new Map<string, Article>(articlesList.map((a) => [a.code, a]))
    const nomenclaturesMap = buildNomenclatureMap(nomEntries)

    // Stock pour tous les articles du pool + composants de nomenclature.
    const stockArticles = new Set<string>(pool.map((o) => o.article))
    for (const e of nomEntries) {
      stockArticles.add(e.parentArticle)
      stockArticles.add(e.componentArticle)
    }
    const stockFlows = await boardDataset.getStock([...stockArticles]).catch(() => [])
    const stocksMap = buildStocksMap(
      stockFlows.map((f) => ({ article: f.article, origin: f.origin as { subType?: string }, quantity: f.quantity })),
    )

    const receptionFlows = await new X3ReceptionRepository().getReceptionFlows().catch(() => [])
    const receptionsMap = buildReceptionsMap(
      receptionFlows.map((f) => ({
        article: f.article,
        id: (f.origin as { id?: string }).id,
        supplier: (f.origin as { supplier?: string }).supplier,
        quantity: f.quantity,
        date: f.date,
      })),
    )

    const loader: DiagnosticLoader = {
      getArticle: (a) => articlesMap.get(a),
      getNomenclature: (a) => nomenclaturesMap.get(a),
      getStock: (a) => stocksMap.get(a),
      getReceptions: (a) => receptionsMap.get(a) ?? [],
      // Allocations ERP non chargées en v1 : la MFGMAT reflète déjà l'alloué (ALLQTY),
      // et evaluateMfgFeasibility en tient compte.
      getAllocationsOf: () => [],
      getMfgmat: (n) => mfgmatMap.get(n) ?? [],
      getOfsByArticle: (article, statut, dateBesoin) => {
        let f = pool.filter((o) => o.article === article)
        if (statut !== undefined) f = f.filter((o) => o.statutNum === statut)
        if (dateBesoin) f = f.filter((o) => !o.dateFin || o.dateFin <= dateBesoin)
        return f
      },
    }

    const checker = new RecursiveDiagnosticChecker(loader, { checkDate: new Date(), useReceptions: true })
    return checker.diagnoseOf(head)
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
