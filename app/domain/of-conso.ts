/**
 * Matching commande→OF avec OFConso (consommation partagée d'OF).
 *
 * Port de orders/matching.py.
 * Améliore orders.ts avec :
 * - OFConso : tracker de consommation par OF partagé entre commandes
 * - dateToleranceDays : filtre les OF trop éloignés
 * - multi-OF cumulatif avec OFMatchAllocation détaillé
 * - StockAllocation avec besoin_net
 */

import type { Flow, FlowOrigin } from './models/flow.js'
import type { Article } from './models/article.js'
import type { Nomenclature } from './models/nomenclature.js'
import { isPurchaseArticle } from './rules.js'
import { StockState } from './stock-state.js'

type OfOrigin = Extract<FlowOrigin, { type: 'of' }>
type OrderOrForecastOrigin = Extract<FlowOrigin, { type: 'order' } | { type: 'forecast' }>

function isOfOrigin(origin: FlowOrigin): origin is OfOrigin {
  return origin.type === 'of'
}

function isOrderOrForecastOrigin(origin: FlowOrigin): origin is OrderOrForecastOrigin {
  return origin.type === 'order' || origin.type === 'forecast'
}


export class OFConso {
  ofFlow: Flow
  qteDisponible: number
  qteAllouee: number
  commandesServees: string[]

  constructor(ofFlow: Flow) {
    this.ofFlow = ofFlow
    this.qteDisponible = ofFlow.quantity
    this.qteAllouee = 0
    this.commandesServees = []
  }

  get numOf(): string {
    return isOfOrigin(this.ofFlow.origin) ? this.ofFlow.origin.id : ''
  }

  get statutNum(): number {
    return isOfOrigin(this.ofFlow.origin) ? this.ofFlow.origin.status : 3
  }

  get article(): string {
    return this.ofFlow.article
  }

  estDisponible(qteBesoin: number): boolean {
    return this.qteDisponible >= qteBesoin
  }

  allouer(qteBesoin: number, numCommande: string): void {
    const allocated = Math.min(qteBesoin, this.qteDisponible)
    this.qteAllouee += allocated
    this.qteDisponible -= allocated
    this.commandesServees.push(numCommande)
  }
}

export interface StockAllocation {
  article: string
  qteCommandee: number
  qteAlloueeExist: number
  qteRestante: number
  qteDisponible: number
  qteAllouee: number
  besoinNet: number
}

export interface OFMatchAllocation {
  ofFlow: Flow
  qteAllouee: number
  qteDisponibleAvant: number
  qteDisponibleApres: number
  matchReason: string
}

export type MatchMethod =
  | 'mts_hard_pegging'
  | 'stock_complete'
  | 'nor_mto_cumulative'
  | 'purchase_supply'
  | 'none'

export interface MatchingResult {
  demandFlow: Flow
  of: Flow | null
  matchingMethod: MatchMethod
  alerts: string[]
  stockAllocation: StockAllocation | null
  ofAllocations: OFMatchAllocation[]
  remainingUncoveredQty: number
}

function statutPriority(statutNum: number): number {
  if (statutNum === 1) return 0
  if (statutNum === 2) return 1
  return 2
}

function getOfStatus(origin: FlowOrigin): number {
  if (origin.type === 'of') return (origin as OfOrigin).status ?? 3
  return 3
}

function getOfId(origin: FlowOrigin): string {
  if (origin.type === 'of') return (origin as OfOrigin).id ?? ''
  return ''
}

export class CommandeOFMatcher {
  private ofConso: Map<string, OFConso> = new Map()
  private ofsDejaUtilises: Set<string> = new Set()
  private dateToleranceDays: number

  constructor(
    private supplyFlows: Flow[],
    private articles: Map<string, Article>,
    _nomenclatures: Map<string, Nomenclature>,
    dateToleranceDays: number = 10,
  ) {
    this.dateToleranceDays = dateToleranceDays
  }

  reset(): void {
    this.ofConso.clear()
    this.ofsDejaUtilises.clear()
  }

  private initOfConso(articles?: Set<string>): void {
    for (const flow of this.supplyFlows) {
      if (flow.direction !== 'supply' || flow.origin.type !== 'of') continue
      if (flow.quantity <= 0) continue
      const status = getOfStatus(flow.origin)
      if (status < 1 || status > 3) continue
      if (articles && !articles.has(flow.article)) continue

      const id = getOfId(flow.origin)
      if (!this.ofConso.has(id)) {
        this.ofConso.set(id, new OFConso(flow))
      }
    }
  }

