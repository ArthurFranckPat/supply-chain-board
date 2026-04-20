/** Status values assigned by the suivi-commandes backend. */
export type SuiviStatus =
  | 'A Livrer'
  | 'Allocation \u00e0 faire'
  | 'Retard Prod'
  | 'Horizon MAD aux Exp\u00e9'
  | 'RAS'

/** Mapping from status string to Pill tone for the UI. */
export const STATUS_TONE_MAP: Record<string, 'good' | 'primary' | 'danger' | 'warn' | 'default'> = {
  'A Livrer': 'good',
  'Allocation \u00e0 faire': 'primary',
  'Retard Prod': 'danger',
  'Horizon MAD aux Exp\u00e9': 'warn',
  RAS: 'default',
}

/** Single order row returned by the status API. */
export interface OrderRow {
  'Date expedition': string | null
  'No commande': string
  'Nom client commande': string
  Article: string
  'D\u00e9signation 1': string | null
  'Type commande': string
  Statut: string
  'Poste de charge': string | null
  Emplacement: string | null
  HUM: string | null
  'Date mise en stock': string | null
  'Quantit\u00e9 restante': number
  'Quantit\u00e9 livr\u00e9e': number
  'Quantit\u00e9 command\u00e9e': number
  'Qt\u00e9 allou\u00e9e': number | null
  'Prix brut': number | null
  Cadence: number | null
  'Stock interne \'A\'': number | null
  'Allou\u00e9 interne \'A\'': number | null
  'Date liv pr\u00e9vue': string | null
  'Etat commande': string | null
  'Etat ligne': string | null
  'Stock libre article'?: number | null
  'Besoin ligne'?: number | null
  'Besoin cumul\u00e9'?: number | null
  'Allocation possible'?: boolean | null
  'Allocation \u00e0 faire'?: boolean | null
  'Jours ouvr\u00e9s avant exp'?: number | null
  Commentaire?: string | null
}

/** Line-level aggregated row for delay depth analysis. */
export interface LineLevelRow {
  Article: string
  'No commande': string
  'Date expedition': string | null
  'Date liv pr\u00e9vue': string | null
  'Besoin ligne': number
  'Stock libre article': number
  [key: string]: unknown
}

/** Top-level response from the status API. */
export interface SuiviStatusResponse {
  total_rows: number
  status_counts: Record<string, number>
  rows: OrderRow[]
  line_level: LineLevelRow[]
}

/** Comment entry from the comments API. */
export interface CommentEntry {
  no_commande: string
  article: string
  comment: string
  updated_at: string
}

/** Filter state managed in OrderTrackingView. */
export interface OrderFilterState {
  client: string
  orderSearch: string
  articleSearch: string
  typesCommande: string[]
  statuts: string[]
}

/** Available options extracted from the raw data for filter dropdowns. */
export interface FilterOptions {
  clients: string[]
  typesCommande: string[]
  statuts: string[]
}
