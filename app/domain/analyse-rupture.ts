/**
 * Analyse de rupture — remontée d'impact composant.
 *
 * Depuis un composant en rupture :
 * 1. BFS inverse avec ratios cumulés (composant → parents)
 * 2. Pool multi-niveaux (stock × ratio à chaque niveau BOM)
 * 3. Waterfall chronologique (commandes consomment le pool)
 *
 * Port de feasibility/analyse_rupture.py.
 */

import type { Flow } from './models/flow.js'
import type { Article } from './models/article.js'
import type { Nomenclature } from './models/nomenclature.js'
import { currentStock } from './availability.js'

const MAX_DEPTH = 10
const MAX_NODES = 10_000

export interface ComponentInfo {
  code: string
  description: string
  stockPhysique: number
  stockDisponible: number
  poolTotal: number
  deficit: number
}

export interface PoolContrib {
  article: string
  description: string
  category: 'COMPOSANT' | 'SF' | 'PF'
  stockUtilise: number
  ratioCumule: number
  contribution: number
}

export interface BlockedOrder {
  numCommande: string
  client: string
  article: string
  qteRestante: number
  dateExpedition: string
  nature: string
  cheminImpact: string[]
  qteImpactComposant: number
  projPool: number
  etat: 'OK' | 'RUPTURE'
}

export interface BlockedOf {
  numOf: string
  article: string
  qteRestante: number
  dateFin: string
  statut: string
}

export interface RuptureSummary {
  totalBlockedOfs: number
  totalAffectedOrders: number
  maxBomDepth: number
  nodesVisited: number
  truncated: boolean
}

export interface RuptureResult {
  component: ComponentInfo
  blockedOrders: BlockedOrder[]
  blockedOfsWithoutOrder: BlockedOf[]
  summary: RuptureSummary
}

// ── Reverse index ────────────────────────────────────────────

interface ReverseEntry {
  parentArticle: string
  linkQuantity: number
}

function buildReverseIndex(nomenclatures: Map<string, Nomenclature>): Map<string, ReverseEntry[]> {
  const index = new Map<string, ReverseEntry[]>()
  const seen = new Map<string, Set<string>>()

  for (const [parentArticle, nomen] of nomenclatures) {
    for (const entry of nomen.components) {
      const key = entry.componentArticle
      const seenSet = seen.get(key) ?? new Set<string>()
      if (seenSet.has(parentArticle)) continue
      seenSet.add(parentArticle)
      seen.set(key, seenSet)

      const list = index.get(key) ?? []
      list.push({ parentArticle, linkQuantity: entry.linkQuantity })
      index.set(key, list)
    }
  }

  return index
}

// ── BFS upward with cumulative ratios ────────────────────────

function bfsUpward(
  componentCode: string,
  reverseIndex: Map<string, ReverseEntry[]>,
): { paths: string[][]; articleRatios: Map<string, number>; nodesVisited: number; truncated: boolean } {
  const queue: Array<[string, string[], number]> = [[componentCode, [componentCode], 1.0]]
  const visited = new Set<string>([componentCode])
  const paths: string[][] = []
  const articleRatios = new Map<string, number>([[componentCode, 1.0]])
  let nodesVisited = 0
  let truncated = false

  while (queue.length > 0) {
    if (nodesVisited >= MAX_NODES) {
      truncated = true
      break
    }

    const [current, path, ratio] = queue.shift()!
    nodesVisited++

    const parents = reverseIndex.get(current) ?? []

    if (parents.length === 0) {
      if (path.length > 1) paths.push(path)
      continue
    }

    for (const entry of parents) {
      const parentRatio = ratio * entry.linkQuantity

      if (path.length >= MAX_DEPTH) {
        paths.push(path)
        truncated = true
        continue
      }

      const newPath = [...path, entry.parentArticle]

      if (visited.has(entry.parentArticle)) {
        paths.push(newPath)
        const existing = articleRatios.get(entry.parentArticle) ?? 0
        if (parentRatio > existing) articleRatios.set(entry.parentArticle, parentRatio)
        continue
      }

      visited.add(entry.parentArticle)
      articleRatios.set(entry.parentArticle, parentRatio)
      queue.push([entry.parentArticle, newPath, parentRatio])
    }
  }

  return { paths, articleRatios, nodesVisited, truncated }
}

