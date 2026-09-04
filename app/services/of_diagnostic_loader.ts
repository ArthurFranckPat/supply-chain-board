/**
 * Diagnostic récursif d'un OF (issue #25). Descend la chaîne des OF — MFGMAT d'abord
 * (OF fermes/planifiés éclatés), repli nomenclature théorique pour les OF suggérés sans
 * MFGMAT — pour désigner le VRAI composant bloquant, ou conclure qu'il n'y a qu'un OF de
 * sous-ensemble à lancer. Distinct du mode direct (ofMaterials, MFGMAT 1 niveau).
 *
 * Extrait de `PlanningBoardController.ofMaterialsDiagnostic` (issue #49) : construction
 * pool + chargeurs paresseux memoïsés + mapping debug, 142 l. inline dans le controller.
 */

import logger from '@adonisjs/core/services/logger'
import boardDataset from '#services/board_dataset'
import {
  buildStocksMap,
  buildReceptionsMap,
  buildNomenclatureMap,
} from '#services/feasibility_loader_adapter'
import type { OfRecord, StockRecord, ReceptionRecord } from '#app/domain/recursive_checker'
import {
  evaluateMfgFeasibility,
  buildStrictQcStock,
  type MfgMaterialInput,
} from '#app/domain/of_feasibility'
import {
  RecursiveDiagnosticChecker,
  type DiagnosticLoader,
} from '#app/domain/recursive_diagnostic_checker'
import type { Flow } from '#app/domain/models/flow'
import { X3MfgmatRepository } from '#repositories/mfgmat_repository'
import type { Article } from '#app/domain/models/article'
import { requiredQuantity, type NomenclatureEntry } from '#app/domain/models/nomenclature'

/**
 * Nombre max d'OF concurrents dont on LIT la MFGMAT pour mesurer leur besoin réel. Chaque
 * lecture est un appel SOAP (memoïsé, partagé avec la descente). Au-delà, les concurrents
 * sont comptés mais leur quantité n'est pas devinée : mieux vaut un plancher annoncé comme
 * tel qu'un total théorique faux.
 */
const COMPETING_MEASURE_CAP = 8
/** Concurrents nommés à l'écran (les plus proches du besoin). */
const COMPETING_SAMPLE_CAP = 3

/**
 * Diagnostic récursif d'un OF. Pure-ish (I/O board + MFGMAT), sans HttpContext —
 * appelable depuis controller HTTP **et** tools agent.
 *
 * Retourne `null` si `numOf` est introuvable dans le pool (404 côté controller).
 */
export async function loadOfMaterialsDiagnostic(numOf: string) {
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

  /**
   * Index inverse composant → lien parent (niveau 1), construit paresseusement UNE fois.
   * Sert uniquement à divulguer la concurrence (`getCompetingDemand`) : aucun verdict n'en
   * dépend, donc on se limite au niveau direct — pas de fermeture fantôme, pas de descente.
   */
  let parentLinks: Map<string, NomenclatureEntry[]> | null = null
  const getParentLinks = (): Map<string, NomenclatureEntry[]> => {
    if (parentLinks) return parentLinks
    const index = new Map<string, NomenclatureEntry[]>()
    for (const nom of nomenclaturesMap.values()) {
      for (const entry of nom.components) {
        const list = index.get(entry.componentArticle)
        if (list) list.push(entry)
        else index.set(entry.componentArticle, [entry])
      }
    }
    parentLinks = index
    return index
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
    /**
     * Qui d'autre veut ce composant AVANT moi.
     *
     * Le REPÉRAGE des concurrents est pur mémoire (pool + nomenclatures déjà chargés). Leur
     * BESOIN, lui, suit la règle 1 : MFGMAT quand l'OF est éclaté (une lecture memoïsée,
     * partagée avec la descente), nomenclature théorique seulement en repli — un OF éclaté
     * de 2592 pièces peut n'avoir besoin que de 956 unités du composant, et la théorique
     * seule affichait 2592. Lecture plafonnée à COMPETING_MEASURE_CAP OF, les plus proches
     * du besoin d'abord ; au-delà, l'OF est compté mais sa quantité n'est PAS devinée
     * (`partial` le dit, la quantité devient un plancher).
     *
     * Les OF sans date sont exclus : on ne compte que les concurrents dont l'antériorité est
     * démontrable.
     */
    getCompetingDemand: async (article, before, excludeOfs) => {
      const empty = {
        quantity: 0,
        ofCount: 0,
        measuredCount: 0,
        partial: false,
        sample: [] as Array<{ numOf: string; quantity: number }>,
      }
      const links = getParentLinks().get(article)
      if (!links || links.length === 0) return empty
      // Un parent peut lister le composant plusieurs fois : un seul lien retenu par parent,
      // sinon la demande d'un même OF serait comptée autant de fois qu'il y a de lignes.
      const linkByParent = new Map<string, NomenclatureEntry>()
      for (const link of links) {
        if (!linkByParent.has(link.parentArticle)) linkByParent.set(link.parentArticle, link)
      }
      const excluded = new Set(excludeOfs)
      const candidates = pool.filter(
        (o) =>
          !excluded.has(o.numOf) &&
          o.dateFin !== undefined &&
          o.dateFin !== null &&
          o.dateFin <= before &&
          linkByParent.has(o.article)
      )
      if (candidates.length === 0) return empty

      // Les plus proches du besoin d'abord : ce sont eux qui se disputent réellement la
      // production, et ce sont eux qu'on mesure si le plafond oblige à choisir.
      candidates.sort((a, b) => (b.dateFin?.getTime() ?? 0) - (a.dateFin?.getTime() ?? 0))

      let quantity = 0
      let measuredCount = 0
      const sample: Array<{ numOf: string; quantity: number }> = []
      for (const o of candidates.slice(0, COMPETING_MEASURE_CAP)) {
        const materials = await loadMfgmat(o.numOf).catch(() => [])
        let need: number
        if (materials.length > 0) {
          // Règle 1 : MFGMAT = besoin réel, net de l'alloué (règle 3).
          need = materials
            .filter((m) => m.article === article)
            .reduce((sum, m) => sum + Math.max(0, m.remaining - (m.allocated ?? 0)), 0)
        } else {
          need = requiredQuantity(linkByParent.get(o.article)!, o.qteRestante)
        }
        if (need <= 0) continue
        quantity += need
        measuredCount++
        if (sample.length < COMPETING_SAMPLE_CAP) sample.push({ numOf: o.numOf, quantity: need })
      }

      return {
        quantity,
        ofCount: candidates.length,
        measuredCount,
        partial: candidates.length > COMPETING_MEASURE_CAP,
        sample,
      }
    },
  }

  // useReceptions retiré (issue #51) : option jamais lue par RecursiveDiagnosticChecker —
  // les réceptions sont déjà remontées séparément en métadonnée (receptionFields), le
  // verdict de la descente reste toujours stock strict (parité badge/détail, issue #11).
  const checker = new RecursiveDiagnosticChecker(loader, { checkDate: new Date() })
  const tDesc = Date.now()
  const result = await checker.diagnoseOf(head)
  logger.info(
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
          .filter((m) => !m.feasible)
          .map((m) => ({
            article: m.article,
            remaining: m.remaining,
            available: m.available,
            missing: m.missing,
          })),
      },
    },
  }
}