  private createStockState(): StockState {
    const stock = new Map<string, number>()
    for (const flow of this.supplyFlows) {
      if (flow.direction !== 'supply') continue
      if (flow.origin.type === 'stock' || flow.origin.type === 'reception') {
        stock.set(flow.article, (stock.get(flow.article) ?? 0) + flow.quantity)
      }
    }
    return new StockState(stock)
  }

  private consumeOfQuantity(ofFlow: Flow, qte: number, numCommande: string, reason: string): OFMatchAllocation {
    const id = getOfId(ofFlow.origin)
    if (!this.ofConso.has(id)) {
      this.ofConso.set(id, new OFConso(ofFlow))
    }
    const conso = this.ofConso.get(id)!
    const before = conso.qteDisponible
    const allocated = Math.min(qte, before)
    conso.allouer(allocated, numCommande)
    return {
      ofFlow,
      qteAllouee: allocated,
      qteDisponibleAvant: before,
      qteDisponibleApres: conso.qteDisponible,
      matchReason: reason,
    }
  }

  private matchMts(demand: Flow): MatchingResult {
    const numCommande = isOrderOrForecastOrigin(demand.origin) ? demand.origin.id : ''

    const linkedOfs = this.supplyFlows.filter((f) => {
      if (f.direction !== 'supply' || f.origin.type !== 'of') return false
      if (f.article !== demand.article || f.quantity <= 0) return false
      const status = getOfStatus(f.origin)
      return status >= 1 && status <= 3
    })

    if (linkedOfs.length === 0) {
      return {
        demandFlow: demand, of: null, matchingMethod: 'mts_hard_pegging',
        alerts: [`MTS: aucun OF lie pour ${demand.article}`],
        stockAllocation: null, ofAllocations: [], remainingUncoveredQty: demand.quantity,
      }
    }

    const sorted = [...linkedOfs].sort((a, b) => {
      const pa = statutPriority(getOfStatus(a.origin))
      const pb = statutPriority(getOfStatus(b.origin))
      if (pa !== pb) return pa - pb
      const dateA = a.date?.getTime() ?? Infinity
      const dateB = b.date?.getTime() ?? Infinity
      const demandDate = demand.date?.getTime() ?? Infinity
      return Math.abs(dateA - demandDate) - Math.abs(dateB - demandDate)
    })

    const selected = sorted[0]
    const allocation = this.consumeOfQuantity(
      selected,
      Math.min(demand.quantity, selected.quantity),
      numCommande,
      'MTS hard pegging',
    )
    const remaining = Math.max(demand.quantity - allocation.qteAllouee, 0)
    const alerts: string[] = []
    if (linkedOfs.length > 1) {
      alerts.push(`MTS: ${linkedOfs.length} OF lies, selectionne ${getOfId(selected.origin)}`)
    }
    if (remaining > 0) {
      alerts.push(`MTS: couverture partielle (${allocation.qteAllouee}/${demand.quantity})`)
    }

    return {
      demandFlow: demand, of: selected, matchingMethod: 'mts_hard_pegging',
      alerts, stockAllocation: null, ofAllocations: [allocation], remainingUncoveredQty: remaining,
    }
  }

  private allocateStock(demand: Flow, stockState: StockState): StockAllocation {
    const qteDispo = stockState.getAvailable(demand.article)
    const qteAllouee = Math.min(qteDispo, demand.quantity)
    const besoinNet = demand.quantity - qteAllouee

    if (qteAllouee > 0) {
      stockState.allocate(demand.origin.type + ':' + demand.article, { [demand.article]: qteAllouee })
    }

    return {
      article: demand.article,
      qteCommandee: demand.quantity,
      qteAlloueeExist: 0,
      qteRestante: demand.quantity,
      qteDisponible: qteDispo,
      qteAllouee,
      besoinNet,
    }
  }

  private iterOfCandidates(demand: Flow, isForecast: boolean = false): OFConso[] {
    const demandDate = demand.date?.getTime() ?? Date.now()
    const candidates: Array<[number, number, number, OFConso]> = []

    for (const conso of this.ofConso.values()) {
      if (conso.article !== demand.article) continue
      if (conso.qteDisponible <= 0) continue

      // Python: forecasts do not consume firm (1) or planned (2) OFs.
      if (isForecast && (conso.statutNum === 1 || conso.statutNum === 2)) continue

      const ofDate = conso.ofFlow.date?.getTime() ?? 0
      const ecartDays = Math.abs(ofDate - demandDate) / 86400000
      if (ecartDays > this.dateToleranceDays) continue

      const weekGap = Math.floor(ecartDays / 7)
      const priorite = statutPriority(conso.statutNum)
      candidates.push([priorite, weekGap, ecartDays, conso])
    }

    candidates.sort((a, b) => {
      if (a[0] !== b[0]) return a[0] - b[0]
      if (a[1] !== b[1]) return a[1] - b[1]
      if (a[2] !== b[2]) return a[2] - b[2]
      return b[3].qteDisponible - a[3].qteDisponible
    })

    return candidates.map((c) => c[3])
  }

