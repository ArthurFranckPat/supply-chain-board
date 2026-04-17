export interface CandidateOF {
  num_of: string
  article: string
  description: string
  line: string
  due_date: string
  quantity: number
  charge_hours: number
  is_buffer_bdh: boolean
  source: 'matching_client' | 'encours_of' | 'buffer_bdh'
  statut_num: number
  blocking_components: string
  linked_orders: string
  scheduled_day: string | null
  start_hour: number | null
  end_hour: number | null
  reason: string
  deviations: number
  target_day: string | null
}

export interface SchedulerResult {
  score: number
  taux_service: number
  taux_ouverture: number
  nb_deviations: number
  nb_jit: number
  nb_changements_serie: number
  plannings: Record<string, CandidateOF[]>
  line_candidates: Record<string, CandidateOF[]>
  stock_projection: StockProjectionEntry[]
  alerts: string[]
  weights: Record<string, number>
  unscheduled_rows: UnscheduledRow[]
  order_rows: OrderRow[]
  line_labels: Record<string, string>
  reception_rows: ReceptionRow[]
}

export interface StockProjectionEntry {
  jour: string
  article: string
  stock_projete: number
}

export interface UnscheduledRow {
  ligne: string
  of: string
  article: string
  date_echeance: string
  charge_h: number
  source: string
  composants_bloquants: string
  cause: string
}

export interface OrderRow {
  commande: string
  article_commande: string
  date_demande: string
  qte: number
  of: string
  article_of: string
  jour_planifie: string
  statut: string
  cause: string
  matching: string
}

export interface ReceptionLinkedOF {
  num_of: string
  article: string
  line: string
  scheduled_day: string | null
  blocked: boolean
}

export interface ReceptionRow {
  num_commande: string
  article: string
  description: string
  fournisseur: string
  quantite: number
  date_prevue: string
  jours_restants: number
  stock_actuel: number
  nb_of_concernes: number
  ofs: ReceptionLinkedOF[]
}
