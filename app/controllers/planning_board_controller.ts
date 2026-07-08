import { HttpContext } from '@adonisjs/core/http'
import { OverrideStore } from '#services/override_store'
import { buildStocksMap, buildReceptionsMap, buildNomenclatureMap } from '#services/feasibility-loader-adapter'
import type { OfRecord, StockRecord, ReceptionRecord } from '#app/domain/recursive-checker'
import boardDataset from '#services/board_dataset'
import { loadOrderImpacts } from '#services/order_impacts_loader'
import { evaluateMfgFeasibility, buildStrictQcStock, type MfgMaterialInput } from '#app/domain/of-feasibility'
import { RecursiveDiagnosticChecker, type DiagnosticLoader } from '#app/domain/recursive-diagnostic-checker'
import type { Flow } from '#app/domain/models/flow'
import type { ManufacturingOrder } from '#repositories/of_repository'
import type { GammeOperation } from '#app/domain/models/gamme'
import { X3MfgmatRepository } from '#repositories/mfgmat_repository'
import type { Article } from '#app/domain/models/article'

/**
 * PlanningBoardController — endpoints OF LIVE consommés par le board unifié (/programme) :
 *   - PATCH /ofs/:of           : override d'OF (date/statut/poste/note)
 *   - POST /board-feasibility  : badges de faisabilité (loadOrderImpacts)
 *   - GET  /articles-by-component : recherche composant → PF parents
 *   - GET  /search/{poste,of,pf}  : recherche board
 *   - GET  /of-materials/:of/diagnostic : diagnostic récursif (issue #25)
 *
 * Endpoints legacy (index/show/whatif/orderImpacts/shortages/events/overrides/feasibility/
 * nomenclature/reload/resetOverride) supprimés : non appelés par le front (board unifié sur
 * /programme). Les helpers lourds associés (getSupplyFlows/getStockFlows full scan) partent
 * avec — cf. cleanup 2026-06-27.
 */
export default class PlanningBoardController {
  private get store() {
    return new OverrideStore()
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

  /** POST /api/v1/planning/board-feasibility — badges de faisabilité (pipeline partagé loadOrderImpacts). */
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
    // useWindowOfs : OFs scopés par STRDAT (comme le board /programme) → badges alignés sur
    // les OF VISIBLES (sinon on badgeait des OF ENDDAT hors board) + demande WIPTYP=1+2 sans
    // OFs (getDemandAndReception lean). Phase 2 (MFGMAT+pegs) conservée : badges MFGMAT-based
    // (parité panneau de détail, issue #11).
    const { result } = await loadOrderImpacts({
      from: windowFrom,
      to: windowTo,
      workstation: workstationFilter,
      mode: mode as 'immediate' | 'sequential' | undefined,
      force: !!ctx.request.input('refresh'),
      pipeline: 'board-badges',
    })

    return result
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

    // getPool() = getOrders() seul (cache global SWR). Surtout ne pas rajouter de
    // fenêtre getLive ici : cf. BoardDataset.getPool (#55, fetchLive 13 mois jeté).
    const [poolData, nomEntries, articlesList] = await Promise.all([
      boardDataset.getPool(),
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

    let mfgmatCalls = 0
    let mfgmatMs = 0
    const loadMfgmat = (n: string): Promise<MfgMaterialInput[]> => {
      const hit = mfgmatCache.get(n)
      if (hit) return hit
      const started = Date.now()
      const p = mfgmatRepo.getMaterials(n).then((mats) => {
        mfgmatCalls++
        mfgmatMs += Date.now() - started
        return mats.map((m) => ({
          article: m.article,
          description: m.description,
          unit: m.unit,
          remaining: m.remaining,
          allocated: m.allocated,
        }))
      })
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
    let stockCalls = 0
    let stockMs = 0
    const loadStocks = async (articles: string[]): Promise<Map<string, StockRecord | undefined>> => {
      const startedStock = Date.now()
      const flows = await stockRepo.getStock(articles).catch(() => [])
      stockCalls++
      stockMs += Date.now() - startedStock
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
    const tDesc = Date.now()
    const result = await checker.diagnoseOf(head)
    ctx.logger.info(
      `[diagnostic #55] ${head.numOf}: descente=${Date.now() - tDesc}ms mfgmat=${mfgmatCalls}×/${mfgmatMs}ms stock=${stockCalls}×/${stockMs}ms nodes=${result.componentsChecked} depth=${result.maxDepthReached}`,
    )

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
