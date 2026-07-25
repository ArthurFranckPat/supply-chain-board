/**
 * Types miroir des scénarios (issue #57). Copie front des contrats domaine
 * (`app/domain/plan-diff.ts`) + du modèle persisté (`app/services/scenario_store.ts`).
 * L'inertia n'importe pas `app/` (tsconfig distinct) → duplication assumée, comme
 * `lib/vision/types.ts`.
 */

export type PlanMutation =
  | {
      type: 'shift_of'
      numOf: string
      dateFin?: string | null
      dateDebut?: string | null
      poste?: string | null
    }
  | { type: 'shift_demand'; numCommande: string; ligne?: string | null; date: string }
  | {
      type: 'inject_demand'
      id: string
      article: string
      quantity: number
      date: string
      client?: string
      ligne?: string | null
      /** true si la date vient du moteur CTP (« au plus tôt ») — badge sur le chip. */
      earliest?: boolean
    }
  | { type: 'suspend_supply'; article: string; sourceId?: string; delay?: string }

export type AllocationStrategy = 'date_besoin' | 'date_passation' | 'priorite_previsions'

export interface ApproVerdictEntry {
  composant: string
  numOf: string
  verdict: 'inevitable' | 'recalable' | 'dormant'
  dateAvant: string
  dateApres: string
  quantite: number
  reorderDelay: number
}

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
  approVerdicts?: ApproVerdictEntry[]
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
  strategy: AllocationStrategy
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

/** Vue d'une commande virtuelle (issue #58) — mutation `inject_demand` + verdict de
 *  servabilité résolu depuis le dernier diff calculé (null tant que non évalué). */
export interface VirtualOrderVm {
  id: string
  article: string
  quantity: number
  client: string | null
  date: string
  statut: ClientDiffEntry['statutApres'] | null
  joursRetard: number | null
  /** Date calculée « au plus tôt » par le moteur CTP (badge sur le chip). */
  earliest: boolean
}

/** Reconstruit les commandes virtuelles courantes (mutations `inject_demand`) et
 *  résout leur verdict de servabilité dans le dernier diff calculé (issue #58). */
export function virtualOrdersFrom(
  mutations: PlanMutation[],
  diff: PlanDiff | null
): VirtualOrderVm[] {
  const clientByKey = new Map(
    (diff?.client ?? [])
      .filter((e) => e.nouvelle)
      .map((e) => [`${e.numCommande}#${e.ligne ?? ''}`, e])
  )
  return mutations
    .filter(
      (m): m is Extract<PlanMutation, { type: 'inject_demand' }> => m.type === 'inject_demand'
    )
    .map((m) => {
      const entry = clientByKey.get(`${m.id}#${m.ligne ?? ''}`)
      return {
        id: m.id,
        article: m.article,
        quantity: m.quantity,
        client: m.client ?? null,
        date: m.date,
        statut: entry?.statutApres ?? null,
        joursRetard: entry?.joursRetardApres ?? null,
        earliest: m.earliest === true,
      }
    })
}
