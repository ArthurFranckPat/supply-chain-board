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

// ───────────────────────────── listerOF ─────────────────────────────

export interface ListerOfParams {
  /** Statuts WIPSTA à garder (1 ferme, 2 planifié, 3 suggéré). Défaut = tous. */
  statuts?: number[]
  /** Filtre code article exact (insensible à la casse). */
  article?: string
  /**
   * Filtre famille produit X3 : match YFAMSTAT7_0 (famille, ex. ESH) OU
   * TSICOD_4 (typologie, ex. BDH60). Insensible à la casse.
   */
  famille?: string
  /** Horizon en jours : ne garde que dateFin ≤ from+horizon. Défaut = pas de borne. */
  horizonDays?: number
  /** Début d'horizon ISO (défaut = aujourd'hui). Sert de référence retard. */
  from?: string
  /** Nombre max de lignes (défaut 50, max 200). */
  limit?: number
}

/**
 * Découverte : liste les OF du pool board (ORDERS 1/2/3) avec filtres.
 * Rend l'agent autonome — il ne doit jamais demander la liste à l'utilisateur.
 */
export async function listerOF(params: ListerOfParams = {}) {
  const pool = await boardDataset.getPool().catch(() => ({ supply: [] as Flow[] }))

  const statuts =
    Array.isArray(params.statuts) && params.statuts.length > 0
      ? new Set(params.statuts.map((s) => Math.trunc(Number(s))).filter((s) => s >= 1 && s <= 3))
      : null
  const articleFilter = params.article?.trim().toUpperCase() || null
  const familleFilter = params.famille?.trim().toUpperCase() || null

  // Catalogue articles : famille/typologie (YFAMSTAT7_0 / TSICOD_4) par code.
  const catalog = familleFilter
    ? new Map(
        (await boardDataset.getArticles().catch(() => [])).map((a) => [
          a.code.toUpperCase(),
          { famille: a.famille?.toUpperCase() ?? null, typologie: a.typologie?.toUpperCase() ?? null },
        ])
      )
    : null

  const from = params.from ? new Date(params.from) : new Date()
  if (Number.isNaN(from.getTime())) {
    return { error: 'from invalide (YYYY-MM-DD attendu)', _source: 'listerOF' as const }
  }
  from.setHours(0, 0, 0, 0)

  let to: Date | null = null
  if (params.horizonDays !== undefined) {
    const h = Math.floor(Number(params.horizonDays))
    if (!Number.isFinite(h) || h <= 0) {
      return { error: 'horizonDays doit être > 0', _source: 'listerOF' as const }
    }
    to = new Date(from)
    to.setDate(to.getDate() + Math.min(h, 180))
    to.setHours(23, 59, 59, 999)
  }

  const limitRaw = params.limit === undefined ? 50 : Math.floor(Number(params.limit))
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 200) : 50

  type OfRow = {
    numOf: string
    article: string
    designation: string | null
    quantity: number
    statut: number
    statutLabel: string | null
    dateFin: string | null
    enRetard: boolean
  }
  const rows: OfRow[] = []
  for (const f of pool.supply) {
    if (f.origin.type !== 'of') continue
    const statut = f.origin.status ?? 3
    if (statuts && !statuts.has(statut)) continue
    if (articleFilter && f.article.toUpperCase() !== articleFilter) continue
    if (familleFilter && catalog) {
      const art = catalog.get(f.article.toUpperCase())
      if (!art || (art.famille !== familleFilter && art.typologie !== familleFilter)) continue
    }
    if (to && f.date && f.date > to) continue
    // Sans dateFin : gardé seulement hors fenêtre horizon (donnée incomplète sinon).
    if (to && !f.date) continue
    rows.push({
      numOf: f.origin.id,
      article: f.article,
      designation: f.origin.designation ?? null,
      quantity: f.quantity,
      statut,
      statutLabel: f.origin.statutLabel,
      dateFin: isoDate(f.date),
      enRetard: Boolean(f.date && f.date < from),
    })
  }

  rows.sort((a, b) => {
    if (a.dateFin === b.dateFin) return a.numOf.localeCompare(b.numOf)
    if (a.dateFin === null) return 1
    if (b.dateFin === null) return -1
    return a.dateFin.localeCompare(b.dateFin)
  })

  // Filtre famille inconnu → 0 ligne est ambigu (« code faux » vs « aucun OF »).
  // On rend l'échec actionnable en listant les valeurs légales (cf. toolDoc SI VIDE).
  let famillesConnues: string[] | undefined
  if (familleFilter && catalog && rows.length === 0) {
    const values = new Set<string>()
    for (const { famille, typologie } of catalog.values()) {
      if (famille) values.add(famille)
      if (typologie) values.add(typologie)
    }
    famillesConnues = [...values].sort()
  }

  return {
    _source: 'listerOF' as const,
    engine: 'boardDataset.getPool (ORDERS WIPSTA 1/2/3)',
    filtres: {
      statuts: statuts ? [...statuts] : null,
      article: articleFilter,
      famille: familleFilter,
      from: isoDate(from),
      to: to ? isoDate(to) : null,
    },
    totalMatching: rows.length,
    truncated: rows.length > limit,
    ofs: rows.slice(0, limit),
    ...(famillesConnues
      ? {
          familleInconnue: !famillesConnues.includes(familleFilter!),
          famillesConnues,
        }
      : {}),
  }
}

