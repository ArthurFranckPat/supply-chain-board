/**
 * Diagnostic récursif d'un OF (issue #25). Descend la chaîne des OF — MFGMAT d'abord
 * (OF fermes/planifiés éclatés), repli nomenclature théorique pour les OF suggérés sans
 * MFGMAT — pour désigner le VRAI composant bloquant, ou conclure qu'il n'y a qu'un OF de
 * sous-ensemble à lancer. Distinct du mode direct (ofMaterials, MFGMAT 1 niveau).
 *
 * Extrait de `PlanningBoardController.ofMaterialsDiagnostic` (issue #49) : construction
 * pool + chargeurs paresseux memoïsés + mapping debug, 142 l. inline dans le controller.
 */

import type { HttpContext } from '@adonisjs/core/http'
import boardDataset from '#services/board_dataset'
import {
  buildStocksMap,
  buildReceptionsMap,
  buildNomenclatureMap,
} from '#services/feasibility-loader-adapter'
import type { OfRecord, StockRecord, ReceptionRecord } from '#app/domain/recursive-checker'
import {
  evaluateMfgFeasibility,
  buildStrictQcStock,
  type MfgMaterialInput,
} from '#app/domain/of-feasibility'
import {
  RecursiveDiagnosticChecker,
  type DiagnosticLoader,
} from '#app/domain/recursive-diagnostic-checker'
import type { Flow } from '#app/domain/models/flow'
import { X3MfgmatRepository } from '#repositories/mfgmat_repository'
import type { Article } from '#app/domain/models/article'

/** Retourne `null` si `numOf` est introuvable dans le pool (404 côté controller). */
export async function loadOfMaterialsDiagnostic(ctx: HttpContext, numOf: string) {
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
  if (!head) return null

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
      flows.map((f) => ({
        article: f.article,
        origin: f.origin as { subType?: string },
        quantity: f.quantity,
      }))
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
          }))
        )
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

  // useReceptions retiré (issue #51) : option jamais lue par RecursiveDiagnosticChecker —
  // les réceptions sont déjà remontées séparément en métadonnée (receptionFields), le
  // verdict de la descente reste toujours stock strict (parité badge/détail, issue #11).
  const checker = new RecursiveDiagnosticChecker(loader, { checkDate: new Date() })
  const tDesc = Date.now()
  const result = await checker.diagnoseOf(head)
  ctx.logger.info(
    `[diagnostic #55] ${head.numOf}: descente=${Date.now() - tDesc}ms mfgmat=${mfgmatCalls}×/${mfgmatMs}ms stock=${stockCalls}×/${stockMs}ms nodes=${result.componentsChecked} depth=${result.maxDepthReached}`
  )

  // Debug (page de test #25) : confronte le verdict récursif au mode DIRECT classique
  // (ofMaterials : MFGMAT 1 niveau, stock strict/qc) sur l'OF de tête.
  const headMat = await loadMfgmat(head.numOf)
  const directStockArticles = [...new Set(headMat.map((m) => m.article).filter(Boolean))]
  const directStockFlows = await boardDataset.getStock(directStockArticles).catch(() => [])
  const directVerdict = evaluateMfgFeasibility(
    headMat,
    buildStrictQcStock(directStockFlows),
    head.statutNum === 1
  )
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
          .map((m) => ({
            article: m.article,
            remaining: m.remaining,
            available: m.available,
            missing: m.missing,
          })),
        unknownStock: directVerdict.materials
          .filter((m) => m.available === null)
          .map((m) => m.article),
      },
    },
  }
}
