/**
 * Moteur CTP — Capable-to-Promise (PRD docs/prd-ctp-date-au-plus-tot.md).
 *
 * Répond à la question inverse de l'ATP fixé (#58) : « quelle est la première date
 * à laquelle je peux promettre (article, quantité) ? » au lieu de « la date D tient-elle ? ».
 *
 * Domaine PUR, sans I/O (même discipline que rupture-engine.ts / plan-diff.ts).
 * Consomme des lookups injectés (Map ou adapter), testable sur fixtures sans X3.
 *
 * Réutilise la logique de descente BOM du moteur de rupture (#73) — règle AFANT
 * (fantôme : stock net d'abord, descente du reliquat), plafond PHANTOM_DEPTH_CAP,
 * garde-fou anti-cycle — mais PROJETTE DANS LE TEMPS au lieu de donner un verdict photo.
 */

import type { Article } from './models/article.js'
import { isPhantom } from './models/article.js'
import type { NomenclatureEntry } from './models/nomenclature.js'
import { requiredQuantity } from './models/nomenclature.js'
import { isSubcontracted } from './rules.js'
import { PHANTOM_DEPTH_CAP, type ArticleLookup, type NomenclatureLookup } from './rupture-engine.js'

// Re-export pour le loader (Lot 2) — single import surface.
export type { ArticleLookup, NomenclatureLookup } from './rupture-engine.js'

// ───────────────────────────── Types publics ─────────────────────────────

export type PromiseMode = 'optimiste' | 'engageante'

/** Flux daté non alloué : réception (PO), OF en cours, ou stock à date nulle. */
export interface DatedSupply {
  /** Arrivée prévue (réception) ou fin prévue (OF). */
  date: Date
  /** Quantité NON allouée disponible à cette date. */
  quantity: number
  source: 'reception' | 'of' | 'stock'
  /** N° PO / N° OF — pour le chemin critique. */
  id: string
}

export interface PromiseDataset {
  articles: ArticleLookup
  nomenclatures: NomenclatureLookup
  /** Stock résiduel NON alloué par article (nets des allocations carnet). */
  stockNet: Map<string, number>
  /** POs attendues datées, non allouées, par article. */
  receptions: Map<string, DatedSupply[]>
  /** OF en cours datés, non alloués, par article produit. */
  ofSupply?: Map<string, DatedSupply[]>
  /**
   * Jours fermés usine (ISO `YYYY-MM-DD`) : fériés actifs + fermetures globales
   * totales (#37). Consommé par le décalage en jours ouvrés (mode engageante),
   * en plus des week-ends. Absent → week-ends seuls.
   */
  closedDays?: Set<string>
  /** Retard fournisseur moyen observé, en jours (#43) — mode engageante. V1 défaut 0. */
  supplierLatency?: Map<string, number>
}

export interface PromiseRequest {
  article: string
  quantity: number
  /** Défaut : aujourd'hui. */
  from?: Date
  mode: PromiseMode
}

export type PromiseReason =
  | { kind: 'stock' }
  | { kind: 'reception'; poId: string; date: Date }
  | { kind: 'of'; ofId: string; date: Date }
  | { kind: 'appro'; leadTime: number; observed?: number }
  | { kind: 'fabrication'; leadTime: number }
  | { kind: 'infeasible'; detail: string }

export interface PromiseNode {
  article: string
  /** Quantité requise à ce maillon (propagée par linkQuantity). */
  quantity: number
  availableDate: Date
  reason: PromiseReason
  /** Délai appliqué (jours) à ce maillon — 0 si couvert par stock/flux. */
  leadTimeUsed: number
  children: PromiseNode[]
  /** Ce maillon détermine-t-il la date du parent (branche critique) ? */
  onCriticalPath: boolean
}

