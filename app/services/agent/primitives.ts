/**
 * Primitifs supply exposés aux tools agent (étape 2).
 *
 * Chaque fn orchestre un point d'entrée algo/loader existant.
 * Retour = JSON sérialisable + champ `_source` pour anti-hallu.
 * Zéro SOAP hors des loaders boardDataset déjà en place.
 */

import boardDataset from '#services/board_dataset'
import { loadPromise } from '#services/promise_loader'
import { loadOfMaterialsDiagnostic } from '#services/of_diagnostic_loader'
import { buildNomenclatureMap } from '#services/feasibility-loader-adapter'
import { buildArticleCatalog, expandArticleSetWithBom } from '#app/domain/order-impacts-assembly'
import { buildStrictQcStock } from '#app/domain/of-feasibility'
import {
  evaluateRuptures,
  directMissing,
  type RuptureOfInput,
  type RuptureDataset,
} from '#app/domain/rupture-engine'
import type { Flow } from '#app/domain/models/flow'
import type { NomenclatureEntry } from '#app/domain/models/nomenclature'
import { X3MfgmatRepository } from '#repositories/mfgmat_repository'

// ───────────────────────────── helpers ─────────────────────────────

function isoDate(d: Date | string | null | undefined): string | null {
  if (!d) return null
  const dt = d instanceof Date ? d : new Date(d)
  if (Number.isNaN(dt.getTime())) return null
  const y = dt.getFullYear()
  const m = String(dt.getMonth() + 1).padStart(2, '0')
  const da = String(dt.getDate()).padStart(2, '0')
  return `${y}-${m}-${da}`
}

function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.parse(`${fromIso}T00:00:00`)
  const b = Date.parse(`${toIso}T00:00:00`)
  if (Number.isNaN(a) || Number.isNaN(b)) return 0
  return Math.round((b - a) / 86_400_000)
}

function findOfInPool(
  supply: Flow[],
  numOf: string
): {
  numOf: string
  article: string
  quantity: number
  statutNum: number
  dateFin: Date | null
  designation: string | null
} | null {
  for (const f of supply) {
    if (f.origin.type !== 'of') continue
    if (f.origin.id !== numOf) continue
    return {
      numOf,
      article: f.article,
      quantity: f.quantity,
      statutNum: f.origin.status ?? 3,
      dateFin: f.date,
      designation: f.origin.designation ?? null,
    }
  }
  return null
}

// ───────────────────────────── getVerdict ─────────────────────────────

/**
 * Verdict photo rupture d'un OF (moteur unique `evaluateRuptures` #73).
 * MFGMAT si éclaté, sinon nomenclature théorique.
 */
export async function getVerdict(numOf: string) {
  const ofId = numOf.trim()
  if (!ofId) return { error: 'numOf requis', _source: 'getVerdict' as const }

  const pool = await boardDataset.getPool().catch(() => ({ supply: [] as Flow[] }))
  const head = findOfInPool(pool.supply, ofId)
  if (!head) {
    return { error: `OF introuvable dans le pool : ${ofId}`, _source: 'getVerdict' as const }
  }

  const mfgmatRepo = new X3MfgmatRepository()
  const materialsRaw = await mfgmatRepo.getMaterials(ofId).catch(() => [])
  const materials = materialsRaw.map((m) => ({
    article: m.article,
    description: m.description,
    unit: m.unit,
    remaining: m.remaining,
    allocated: m.allocated,
  }))

  const [nomEntries, articlesList] = await Promise.all([
    boardDataset.getNomenclature().catch(() => [] as NomenclatureEntry[]),
    boardDataset.getArticles().catch(() => []),
  ])
  const nomenclatures = buildNomenclatureMap(nomEntries)
  const articles = buildArticleCatalog(articlesList, nomEntries)

  // Stock net sur articles réellement demandés (MFGMAT ou BOM théorique).
  const reachable =
    materials.length > 0
      ? new Set(materials.map((m) => m.article))
      : expandArticleSetWithBom([head.article], nomEntries)
  const stockFlows = await boardDataset.getStock([...reachable]).catch(() => [] as Flow[])
  const stockNet = buildStrictQcStock(stockFlows)

  const ofInput: RuptureOfInput = {
    numOf: head.numOf,
    article: head.article,
    qteRestante: head.quantity,
    statutNum: head.statutNum,
    dateBesoin: head.dateFin,
    materials: materials.length > 0 ? materials : null,
  }
  const dataset: RuptureDataset = { articles, nomenclatures, stockNet }
  const verdict = evaluateRuptures([ofInput], dataset, 'photo').get(ofId)
  if (!verdict) {
    return { error: 'Verdict non produit', _source: 'getVerdict' as const }
  }

  const missing = directMissing(verdict)
  const missingList = Object.entries(missing)
    .map(([article, qty]) => ({ article, qty }))
    .sort((a, b) => b.qty - a.qty)

  return {
    _source: 'getVerdict' as const,
    engine: 'rupture-engine.evaluateRuptures(photo)',
    of: {
      numOf: head.numOf,
      article: head.article,
      designation: head.designation,
      quantity: head.quantity,
      statutNum: head.statutNum,
      dateFin: isoDate(head.dateFin),
    },
    requirementSource: verdict.source,
    feasible: verdict.feasible,
    missingDirect: missingList,
    missingCount: missingList.length,
    missingDetail: verdict.missingDetail.map((m) => ({
      article: m.article,
      shortage: m.shortage,
      depth: m.depth,
      fabricated: m.fabricated,
    })),
  }
}

