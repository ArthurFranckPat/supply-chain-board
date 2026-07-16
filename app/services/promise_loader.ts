/**
 * Loader CTP — dérive PromiseDataset des caches boardDataset (SWR partagé).
 *
 * Aucun appel X3 direct par requête CTP (PRD §8.7) : tout vient des lookups
 * déjà en cache (`board:*`), comme le board et le suivi. Le calcul CTP =
 * une descente d'arbre en mémoire, O(taille BOM).
 *
 * PRD §8.3 : stockNet et receptions sont nets des allocations au niveau article
 * (buildStrictQcStock = PHYSTO − PHYALL − GLOALL). Le netting ligne-par-ligne
 * (allocations détaillées STOALL) est une amélioration future — documentée.
 */

import boardDataset from '#services/board_dataset'
import { buildNomenclatureMap } from '#services/feasibility-loader-adapter'
import { buildStrictQcStock } from '#app/domain/of-feasibility'
import { buildArticleCatalog, expandArticleSetWithBom } from '#app/domain/order-impacts-assembly'
import {
  computePromiseDate,
  type PromiseDataset,
  type PromiseResult,
  type DatedSupply,
} from '#app/domain/promise-engine'
import type { Flow } from '#app/domain/models/flow'
import type { NomenclatureEntry } from '#app/domain/models/nomenclature'

/** Convertit les Flow supply (réceptions ou OF) en DatedSupply par article. */
function flowsToDatedSupplies(
  flows: Flow[],
  originType: 'reception' | 'of'
): Map<string, DatedSupply[]> {
  const map = new Map<string, DatedSupply[]>()
  for (const f of flows) {
    if (f.direction !== 'supply' || f.origin.type !== originType) continue
    if (!f.date) continue
    const list = map.get(f.article) ?? []
    list.push({ date: f.date, quantity: f.quantity, source: originType, id: f.origin.id })
    map.set(f.article, list)
  }
  return map
}

/** Filtre une Map au périmètre d'articles atteignables depuis la BOM. */
function scopeToReachable<K, V>(map: Map<K, V>, reachable: Set<K>): Map<K, V> {
  const out = new Map<K, V>()
  for (const [k, v] of map) {
    if (reachable.has(k)) out.set(k, v)
  }
  return out
}

/**
 * Construit le PromiseDataset pour un article, en réutilisant les caches
 * boardDataset. Définit le périmètre stock/réceptions/OF aux articles
 * atteignables depuis la BOM du produit demandé.
 */
export async function buildPromiseDataset(article: string): Promise<PromiseDataset> {
  const [nomEntries, articlesList] = await Promise.all([
    boardDataset.getNomenclature().catch(() => [] as NomenclatureEntry[]),
    boardDataset.getArticles(),
  ])

  const reachable = expandArticleSetWithBom([article], nomEntries)

  const [stockFlows, receptionFlows, poolData, supplierLatency] = await Promise.all([
    boardDataset.getStock([...reachable]).catch(() => [] as Flow[]),
    boardDataset.getReceptions().catch(() => [] as Flow[]),
    boardDataset.getPool().catch(() => ({ supply: [] as Flow[], mos: [] })),
    boardDataset.getSupplierLatency().catch(() => new Map<string, number>()),
  ])

  const nomenclatures = buildNomenclatureMap(nomEntries)
  const articles = buildArticleCatalog(articlesList, nomEntries)
  const stockNet = buildStrictQcStock(stockFlows)

  const receptions = scopeToReachable(flowsToDatedSupplies(receptionFlows, 'reception'), reachable)
  const ofSupply = scopeToReachable(flowsToDatedSupplies(poolData.supply, 'of'), reachable)
  return { articles, nomenclatures, stockNet, receptions, ofSupply, supplierLatency }
}

export interface PromiseResponse {
  article: string
  quantity: number
  from: string
  optimiste: PromiseResult
  engageante: PromiseResult
}

/**
 * Calcule les deux dates (optimiste + engageante) pour une demande.
 * Chaque mode obtient son propre ledger (cloné dans computePromiseDate) →
 * les deux passes sont indépendantes.
 */
export async function loadPromise(params: {
  article: string
  quantity: number
  from?: Date
}): Promise<PromiseResponse> {
  const from = params.from ?? new Date()
  const data = await buildPromiseDataset(params.article)

  const base = { article: params.article, quantity: params.quantity, from }
  const optimiste = computePromiseDate({ ...base, mode: 'optimiste' }, data)
  const engageante = computePromiseDate({ ...base, mode: 'engageante' }, data)

  return {
    article: params.article,
    quantity: params.quantity,
    from: from.toISOString(),
    optimiste,
    engageante,
  }
}
