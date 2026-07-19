/**
 * Store zustand du mode scénario (issue #57) — port React du Solid
 * inertia/lib/scenarios/store.ts. Purement data + I/O serveur ; le couplage
 * visuel (interception du PATCH, rejeu au drop, retour à l'état réel) vit
 * dans programme.tsx, seul détenteur des board stores.
 *
 * Décision actée (vision §5) : on empile les MUTATIONS, pas le résultat. Le diff
 * (3 axes : client / appro / allocation) est réévalué à la demande sur données
 * fraîches via `scenarios.diff`.
 */
import { create } from 'zustand'
import { route } from '@/lib/routes'
import { type PlanMutation, type PlanDiff, type ScenarioRow, type AllocationStrategy, mutationKey } from '@/lib/scenarios/types'

interface CurrentScenario {
  id: number | null
  nom: string
  statut: 'brouillon' | 'applique'
  mutations: PlanMutation[]
  strategy: AllocationStrategy
  evaluatedAt: string | null
  dataAt: string | null
}

interface ScenarioState {
  // Mode direct (false) = comportement actuel (PATCH immédiat). Mode scénario (true)
  // = capture des gestes en mutations, aucun PATCH réel.
  active: boolean
  setActive: (active: boolean) => void

  // Scénario courant (brouillon en cours d'édition). id=null tant que non enregistré.
  current: CurrentScenario
  setCurrent: (next: Partial<CurrentScenario>) => void
  reconcileCurrent: (next: Partial<CurrentScenario>) => void
  reset: () => void

  // État de sauvegarde
  saving: boolean
  setSaving: (saving: boolean) => void

  // Liste des scénarios enregistrés (pour rouvrir / supprimer).
  list: ScenarioRow[]
  setList: (list: ScenarioRow[]) => void
  listLoading: boolean
  setListLoading: (loading: boolean) => void

  // Diff courant (constat 3 axes), null tant que non calculé.
  diff: PlanDiff | null
  setDiff: (diff: PlanDiff | null) => void
  diffLoading: boolean
  setDiffLoading: (loading: boolean) => void

  // Mutation helpers
  mutationCount: () => number
  upsertMutation: (m: PlanMutation) => void
  removeMutation: (key: string) => void
  setNom: (nom: string) => void
  setStrategy: (strategy: AllocationStrategy) => void

  // I/O serveur
  loadList: () => Promise<void>
  save: () => Promise<number | null>
  open: (id: number) => Promise<PlanMutation[]>
  remove: (id: number) => Promise<void>
  computeDiff: (from: string, to: string) => Promise<void>
  markApplied: () => Promise<void>
}

const INITIAL_CURRENT: CurrentScenario = {
  id: null,
  nom: '',
  statut: 'brouillon',
  mutations: [],
  strategy: 'date_besoin',
  evaluatedAt: null,
  dataAt: null,
}

export const useScenarioStore = create<ScenarioState>((set, get) => ({
  active: false,
  setActive: (active) => set({ active }),

  current: INITIAL_CURRENT,
  setCurrent: (next) => set((state) => ({ current: { ...state.current, ...next } })),
  reconcileCurrent: (next) =>
    set({
      current: {
        id: next.id ?? null,
        nom: next.nom ?? '',
        statut: next.statut ?? 'brouillon',
        mutations: next.mutations ?? [],
        strategy: next.strategy ?? 'date_besoin',
        evaluatedAt: next.evaluatedAt ?? null,
        dataAt: next.dataAt ?? null,
      },
    }),
  reset: () => set({ current: INITIAL_CURRENT, diff: null }),

  saving: false,
  setSaving: (saving) => set({ saving }),

  list: [],
  setList: (list) => set({ list }),
  listLoading: false,
  setListLoading: (listLoading) => set({ listLoading }),

  diff: null,
  setDiff: (diff) => set({ diff }),
  diffLoading: false,
  setDiffLoading: (diffLoading) => set({ diffLoading }),

  mutationCount: () => get().current.mutations.length,

  upsertMutation: (m) => {
    const key = mutationKey(m)
    const idx = get().current.mutations.findIndex((x) => mutationKey(x) === key)
    if (idx === -1) {
      set((state) => ({
        current: { ...state.current, mutations: [...state.current.mutations, m] },
      }))
    } else {
      set((state) => ({
        current: {
          ...state.current,
          mutations: state.current.mutations.map((x, i) => (i === idx ? m : x)),
        },
      }))
    }
    set({ diff: null })
  },

  removeMutation: (key) => {
    set((state) => ({
      current: {
        ...state.current,
        mutations: state.current.mutations.filter((x) => mutationKey(x) !== key),
      },
      diff: null,
    }))
  },

  setNom: (nom) =>
    set((state) => ({
      current: { ...state.current, nom },
    })),

  setStrategy: (strategy) =>
    set((state) => ({
      current: { ...state.current, strategy },
      diff: null,
    })),

  // ── I/O serveur ──

  loadList: async () => {
    set({ listLoading: true })
    try {
      const r = await fetch(route('scenarios.index'))
      const data = (await r.json()) as { scenarios: ScenarioRow[] }
      set({ list: data.scenarios ?? [] })
    } finally {
      set({ listLoading: false })
    }
  },

  save: async () => {
    if (get().saving) return get().current.id
    set({ saving: true })
    try {
      const current = get().current
      const body = JSON.stringify({
        nom: current.nom || 'Scénario',
        mutations: current.mutations,
        strategy: current.strategy,
      })
      const isNew = current.id == null
      const r = await fetch(
        isNew ? route('scenarios.store') : route('scenarios.update', { id: current.id! }),
        { method: isNew ? 'POST' : 'PATCH', headers: { 'Content-Type': 'application/json' }, body }
      )
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const row = (await r.json()) as ScenarioRow
      set((state) => ({
        current: { ...state.current, id: row.id, statut: row.statut },
      }))
      await get().loadList()
      return row.id
    } finally {
      set({ saving: false })
    }
  },

  open: async (id) => {
    const r = await fetch(route('scenarios.show', { id }))
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    const row = (await r.json()) as ScenarioRow
    set({
      current: {
        id: row.id,
        nom: row.nom,
        statut: row.statut,
        mutations: row.mutations,
        strategy: row.strategy,
        evaluatedAt: row.evaluatedAt,
        dataAt: row.dataAt,
      },
      diff: null,
    })
    return row.mutations
  },

  remove: async (id) => {
    await fetch(route('scenarios.destroy', { id }), { method: 'DELETE' })
    const state = get()
    if (state.current.id === id) {
      set({ current: INITIAL_CURRENT, diff: null })
    }
    await get().loadList()
  },

  computeDiff: async (from, to) => {
    if (get().diffLoading) return
    set({ diffLoading: true })
    try {
      const current = get().current
      const r = await fetch(route('scenarios.diff'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from,
          to,
          mutations: current.mutations,
          id: current.id ?? undefined,
          strategy: current.strategy,
        }),
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const data = (await r.json()) as { diff: PlanDiff; evaluatedAt: string; dataAt: string }
      set({
        diff: data.diff,
        current: { ...get().current, evaluatedAt: data.evaluatedAt, dataAt: data.dataAt },
      })
    } finally {
      set({ diffLoading: false })
    }
  },

  markApplied: async () => {
    const id = get().current.id
    if (id == null) return
    await fetch(route('scenarios.update', { id }), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ statut: 'applique' }),
    })
    set((state) => ({ current: { ...state.current, statut: 'applique' } }))
    await get().loadList()
  },
}))