// ───────────────────────────── descendreBOM ─────────────────────────────

/**
 * Arbre de diagnostic récursif (issue #25) — vraie racine bloquante.
 * Wrapper mince autour de `loadOfMaterialsDiagnostic` (sans HttpContext).
 */
export async function descendreBOM(numOf: string) {
  const ofId = numOf.trim()
  if (!ofId) return { error: 'numOf requis', _source: 'descendreBOM' as const }

  const result = await loadOfMaterialsDiagnostic(ofId)
  if (!result) {
    return { error: `OF introuvable dans le pool : ${ofId}`, _source: 'descendreBOM' as const }
  }

  // Compactage pour le LLM : monolithe debug retiré, nœuds utilitaires.
  const { _debug: _ignored, ...core } = result as typeof result & { _debug?: unknown }
  return {
    _source: 'descendreBOM' as const,
    engine: 'RecursiveDiagnosticChecker.diagnoseOf',
    ...core,
  }
}

// ───────────────────────────── getPromise ─────────────────────────────

/**
 * Capable-to-Promise : date au plus tôt optimiste + engageante.
 * Point d'entrée loader : `loadPromise` (caches board).
 */
export async function getPromise(params: {
  article: string
  quantity: number
  from?: string
}) {
  const article = params.article?.trim()
  const quantity = Number(params.quantity)
  if (!article) return { error: 'article requis', _source: 'getPromise' as const }
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return { error: 'quantity doit être un nombre > 0', _source: 'getPromise' as const }
  }

  let from: Date | undefined
  if (params.from) {
    from = new Date(params.from)
    if (Number.isNaN(from.getTime())) {
      return { error: 'from invalide (YYYY-MM-DD attendu)', _source: 'getPromise' as const }
    }
  }

  const result = await loadPromise({ article, quantity, from })

  const slimNode = (node: {
    article: string
    quantity: number
    availableDate: Date
    reason: { kind: string; [k: string]: unknown }
    leadTimeUsed: number
    onCriticalPath: boolean
  }) => ({
    article: node.article,
    quantity: node.quantity,
    availableDate: isoDate(node.availableDate),
    reason: node.reason,
    leadTimeUsed: node.leadTimeUsed,
    onCriticalPath: node.onCriticalPath,
  })

  const slimResult = (r: typeof result.optimiste) => ({
    promiseDate: isoDate(r.promiseDate),
    mode: r.mode,
    infeasible: r.infeasible,
    truncated: r.truncated,
    limitingFactor: {
      article: r.limitingFactor.article,
      reason: r.limitingFactor.reason,
      date: isoDate(r.limitingFactor.date),
      leadTime: r.limitingFactor.leadTime,
    },
    criticalPath: r.criticalPath.map(slimNode),
  })

  return {
    _source: 'getPromise' as const,
    engine: 'promise-engine.computePromiseDate',
    article: result.article,
    quantity: result.quantity,
    from: isoDate(result.from) ?? result.from,
    optimiste: slimResult(result.optimiste),
    engageante: slimResult(result.engageante),
  }
}

// ────────────────────────── listerRetardsPrevus ──────────────────────────

export interface ListerRetardsParams {
  /** Horizon en jours calendaires (défaut 14, max 90). */
  horizonDays?: number
  /** Filtre article (match exact), optionnel. */
  article?: string
  /** Filtre client (sous-chaîne, case-insensitive), optionnel. */
  client?: string
  /** Borne basse inclusive ISO. Défaut = aujourd'hui. */
  from?: string
}

/**
 * Anticipation retards (Q3) : pour chaque demande client dans l'horizon,
 * `computePromiseDate(engageante)` vs date besoin. Coté positif = retard prévu.
 *
 * Source = board caches (demandes + CTP). Pas de moteur prédictif neuf.
 */