export interface PromiseResult {
  article: string
  quantity: number
  /** Date au plus tôt (racine). Si `infeasible`, c'est `from` (placeholder — vérifier le flag). */
  promiseDate: Date
  mode: PromiseMode
  /** Branche contraignante aplatie : racine → feuille limitante. */
  criticalPath: PromiseNode[]
  /** Le maillon terminal du chemin critique, formulé. */
  limitingFactor: {
    article: string
    reason: PromiseReason
    date: Date
    leadTime: number
  }
  /** Arbre complet (drill-down). */
  tree: PromiseNode
  /** true si PHANTOM_DEPTH_CAP atteint ou cycle BOM (arbre incomplet). */
  truncated: boolean
  /** Article sans stock, sans flux, sans recette (ni BOM) — pas de date significative. */
  infeasible: boolean
}

// ─────────────────────────── Entrée principale ───────────────────────────

/**
 * Calcule la date au plus tôt pour une demande (article, quantité) ainsi que
 * le chemin critique qui la contraint.
 *
 * Pour afficher les DEUX dates (optimiste + engageante), appeler deux fois
 * avec `mode` différent — l'écart = risque chiffré (PRD §5.4).
 */
export function computePromiseDate(req: PromiseRequest, data: PromiseDataset): PromiseResult {
  const from = req.from ?? new Date()
  const ctx: EngineCtx = {
    mode: req.mode,
    data,
    ledger: new PromiseLedger(data.stockNet, data.receptions, data.ofSupply),
    truncated: false,
  }

  const tree = dispoDate(req.article, req.quantity, from, 0, new Set(), ctx)
  const criticalPath = buildCriticalPath(tree)
  const limiting = criticalPath.length > 0 ? criticalPath[criticalPath.length - 1] : tree

  return {
    article: req.article,
    quantity: req.quantity,
    promiseDate: tree.availableDate,
    mode: req.mode,
    criticalPath,
    limitingFactor: {
      article: limiting.article,
      reason: limiting.reason,
      date: limiting.availableDate,
      leadTime: limiting.leadTimeUsed,
    },
    tree,
    truncated: ctx.truncated,
    infeasible: tree.reason.kind === 'infeasible',
  }
}

// ───────────────────────── Contexte d'exécution ──────────────────────────

interface EngineCtx {
  mode: PromiseMode
  data: PromiseDataset
  ledger: PromiseLedger
  truncated: boolean
}

// ─────────────── Récursion centrale : `dispoDate` (PRD §5.2) ──────────────

/**
 * Date à laquelle `quantity` unités de `article` sont disponibles, avec l'arbre
 * d'explication.
 *
 * 1. Stock net résiduel ≥ qté → dispo immédiat (`from`).
 * 2. Flux datés (réceptions + OF) couvrent le reliquat → dispo au dernier flux.
 * 3. Reliquat non couvert → produire (descendre BOM + délai fab) ou acheter (+ délai appro).
 * 4. Plafond de profondeur / cycle → coupe prudente.
 */
