/**
 * Planning-board feasibility evaluation with concurrency and what-if simulation.
 *
 * Mirrors production_planning.services.planning_board_feasibility.
 */

import type { Article } from './models/article.js'
import type { Nomenclature } from './models/nomenclature.js'
import { RecursiveChecker, type RecursiveCheckerLoader, type StockRecord, type OfRecord } from './recursive-checker.js'
import { StockState } from './stock-state.js'
import type { ErpAllocation } from './allocation.js'

export interface PlanningBoardFeasibilityEntry {
  numOf: string
  article: string
  faisable: boolean
  statut: 'ok' | 'blocked' | 'sans_nomenclature'
  missingComponents: Record<string, number>
  allocated: Record<string, number>
  commandes: Array<{ numCommande: string; article: string; qteRestante: number }>
}

export interface PlanningBoardFeasibilityLoader {
  getArticle(article: string): Article | undefined
  getNomenclature(article: string): Nomenclature | undefined
  getStock(article: string): StockRecord | undefined
  getReceptions(article: string): Array<{ id: string; article: string; supplier: string; quantity: number; date: Date }>
  getAllocationsOf?(numDoc: string): ErpAllocation[]
  getOfsByArticle(article: string, statut?: number, dateBesoin?: Date): OfRecord[]
  commandesClients?: Array<{
    numCommande: string
    nomClient: string
    article: string
    qteRestante: number
    dateExpeditionDemandee: Date
    typeCommande: string
    ofContremarque: string
  }>
}

export interface WhatIfResult {
  nouvelle: { faisable: boolean; missingComponents: Record<string, number> }
  degraded: Array<{
    numOf: string
    composantsPerdus: Record<string, number>
    commandes: Array<{ numCommande: string; article: string; qteRestante: number }>
  }>
  improved: unknown[]
  stats: { nbDegrades: number; nbCommandesTouches: number }
}

function isInWindow(of: OfRecord, fromD: Date, toD: Date): boolean {
  const debut = of.dateDebut ?? fromD
  const fin = of.dateFin ?? toD
  return debut <= toD && fin >= fromD
}

export function buildEffectiveOfs(
  loader: PlanningBoardFeasibilityLoader,
  overrides: Record<string, Partial<OfRecord>>,
  fromD: Date,
  toD: Date,
): OfRecord[] {
  const allOfs = loader.getOfsByArticle('', undefined, fromD)
  const effective: OfRecord[] = []
  for (const of of allOfs) {
    const overridden = { ...of, ...overrides[of.numOf] }
    if (isInWindow(overridden, fromD, toD)) {
      effective.push(overridden)
    }
  }
  return effective
}

function makeChecker(
  loader: PlanningBoardFeasibilityLoader,
  horizonEnd: Date,
  stockState: StockState,
): RecursiveChecker {
  const rcLoader: RecursiveCheckerLoader = {
    getArticle: (a) => loader.getArticle(a),
    getNomenclature: (a) => loader.getNomenclature(a),
    getStock: (a) => loader.getStock(a),
    getReceptions: (a) => loader.getReceptions(a),
    getAllocationsOf: (numDoc) => loader.getAllocationsOf?.(numDoc) ?? [],
    getOfsByArticle: (article, statut, dateBesoin) => loader.getOfsByArticle(article, statut, dateBesoin),
  }
  return new RecursiveChecker(rcLoader, { dispoPolicy: 'stock_plus_receptions', checkDate: horizonEnd, stockState })
}

function collectArticles(ofs: OfRecord[], loader: PlanningBoardFeasibilityLoader): Set<string> {
  const articles = new Set<string>()
  for (const of of ofs) {
    const bom = loader.getNomenclature(of.article)
    if (bom) {
      for (const comp of bom.components) {
        articles.add(comp.componentArticle)
      }
    }
  }
  return articles
}

function buildInitialStock(
  loader: PlanningBoardFeasibilityLoader,
  articles: Set<string>,
  horizonEnd: Date,
): Map<string, number> {
  const initialStock = new Map<string, number>()
  for (const article of articles) {
    const s = loader.getStock(article)
    let available = s ? s.stockPhysique - s.stockAlloue : 0
    for (const rec of loader.getReceptions(article)) {
      if (rec.date <= horizonEnd) available += rec.quantity
    }
    initialStock.set(article, available)
  }
  return initialStock
}