// ── Article paths (shortest path per article) ────────────────

function buildArticlePaths(paths: string[][]): Map<string, string[]> {
  const articlePaths = new Map<string, string[]>()
  for (const path of paths) {
    for (let i = 1; i < path.length; i++) {
      const article = path[i]
      const subPath = path.slice(0, i + 1)
      const existing = articlePaths.get(article)
      if (!existing || subPath.length < existing.length) {
        articlePaths.set(article, subPath)
      }
    }
  }
  return articlePaths
}

// ── Multi-level pool ─────────────────────────────────────────

function computePool(
  componentCode: string,
  articleRatios: Map<string, number>,
  articles: Map<string, Article>,
  flows: Flow[],
): { poolTotal: number; repartition: PoolContrib[] } {
  const repartition: PoolContrib[] = []
  let poolTotal = 0

  for (const [articleCode, ratio] of articleRatios) {
    const art = articles.get(articleCode)
    if (!art) continue

    const stockPhys = currentStock(flows, articleCode)
    let category: 'COMPOSANT' | 'SF' | 'PF'
    let contrib: number

    if (articleCode === componentCode) {
      category = 'COMPOSANT'
      contrib = stockPhys * ratio
    } else if (art.category?.startsWith('SF') || art.category === 'STF') {
      category = 'SF'
      contrib = stockPhys * ratio
    } else if (art.category?.startsWith('PF')) {
      category = 'PF'
      contrib = stockPhys * ratio
    } else {
      category = 'SF'
      contrib = stockPhys * ratio
    }

    poolTotal += contrib

    repartition.push({
      article: articleCode,
      description: art.description ?? '',
      category,
      stockUtilise: stockPhys,
      ratioCumule: ratio,
      contribution: contrib,
    })
  }

  repartition.sort((a, b) => {
    if (a.category === 'COMPOSANT' && b.category !== 'COMPOSANT') return -1
    if (a.category !== 'COMPOSANT' && b.category === 'COMPOSANT') return 1
    return b.contribution - a.contribution
  })

  return { poolTotal, repartition }
}

// ── Waterfall simulation ─────────────────────────────────────

interface WaterfallDemand {
  numCommande: string
  client: string
  article: string
  qteRestante: number
  dateExpedition: Date
  nature: string
  ratio: number
}

function computeWaterfall(
  articleRatios: Map<string, number>,
  articlePaths: Map<string, string[]>,
  poolTotal: number,
  demands: Flow[],
  flows: Flow[],
): Map<string, BlockedOrder> {
  const waterfallDemands: WaterfallDemand[] = []

  for (const [articleCode, ratio] of articleRatios) {
    for (const d of demands) {
      if (d.article !== articleCode || d.direction !== 'demand') continue
      if (d.quantity <= 0) continue
      waterfallDemands.push({
        numCommande: (d.origin as any).id ?? '',
        client: (d.origin as any).client ?? '',
        article: d.article,
        qteRestante: d.quantity,
        dateExpedition: d.date ?? new Date(),
        nature: d.origin.type === 'order' ? 'COMMANDE' : 'PREVISION',
        ratio,
      })
    }
  }

  waterfallDemands.sort((a, b) => a.dateExpedition.getTime() - b.dateExpedition.getTime())

  const remainingStock = new Map<string, number>()
  for (const articleCode of articleRatios.keys()) {
    remainingStock.set(articleCode, currentStock(flows, articleCode))
  }

  let cumulImpact = 0
  const results = new Map<string, BlockedOrder>()

  for (const demand of waterfallDemands) {
    const stockAvail = remainingStock.get(demand.article) ?? 0
    const fromStock = Math.min(demand.qteRestante, stockAvail)
    remainingStock.set(demand.article, stockAvail - fromStock)

    const stillUncovered = demand.qteRestante - fromStock
    const qteImpact = stillUncovered * demand.ratio
    cumulImpact += qteImpact

    const projPool = poolTotal - cumulImpact
    const etat = projPool < 0 ? 'RUPTURE' : 'OK'

    const key = `${demand.numCommande}|${demand.article}|${demand.dateExpedition.toISOString()}`
    const existing = results.get(key)
    const chemin = articlePaths.get(demand.article) ?? []

    if (existing) {
      existing.qteImpactComposant += qteImpact
      existing.projPool = projPool
      existing.etat = etat
    } else {
      results.set(key, {
        numCommande: demand.numCommande,
        client: demand.client,
        article: demand.article,
        qteRestante: demand.qteRestante,
        dateExpedition: demand.dateExpedition.toISOString(),
        nature: demand.nature,
        cheminImpact: chemin,
        qteImpactComposant: qteImpact,
        projPool,
        etat,
      })
    }
  }

  return results
}

