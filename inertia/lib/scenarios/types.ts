/**
 * Types miroir des scénarios (issue #57). Copie front des contrats domaine
 * (`app/domain/plan-diff.ts`) + du modèle persisté (`app/services/scenario_store.ts`).
 * L'inertia n'importe pas `app/` (tsconfig distinct) → duplication assumée, comme
 * `lib/vision/types.ts`.
 */

export type PlanMutation =
  | { type: 'shift_of'; numOf: string; dateFin?: string | null; dateDebut?: string | null; poste?: string | null }
  | { type: 'shift_demand'; numCommande: string; ligne?: string | null; date: string }
  | { type: 'inject_demand'; id: string; article: string; quantity: number; date: string; client?: string; ligne?: string | null }
  | { type: 'suspend_supply'; article: string; sourceId?: string; delay?: string }

export type DiffSens = 'degradation' | 'amelioration'

export interface ClientDiffEntry {
  numCommande: string
  ligne: string | null
  article: string
  client: string
  statutAvant: string | null
  statutApres: string | null
  joursRetardAvant: number
  joursRetardApres: number
  deltaJours: number
  nouvelle: boolean
  disparue: boolean
  sens: DiffSens
}

export interface ApproDiffEntry {
  composant: string
  manquantAvant: number
  manquantApres: number
  delta: number
  ofs: string[]
  sens: DiffSens
}

export interface AllocationDiffEntry {
  numCommande: string
  ligne: string | null
  article: string
  perd: string[]
  gagne: string[]
  beneficiaires: Array<{ numOf: string; commandes: string[] }>
  deltaReliquat: number
  sens: DiffSens
}

export interface ChargeDiffEntry {
  poste: string
  semaine: string
  deltaHeures: number
  deltaPct: number | null
}

export interface PlanDiff {
  client: ClientDiffEntry[]
  appro: ApproDiffEntry[]
  allocation: AllocationDiffEntry[]
  charge: ChargeDiffEntry[]
  stats: { degradations: number; ameliorations: number }
}

export interface ScenarioRow {
  id: number
  nom: string
  description: string | null
  auteur: string | null
  statut: 'brouillon' | 'applique'
  mutations: PlanMutation[]
  evaluatedAt: string | null
  dataAt: string | null
  createdAt: string
  updatedAt: string
}

/** Clé d'identité d'une mutation (dédup : un 2e drag du même OF remplace le 1er). */
export function mutationKey(m: PlanMutation): string {
  switch (m.type) {
    case 'shift_of':
      return `of:${m.numOf}`
    case 'shift_demand':
      return `demand:${m.numCommande}#${m.ligne ?? ''}`
    case 'inject_demand':
      return `inject:${m.id}`
    case 'suspend_supply':
      return `suspend:${m.article}:${m.sourceId ?? ''}`
  }
}
