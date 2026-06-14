/** Shared types for the board frontend — mirrors server-side domain types. */

/** OF detail data injected via #board-data JSON script. */
export interface OfDetail {
  numOf: string
  article: string
  designation: string
  statutLabel: string
  typeOfLabel: string | null
  workstation: string | null
  workstationLabel: string | null
  startIso: string
  endIso: string
  spanDays: number
  qtyLaunched: number
  qtyDone: number
  qtyRemaining: number
  unit: string
  hours: number
  status: number
  modified: boolean
  note: string | null
}

/** Parsed #board-data JSON payload. */
export interface BoardData {
  days: string[]
  cols: number
  ofData: Record<string, OfDetail>
}

/** Material component row from /of-materials/:numOf API. */
export interface MaterialRow {
  article: string
  description: string
  remaining: number
  unit: string
  available: number | null
  allocated?: number
  feasible: boolean | null
  missing: number
}

/** Response from /of-materials/:numOf API. */
export interface MaterialsResponse {
  numOf: string
  article?: string
  materials: MaterialRow[]
  feasible: boolean
  blockedCount: number
  message?: string
}

/** OF info inside a feasibility order result. */
export interface FeasOf {
  numOf: string
  article: string
  qteAllouee: number
  dateFin: string
  feasible: boolean | null
  missingComponents: Record<string, number>
  modified: boolean
  statutNum: number
}

/** Single order in the feasibility result. */
export interface FeasOrder {
  numCommande: string
  client: string
  article: string
  description: string
  qteRestante: number
  dateExpedition: string
  dejaEnRetard: boolean
  nature: 'commande' | 'prevision'
  typeCommande: string
  matchingMethod: string
  reliquat: number
  statut: 'on_time' | 'stock' | 'retard' | 'bloquee' | 'sans_couverture'
  joursRetard: number
  ofs: FeasOf[]
}

/** Feasibility stats summary. */
export interface FeasStats {
  nbCommandes: number
  nbOnTime: number
  nbRetard: number
  nbBloquees: number
  nbSansCouverture: number
}

/** Full response from /board-feasibility API. */
export interface FeasibilityResult {
  orders: FeasOrder[]
  window: { from: string; to: string }
  stats: FeasStats
}

/** Toast notification state. */
export interface ToastState {
  show: boolean
  msg: string
  err: boolean
}

/** Per-OF feasibility lookup extracted from FeasibilityResult. */
export interface OfFeasibility {
  feasible: boolean | null
  missingComponents: Record<string, number>
}
