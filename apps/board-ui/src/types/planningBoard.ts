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

/* ── Faisabilité ───────────────────────────────────────────────── */

export type FeasibilityStatut = 'ok' | 'bloque' | 'sans_nomenclature'

export interface FeasibilityEntry {
  num_of: string
  article: string
  faisable: boolean
  statut: FeasibilityStatut
  missing_components: Record<string, number>
  alerts: string[]
  allocated: Record<string, number>
  date_besoin: string | null
  statut_num: number
}

export interface FeasibilityResponse {
  results: Record<string, FeasibilityEntry>
  window: { from: string; to: string }
  stats: {
    nb_evalues: number
    nb_ok: number
    nb_bloques: number
    nb_sans_nomenclature: number
  }
}

export interface FeasibilityDiff {
  degraded: string[]
  improved: string[]
}

/* ── What-if ───────────────────────────────────────────────────── */

export interface WhatIfLinkedOrder {
  num_commande: string
  client: string
  article: string
  qte_restante: number
  date_expedition: string | null
  type_commande: string
}

export interface WhatIfDegradedOf extends FeasibilityEntry {
  composants_perdus: Record<string, number>
  commandes: WhatIfLinkedOrder[]
}

export interface WhatIfResponse {
  demande: { article: string; quantite: number; date_besoin: string }
  nouvelle: FeasibilityEntry
  degraded: WhatIfDegradedOf[]
  improved: FeasibilityEntry[]
  stats: {
    nb_of_evalues: number
    nb_degrades: number
    nb_ameliores: number
    nb_commandes_touchees: number
  }
}

export interface ArticleSearchResult {
  code: string
  description: string
  type_appro: string
}
