/** Types sérialisés de la file d'expédition (issue #104). */

export type ForecastBand = 'decision' | 'prealert'
export type AvailabilitySource =
  | 'stock'
  | 'quai'
  | 'stock_production'
  | 'of_lance'
  | 'of_ferme'
  | 'of_planifie'
  | 'of_suggere'
  | 'ctp'
export type AvailabilityConfidence = 'constatee' | 'haute' | 'moyenne' | 'faible'

export interface ForecastLine {
  numCommande: string
  ligne: string | null
  vcrseq?: string | null
  client: string
  article: string
  description: string
  qte: number
  qteCommandee: number
  palTheo: number | null
  dateLivraison: string | null
  dateCommande: string | null
  dateMiseADispo: string | null
  dateChargement: string | null
  source: AvailabilitySource
  confidence: AvailabilityConfidence
  cause: string
  ofNum: string | null
  coefficientSource: 'référencé' | 'STOCK' | 'STOJOU' | 'inconnu'
  nonChiffrable: boolean
  chargeStatus?: 'loaded' | 'overflow'
}

export interface DayCharge {
  date: string
  band: ForecastBand
  offset: number
  fileBefore: number
  entries: number
  /** Part des entrées sortie de l'atelier ce jour. */
  entriesProduites: number
  available: number
  loaded: number
  loadedSpot: number
  fileAfter: number
  capaciteJour: number
  deltaVsCapacite: number
  spot: boolean
  /** Camions à commander, plafonnés par ce qui est affrétable en un jour. */
  nbCamionsSpot: number
  /** Ce qu'il faudrait sans plafond : mesure de l'arriéré, pas une commande. */
  nbCamionsSpotTheorique: number
  spotSature: boolean
  spotPalettes: number
  /** Charge du jour = chargé + overflow (spot / report). */
  lignes: ForecastLine[]
}

export interface WeekCharge {
  key: string
  from: string
  to: string
  carnetPalettes: number
  capaciteTransport: number
  capaciteProduction: number
  capacite: number
  chargePlafonnee: number
  deltaVsCapacite: number
  spot: boolean
  nbCamionsSpot: number
  lignes: ForecastLine[]
  nonQuantifiableLines: number
  usineFermee: boolean
}

export interface PlantClosureRange {
  from: string
  to: string
  motif: string
}

export interface ExpeditionForecast {
  from: string
  to: string
  decisionTo: string
  prealertTo: string
  dailyHorizonDays: number
  weeklyHorizonWeeks: number
  capaciteJour: number
  nbDepartsQuotidiens: number
  camionCapacitePalettes: number
  /** Cadence atelier retenue, en équivalent-palettes par jour ouvré. */
  productionDailyCapacity: number
  maxSpotTrucks: number
  initialQueuePalettes: number
  loadedTodayPalettes: number
  days: DayCharge[]
  weeks: WeekCharge[]
  /** Carnet à échéance dépassée que la bande jour n'a pas absorbé. */
  retardPalettes: number
  retardLines: ForecastLine[]
  deferred: ForecastLine[]
  deferredPalettes: number
  nonQuantifiableLines: number
  plantClosures: PlantClosureRange[]
  firstWorkingDay: string | null
}

export interface ForecastResponse {
  forecast: ExpeditionForecast
  x3Error: string | null
}

export const SOURCE_LABEL: Record<AvailabilitySource, string> = {
  stock: 'Stock alloué',
  quai: 'Quai',
  stock_production: 'Atelier',
  of_lance: 'OF lancé',
  of_ferme: 'OF ferme',
  of_planifie: 'OF planifié',
  of_suggere: 'OF suggéré',
  ctp: 'CTP',
}

export const CONFIDENCE_LABEL: Record<AvailabilityConfidence, string> = {
  constatee: 'Constatée',
  haute: 'Haute',
  moyenne: 'Moyenne',
  faible: 'Faible',
}

/** jj/mm depuis ISO YYYY-MM-DD. */
export function fmtJour(iso: string | null): string {
  if (!iso) return '—'
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return iso
  return `${m[3]}/${m[2]}`
}

export function fmtPal(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return '—'
  if (n === 0) return '0'
  return n < 10 ? n.toFixed(1) : String(Math.round(n))
}

export function weekdayShort(iso: string): string {
  return new Intl.DateTimeFormat('fr-FR', { weekday: 'short' }).format(new Date(`${iso}T12:00:00`))
}
