export interface PlanningBoardOF {
  num_of: string
  article: string
  description: string
  statut_num: number
  statut_texte: string
  statut_origine: number
  date_debut: string | null
  date_fin: string | null
  date_debut_origine: string | null
  date_fin_origine: string | null
  qte_a_fabriquer: number
  qte_fabriquee: number
  qte_restante: number
  poste_charge: string | null
  libelle_poste: string | null
  cadence: number | null
  duree_heures: number | null
  modified: boolean
  note: string | null
  updated_at: string | null
}

export interface PlanningBoardResponse {
  ofs: PlanningBoardOF[]
  total: number
  window: { from: string; to: string }
  postes: string[]
  nb_modified: number
}

export interface OfPatchPayload {
  date_debut?: string | null
  date_fin?: string | null
  statut_num?: number | null
  note?: string | null
}

export interface PlanningBoardOverride {
  num_of: string
  date_debut: string | null
  date_fin: string | null
  statut_num: number | null
  note: string | null
  updated_at: string
}

export interface PlanningBoardEvent {
  id: number
  num_of: string
  action: string
  payload: string
  created_at: string
}