function dispoDate(
  article: string,
  quantity: number,
  from: Date,
  depth: number,
  visited: Set<string>,
  ctx: EngineCtx
): PromiseNode {
  // Garde-fou anti-cycle (PRD §8.4).
  if (visited.has(article)) {
    ctx.truncated = true
    return mkInfeasible(article, quantity, from, `cycle de nomenclature détecté sur « ${article} »`)
  }

  // Plafond de profondeur (PRD §5.2 point 4 / §8.4).
  if (depth > PHANTOM_DEPTH_CAP) {
    ctx.truncated = true
    const info = ctx.data.articles.get(article)
    const delay = info?.reorderDelay ?? 14
    return mkLeaf(
      article,
      quantity,
      shiftDate(from, delay, ctx.mode, ctx.data.closedDays),
      {
        kind: 'appro',
        leadTime: delay,
      },
      delay
    )
  }

  if (quantity <= 0) {
    return mkLeaf(article, 0, from, { kind: 'stock' }, 0)
  }

  const info = ctx.data.articles.get(article)
  const hasBom = (ctx.data.nomenclatures.get(article)?.components.length ?? 0) > 0

  // ── Étape 1 : stock net résiduel ──
  const stockTaken = ctx.ledger.takeStock(article, quantity)
  let remaining = quantity - stockTaken

  // ── Étape 2 : flux datés (réceptions + OF en cours) ──
  // Latence clampée à 0 : un fournisseur en avance (moyenne négative) ne doit
  // jamais produire engageante < optimiste (critère PRD §12) ni re-dater un
  // overdue dans le passé.
  const latency =
    ctx.mode === 'engageante' ? Math.max(0, ctx.data.supplierLatency?.get(article) ?? 0) : 0
  const flux = ctx.ledger.takeFlux(article, remaining, from, ctx.mode, latency, ctx.data.closedDays)
  remaining -= flux.taken

  const partialDate = flux.date ? maxDate(from, flux.date) : from

  // Couvert entièrement par stock + flux.
  if (remaining <= 0) {
    if (flux.taken > 0 && flux.supply) {
      const s = flux.supply
      const date = flux.date ?? from
      const reason: PromiseReason =
        s.source === 'of'
          ? { kind: 'of', ofId: s.id, date }
          : { kind: 'reception', poId: s.id, date }
      return mkLeaf(article, quantity, date, reason, 0)
    }
    return mkLeaf(article, quantity, from, { kind: 'stock' }, 0)
  }

  // ── Étape 3 : reliquat à produire ou acheter ──

  // Couverture partielle stock/flux rendue visible dans l'arbre (drill-down
  // honnête) : la part couverte apparaît en feuilles à côté du reliquat produit/acheté.
  const coverLeaves: PromiseNode[] = []
  if (stockTaken > 0) coverLeaves.push(mkLeaf(article, stockTaken, from, { kind: 'stock' }, 0))
  if (flux.taken > 0 && flux.supply) {
    const s = flux.supply
    const date = flux.date ?? from
    const reason: PromiseReason =
      s.source === 'of'
        ? { kind: 'of', ofId: s.id, date }
        : { kind: 'reception', poId: s.id, date }
    coverLeaves.push(mkLeaf(article, flux.taken, date, reason, 0))
  }
  // La feuille flux la plus tardive — candidate au chemin critique si elle
  // arrive après la production/commande du reliquat.
  const fluxLeaf = coverLeaves.length > 0 ? coverLeaves[coverLeaves.length - 1] : null

  const phantom = info ? isPhantom(info) : false
  const subcontracted = info ? isSubcontracted(info) : false
  const canFabricate = hasBom && info?.supplyType === 'FABRICATION' && !phantom && !subcontracted
  const canPhantomDescend = phantom && hasBom

  // 3a/3b — Fantôme AFANT (délai 0) ou fabrication (délai fab) : descendre la BOM.
  if (canPhantomDescend || canFabricate) {
    return fabricate(
      article,
      quantity,
      remaining,
      from,
      depth,
      visited,
      ctx,
      info,
      partialDate,
      coverLeaves
    )
  }

  // 3c — Achat ou sous-traitance : commander (délai appro).
  if (info && (info.supplyType === 'ACHAT' || subcontracted)) {
    const baseDelay = info.reorderDelay || 14
    const observed = ctx.mode === 'engageante' && latency > 0 ? latency : undefined
    const orderArrival = shiftDate(from, baseDelay + latency, ctx.mode, ctx.data.closedDays)
    // Si le flux partiel arrive après la commande du reliquat, c'est lui qui contraint.
    if (fluxLeaf && partialDate.getTime() > orderArrival.getTime()) fluxLeaf.onCriticalPath = true
    return {
      article,
      quantity,
      availableDate: maxDate(partialDate, orderArrival),
      reason: { kind: 'appro', leadTime: baseDelay, observed },
      leadTimeUsed: baseDelay + latency,
      children: coverLeaves,
      onCriticalPath: false,
    }
  }

  // 3d/3e — Infaisable : FABRICATION sans nomenclature, ou article inconnu (PRD §8.1).
  ctx.truncated = true
  const detail = info
    ? `« ${article} » (${info.supplyType}) sans nomenclature — ni stock, ni flux, ni recette`
    : `« ${article} » inconnu du référentiel`
  return mkInfeasible(article, quantity, from, detail)
}

/**
 * Descent BOM pour un reliquat à fabriquer (ou fantôme, délai 0).
 * Le composant le plus lent contraint ; son délai fab se cumule (PRD §8.2).
 */