// ── OF collection ────────────────────────────────────────────

function collectBlockedOfs(
  articlePaths: Map<string, string[]>,
  flows: Flow[],
): { allBlocked: BlockedOf[]; byArticle: Map<string, BlockedOf[]> } {
  const allBlocked: BlockedOf[] = []
  const byArticle = new Map<string, BlockedOf[]>()
  const seen = new Set<string>()

  for (const articleCode of articlePaths.keys()) {
    for (const flow of flows) {
      if (flow.direction !== 'supply' || flow.origin.type !== 'of') continue
      if (flow.article !== articleCode) continue
      const id = (flow.origin as any).id ?? ''
      if (seen.has(id)) continue
      seen.add(id)

      const blocked: BlockedOf = {
        numOf: id,
        article: flow.article,
        qteRestante: flow.quantity,
        dateFin: flow.date?.toISOString() ?? '',
        statut: String((flow.origin as any).status ?? ''),
      }
      allBlocked.push(blocked)
      const list = byArticle.get(articleCode) ?? []
      list.push(blocked)
      byArticle.set(articleCode, list)
    }
  }

  return { allBlocked, byArticle }
}

// ── Main entry point ─────────────────────────────────────────

export function analyseRupture(
  componentCode: string,
  flows: Flow[],
  nomenclatures: Map<string, Nomenclature>,
  articles: Map<string, Article>,
  options?: { includePrevisions?: boolean },
): RuptureResult {
  const includePrevisions = options?.includePrevisions ?? false

  const article = articles.get(componentCode)
  const stockPhysique = currentStock(flows, componentCode)

  const reverseIndex = buildReverseIndex(nomenclatures)
  const { paths, articleRatios, nodesVisited, truncated } = bfsUpward(componentCode, reverseIndex)
  const articlePaths = buildArticlePaths(paths)

  const { allBlocked, byArticle } = collectBlockedOfs(articlePaths, flows)

  const { poolTotal, repartition: _repartition } = computePool(
    componentCode, articleRatios, articles, flows,
  )

  const demands = flows.filter((f) => {
    if (f.direction !== 'demand') return false
    if (!includePrevisions && f.origin.type === 'forecast') return false
    return true
  })

  const waterfallResults = computeWaterfall(
    articleRatios, articlePaths, poolTotal, demands, flows,
  )

  const blockedOrders = [...waterfallResults.values()].sort(
    (a, b) => a.dateExpedition.localeCompare(b.dateExpedition),
  )

  const ofsInOrders = new Set<string>()
  for (const _order of blockedOrders) {
    for (const path of articlePaths.values()) {
      for (const art of path) {
        for (const of_ of byArticle.get(art) ?? []) {
          ofsInOrders.add(of_.numOf)
        }
      }
    }
  }

  const blockedOfsWithoutOrder = allBlocked.filter((of_) => !ofsInOrders.has(of_.numOf))
  blockedOfsWithoutOrder.sort((a, b) => a.dateFin.localeCompare(b.dateFin))

  const deficit = Math.max(0, allBlocked.reduce((sum, of_) => sum + of_.qteRestante, 0) - stockPhysique)

  const maxDepth = Math.max(0, ...[...articlePaths.values()].map((p) => p.length))

  return {
    component: {
      code: componentCode,
      description: article?.description ?? '',
      stockPhysique,
      stockDisponible: stockPhysique,
      poolTotal,
      deficit,
    },
    blockedOrders,
    blockedOfsWithoutOrder,
    summary: {
      totalBlockedOfs: allBlocked.length,
      totalAffectedOrders: blockedOrders.length,
      maxBomDepth: maxDepth,
      nodesVisited,
      truncated,
    },
  }
}