export function evaluateWindow(
  loader: PlanningBoardFeasibilityLoader,
  ofs: OfRecord[],
  horizonEnd: Date,
): Record<string, PlanningBoardFeasibilityEntry> {
  const commandesByOf = new Map<string, PlanningBoardFeasibilityEntry['commandes']>()
  for (const cmd of loader.commandesClients ?? []) {
    if (cmd.ofContremarque) {
      const list = commandesByOf.get(cmd.ofContremarque) ?? []
      list.push({
        numCommande: cmd.numCommande,
        article: cmd.article,
        qteRestante: cmd.qteRestante,
      })
      commandesByOf.set(cmd.ofContremarque, list)
    }
  }

  const sorted = [...ofs].sort((a, b) => {
    const pa = a.statutNum === 1 ? 0 : a.statutNum === 2 ? 1 : 2
    const pb = b.statutNum === 1 ? 0 : b.statutNum === 2 ? 1 : 2
    if (pa !== pb) return pa - pb
    const da = a.dateDebut?.getTime() ?? 0
    const db = b.dateDebut?.getTime() ?? 0
    if (da !== db) return da - db
    return a.numOf.localeCompare(b.numOf)
  })

  const articles = collectArticles(sorted, loader)
  const stockState = new StockState(buildInitialStock(loader, articles, horizonEnd))
  const checker = makeChecker(loader, horizonEnd, stockState)

  const entries: Record<string, PlanningBoardFeasibilityEntry> = {}
  for (const of of sorted) {
    const dateBesoin = of.dateDebut ?? horizonEnd
    const hasBom = !!loader.getNomenclature(of.article)
    if (!hasBom) {
      entries[of.numOf] = {
        numOf: of.numOf,
        article: of.article,
        faisable: false,
        statut: 'sans_nomenclature',
        missingComponents: {},
        allocated: {},
        commandes: commandesByOf.get(of.numOf) ?? [],
      }
      continue
    }

    const result = checker.checkArticleRecursive(of.article, of.qteRestante, dateBesoin, 0, of.statutNum === 1, of.numOf)

    const allocated: Record<string, number> = {}
    if (result.feasible) {
      const bom = loader.getNomenclature(of.article)
      if (bom) {
        for (const comp of bom.components) {
          if (comp.componentType !== 'ACHETE') continue
          const needed = comp.consumptionNature === 'FORFAIT' ? comp.linkQuantity : comp.linkQuantity * of.qteRestante
          const qty = Math.min(needed, stockState.getAvailable(comp.componentArticle))
          if (qty > 0) {
            allocated[comp.componentArticle] = qty
          }
        }
      }
      if (Object.keys(allocated).length > 0) {
        stockState.allocate(of.numOf, allocated)
      }
    }

    entries[of.numOf] = {
      numOf: of.numOf,
      article: of.article,
      faisable: result.feasible,
      statut: result.feasible ? 'ok' : 'blocked',
      missingComponents: result.missingComponents,
      allocated,
      commandes: commandesByOf.get(of.numOf) ?? [],
    }
  }

  return entries
}

export function whatifOrder(
  loader: PlanningBoardFeasibilityLoader,
  overrides: Record<string, Partial<OfRecord>>,
  article: string,
  quantite: number,
  dateBesoin: Date,
  fromD: Date,
  toD: Date,
): WhatIfResult {
  const baselineOfs = buildEffectiveOfs(loader, overrides, fromD, toD)
  const baseline = evaluateWindow(loader, baselineOfs, toD)

  const virtualOf: OfRecord = {
    numOf: 'nouvelle',
    article,
    statutNum: 1,
    qteRestante: quantite,
    dateDebut: dateBesoin,
    dateFin: dateBesoin,
  }
  const withVirtual = [...baselineOfs, virtualOf].sort((a, b) => {
    const pa = a.statutNum === 1 ? 0 : a.statutNum === 2 ? 1 : 2
    const pb = b.statutNum === 1 ? 0 : b.statutNum === 2 ? 1 : 2
    if (pa !== pb) return pa - pb
    const da = a.dateDebut?.getTime() ?? 0
    const db = b.dateDebut?.getTime() ?? 0
    if (da !== db) return da - db
    return a.numOf.localeCompare(b.numOf)
  })
  const withVirtualResult = evaluateWindow(loader, withVirtual, toD)

  const nouvelle = withVirtualResult['nouvelle']
  const degraded: WhatIfResult['degraded'] = []
  let nbCommandesTouches = 0

  for (const [numOf, entry] of Object.entries(withVirtualResult)) {
    if (numOf === 'nouvelle') continue
    const baselineEntry = baseline[numOf]
    if (!baselineEntry) continue
    if (baselineEntry.faisable && !entry.faisable) {
      const composantsPerdus: Record<string, number> = {}
      for (const [comp, gap] of Object.entries(entry.missingComponents)) {
        composantsPerdus[comp] = gap
      }
      degraded.push({
        numOf,
        composantsPerdus,
        commandes: entry.commandes,
      })
      nbCommandesTouches += entry.commandes.length
    }
  }

  return {
    nouvelle: {
      faisable: nouvelle?.faisable ?? false,
      missingComponents: nouvelle?.missingComponents ?? {},
    },
    degraded,
    improved: [],
    stats: {
      nbDegrades: degraded.length,
      nbCommandesTouches,
    },
  }
}