// ─────────────────────────── rechercherArticle ───────────────────────────

/**
 * Découverte : retrouve un code article par code partiel ou libellé.
 * Classement : code exact > code préfixe > code contient > libellé contient.
 */
export async function rechercherArticle(params: { query: string; limit?: number }) {
  const query = params.query?.trim()
  if (!query) return { error: 'query requis', _source: 'rechercherArticle' as const }

  const limitRaw = params.limit === undefined ? 20 : Math.floor(Number(params.limit))
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 50) : 20

  const articles = await boardDataset.getArticles().catch(() => [])
  const q = query.toUpperCase()

  const scored: Array<{ score: number; row: (typeof articles)[number] }> = []
  for (const a of articles) {
    const code = a.code.toUpperCase()
    const desc = (a.description ?? '').toUpperCase()
    let score = 0
    if (code === q) score = 100
    else if (code.startsWith(q)) score = 80
    else if (code.includes(q)) score = 60
    else if (desc.includes(q)) score = 40
    else continue
    scored.push({ score, row: a })
  }
  scored.sort((x, y) => y.score - x.score || x.row.code.localeCompare(y.row.code))

  return {
    _source: 'rechercherArticle' as const,
    engine: 'boardDataset.getArticles',
    query,
    totalMatching: scored.length,
    truncated: scored.length > limit,
    articles: scored.slice(0, limit).map(({ row }) => ({
      code: row.code,
      description: row.description,
      supplyType: row.supplyType,
      famille: row.famille ?? null,
      typologie: row.typologie ?? null,
      reorderDelay: row.reorderDelay,
    })),
  }
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

/** Bornes de compactage arbre BOM pour le contexte LLM. */
const BOM_MAX_SHORTS_PER_NODE = 8
const BOM_MAX_COVERING = 3
const BOM_MAX_BLOCKING_LEAVES = 15

type DiagShort = {
  article: string
  description: string
  quantityNeeded: number
  available: number | null
  quantityMissing: number
  earliestReception: string | null
  receptionSupplier?: string
  receptionOrderId?: string
  fabricated: boolean
  status: string
  covering: Array<{ numOf: string; statut: number; quantity: number; node: DiagNode }>
}
type DiagNode = {
  numOf: string
  article: string
  statut: number
  source: string
  feasible: boolean
  status: string
  shorts: DiagShort[]
  alerts: string[]
}

