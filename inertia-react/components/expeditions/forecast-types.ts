/**
 * Types partagés prévision charge transport (issue #104) — miroir du domaine
 * `app/domain/expedition_forecast.ts` pour le front Inertia.
 */

export type ForecastStatut = 'on_time' | 'stock' | 'retard' | 'bloquee' | 'sans_couverture'

export interface ForecastLine {
  numCommande: string
  ligne: string | null
  client: string
  article: string
  description: string
  qte: number
  palTheo: number
  statut: ForecastStatut
  dateExpedition: string
  dateRealiste: string | null
  glisse: boolean
  ofNum: string | null
  ofDateFin: string | null
}

export interface DayCharge {
  date: string
  chargeNominale: number
  chargeRealiste: number
  partGlisse: number
  capaciteJour: number
  deltaVsCapacite: number
  spot: boolean
  lignesNominales: ForecastLine[]
  lignesRealistes: ForecastLine[]
}

export interface ExpeditionForecast {
  from: string
  to: string
  horizonDays: number
  capaciteJour: number
  nbDepartsQuotidiens: number
  camionCapacitePalettes: number
  days: DayCharge[]
  deferred: ForecastLine[]
  deferredPalTheo: number
}

export interface ForecastResponse {
  forecast: ExpeditionForecast
  x3Error: string | null
}

export const STATUT_LABEL: Record<ForecastStatut, string> = {
  on_time: 'À l’heure',
  stock: 'Stock',
  retard: 'Retard',
  bloquee: 'Bloquée',
  sans_couverture: 'Sans couverture',
}

/** jj/mm depuis ISO YYYY-MM-DD. */
export function fmtJour(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return iso
  return `${m[3]}/${m[2]}`
}

export function fmtPal(n: number): string {
  if (n < 0) return '—'
  return n < 10 ? n.toFixed(1) : String(Math.round(n))
}
