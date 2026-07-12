import { createSignal } from 'solid-js'
import { createStore, produce, reconcile } from 'solid-js/store'
import { route } from '@/lib/routes'
import { type PlanMutation, type PlanDiff, type ScenarioRow, type AllocationStrategy, mutationKey } from './types'

/**
 * État du mode scénario de `/programme` (issue #57). Purement data + I/O serveur :
 * le couplage visuel (interception du PATCH, rejeu au drop, retour à l'état réel)
 * vit dans `programme.tsx`, seul détenteur des board stores.
 *
 * Décision actée (vision §5) : on empile les MUTATIONS, pas le résultat. Le diff
 * (3 axes : client / appro / allocation) est réévalué à la demande sur données
 * fraîches via `scenarios.diff`.
 */
export function createScenarioStore() {
  // Mode direct (false) = comportement actuel (PATCH immédiat). Mode scénario (true)
  // = capture des gestes en mutations, aucun PATCH réel.
  const [active, setActive] = createSignal(false)

  // Scénario courant (brouillon en cours d'édition). id=null tant que non enregistré.
  const [current, setCurrent] = createStore<{
    id: number | null
    nom: string
    statut: 'brouillon' | 'applique'
    mutations: PlanMutation[]
    strategy: AllocationStrategy
    evaluatedAt: string | null
    dataAt: string | null
  }>({ id: null, nom: '', statut: 'brouillon', mutations: [], strategy: 'date_besoin', evaluatedAt: null, dataAt: null })

  const [saving, setSaving] = createSignal(false)

  // Liste des scénarios enregistrés (pour rouvrir / supprimer).
  const [list, setList] = createStore<ScenarioRow[]>([])
  const [listLoading, setListLoading] = createSignal(false)

  // Diff courant (constat 3 axes), null tant que non calculé.
  const [diff, setDiff] = createSignal<PlanDiff | null>(null)
  const [diffLoading, setDiffLoading] = createSignal(false)

  const mutationCount = () => current.mutations.length

  function reconcileCurrent(next: Partial<typeof current>) {
    setCurrent(
      reconcile({
        id: next.id ?? null,
        nom: next.nom ?? '',
        statut: next.statut ?? 'brouillon',
        mutations: next.mutations ?? [],
        strategy: next.strategy ?? 'date_besoin',
        evaluatedAt: next.evaluatedAt ?? null,
        dataAt: next.dataAt ?? null,
      } as any)
    )
  }

  function reset() {
    reconcileCurrent({
      id: null,
      nom: '',
      statut: 'brouillon',
      mutations: [],
      strategy: 'date_besoin',
      evaluatedAt: null,
      dataAt: null,
    })
    setDiff(null)
  }

  /** Empile (ou remplace, par clé d'identité) une mutation. Diff périmé → invalidé. */
  function upsertMutation(m: PlanMutation) {
    const key = mutationKey(m)
    setCurrent(
      produce((c) => {
        const idx = c.mutations.findIndex((x) => mutationKey(x) === key)
        if (idx === -1) c.mutations.push(m)
        else c.mutations[idx] = m
      })
    )
    setDiff(null)
  }

  /** Retire une mutation par clé (ex. OF ramené à son origine). */
  function removeMutation(key: string) {
    setCurrent(
      produce((c) => {
        const idx = c.mutations.findIndex((x) => mutationKey(x) === key)
        if (idx !== -1) c.mutations.splice(idx, 1)
      })
    )
    setDiff(null)
  }

  function setNom(nom: string) {
    setCurrent('nom', nom)
  }

  function setStrategy(strategy: AllocationStrategy) {
    setCurrent('strategy', strategy)
    setDiff(null)
  }

  // ── I/O serveur ──

  async function loadList() {
    setListLoading(true)
    try {
      const r = await fetch(route('scenarios.index'))
      const data = (await r.json()) as { scenarios: ScenarioRow[] }
      setList(reconcile(data.scenarios ?? []))
    } finally {
      setListLoading(false)
    }
  }

  /** Enregistre le brouillon courant (POST si neuf, PATCH sinon). Retourne l'id. */
  async function save(): Promise<number | null> {
    if (saving()) return current.id
    setSaving(true)
    try {
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
      setCurrent('id', row.id)
      setCurrent('statut', row.statut)
      await loadList()
      return row.id
    } finally {
      setSaving(false)
    }
  }

  /** Charge un scénario enregistré dans le brouillon courant. Retourne ses mutations
   *  (pour rejeu visuel côté programme.tsx). */
  async function open(id: number): Promise<PlanMutation[]> {
    const r = await fetch(route('scenarios.show', { id }))
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    const row = (await r.json()) as ScenarioRow
    reconcileCurrent({
      id: row.id,
      nom: row.nom,
      statut: row.statut,
      mutations: row.mutations,
      strategy: row.strategy,
      evaluatedAt: row.evaluatedAt,
      dataAt: row.dataAt,
    })
    setDiff(null)
    return row.mutations
  }

  async function remove(id: number): Promise<void> {
    await fetch(route('scenarios.destroy', { id }), { method: 'DELETE' })
    if (current.id === id) reset()
    await loadList()
  }

  /** Réévalue le diff du scénario courant sur données fraîches. */
  async function computeDiff(from: string, to: string): Promise<void> {
    if (diffLoading()) return
    setDiffLoading(true)
    try {
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
      setDiff(data.diff)
      setCurrent('evaluatedAt', data.evaluatedAt)
      setCurrent('dataAt', data.dataAt)
    } finally {
      setDiffLoading(false)
    }
  }

  /** Marque le scénario courant `applique` (après rejeu des PATCHs réels). */
  async function markApplied(): Promise<void> {
    if (current.id == null) return
    await fetch(route('scenarios.update', { id: current.id }), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ statut: 'applique' }),
    })
    setCurrent('statut', 'applique')
    await loadList()
  }

  return {
    active,
    setActive,
    current,
    saving,
    list,
    listLoading,
    diff,
    diffLoading,
    mutationCount,
    upsertMutation,
    removeMutation,
    setNom,
    setStrategy,
    reset,
    loadList,
    save,
    open,
    remove,
    computeDiff,
    markApplied,
  }
}

export type ScenarioStore = ReturnType<typeof createScenarioStore>