function slimDiagNode(node: DiagNode): Record<string, unknown> {
  return {
    numOf: node.numOf,
    article: node.article,
    statut: node.statut,
    source: node.source,
    feasible: node.feasible,
    status: node.status,
    ...(node.alerts.length > 0 ? { alerts: node.alerts } : {}),
    shorts: node.shorts.slice(0, BOM_MAX_SHORTS_PER_NODE).map((s) => ({
      article: s.article,
      description: s.description,
      quantityNeeded: s.quantityNeeded,
      available: s.available,
      quantityMissing: s.quantityMissing,
      earliestReception: s.earliestReception,
      ...(s.receptionSupplier ? { receptionSupplier: s.receptionSupplier } : {}),
      ...(s.receptionOrderId ? { receptionOrderId: s.receptionOrderId } : {}),
      fabricated: s.fabricated,
      status: s.status,
      covering: s.covering.slice(0, BOM_MAX_COVERING).map((c) => ({
        numOf: c.numOf,
        statut: c.statut,
        quantity: c.quantity,
        node: slimDiagNode(c.node),
      })),
      ...(s.covering.length > BOM_MAX_COVERING ? { coveringTruncated: s.covering.length } : {}),
    })),
    ...(node.shorts.length > BOM_MAX_SHORTS_PER_NODE ? { shortsTruncated: node.shorts.length } : {}),
  }
}

/** Feuilles réellement bloquantes de l'arbre (achats en manque, SE sans OF couvrant). */
function collectBlockingLeaves(node: DiagNode, depth = 0, out: Array<Record<string, unknown>> = []) {
  for (const s of node.shorts) {
    const leaf = !s.fabricated || s.covering.length === 0
    if (leaf && s.quantityMissing > 0) {
      out.push({
        article: s.article,
        description: s.description,
        quantityMissing: s.quantityMissing,
        available: s.available,
        fabricated: s.fabricated,
        status: s.status,
        earliestReception: s.earliestReception,
        ...(s.receptionSupplier ? { receptionSupplier: s.receptionSupplier } : {}),
        sousOf: node.numOf,
        depth,
      })
    }
    for (const c of s.covering) collectBlockingLeaves(c.node, depth + 1, out)
  }
  return out
}

/**
 * Arbre de diagnostic récursif (issue #25) — vraie racine bloquante.
 * Wrapper mince autour de `loadOfMaterialsDiagnostic` (sans HttpContext).
 * Sortie compactée pour le LLM : arbre borné + feuilles bloquantes extraites.
 */
export async function descendreBOM(numOf: string) {
  const ofId = numOf.trim()
  if (!ofId) return { error: 'numOf requis', _source: 'descendreBOM' as const }

  const result = await loadOfMaterialsDiagnostic(ofId)
  if (!result) {
    return { error: `OF introuvable dans le pool : ${ofId}`, _source: 'descendreBOM' as const }
  }

  const tree = result.tree as unknown as DiagNode
  const blockingLeaves = collectBlockingLeaves(tree)
  return {
    _source: 'descendreBOM' as const,
    engine: 'RecursiveDiagnosticChecker.diagnoseOf',
    numOf: result.numOf,
    article: result.article,
    feasible: result.feasible,
    rootCause: result.rootCause,
    componentsChecked: result.componentsChecked,
    maxDepthReached: result.maxDepthReached,
    alerts: result.alerts,
    blockingLeavesCount: blockingLeaves.length,
    blockingLeaves: blockingLeaves.slice(0, BOM_MAX_BLOCKING_LEAVES),
    tree: slimDiagNode(tree),
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

  type RetardRow = {
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
  }

  const evalLine = async (line: DemandLine): Promise<RetardRow | null> => {
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
      if (retardJours <= 0 && !eng.infeasible) return null
      return {
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
      }
    } catch (err) {
      return {
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
      }
    }
  }

  // CTP par lots concurrents (données = caches board, pas de SOAP par ligne).
  const CONCURRENCY = 5
  const evaluated: Array<RetardRow | null> = new Array(sample.length).fill(null)
  let cursor = 0
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, sample.length) }, async () => {
      while (cursor < sample.length) {
        const i = cursor++
        evaluated[i] = await evalLine(sample[i])
      }
    })
  )
  const retards: RetardRow[] = evaluated.filter((r): r is RetardRow => r !== null)

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
