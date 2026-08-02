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
}

export interface DayCharge {
  date: string
  band: ForecastBand
  offset: number
  fileBefore: number
  entries: number
  available: number
  loaded: number
  fileAfter: number
  capaciteJour: number
  deltaVsCapacite: number
  spot: boolean
  nbCamionsSpot: number
  spotPalettes: number
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
  initialQueuePalettes: number
  loadedTodayPalettes: number
  days: DayCharge[]
  weeks: WeekCharge[]
  deferred: ForecastLine[]
  deferredPalettes: number
  nonQuantifiableLines: number
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
  return n < 10 ? n.toFixed(1) : String(Math.round(n))
}
