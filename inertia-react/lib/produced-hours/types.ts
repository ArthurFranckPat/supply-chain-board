export interface DailyPoint {
  date: string
  hours: number
  allocated: number
  qty: number
  morningHours?: number
  afternoonHours?: number
}

export interface WorkstationProducedCard {
  poste: string
  name: string
  atelier: string
  workCenter: string
  wstType: number
  operationHours: number
  setupHours: number
  totalHours: number
  allocatedOperationHours: number
  allocatedSetupHours: number
  totalAllocatedHours: number
  deltaHours: number
  efficiency: number
  quantity: number
  rejectQuantity: number
  rejectRate: number
  nbOfs: number
  nbTrackings: number
  weeklyCapacity: number
  timeline: DailyPoint[]
}

export interface ProducedHoursKPIs {
  totalHours: number
  totalOperationHours: number
  totalSetupHours: number
  totalAllocatedHours: number
  globalDeltaHours: number
  globalEfficiency: number
  totalQuantity: number
  totalRejects: number
  rejectRate: number
  activeWorkstationsCount: number
  totalWorkstationsCount: number
}

/** Filtre article résolu : l'article saisi et tous ses composants, tous niveaux. */
export interface ArticleFilterInfo {
  code: string
  designation: string
  nbArticles: number
}

export interface ProducedHoursPayload {
  from: string
  to: string
  kpis: ProducedHoursKPIs
  workstations: WorkstationProducedCard[]
  ateliers: string[]
  articleFilter: ArticleFilterInfo | null
}

export interface EnrichedPosteTracking {
  trackingNum: string
  lineNum: number
  ofNum: string
  opeNum: number
  article: string
  designation: string
  date: string
  time?: string
  shift?: 'matin' | 'aprem'
  setupHours: number
  operationHours: number
  totalHours: number
  allocatedSetupHours: number
  allocatedOperationHours: number
  totalAllocatedHours: number
  deltaHours: number
  quantity: number
  rejectQuantity: number
  employee: string
  standardCadence: number | null
}

export interface WorkstationDetailResponse {
  poste: string
  name: string
  atelier: string
  workCenter: string
  wstType: number
  from: string
  to: string
  kpis: {
    totalHours: number
    operationHours: number
    setupHours: number
    totalAllocatedHours: number
    deltaHours: number
    efficiency: number
    quantity: number
    rejectQuantity: number
    nbOfs: number
    nbTrackings: number
  }
  timeline: DailyPoint[]
  trackings: EnrichedPosteTracking[]
  lineStandardCadence: number | null
  articleFilter: ArticleFilterInfo | null
}

/** Formate une date ISO AAAA-MM-JJ en JJ/MM/AAAA */
export function formatDateFr(dateStr?: string | null): string {
  if (!dateStr) return ''
  const parts = dateStr.trim().split('-')
  if (parts.length === 3 && parts[0].length === 4) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`
  }
  return dateStr
}

export type OrderDateMode = 'demandee' | 'acceptee'

export interface OrderedProductItem {
  code: string
  name: string
  category: string
  quantity: number
  nbOrders: number
  timeline: { date: string; qty: number }[]
}

export interface WorkstationOrderedCard {
  poste: string
  name: string
  atelier: string
  workCenter: string
  wstType: number
  totalQuantity: number
  nbProducts: number
  nbOrders: number
  products: OrderedProductItem[]
  timeline: { date: string; qty: number }[]
}

export interface ProducedOrdersKPIs {
  totalQuantity: number
  totalProducts: number
  totalOrders: number
  activeWorkstationsCount: number
  totalWorkstationsCount: number
}

export interface ProducedOrdersPayload {
  from: string
  to: string
  dateMode: OrderDateMode
  kpis: ProducedOrdersKPIs
  workstations: WorkstationOrderedCard[]
  ateliers: string[]
}

export interface OrderDetailLine {
  orderNum: string
  orderLine: number
  orderSeq: number
  clientCode: string
  clientName: string
  article: string
  designation: string
  quantity: number
  dateDemandee: string
  dateAcceptee: string
  deltaDays: number
  parentArticle?: string
  parentDesignation?: string
  isDerived?: boolean
}

export interface OrderWorkstationProductSummary {
  code: string
  name: string
  quantity: number
  nbOrders: number
  sharePct: number
}

export interface OrderWorkstationDetailResponse {
  poste: string
  name: string
  atelier: string
  workCenter: string
  wstType: number
  from: string
  to: string
  dateMode: OrderDateMode
  kpis: {
    totalQuantity: number
    nbProducts: number
    nbOrders: number
    topProduct: {
      code: string
      name: string
      quantity: number
      sharePct: number
    } | null
  }
  timeline: {
    date: string
    qty: number
    nbOrders: number
  }[]
  products: OrderWorkstationProductSummary[]
  lines: OrderDetailLine[]
}

/**
 * Relais de session à usage unique : poste sur lequel /heures-produites
 * s'ouvre filtrée (lien « réalisé » de /charge). Lu puis effacé à l'arrivée —
 * un retour ultérieur sur la page ne doit pas rester filtré.
 */
export const PRODUCED_HOURS_POSTE_KEY = 'heures-produites:poste'