function fabricate(
  article: string,
  quantity: number,
  remaining: number,
  from: Date,
  depth: number,
  visited: Set<string>,
  ctx: EngineCtx,
  info: Article | undefined,
  partialDate: Date,
  coverLeaves: PromiseNode[]
): PromiseNode {
  const bom = ctx.data.nomenclatures.get(article)!
  const phantom = info ? isPhantom(info) : false
  const fabDelay = phantom ? 0 : info!.reorderDelay || 10

  const bomChildren: PromiseNode[] = []
  for (const entry of bom.components) {
    const compArticle = entry.componentArticle
    if (visited.has(compArticle)) {
      ctx.truncated = true // cycle de nomenclature (PRD §8.4)
      continue
    }
    const compQty = requiredQuantity(entry as NomenclatureEntry, remaining)
    const child = dispoDate(
      compArticle,
      compQty,
      from,
      depth + 1,
      new Set(visited).add(article),
      ctx
    )
    bomChildren.push(child)
  }

  const componentsReady =
    bomChildren.length > 0
      ? bomChildren.reduce(
          (max, c) => (c.availableDate.getTime() > max.getTime() ? c.availableDate : max),
          bomChildren[0].availableDate
        )
      : from
  const productionDate = shiftDate(componentsReady, fabDelay, ctx.mode, ctx.data.closedDays)

  // Branche critique : le flux partiel s'il arrive après la production du
  // reliquat, sinon le composant BOM le plus lent.
  const fluxLeaf = coverLeaves.length > 0 ? coverLeaves[coverLeaves.length - 1] : null
  if (fluxLeaf && partialDate.getTime() > productionDate.getTime()) {
    fluxLeaf.onCriticalPath = true
  } else {
    markCriticalChild(bomChildren)
  }

  return {
    article,
    quantity,
    availableDate: maxDate(partialDate, productionDate),
    reason: { kind: 'fabrication', leadTime: fabDelay },
    leadTimeUsed: fabDelay,
    children: [...coverLeaves, ...bomChildren],
    onCriticalPath: false,
  }
}

// ───────────────────────── Ledger (anti-double-promesse) ──────────────────

/**
 * Stock + flux mutables, clonés à l'entrée de `computePromiseDate`.
 * Garantit qu'au sein d'un même appel, deux composants partageant un sous-article
 * ne promettent pas deux fois le même stock (PRD §5.2 / non-but §7).
 */
class PromiseLedger {
  private readonly stock: Map<string, number>
  private readonly flux: Map<string, DatedSupply[]>

  constructor(
    stockNet: Map<string, number>,
    receptions: Map<string, DatedSupply[]>,
    ofSupply?: Map<string, DatedSupply[]>
  ) {
    this.stock = new Map(stockNet)
    this.flux = new Map()
    for (const [k, v] of receptions)
      this.flux.set(
        k,
        v.map((s) => ({ ...s }))
      )
    if (ofSupply) {
      for (const [k, v] of ofSupply) {
        const existing = this.flux.get(k) ?? []
        this.flux.set(k, [...existing, ...v.map((s) => ({ ...s }))])
      }
    }
  }

  /** Consomme jusqu'à `qty` du stock net. Rend le pris. */
  takeStock(article: string, qty: number): number {
    if (qty <= 0) return 0
    const avail = Math.max(0, this.stock.get(article) ?? 0)
    const taken = Math.min(qty, avail)
    if (taken > 0) this.stock.set(article, avail - taken)
    return taken
  }

