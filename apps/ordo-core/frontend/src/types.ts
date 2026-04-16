export type DataSource = 'extractions'

export interface ApiConfig {
  project_root: string
  data_dir_default: string
  extractions_mode_supported: boolean
  sources: Array<{ id: DataSource; label: string }>
  feasibility_modes: Array<{ id: string; label: string }>
}

export interface RunSummary {
  horizon_days: number
  include_previsions: boolean
  feasibility_mode: string
  besoins_s1: number
  matched_ofs: number
  feasible_ofs: number
  non_feasible_ofs: number
  action_components: number
  kanban_postes: number
}

export interface OfResult {
  num_of: string
  article: string
  date_debut: string | null
  date_fin: string
  qte_restante: number
  commande: string
  commande_article: string
  commande_date_expedition: string
  matching_method: string
  feasible: boolean
  missing_components: Record<string, number>
  alerts: string[]
}

export interface ActionReportLine {
  article_composant?: string
  description?: string | null
  missing_qty_total?: number
  nb_ofs_impactes?: number
  nb_commandes_impactees?: number
  date_expedition_la_plus_proche?: string | null
  niveau_action?: string
  action_recommandee?: string
  fournisseur?: string
  num_commande_achat?: string
  articles_concernes?: string[]
  poste_fournisseur?: string
  libelle_poste_fournisseur?: string
  articles_kanban_concernes?: string[]
  postes_consommateurs?: string[]
  niveau_risque?: string
}

export interface ActionReportPayload {
  component_lines: ActionReportLine[]
  supplier_lines: ActionReportLine[]
  poste_kanban_lines: ActionReportLine[]
  impacted_ofs: number
  impacted_commandes: number
}

export interface ReportFile {
  name: string
  path: string
  category: string
  updated_at: string
  size_bytes: number
}

export interface EmbeddedReport {
  type: string
  path: string
  exists: boolean
  content?: string
  updated_at?: string | null
}

export interface RunResult {
  reference_date: string
  source: Record<string, unknown> | null
  summary: RunSummary
  of_results: OfResult[]
  action_report: ActionReportPayload
  reports: {
    actions: EmbeddedReport
    s1: EmbeddedReport
  }
}

export interface RunState {
  run_id: string
  status: string
  created_at: string
  completed_at?: string
  kind: string
  result?: RunResult
  error?: string
}

export interface DetailItem {
  title: string
  description: string
  payload: unknown
}