export async function listerRetardsPrevus(params: ListerRetardsParams = {}) {
  const horizonRaw = params.horizonDays ?? 14
  const horizon =
    Number.isFinite(horizonRaw) && horizonRaw > 0 ? Math.min(Math.floor(horizonRaw), 90) : 14

  const from = params.from ? new Date(params.from) : new Date()
  if (Number.isNaN(from.getTime())) {
    return { error: 'from invalide', _source: 'listerRetardsPrevus' as const }
  }
  from.setHours(0, 0, 0, 0)
  const to = new Date(from)
  to.setDate(to.getDate() + horizon)
  to.setHours(23, 59, 59, 999)

  const y = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const fromIso = y(from)
  const toIso = y(to)

  const live = await boardDataset.getDemandAndReception(fromIso, toIso).catch(() => ({
    demand: [] as Flow[],
    reception: [] as Flow[],
  }))

  const articleFilter = params.article?.trim()
  const clientFilter = params.client?.trim().toLowerCase()

  // Une ligne par (orderId, ligne, article) pour éviter double calcul CTP.
  type DemandLine = {
    orderId: string
    ligne: string | null
    article: string
    quantity: number
    dateBesoin: Date
    customer: string
    nature: string
  }
  const lines: DemandLine[] = []
  for (const f of live.demand) {
    if (f.direction !== 'demand') continue
    if (f.origin.type !== 'order' && f.origin.type !== 'forecast') continue
    if (!f.date) continue
    if (f.date < from || f.date > to) continue
    if (articleFilter && f.article !== articleFilter) continue
    const customer =
      f.origin.type === 'order' || f.origin.type === 'forecast' ? (f.origin.customer ?? '') : ''
    if (clientFilter && !customer.toLowerCase().includes(clientFilter)) continue
    // Besoin net : quantity reste déjà souvent net ; on prend tel quel.
    if (!(f.quantity > 0)) continue
    lines.push({
      orderId: f.origin.id,
      ligne: f.origin.type === 'order' ? (f.origin.ligne ?? null) : null,
      article: f.article,
      quantity: f.quantity,
      dateBesoin: f.date,
      customer,
      nature: f.origin.type === 'order' ? f.origin.nature : 'PREVISION',
    })
  }

  // Cap défensif : CTP pour N demandes = N×BOM descentes. On prend les + proches.
  lines.sort((a, b) => a.dateBesoin.getTime() - b.dateBesoin.getTime())
  const CAP = 40
  const sample = lines.slice(0, CAP)

  const retards: Array<{
    orderId: string
    ligne: string | null
    article: string
    customer: string
    nature: string
    quantity: number
    dateBesoin: string
    promiseEngageante: string | null
    retardJours: number
    limitingArticle: string | null
    limitingReason: string | null
    infeasible: boolean
  }> = []

  for (const line of sample) {
    try {
      const p = await loadPromise({
        article: line.article,
        quantity: line.quantity,
        from,
      })
      const eng = p.engageante
      const besoinIso = isoDate(line.dateBesoin)!
      const promiseIso = eng.infeasible ? null : isoDate(eng.promiseDate)
      const retardJours =
        promiseIso === null ? 9999 : Math.max(0, daysBetween(besoinIso, promiseIso))
      if (retardJours <= 0 && !eng.infeasible) continue
      retards.push({
        orderId: line.orderId,
        ligne: line.ligne,
        article: line.article,
        customer: line.customer,
        nature: line.nature,
        quantity: line.quantity,
        dateBesoin: besoinIso,
        promiseEngageante: promiseIso,
        retardJours,
        limitingArticle: eng.limitingFactor.article,
        limitingReason: eng.limitingFactor.reason.kind,
        infeasible: eng.infeasible,
      })
    } catch (err) {
      retards.push({
        orderId: line.orderId,
        ligne: line.ligne,
        article: line.article,
        customer: line.customer,
        nature: line.nature,
        quantity: line.quantity,
        dateBesoin: isoDate(line.dateBesoin)!,
        promiseEngageante: null,
        retardJours: 9999,
        limitingArticle: null,
        limitingReason: err instanceof Error ? err.message : String(err),
        infeasible: true,
      })
    }
  }

  retards.sort((a, b) => b.retardJours - a.retardJours || a.dateBesoin.localeCompare(b.dateBesoin))

  return {
    _source: 'listerRetardsPrevus' as const,
    engine: 'loadPromise(engageante) vs date besoin',
    horizon: { from: fromIso, to: toIso, days: horizon },
    demandsScanned: lines.length,
    demandsEvaluated: sample.length,
    truncated: lines.length > CAP,
    retardsCount: retards.length,
    retards,
  }
}