  private matchNorMto(demand: Flow, stockState: StockState): MatchingResult {
    const numCommande = isOrderOrForecastOrigin(demand.origin) ? demand.origin.id : demand.article
    const contremarque: string | null = isOrderOrForecastOrigin(demand.origin) ? demand.origin.contremarque ?? null : null

    // Contremarque = lien direct commande↔OF dans X3 (hard peg prioritaire).
    if (contremarque) {
      const peggedFlow = this.supplyFlows.find(
        (f) => f.direction === 'supply' && f.origin.type === 'of' && getOfId(f.origin) === contremarque,
      )
      if (peggedFlow) {
        const allocation = this.allocateStock(demand, stockState)
        const ofAlloc = this.consumeOfQuantity(peggedFlow, demand.quantity, numCommande, 'contremarque hard peg')
        const remaining = Math.max(0, demand.quantity - ofAlloc.qteAllouee - allocation.qteAllouee)
        return {
          demandFlow: demand, of: peggedFlow, matchingMethod: 'mts_hard_pegging',
          alerts: remaining > 0 ? [`Contremarque: couverture partielle (${demand.quantity - remaining}/${demand.quantity})`] : [],
          stockAllocation: allocation, ofAllocations: [ofAlloc], remainingUncoveredQty: remaining,
        }
      }
    }

    const allocation = this.allocateStock(demand, stockState)

    if (allocation.besoinNet === 0) {
      return {
        demandFlow: demand, of: null, matchingMethod: 'stock_complete',
        alerts: [], stockAllocation: allocation, ofAllocations: [], remainingUncoveredQty: 0,
      }
    }

    const article = this.articles.get(demand.article)
    if (article && isPurchaseArticle(article)) {
      return {
        demandFlow: demand, of: null, matchingMethod: 'purchase_supply',
        alerts: [`Article achat: ${allocation.qteAllouee} stock, ${allocation.besoinNet} manquant`],
        stockAllocation: allocation, ofAllocations: [], remainingUncoveredQty: allocation.besoinNet,
      }
    }

    if (demand.article && !this.ofConso.size) {
      this.initOfConso(new Set([demand.article]))
    }

    let remaining = allocation.besoinNet
    const ofAllocations: OFMatchAllocation[] = []

    for (const conso of this.iterOfCandidates(demand, demand.origin.type === 'forecast')) {
      if (remaining <= 0) break
      const alloc = this.consumeOfQuantity(conso.ofFlow, remaining, numCommande, 'MTO/NOR couverture cumulative')
      if (alloc.qteAllouee <= 0) continue
      ofAllocations.push(alloc)
      remaining -= alloc.qteAllouee
    }

    if (ofAllocations.length === 0) {
      return {
        demandFlow: demand, of: null, matchingMethod: 'none',
        alerts: [`Aucun OF pour ${demand.article}, ${allocation.besoinNet} non couvert`],
        stockAllocation: allocation, ofAllocations: [], remainingUncoveredQty: allocation.besoinNet,
      }
    }

    const primaryOf = ofAllocations[0].ofFlow
    const alerts: string[] = []
    if (remaining > 0) {
      alerts.push(`Couverture partielle OF: ${allocation.besoinNet - remaining}/${allocation.besoinNet}`)
    }

    return {
      demandFlow: demand, of: primaryOf, matchingMethod: 'nor_mto_cumulative',
      alerts, stockAllocation: allocation, ofAllocations, remainingUncoveredQty: remaining,
    }
  }

  matchCommande(demand: Flow, stockState?: StockState): MatchingResult {
    const origin = demand.origin
    if (isOrderOrForecastOrigin(origin) && origin.orderType === 'MTS') {
      return this.matchMts(demand)
    }
    return this.matchNorMto(demand, stockState ?? this.createStockState())
  }

  matchCommandes(demands: Flow[]): MatchingResult[] {
    this.reset()

    const articlesNorMto = new Set(demands.map((d) => d.article))
    this.initOfConso(articlesNorMto)

    const stockState = this.createStockState()

    const sorted = [...demands].sort((a, b) => {
      const pa = a.origin.type === 'order' ? 0 : 1
      const pb = b.origin.type === 'order' ? 0 : 1
      if (pa !== pb) return pa - pb
      const da = a.date?.getTime() ?? Infinity
      const db = b.date?.getTime() ?? Infinity
      if (da !== db) return da - db
      return 0
    })

    return sorted.map((demand) => this.matchCommande(demand, stockState))
  }
}
