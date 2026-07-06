/**
 * Orchestrateur : matching OF↔commande × faisabilité × overrides → statut par commande.
 *
 * Chaîne :
 * 1. CommandeOFMatcher.matchCommandes() → OF alloués par commande
 * 2. buildEffectiveFlows() → OF avec overrides appliqués
 * 3. evaluateSequentialFeasibility() → faisabilité par OF (stock virtuel)
 * 4. Croisement → statut : on_time / stock / retard / bloquee / sans_couverture
 *
 * Port de services/planning_board_orders.py (evaluate_order_impacts).
 */

import type { Flow } from './models/flow.js'
import type { Article } from './models/article.js'
import type { FeasibilityOptions } from './stock-state.js'
import type { Nomenclature } from './models/nomenclature.js'
import type { OfOverride } from './planning_board.js'
import { CommandeOFMatcher } from './of-conso.js'
import { evaluateSequentialFeasibility, type OfInput } from './stock-state.js'

export interface OrderImpactRow {
  numCommande: string
  /** N° de ligne de commande (X3 VCRLIN_0). Distingue deux lignes d'une même
   *  commande portant éventuellement le même article. Null/absent pour les
   *  prévisions et les anciennes fixtures. */
  ligne?: string | null
  client: string
  article: string
  description: string
  qteRestante: number
  /** Quantité déjà allouée en ERP (réservée en stock pour cette commande). Optionnel (fixtures). */
  qteAllouee?: number
  dateExpedition: string
  dejaEnRetard: boolean
  nature: 'commande' | 'prevision'
  typeCommande: string
  /** Référence commande client (SORDER.CUSORDREF_0) — null si absente. */
  refCommandeClient?: string | null
  /** Référence article client (ITMBPC.ITMREFBPC_0) — null si absente / identique à l'article. */
  refArticleClient?: string | null
  matchingMethod: string
  reliquat: number
  statut: 'on_time' | 'stock' | 'retard' | 'bloquee' | 'sans_couverture'
  joursRetard: number
  ofs: Array<{
    numOf: string
    article: string
    qteAllouee: number
    dateFin: string
    feasible: boolean | null
    missingComponents: Record<string, number>
    modified: boolean
    statutNum: number
  }>
}

export interface OrderImpactResult {
  orders: OrderImpactRow[]
  /**
   * Faisabilité de TOUS les OFs évalués dans la fenêtre (pas seulement ceux
   * rattachés à une commande). Consommé par le board pour badger chaque carte.
   */
  ofs: Array<{
    numOf: string
    article: string
    feasible: boolean | null
    statutNum: number
    missingComponents: Record<string, number>
  }>
  window: { from: string; to: string }
  stats: {
    nbCommandes: number
    nbOnTime: number
    nbRetard: number
    nbBloquees: number
    nbSansCouverture: number
  }
}

/**
 * Nette la demande de son allocation ERP propre (origin.qteAllouee = stock déjà réservé
 * en X3 pour CETTE commande). Quantité à couvrir par le matching = reste à livrer − alloué ;
 * une commande entièrement allouée n'a rien à faire produire et sort de la demande.
 *
 * Sans ce nettage, le matcher ne voit que le stock LIBRE (PHYSTO − PHYALL) — la part
 * réservée de la commande lui est invisible → il accroche un OF/suggestion destiné à un
 * autre besoin et déclare une fausse rupture (cas AR2602595/AEA833XX : 104 alloués à 100 %,
 * matchée sur la suggestion SGAE10649392338 du besoin d'août). Appliqué à TOUTES les vues
 * depuis fix/ruptures-fiabilite — d'abord gated au proactif (commit 4005f7e), généralisé
 * après validation X3 du cas ruptures.
 */
export function netDemandsByAllocation(demands: Flow[]): Flow[] {
  return demands
    .map((f) => {
      const alloc = (f.origin as { qteAllouee?: number }).qteAllouee ?? 0
      return alloc > 0 ? { ...f, quantity: Math.max(0, f.quantity - alloc) } : f
    })
    .filter((f) => f.quantity > 0)
}

function safeDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const d = new Date(value)
  return isNaN(d.getTime()) ? null : d
}

function effectiveDateFin(
  ofId: string,
  overrides: Map<string, OfOverride>,
  matchingDate: Date | null
): Date | null {
  const ov = overrides.get(ofId)
  const overrideDate = safeDate(ov?.dateFin)
  if (overrideDate) return overrideDate
  return matchingDate
}
/**
 * Évalue le statut de service de chaque commande client dans la fenêtre.
 *
 * @param demands - Flows de demande (commandes + prévisions)
 * @param supplyFlows - Flows de supply (stock + réceptions + OF)
 * @param nomenclatures - BOM par article
 * @param articles - Catalogue articles
 * @param overrides - Overrides locaux (dates/statuts modifiés)
 * @param window - Fenêtre d'analyse { from, to }
 * @param mode - 'immediate' | 'sequential' (défaut: sequential)
 * @param precomputedFeasibility - Verdict de faisabilité par OF calculé en amont (MFGMAT,
 *   matières réelles). S'il existe pour un OF, il SURCHARGE le verdict théorique du moteur
 *   → garantit la cohérence avec le détail OF (issue #11).
 */
export function evaluateOrderImpacts(
  demands: Flow[],
  supplyFlows: Flow[],
  nomenclatures: Map<string, Nomenclature>,
  articles: Map<string, Article>,
  overrides: Map<string, OfOverride>,
  window: { from: Date; to: Date },
  mode?: FeasibilityOptions['mode'],
  precomputedFeasibility?: Map<
    string,
    { feasible: boolean | null; missingComponents: Record<string, number> }
  >
): OrderImpactResult {
  // 1. Filter demands in window
  const windowDemands = demands.filter((d) => {
    if (d.direction !== 'demand' || d.quantity <= 0) return false
    if (!d.date) return false
    return d.date >= window.from && d.date <= window.to
  })

  // 2. Matching commande→OF
  const matcher = new CommandeOFMatcher(supplyFlows, articles, nomenclatures, 30)
  const matchingResults = matcher.matchCommandes(windowDemands)

  // 3. Build effective OFs with overrides → evaluate feasibility
  const ofInputs: OfInput[] = supplyFlows
    .filter((f) => f.direction === 'supply' && f.origin.type === 'of' && f.quantity > 0)
    .map((f) => {
      const id = (f.origin as any).id ?? ''
      const ov = overrides.get(id)
      return {
        numOf: id,
        article: f.article,
        qteRestante: f.quantity,
        dateDebut: ov?.dateDebut ?? null,
        dateFin: ov?.dateFin ?? f.date?.toISOString().slice(0, 10) ?? null,
        statutNum: ov?.status ?? (f.origin as any).status ?? 3,
      }
    })

  const feasibility = evaluateSequentialFeasibility(
    ofInputs,
    supplyFlows,
    nomenclatures,
    articles,
    window.to,
    { mode }
  )

  // Résout le verdict d'un OF : MFGMAT (précalculé) s'il existe, sinon le moteur théorique.
  const resolveFeasibility = (
    ofId: string
  ): { feasible: boolean | null; missingComponents: Record<string, number> } => {
    const pre = precomputedFeasibility?.get(ofId)
    if (pre) return { feasible: pre.feasible, missingComponents: pre.missingComponents }
    const entry = feasibility.get(ofId)
    return { feasible: entry?.feasible ?? null, missingComponents: entry?.missingComponents ?? {} }
  }

  // 4. Cross matching × feasibility × dates → status per commande
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const rows: OrderImpactRow[] = matchingResults.map((result) => {
    const demand = result.demandFlow
    const origin = demand.origin as any

    const ofRows: OrderImpactRow['ofs'] = []
    let blocked = false
    let latestFin: Date | null = null

    for (const alloc of result.ofAllocations) {
      const ofId = (alloc.ofFlow.origin as any).id ?? ''
      const effFin = effectiveDateFin(ofId, overrides, alloc.ofFlow.date)
      const resolved = resolveFeasibility(ofId)
      const ofFeasible = resolved.feasible

      if (ofFeasible === false) blocked = true
      if (effFin && (!latestFin || effFin > latestFin)) latestFin = effFin

      ofRows.push({
        numOf: ofId,
        article: alloc.ofFlow.article,
        qteAllouee: alloc.qteAllouee,
        dateFin: effFin?.toISOString().slice(0, 10) ?? '',
        feasible: ofFeasible,
        missingComponents: resolved.missingComponents,
        modified: overrides.has(ofId),
        statutNum: overrides.get(ofId)?.status ?? (alloc.ofFlow.origin as any).status ?? 3,
      })
    }

    let joursRetard = 0
    if (latestFin && demand.date && latestFin > demand.date) {
      joursRetard = Math.round((latestFin.getTime() - demand.date.getTime()) / 86400000)
    } else if (demand.date && demand.date < today) {
      // date d'expé dépassée sans retard OF → retard calendaire depuis aujourd'hui
      joursRetard = Math.round((today.getTime() - demand.date.getTime()) / 86400000)
    }

    let statut: OrderImpactRow['statut']
    if (
      result.remainingUncoveredQty > 0 ||
      (result.ofAllocations.length === 0 && result.matchingMethod !== 'stock_complete')
    ) {
      statut = 'sans_couverture'
    } else if (blocked) {
      statut = 'bloquee'
    } else if (joursRetard > 0 || (demand.date !== null && demand.date < today)) {
      statut = 'retard'
    } else if (result.ofAllocations.length === 0) {
      statut = 'stock'
    } else {
      statut = 'on_time'
    }

    return {
      numCommande: origin.id ?? '',
      ligne: origin.ligne ?? null,
      client: origin.customer ?? '',
      article: demand.article,
      description: articles.get(demand.article)?.description ?? '',
      qteRestante: demand.quantity,
      qteAllouee: origin.qteAllouee ?? 0,
      dateExpedition: demand.date?.toISOString().slice(0, 10) ?? '',
      dejaEnRetard: demand.date ? demand.date < today : false,
      nature: origin.type === 'order' ? 'commande' : 'prevision',
      typeCommande: origin.orderType ?? 'NOR',
      refCommandeClient: origin.refCommandeClient ?? null,
      refArticleClient: origin.refArticleClient ?? null,
      matchingMethod: result.matchingMethod,
      reliquat: result.remainingUncoveredQty,
      statut,
      joursRetard,
      ofs: ofRows,
    }
  })

  rows.sort((a, b) => {
    if (a.dateExpedition !== b.dateExpedition) return a.dateExpedition < b.dateExpedition ? -1 : 1
    return a.numCommande.localeCompare(b.numCommande)
  })

  const statutCounts = { on_time: 0, retard: 0, bloquee: 0, sans_couverture: 0, stock: 0 }
  for (const row of rows) {
    statutCounts[row.statut]++
  }

  return {
    orders: rows,
    ofs: [...feasibility.values()].map((e) => {
      const resolved = resolveFeasibility(e.numOf)
      return {
        numOf: e.numOf,
        article: e.article,
        feasible: resolved.feasible,
        statutNum: e.statutNum,
        missingComponents: resolved.missingComponents,
      }
    }),
    window: {
      from: window.from.toISOString().slice(0, 10),
      to: window.to.toISOString().slice(0, 10),
    },
    stats: {
      nbCommandes: rows.length,
      nbOnTime: statutCounts.on_time + statutCounts.stock,
      nbRetard: statutCounts.retard,
      nbBloquees: statutCounts.bloquee,
      nbSansCouverture: statutCounts.sans_couverture,
    },
  }
}