  /**
   * Consomme jusqu'à `qty` des flux datés, du plus tôt au plus tard.
   * Rend la quantité prise, la date effective du dernier flux, et le supply correspondant.
   */
  takeFlux(
    article: string,
    qty: number,
    from: Date,
    mode: PromiseMode,
    latency: number,
    closedDays?: Set<string>
  ): { taken: number; date: Date | null; supply: DatedSupply | null } {
    if (qty <= 0) return { taken: 0, date: null, supply: null }
    const supplies = this.flux.get(article)
    if (!supplies || supplies.length === 0) return { taken: 0, date: null, supply: null }

    const sorted = [...supplies].sort(
      (a, b) =>
        effectiveDate(a, from, mode, latency, closedDays).getTime() -
        effectiveDate(b, from, mode, latency, closedDays).getTime()
    )

    let taken = 0
    let date: Date | null = null
    let supply: DatedSupply | null = null

    for (const s of sorted) {
      if (taken >= qty) break
      const avail = Math.max(0, s.quantity)
      if (avail <= 0) continue
      const consume = Math.min(qty - taken, avail)
      s.quantity -= consume
      taken += consume
      date = effectiveDate(s, from, mode, latency, closedDays)
      supply = { ...s, quantity: consume }
    }

    return { taken, date, supply }
  }
}

// ───────────────────────────── Helpers dates ─────────────────────────────

/** Date effective d'un flux selon le mode (PRD §5.4). */
function effectiveDate(
  s: DatedSupply,
  from: Date,
  mode: PromiseMode,
  latency: number,
  closedDays?: Set<string>
): Date {
  if (mode === 'optimiste') {
    // Overdue : date théorique dans le passé → dispo maintenant.
    return maxDate(s.date, from)
  }
  // Engageante : overdue re-datée à today + latence résiduelle (jours ouvrés).
  if (s.date.getTime() < from.getTime()) return shiftDate(from, latency, mode, closedDays)
  return s.date
}

/**
 * Décale une date de `days` jours.
 * - Optimiste : jours calendaires.
 * - Engageante : jours ouvrés (saute sam/dim + jours fermés usine #37).
 */
function shiftDate(date: Date, days: number, mode: PromiseMode, closedDays?: Set<string>): Date {
  if (days <= 0) return new Date(date)
  if (mode === 'optimiste') return addCalendarDays(date, days)
  return addWorkingDays(date, days, closedDays)
}

function addCalendarDays(date: Date, n: number): Date {
  const d = new Date(date)
  d.setUTCDate(d.getUTCDate() + n)
  return d
}

function addWorkingDays(date: Date, n: number, closedDays?: Set<string>): Date {
  const d = new Date(date)
  let remaining = n
  while (remaining > 0) {
    d.setUTCDate(d.getUTCDate() + 1)
    const dow = d.getUTCDay()
    if (dow === 0 || dow === 6) continue // dim(0) / sam(6)
    if (closedDays?.has(d.toISOString().slice(0, 10))) continue // férié / fermeture usine
    remaining--
  }
  return d
}

function maxDate(a: Date, b: Date): Date {
  return a.getTime() >= b.getTime() ? a : b
}

// ─────────────────────────── Helpers nœuds / raison ───────────────────────

function mkLeaf(
  article: string,
  quantity: number,
  date: Date,
  reason: PromiseReason,
  leadTime: number
): PromiseNode {
  return {
    article,
    quantity,
    availableDate: date,
    reason,
    leadTimeUsed: leadTime,
    children: [],
    onCriticalPath: false,
  }
}

function mkInfeasible(article: string, quantity: number, from: Date, detail: string): PromiseNode {
  return {
    article,
    quantity,
    availableDate: from,
    reason: { kind: 'infeasible', detail },
    leadTimeUsed: 0,
    children: [],
    onCriticalPath: false,
  }
}

/** Marque l'enfant à la date la plus tardive comme `onCriticalPath`. */
function markCriticalChild(children: PromiseNode[]): void {
  if (children.length === 0) return
  let slowest = children[0]
  for (const c of children) {
    if (c.availableDate.getTime() > slowest.availableDate.getTime()) slowest = c
  }
  slowest.onCriticalPath = true
}

/**
 * Chemin critique = descente depuis la racine en suivant l'enfant `onCriticalPath`
 * jusqu'à la feuille limitante (PRD §5.2).
 */
function buildCriticalPath(root: PromiseNode): PromiseNode[] {
  const path = [root]
  let node = root
  while (node.children.length > 0) {
    const critical = node.children.find((c) => c.onCriticalPath)
    if (!critical) break
    path.push(critical)
    node = critical
  }
  return path
}
