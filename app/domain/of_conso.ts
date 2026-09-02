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
import { StockState } from './stock_state.js'

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

  /** Demande à laquelle cet OF est réservé (ordre virtuel, #58) — null si servable à tous. */
  get reservePour(): string | null {
    return isOfOrigin(this.ofFlow.origin) ? (this.ofFlow.origin.reservePour ?? null) : null
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
  'mts_hard_pegging' | 'stock_complete' | 'nor_mto_cumulative' | 'purchase_supply' | 'none'

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

export type AllocationStrategy = 'date_besoin' | 'date_passation' | 'priorite_previsions'

export class CommandeOFMatcher {
  private ofConso: Map<string, OFConso> = new Map()
  private ofsDejaUtilises: Set<string> = new Set()
  private dateToleranceDays: number

  constructor(
    private supplyFlows: Flow[],
    private articles: Map<string, Article>,
    _nomenclatures: Map<string, Nomenclature>,
    dateToleranceDays: number = 10,
    private strategy: AllocationStrategy = 'date_besoin'
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

  private consumeOfQuantity(
    ofFlow: Flow,
    qte: number,
    numCommande: string,
    reason: string
  ): OFMatchAllocation {
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

  private matchMts(demand: Flow, stockState: StockState): MatchingResult {
    const numCommande = isOrderOrForecastOrigin(demand.origin) ? demand.origin.id : ''

    // Contremarque = lien direct commande↔OF dans X3 (FMINUM_0), prioritaire même en MTS.
    // Sans ça, on retombe sur un match par article + date qui sélectionne UN seul OF et
    // laisse orphelin l'OF explicitement peggé (cf. AR2602600 MTS ↔ F426-32503).
    const contremarque = isOrderOrForecastOrigin(demand.origin)
      ? (demand.origin.contremarque ?? null)
      : null
    if (contremarque) {
      const peggedFlow = this.supplyFlows.find(
        (f) =>
          f.direction === 'supply' && f.origin.type === 'of' && getOfId(f.origin) === contremarque
      )
      if (peggedFlow) {
        const ofAlloc = this.consumeOfQuantity(
          peggedFlow,
          demand.quantity,
          numCommande,
          'contremarque hard peg (MTS)'
        )
        const remaining = Math.max(demand.quantity - ofAlloc.qteAllouee, 0)
        return {
          demandFlow: demand,
          of: peggedFlow,
          matchingMethod: 'mts_hard_pegging',
          alerts:
            remaining > 0
              ? [
                  `Contremarque MTS: couverture partielle (${ofAlloc.qteAllouee}/${demand.quantity})`,
                ]
              : [],
          stockAllocation: null,
          ofAllocations: [ofAlloc],
          remainingUncoveredQty: remaining,
        }
      }
      // Contremarque présente mais l'OF pointé n'est pas dans supplyFlows : il est
      // clôturé/terminé (RMNEXTQTY_0 = 0 → exclu de getOrders). La commande est déjà
      // servie par son OF fermé — on NE replie PAS sur l'heuristique article+date,
      // sinon on attribue faussement la commande à un autre OF ouvert du même article
      // (ex. AR2603003 ↔ F426-33894 clôturé → se rabattait sur F126-47104, #46).
      return {
        demandFlow: demand,
        of: null,
        matchingMethod: 'mts_hard_pegging',
        alerts: [`MTS: contremarque ${contremarque} hors supply (OF clôturé)`],
        stockAllocation: null,
        ofAllocations: [],
        remainingUncoveredQty: 0,
      }
    }

    const linkedOfs = this.supplyFlows.filter((f) => {
      if (f.direction !== 'supply' || f.origin.type !== 'of') return false
      if (f.article !== demand.article || f.quantity <= 0) return false
      // Ordre virtuel réservé à une autre demande (#58) : invisible ici.
      const reserve = (f.origin as OfOrigin).reservePour ?? null
      if (reserve !== null && reserve !== numCommande) return false
      const status = getOfStatus(f.origin)
      return status >= 1 && status <= 3
    })

    if (linkedOfs.length === 0) {
      // Pas d'OF lié pour cet article MTS. Soit l'article est acheté (couverture
      // par stock/réception, ex. A2178/AR2601357), soit c'est un vrai trou de
      // planification. On replie sur le stock avant de déclarer la commande non
      // couverte — sinon un article acheté sans OF apparaît faussement en
      // « sans couverture » alors que le stock libre couvre la demande.
      const allocation = this.allocateStock(demand, stockState)
      if (allocation.besoinNet === 0) {
        return {
          demandFlow: demand,
          of: null,
          matchingMethod: 'stock_complete',
          alerts: [],
          stockAllocation: allocation,
          ofAllocations: [],
          remainingUncoveredQty: 0,
        }
      }
      const article = this.articles.get(demand.article)
      if (article && isPurchaseArticle(article)) {
        return {
          demandFlow: demand,
          of: null,
          matchingMethod: 'purchase_supply',
          alerts: [
            `Article achat (MTS sans OF): ${allocation.qteAllouee} stock, ${allocation.besoinNet} manquant`,
          ],
          stockAllocation: allocation,
          ofAllocations: [],
          remainingUncoveredQty: allocation.besoinNet,
        }
      }
      return {
        demandFlow: demand,
        of: null,
        matchingMethod: 'mts_hard_pegging',
        alerts: [`MTS: aucun OF lie pour ${demand.article}, ${allocation.besoinNet} non couvert`],
        stockAllocation: allocation,
        ofAllocations: [],
        remainingUncoveredQty: allocation.besoinNet,
      }
    }

    // Capacité RESTANTE, pas quantité d'origine (issue #99). Avant, la sélection se faisait
    // sur `flow.quantity` : un OF déjà entièrement consommé par une commande plus urgente
    // restait sélectionnable, l'allocation valait 0 mais la commande continuait de pointer
    // dessus — d'où des commandes affichées sur un OF qui ne leur donne rien.
    if (demand.article && !this.ofConso.size) {
      this.initOfConso(new Set([demand.article]))
    }
    const demandDate = demand.date?.getTime() ?? Infinity
    const candidates = [...this.ofConso.values()]
      .filter((c) => {
        if (c.article !== demand.article || c.qteDisponible <= 0) return false
        return c.reservePour === null || c.reservePour === numCommande
      })
      // Chronologie CBN, pas écart absolu (cf. `iterOfCandidates` pour la démonstration
      // complète). Un OF qui finit APRÈS le besoin ne doit jamais passer devant un OF plus
      // tôt qui a encore de la capacité. OF sans date = fin de file (Infinity → en retard).
      .sort((a, b) => {
        const pa = statutPriority(a.statutNum)
        const pb = statutPriority(b.statutNum)
        if (pa !== pb) return pa - pb
        const dateA = a.ofFlow.date?.getTime() ?? Infinity
        const dateB = b.ofFlow.date?.getTime() ?? Infinity
        const retardA = dateA > demandDate ? 1 : 0
        const retardB = dateB > demandDate ? 1 : 0
        if (retardA !== retardB) return retardA - retardB
        return dateA - dateB
      })

    // Couverture CUMULATIVE (comme matchNorMto) : un OF ne couvrant qu'une partie du besoin
    // laissait le reste « non couvert » alors qu'un second OF du même article pouvait servir.
    // Pas de `dateToleranceDays` ici, contrairement à `iterOfCandidates` : le MTS n'en a jamais
    // eu, l'introduire basculerait en « sans couverture » toute commande dont l'OF est à plus
    // de 30 j — changement de verdict massif, hors périmètre de ce fix.
    let remaining = demand.quantity
    const ofAllocations: OFMatchAllocation[] = []
    for (const conso of candidates) {
      if (remaining <= 0) break
      const alloc = this.consumeOfQuantity(
        conso.ofFlow,
        remaining,
        numCommande,
        'MTS couverture cumulative'
      )
      if (alloc.qteAllouee <= 0) continue
      ofAllocations.push(alloc)
      remaining -= alloc.qteAllouee
    }

    // Ambiguïté : plusieurs OF du même article restaient servables. L'allocation est une
    // heuristique statut+date, pas un peg X3 — l'alerte le dit (cf. golden G20).
    const alerts: string[] = []
    if (candidates.length > 1) {
      const retenus = ofAllocations.map((a) => getOfId(a.ofFlow.origin)).join(', ') || 'aucun'
      alerts.push(`MTS: ${candidates.length} OF candidats, alloue sur ${retenus}`)
    }
    if (remaining > 0) {
      alerts.push(`MTS: couverture partielle (${demand.quantity - remaining}/${demand.quantity})`)
    }

    return {
      demandFlow: demand,
      of: ofAllocations[0]?.ofFlow ?? null,
      matchingMethod: 'mts_hard_pegging',
      alerts,
      stockAllocation: null,
      ofAllocations,
      remainingUncoveredQty: remaining,
    }
  }

  private allocateStock(demand: Flow, stockState: StockState): StockAllocation {
    const qteDispo = stockState.getAvailable(demand.article)
    const qteAllouee = Math.min(qteDispo, demand.quantity)
    const besoinNet = demand.quantity - qteAllouee

    if (qteAllouee > 0) {
      stockState.allocate(demand.origin.type + ':' + demand.article, {
        [demand.article]: qteAllouee,
      })
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
    const numCommande = isOrderOrForecastOrigin(demand.origin) ? demand.origin.id : ''
    const candidates: Array<[number, number, number, OFConso]> = []

    for (const conso of this.ofConso.values()) {
      if (conso.article !== demand.article) continue
      if (conso.qteDisponible <= 0) continue
      // Ordre virtuel réservé à une autre demande (#58) : invisible ici.
      if (conso.reservePour !== null && conso.reservePour !== numCommande) continue

      // Python: forecasts do not consume firm (1) or planned (2) OFs.
      if (isForecast && (conso.statutNum === 1 || conso.statutNum === 2)) continue

      const ofDate = conso.ofFlow.date?.getTime() ?? 0
      const ecartDays = Math.abs(ofDate - demandDate) / 86400000
      // Périmètre de recherche INCHANGÉ : écart absolu, dans les deux sens. C'est un
      // garde-fou « jusqu'où regarder », pas un critère de choix.
      if (ecartDays > this.dateToleranceDays) continue

      // Choix CHRONOLOGIQUE (règle CBN), pas par écart absolu. L'ancien tri prenait
      // `Math.abs(ofDate - demandDate)` : un OF qui finit APRÈS le besoin passait devant un
      // OF plus tôt qui avait encore de la capacité. Cas prouvé sur X3 (AEA731XX) — demande
      // AR2604129 du 16/09 : OF ...683 fin 12/09 (J−4, reste 1812) vs ...684 fin 19/09
      // (J+3) → l'écart absolu élisait ...684, alors que le prévisionnel X3 (3621 → 1812 → 3)
      // montre que les 1809 sortent de ...683. Conséquence : la commande héritait du manque
      // du MAUVAIS OF et basculait « Bloquée ».
      // Deux poches, dans cet ordre : OF disponibles à ≤ date besoin (plus tôt d'abord, FIFO
      // comme la projection de stock), puis OF en retard (moins en retard d'abord).
      const enRetard = ofDate > demandDate ? 1 : 0
      const priorite = statutPriority(conso.statutNum)
      candidates.push([priorite, enRetard, ofDate, conso])
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
    const contremarque: string | null = isOrderOrForecastOrigin(demand.origin)
      ? (demand.origin.contremarque ?? null)
      : null

    // Contremarque = lien direct commande↔OF dans X3 (hard peg prioritaire).
    if (contremarque) {
      const peggedFlow = this.supplyFlows.find(
        (f) =>
          f.direction === 'supply' && f.origin.type === 'of' && getOfId(f.origin) === contremarque
      )
      if (peggedFlow) {
        const allocation = this.allocateStock(demand, stockState)
        const ofAlloc = this.consumeOfQuantity(
          peggedFlow,
          demand.quantity,
          numCommande,
          'contremarque hard peg'
        )
        const remaining = Math.max(0, demand.quantity - ofAlloc.qteAllouee - allocation.qteAllouee)
        return {
          demandFlow: demand,
          of: peggedFlow,
          matchingMethod: 'mts_hard_pegging',
          alerts:
            remaining > 0
              ? [
                  `Contremarque: couverture partielle (${demand.quantity - remaining}/${demand.quantity})`,
                ]
              : [],
          stockAllocation: allocation,
          ofAllocations: [ofAlloc],
          remainingUncoveredQty: remaining,
        }
      }
      // Contremarque présente mais l'OF pointé n'est pas dans supplyFlows : il est
      // clôturé/terminé (RMNEXTQTY_0 = 0 → exclu de getOrders). La commande est déjà
      // servie par son OF fermé — on NE replie PAS sur l'heuristique OF cumulée.
      // Différence avec MTS : on tente d'abord le stock (NOR/MTO = mode réactif
      // sur-stock) ; le reste éventuel est déclaré non couvert sans attribuer la
      // commande à un autre OF (cf. fix équivalent dans matchMts, #46).
      const stockAlloc = this.allocateStock(demand, stockState)
      return {
        demandFlow: demand,
        of: null,
        matchingMethod: stockAlloc.besoinNet === 0 ? 'stock_complete' : 'mts_hard_pegging',
        alerts:
          stockAlloc.besoinNet === 0
            ? []
            : [
                `Contremarque ${contremarque} hors supply (OF clôturé), ${stockAlloc.besoinNet} non couvert`,
              ],
        stockAllocation: stockAlloc,
        ofAllocations: [],
        remainingUncoveredQty: stockAlloc.besoinNet,
      }
    }

    const allocation = this.allocateStock(demand, stockState)

    if (allocation.besoinNet === 0) {
      return {
        demandFlow: demand,
        of: null,
        matchingMethod: 'stock_complete',
        alerts: [],
        stockAllocation: allocation,
        ofAllocations: [],
        remainingUncoveredQty: 0,
      }
    }

    const article = this.articles.get(demand.article)
    if (article && isPurchaseArticle(article)) {
      return {
        demandFlow: demand,
        of: null,
        matchingMethod: 'purchase_supply',
        alerts: [`Article achat: ${allocation.qteAllouee} stock, ${allocation.besoinNet} manquant`],
        stockAllocation: allocation,
        ofAllocations: [],
        remainingUncoveredQty: allocation.besoinNet,
      }
    }

    if (demand.article && !this.ofConso.size) {
      this.initOfConso(new Set([demand.article]))
    }

    let remaining = allocation.besoinNet
    const ofAllocations: OFMatchAllocation[] = []

    for (const conso of this.iterOfCandidates(demand, demand.origin.type === 'forecast')) {
      if (remaining <= 0) break
      const alloc = this.consumeOfQuantity(
        conso.ofFlow,
        remaining,
        numCommande,
        'MTO/NOR couverture cumulative'
      )
      if (alloc.qteAllouee <= 0) continue
      ofAllocations.push(alloc)
      remaining -= alloc.qteAllouee
    }

    if (ofAllocations.length === 0) {
      return {
        demandFlow: demand,
        of: null,
        matchingMethod: 'none',
        alerts: [`Aucun OF pour ${demand.article}, ${allocation.besoinNet} non couvert`],
        stockAllocation: allocation,
        ofAllocations: [],
        remainingUncoveredQty: allocation.besoinNet,
      }
    }

    const primaryOf = ofAllocations[0].ofFlow
    const alerts: string[] = []
    if (remaining > 0) {
      alerts.push(
        `Couverture partielle OF: ${allocation.besoinNet - remaining}/${allocation.besoinNet}`
      )
    }

    return {
      demandFlow: demand,
      of: primaryOf,
      matchingMethod: 'nor_mto_cumulative',
      alerts,
      stockAllocation: allocation,
      ofAllocations,
      remainingUncoveredQty: remaining,
    }
  }

  matchCommande(demand: Flow, stockState?: StockState): MatchingResult {
    const origin = demand.origin
    const ss = stockState ?? this.createStockState()
    if (isOrderOrForecastOrigin(origin) && origin.orderType === 'MTS') {
      return this.matchMts(demand, ss)
    }
    return this.matchNorMto(demand, ss)
  }

  matchCommandes(demands: Flow[]): MatchingResult[] {
    this.reset()

    const articlesNorMto = new Set(demands.map((d) => d.article))
    this.initOfConso(articlesNorMto)

    const stockState = this.createStockState()

    const clientsWithForecasts = new Set<string>()
    if (this.strategy === 'priorite_previsions') {
      for (const d of demands) {
        if (d.origin.type === 'forecast' && d.origin.customer) {
          clientsWithForecasts.add(d.origin.customer)
        }
      }
    }

    const sorted = [...demands].sort((a, b) => {
      const pa = a.origin.type === 'order' ? 0 : 1
      const pb = b.origin.type === 'order' ? 0 : 1
      if (pa !== pb) return pa - pb

      if (this.strategy === 'date_passation') {
        const dateA = (a.origin as any).dateCommande?.getTime() ?? a.date?.getTime() ?? Infinity
        const dateB = (b.origin as any).dateCommande?.getTime() ?? b.date?.getTime() ?? Infinity
        if (dateA !== dateB) return dateA - dateB
      } else if (this.strategy === 'priorite_previsions') {
        const customerA = (a.origin as any).customer ?? ''
        const customerB = (b.origin as any).customer ?? ''
        const priorityA = clientsWithForecasts.has(customerA) ? 0 : 1
        const priorityB = clientsWithForecasts.has(customerB) ? 0 : 1
        if (priorityA !== priorityB) return priorityA - priorityB
      }

      const da = a.date?.getTime() ?? Infinity
      const db = b.date?.getTime() ?? Infinity
      if (da !== db) return da - db
      return 0
    })

    return sorted.map((demand) => this.matchCommande(demand, stockState))
  }
}
