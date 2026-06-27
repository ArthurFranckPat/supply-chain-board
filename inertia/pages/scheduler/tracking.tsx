import { createEffect, createMemo, createResource, createSignal, For, onCleanup, Show, type Component } from 'solid-js'
import { Link } from '@/lib/inertia-solid'
import { route } from '@/lib/routes'
import { cx } from '@/libs/cva'
import { createColumnHelper } from '@tanstack/solid-table'
import { DataTable, type SortingState } from '@/components/ui/data-table'

import type {
  SuiviPageProps,
  SuiviRowsResponse,
  SuiviStatusKey,
  SuiviDisplayRow,
  ProactiveRowsResponse,
  ProactiveVerdictKey,
  ProactiveDisplayRow,
} from '@/lib/suivi/types'
import { Masthead } from '@/components/masthead'

/**
 * Page « Suivi des commandes » (issue #19) — axe allocation / expédition.
 *
 * Shell Inertia rendu instantanément (SuiviController.board) ; les lignes (calcul
 * lourd : assignation des 4 statuts + causes + signal CQ depuis X3) sont chargées
 * en différé par fetch JSON (SuiviController.rows). Même motif que la page
 * ruptures (scheduler/shortages). Registre Papier harmonisé avec shortage-table
 * + Rangée rupture (design_system §07).
 */

const EMPTY: SuiviRowsResponse = {
  total: 0,
  statusCounts: { A_EXPEDIER: 0, ALLOCATION_A_FAIRE: 0, RETARD_PROD: 0, RAS: 0 },
  cqCount: 0,
  ateliers: [],
  rows: [],
  x3Error: null,
  referenceDate: '',
}

const PROACTIVE_EMPTY: ProactiveRowsResponse = {
  total: 0,
  verdictCounts: { time: 0, stock: 0, late: 0, blocked: 0, uncov: 0 },
  ateliers: [],
  rows: [],
  x3Error: null,
  referenceDate: '',
}

/** Couleur du badge par statut (grammar uniforme ui/badge — un seul shape). */
const BADGE_TONE: Record<SuiviStatusKey, string> = {
  exp: 'bg-ferme/15 text-ferme',
  alc: 'bg-suggere/15 text-suggere',
  ret: 'bg-destructive/10 text-destructive',
  ras: 'bg-secondary text-muted-foreground',
}

/**
 * Statut X3 d'un OF (WIPSTA / statutNum) → tag court WOF/WOP/WOS + couleur.
 *  - 1 = Ferme     → WOF (Work Order Firm)
 *  - 2 = Planifié  → WOP (Work Order Planned)
 *  - 3 = Suggéré   → WOS (Work Order Suggested)
 */
const OF_STATUT: Record<number, { tag: string; tone: string }> = {
  1: { tag: 'WOF', tone: 'bg-ferme/15 text-ferme' },
  2: { tag: 'WOP', tone: 'bg-planifie/15 text-planifie' },
  3: { tag: 'WOS', tone: 'bg-suggere/15 text-suggere' },
}

/** Couleur du badge verdict (vue proactive). */
const VERDICT_TONE: Record<ProactiveVerdictKey, string> = {
  time: 'bg-ferme/15 text-ferme',
  stock: 'bg-ferme/15 text-ferme',
  late: 'bg-suggere/15 text-suggere',
  blocked: 'bg-destructive/10 text-destructive',
  uncov: 'bg-destructive/10 text-destructive',
}

const Tracking: Component<SuiviPageProps> = (props) => {
  // Calcul lourd différé : fetch client-side, relancé à chaque changement de date
  // ou de bust (bouton refresh → ?refresh=N invalide le cache serveur).
  const [bust, setBust] = createSignal(0)
  const [rowsMs, setRowsMs] = createSignal<number | null>(null)
  const [proMs, setProMs] = createSignal<number | null>(null)
  const [elapsed, setElapsed] = createSignal(0)
  const [proElapsed, setProElapsed] = createSignal(0)

  const [data] = createResource(
    () => `${props.rowsHref}${bust() ? `&refresh=${bust()}` : ''}`,
    async (url): Promise<SuiviRowsResponse> => {
      const start = Date.now()
      const res = await fetch(url, { headers: { accept: 'application/json' } })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = (await res.json()) as SuiviRowsResponse
      setRowsMs(Date.now() - start)
      return json
    },
  )

  createEffect(() => {
    if (!data.loading) { setElapsed(0); return }
    const t0 = Date.now()
    const id = setInterval(() => setElapsed(Date.now() - t0), 200)
    onCleanup(() => clearInterval(id))
  })

  // Vue courante avec fallback vide (évite de répéter `data() ?? EMPTY` partout).
  const view = createMemo(() => data() ?? EMPTY)

  // ── Vue proactive (réalisabilité des commandes via le moteur séquentiel) ──
  const [mode, setMode] = createSignal<'reactif' | 'proactif'>('reactif')
  const [proData] = createResource(
    () => `${props.proactiveRowsHref}${bust() ? `&refresh=${bust()}` : ''}`,
    async (url): Promise<ProactiveRowsResponse> => {
      const start = Date.now()
      const res = await fetch(url, { headers: { accept: 'application/json' } })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = (await res.json()) as ProactiveRowsResponse
      setProMs(Date.now() - start)
      return json
    },
  )

  createEffect(() => {
    if (!proData.loading) { setProElapsed(0); return }
    const t0 = Date.now()
    const id = setInterval(() => setProElapsed(Date.now() - t0), 200)
    onCleanup(() => clearInterval(id))
  })

  const proView = createMemo(() => proData() ?? PROACTIVE_EMPTY)

  const fmtMs = (ms: number) => ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`

  // Filtres + tri côté client.
  const [query, setQuery] = createSignal('')
  const [statusFilter, setStatusFilter] = createSignal<SuiviStatusKey | 'all'>('all')
  const [typeFilter, setTypeFilter] = createSignal<Set<string>>(new Set(['MTS', 'MTO', 'NOR']))
  // Filtre atelier (#36) : ensemble de STOLOC retenus (vide = tous). Transverse aux 2 vues.
  const [atelierFilter, setAtelierFilter] = createSignal<Set<string>>(new Set())

  const toggleType = (t: string) =>
    setTypeFilter((prev) => {
      const next = new Set(prev)
      next.has(t) ? next.delete(t) : next.add(t)
      return next
    })

  const toggleAtelier = (code: string) =>
    setAtelierFilter((prev) => {
      const next = new Set(prev)
      next.has(code) ? next.delete(code) : next.add(code)
      return next
    })

  // Ateliers de la vue active (réactif/proactif), pour les chips de filtre.
  const ateliers = createMemo(() => (mode() === 'proactif' ? proView().ateliers : view().ateliers))

  // Filtrage + tri manuels (TanStack Table ne tracke pas les signaux extérieurs).
  const [verdictFilter, setVerdictFilter] = createSignal<ProactiveVerdictKey | 'all'>('all')
  const [reactiveSorting, setReactiveSorting] = createSignal<SortingState[]>([{ id: 'dateExp', desc: false }])
  const [proSorting, setProSorting] = createSignal<SortingState[]>([{ id: 'dateExp', desc: false }])

  const sortRows = <T extends { numCommande: string; dateExpIso: string | null }>(rows: T[], sorting: SortingState[]): T[] => {
    if (sorting.length === 0) return rows
    const { id, desc } = sorting[0]
    const sorted = [...rows]
    sorted.sort((a, b) => {
      let va: string | number
      let vb: string | number
      switch (id) {
        case 'numCommande':
          va = a.numCommande
          vb = b.numCommande
          break
        case 'article':
          va = (a as any).article
          vb = (b as any).article
          break
        case 'type':
          va = (a as any).type
          vb = (b as any).type
          break
        case 'qteRestante':
          va = (a as any).qteRestante
          vb = (b as any).qteRestante
          break
        case 'dateExp':
          va = a.dateExpIso ?? '9999-12-31'
          vb = b.dateExpIso ?? '9999-12-31'
          break
        case 'couverture':
          va = (a as any).couverture
          vb = (b as any).couverture
          break
        case 'joursRetard':
          va = (a as any).joursRetard
          vb = (b as any).joursRetard
          break
        default:
          return 0
      }
      let cmp = 0
      if (typeof va === 'number' && typeof vb === 'number') {
        cmp = va < vb ? -1 : va > vb ? 1 : 0
      } else {
        cmp = String(va).localeCompare(String(vb))
      }
      if (cmp !== 0) return cmp
      // Tiebreak identique à l'ancien tri manuel.
      return a.numCommande.localeCompare(b.numCommande)
    })
    return desc ? sorted.reverse() : sorted
  }

  const reactiveRows = createMemo(() => {
    const all = view().rows
    const q = query().trim().toLowerCase()
    const sf = statusFilter()
    const tf = typeFilter()
    const af = atelierFilter()
    let r = all.filter(
      (row) => (sf === 'all' || row.statusKey === sf) && tf.has(row.type) && (af.size === 0 || af.has(row.atelier)),
    )
    if (q) r = r.filter((row) => row.filter.includes(q))
    return sortRows(r, reactiveSorting())
  })
  const proRows = createMemo(() => {
    const all = proView().rows
    const q = query().trim().toLowerCase()
    const vf = verdictFilter()
    const tf = typeFilter()
    const af = atelierFilter()
    let r = all.filter(
      (row) => (vf === 'all' || row.verdictKey === vf) && tf.has(row.type) && (af.size === 0 || af.has(row.atelier)),
    )
    if (q) r = r.filter((row) => row.filter.includes(q))
    return sortRows(r, proSorting())
  })

  const counts = () => view().statusCounts
  const refLabel = () =>
    new Date(props.referenceDate + 'T00:00:00').toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    })

  const statusChip = (k: SuiviStatusKey | 'all', label: string) => {
    const on = statusFilter() === k
    return (
      <button
        type="button"
        class={`rounded-[5px] px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider transition-colors ${
          on ? 'bg-terra-soft text-terra' : 'text-muted-foreground hover:text-foreground'
        }`}
        onClick={() => setStatusFilter(on ? 'all' : k)}
      >
        {label}
      </button>
    )
  }

  const verdictChip = (k: ProactiveVerdictKey | 'all', label: string) => {
    const on = verdictFilter() === k
    return (
      <button
        type="button"
        class={`rounded-[5px] px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider transition-colors ${
          on ? 'bg-terra-soft text-terra' : 'text-muted-foreground hover:text-foreground'
        }`}
        onClick={() => setVerdictFilter(on ? 'all' : k)}
      >
        {label}
      </button>
    )
  }

  // ── Définitions de colonnes (TanStack) ──────────────────────────────────
  // Chaque cellule retourne le même JSX qu'avant pour préserver pixel-perfect.
  const reHelper = createColumnHelper<SuiviDisplayRow>()
  const reactiveColumns = [
    reHelper.accessor('numCommande', {
      header: () => 'Commande · Client',
      cell: (info) => (
        <>
          <div class="font-mono text-[13px] font-bold tracking-tight text-foreground">{info.getValue()}</div>
          <div class="mt-0.5 font-sans text-[12px] font-medium leading-snug text-secondary-foreground">{info.row.original.client || '—'}</div>
        </>
      ),
      meta: { thClass: 'w-[178px] px-4 py-[11px] text-left font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground border-b border-rule border-r border-rule-soft', tdClass: 'px-4 py-[13px] align-middle border-r border-rule-soft' },
    }),
    reHelper.accessor('article', {
      header: () => 'Article · Désignation',
      cell: (info) => (
        <>
          <div class="font-mono text-[13px] font-semibold text-terra">{info.getValue()}</div>
          <div class="mt-0.5 font-sans text-[12px] font-medium leading-snug text-secondary-foreground">{info.row.original.designation || '—'}</div>
        </>
      ),
      meta: { thClass: 'w-[240px] px-4 py-[11px] text-left font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground border-b border-rule border-r border-rule-soft', tdClass: 'px-4 py-[13px] align-middle border-r border-rule-soft' },
    }),
    reHelper.accessor('type', {
      header: () => 'Type',
      cell: (info) => (
        <span class="rounded bg-terra-soft px-[7px] py-0.5 font-mono text-[10px] font-bold uppercase tracking-wide text-terra">{info.getValue()}</span>
      ),
      meta: { thClass: 'w-[56px] px-4 py-[11px] text-left font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground border-b border-rule border-r border-rule-soft', tdClass: 'px-4 py-[13px] align-middle border-r border-rule-soft' },
    }),
    reHelper.accessor('qteRestante', {
      header: () => 'Reste',
      cell: (info) => (
        <>
          <span class="font-fraunces text-[21px] font-black leading-none tracking-tight text-foreground">{info.getValue()}</span>
          <span class="ml-0.5 font-mono text-[10px] font-medium text-muted-foreground/80">u</span>
        </>
      ),
      sortingFn: 'basic',
      meta: { thClass: 'w-[92px] px-4 py-[11px] text-right font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground border-b border-rule border-r border-rule-soft', tdClass: 'whitespace-nowrap border-r border-rule-soft px-4 py-[13px] text-right align-middle' },
    }),
    reHelper.accessor('dateExp', {
      header: () => 'Expé',
      cell: (info) => {
        const late = info.row.original.late
        return (
          <span classList={{ 'font-bold text-destructive': late, 'text-foreground': !late }}>
            {info.getValue() || '—'}
          </span>
        )
      },
      sortingFn: (a, b) => {
        const da = a.original.dateExpIso ?? '9999-12-31'
        const db = b.original.dateExpIso ?? '9999-12-31'
        return da < db ? -1 : da > db ? 1 : 0
      },
      meta: { thClass: 'w-[76px] px-4 py-[11px] text-left font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground border-b border-rule border-r border-rule-soft', tdClass: 'whitespace-nowrap border-r border-rule-soft px-4 py-[13px] align-middle font-mono text-[12.5px] font-semibold' },
    }),
    reHelper.display({
      id: 'emplacements',
      enableSorting: false,
      header: () => 'Emplacement',
      cell: (info) => {
        const emps = info.row.original.emplacements
        if (emps.length === 0) return <span class="font-sans text-[12px] font-medium leading-snug text-muted-foreground/70">—</span>
        return (
          <div class="flex flex-col gap-[3px]">
            <For each={emps}>
              {(e) => (
                <span
                  class={cx(
                    'flex w-full items-center justify-between gap-1 overflow-hidden rounded border px-1.5 py-px font-mono text-[10.5px] leading-[1.4]',
                    e.source === 'STOALL'
                      ? 'border-ferme/30 bg-ferme/15 text-ferme'
                      : 'border-rule bg-card text-secondary-foreground',
                    e.alreadyAllocated && 'line-through opacity-60',
                  )}
                  title={e.source === 'STOALL' ? 'STOALL — déjà alloué à la commande' : (e.alreadyAllocated ? 'Déjà alloué à une autre commande' : 'STOCK — en stock libre, allocation à faire')}
                >
                  <span class="flex shrink-0 items-center gap-1 whitespace-nowrap">
                    <span
                      class={cx(
                        'material-symbols-outlined text-[11px] leading-none',
                        e.source === 'STOALL' ? 'text-ferme' : 'text-muted-foreground/70',
                      )}
                    >
                      {e.source === 'STOALL' ? 'check_circle' : 'radio_button_unchecked'}
                    </span>
                    <span class="font-semibold">{e.nom}</span>
                  </span>
                  <span class="flex min-w-0 items-center gap-1">
                    <Show when={e.hum}>
                      <span class="truncate rounded bg-card px-1.5 font-mono text-[10.5px] font-bold text-foreground" title={e.hum ?? undefined}>{e.hum}</span>
                    </Show>
                    <span class="shrink-0 font-bold tabular-nums">
                      {e.qte > 0 ? Math.round(e.qte) : '·'}
                    </span>
                  </span>
                </span>
              )}
            </For>
          </div>
        )
      },
      meta: { thClass: 'w-[190px] px-4 py-[11px] text-left font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground border-b border-rule border-r border-rule-soft', tdClass: 'border-r border-rule-soft px-4 py-[13px] align-middle' },
    }),
    reHelper.display({
      id: 'statusKey',
      enableSorting: false,
      header: () => 'Statut',
      cell: (info) => {
        const o = info.row.original
        return (
          <div class="flex flex-col items-start gap-1">
            <span class={cx('inline-flex items-center gap-1 rounded-md border border-transparent px-2 py-0.5 text-[11px] font-medium whitespace-nowrap', BADGE_TONE[o.statusKey])}>
              <span class="material-symbols-outlined grid size-[14px] place-items-center overflow-hidden text-[14px] leading-none">{o.statusIcon}</span>
              {o.statusLabel}
            </span>
            <Show when={o.cq}>
              <span class="inline-flex items-center gap-1 rounded-md border border-transparent bg-terra-soft px-2 py-0.5 text-[11px] font-medium text-terra whitespace-nowrap">
                <span class="material-symbols-outlined grid size-[14px] place-items-center text-[14px] leading-none">science</span>CQ
              </span>
            </Show>
          </div>
        )
      },
      meta: { thClass: 'w-[130px] px-4 py-[11px] text-left font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground border-b border-rule border-r border-rule-soft', tdClass: 'border-r border-rule-soft px-4 py-[13px] align-middle' },
    }),
    reHelper.display({
      id: 'cause',
      enableSorting: false,
      header: () => 'Cause du retard',
      cell: (info) => {
        const cause = info.row.original.cause
        if (!cause) return <span class="font-sans text-[12px] font-medium leading-snug text-muted-foreground/70">—</span>
        return (
          <>
            <div class="text-[12px] leading-snug text-secondary-foreground">{cause.label}</div>
            <Show when={cause.comps.length > 0}>
              <span class="mt-[3px] block font-mono text-[10px] font-bold text-destructive">
                {cause.comps.map((c) => `${c.art} −${c.qty}`).join(' · ')}
              </span>
            </Show>
            <Show when={cause.reception}>
              <span class="mt-[2px] block font-mono text-[10px] font-medium text-muted-foreground">
                arrive {cause.reception!.eta} · {cause.reception!.po}
              </span>
            </Show>
            <Show when={cause.retro?.composant}>
              <span class="mt-[2px] block font-mono text-[10px] font-medium text-muted-foreground">
                {cause.retro!.composant!.art} dispo {cause.retro!.composant!.dispoA}
                <Show when={cause.retro!.composant!.cq}> (CQ)</Show>
              </span>
            </Show>
            <Show when={cause.retro?.affermissement}>
              <span class="mt-[1px] block font-mono text-[10px] text-muted-foreground/70">
                OF {cause.retro!.ofPegue} affermi {cause.retro!.affermissement}
              </span>
            </Show>
          </>
        )
      },
      meta: { thClass: 'w-[280px] px-4 py-[11px] text-left font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground border-b border-rule', tdClass: 'px-4 py-[13px] align-middle' },
    }),
  ]

  // Index column partagée (N°) pour la table réactive.
  const reactiveIndexCol = {
    headerLabel: 'N°',
    thClass: 'w-[38px] px-4 py-[11px] text-left font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground border-b border-rule border-r border-rule-soft',
    tdClass: (row: SuiviDisplayRow) =>
      cx(
        'px-4 py-[13px] align-middle font-fraunces text-[14px] leading-none text-muted-foreground/80 border-r border-rule-soft',
        row.late && '[box-shadow:inset_3px_0_var(--color-destructive)]',
      ),
  }

  const proHelper = createColumnHelper<ProactiveDisplayRow>()
  const proactiveColumns = [
    proHelper.accessor('numCommande', {
      header: () => 'Commande · Client',
      cell: (info) => (
        <>
          <div class="font-mono text-[13px] font-bold tracking-tight text-foreground">{info.getValue()}</div>
          <div class="mt-0.5 font-sans text-[12px] font-medium leading-snug text-secondary-foreground">{info.row.original.client || '—'}</div>
        </>
      ),
      meta: { thClass: 'w-[178px] px-4 py-[11px] text-left font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground border-b border-rule border-r border-rule-soft', tdClass: 'px-4 py-[13px] align-middle border-r border-rule-soft' },
    }),
    proHelper.accessor('article', {
      header: () => 'Article · Désignation',
      cell: (info) => (
        <>
          <div class="font-mono text-[13px] font-semibold text-terra">{info.getValue()}</div>
          <div class="mt-0.5 font-sans text-[12px] font-medium leading-snug text-secondary-foreground">{info.row.original.designation || '—'}</div>
        </>
      ),
      meta: { thClass: 'w-[240px] px-4 py-[11px] text-left font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground border-b border-rule border-r border-rule-soft', tdClass: 'px-4 py-[13px] align-middle border-r border-rule-soft' },
    }),
    proHelper.accessor('type', {
      header: () => 'Type',
      cell: (info) => (
        <span class="rounded bg-terra-soft px-[7px] py-0.5 font-mono text-[10px] font-bold uppercase tracking-wide text-terra">{info.getValue()}</span>
      ),
      meta: { thClass: 'w-[56px] px-4 py-[11px] text-left font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground border-b border-rule border-r border-rule-soft', tdClass: 'px-4 py-[13px] align-middle border-r border-rule-soft' },
    }),
    proHelper.accessor('qteRestante', {
      header: () => 'Reste',
      cell: (info) => (
        <>
          <span class="font-fraunces text-[21px] font-black leading-none tracking-tight text-foreground">{info.getValue()}</span>
          <span class="ml-0.5 font-mono text-[10px] font-medium text-muted-foreground/80">u</span>
        </>
      ),
      sortingFn: 'basic',
      meta: { thClass: 'w-[92px] px-4 py-[11px] text-right font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground border-b border-rule border-r border-rule-soft', tdClass: 'whitespace-nowrap border-r border-rule-soft px-4 py-[13px] text-right align-middle' },
    }),
    proHelper.accessor('dateExp', {
      header: () => 'Expé',
      cell: (info) => info.getValue() || '—',
      sortingFn: (a, b) => {
        const da = a.original.dateExpIso ?? '9999-12-31'
        const db = b.original.dateExpIso ?? '9999-12-31'
        return da < db ? -1 : da > db ? 1 : 0
      },
      meta: { thClass: 'w-[76px] px-4 py-[11px] text-left font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground border-b border-rule border-r border-rule-soft', tdClass: 'whitespace-nowrap border-r border-rule-soft px-4 py-[13px] align-middle font-mono text-[12.5px] font-semibold text-foreground' },
    }),
    proHelper.accessor('couverture', {
      header: () => 'Couverture',
      cell: (info) => {
        const v = info.getValue()
        const ofs = info.row.original.ofs
        // Couverture par OF : un n° + son statut X3 (WOF/WOP/WOS) par ordre.
        if (ofs.length > 0) {
          return (
            <div class="flex flex-col gap-1">
              <For each={ofs}>
                {(of) => {
                  const st = OF_STATUT[of.statutNum]
                  return (
                    <div class="flex items-center gap-1.5">
                      <span class="font-mono text-[11px] font-semibold leading-snug text-secondary-foreground break-all">
                        {of.numOf}
                      </span>
                      <Show when={st}>
                        <span
                          class={cx('shrink-0 rounded px-1 py-px font-mono text-[9px] font-bold leading-none', st.tone)}
                          title={`OF ${st.tag === 'WOF' ? 'ferme' : st.tag === 'WOP' ? 'planifié' : 'suggéré'}`}
                        >
                          {st.tag}
                        </span>
                      </Show>
                    </div>
                  )
                }}
              </For>
            </div>
          )
        }
        const isGood = v === 'Stock' || v === 'Achat'
        return isGood ? (
          <span class="inline-flex items-center gap-1 rounded-md border border-transparent bg-ferme/15 px-2 py-0.5 font-mono text-[11px] font-bold text-ferme">
            {v}
          </span>
        ) : (
          <span class="font-mono text-[11px] font-semibold leading-snug text-secondary-foreground break-all">
            {v}
          </span>
        )
      },
      meta: { thClass: 'w-[150px] px-4 py-[11px] text-left font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground border-b border-rule border-r border-rule-soft', tdClass: 'border-r border-rule-soft px-4 py-[13px] align-middle' },
    }),
    proHelper.display({
      id: 'verdictKey',
      enableSorting: false,
      header: () => 'Verdict',
      cell: (info) => {
        const o = info.row.original
        return (
          <span class={cx('inline-flex items-center gap-1 rounded-md border border-transparent px-2 py-0.5 text-[11px] font-medium whitespace-nowrap', VERDICT_TONE[o.verdictKey])}>
            {o.verdictLabel}
          </span>
        )
      },
      meta: { thClass: 'w-[120px] px-4 py-[11px] text-left font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground border-b border-rule border-r border-rule-soft', tdClass: 'border-r border-rule-soft px-4 py-[13px] align-middle' },
    }),
    proHelper.accessor('joursRetard', {
      header: () => 'J. retard',
      cell: (info) => {
        const v = info.getValue()
        return <>{v > 0 ? v : '—'}</>
      },
      sortingFn: 'basic',
      meta: { thClass: 'w-[70px] px-4 py-[11px] text-right font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground border-b border-rule border-r border-rule-soft', tdClass: 'whitespace-nowrap border-r border-rule-soft px-4 py-[13px] text-right align-middle font-mono text-[12.5px] font-semibold text-secondary-foreground' },
    }),
    proHelper.display({
      id: 'composants',
      enableSorting: false,
      header: () => 'Goulots',
      cell: (info) => {
        const comps = info.row.original.composants
        if (comps.length === 0) return <span class="font-sans text-[12px] font-medium leading-snug text-muted-foreground/70">—</span>
        return (
          <div class="flex flex-col gap-1">
            <For each={comps.slice(0, 4)}>
              {(c) => (
                <div class="flex flex-col gap-px">
                  <div class="flex items-center gap-1.5">
                    <span class="shrink-0 font-mono text-[10.5px] font-bold text-destructive">{c.art}</span>
                    <Show when={c.desc}>
                      <span class="truncate font-sans text-[10px] leading-tight text-muted-foreground" title={c.desc}>{c.desc}</span>
                    </Show>
                    <span class="ml-auto shrink-0 rounded bg-destructive/10 px-1 font-mono text-[10px] font-bold tabular-nums text-destructive">−{c.qty}</span>
                  </div>
                  {/* Réception couvrante (lentille appro rapatriée des Ruptures). */}
                  <Show
                    when={c.reception}
                    fallback={
                      <span class="font-mono text-[9.5px] font-medium leading-tight text-destructive/70">aucune couverture prévue</span>
                    }
                  >
                    {(r) => (
                      <span class="font-mono text-[9.5px] font-medium leading-tight text-muted-foreground" title={r().supplier}>
                        arrive {r().eta} · {r().po}
                      </span>
                    )}
                  </Show>
                </div>
              )}
            </For>
            <Show when={comps.length > 4}>
              <span class="font-mono text-[10px] font-medium text-muted-foreground/70">+{comps.length - 4} autre(s)</span>
            </Show>
          </div>
        )
      },
      meta: { thClass: 'w-[300px] px-4 py-[11px] text-left font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground border-b border-rule', tdClass: 'px-4 py-[13px] align-middle' },
    }),
  ]

  const proIndexCol = {
    headerLabel: 'N°',
    thClass: 'w-[38px] px-4 py-[11px] text-left font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground border-b border-rule border-r border-rule-soft',
    tdClass: (row: ProactiveDisplayRow) => {
      const late = row.verdictKey === 'late' || row.verdictKey === 'blocked' || row.verdictKey === 'uncov'
      return cx(
        'px-4 py-[13px] align-middle font-fraunces text-[14px] leading-none text-muted-foreground/80 border-r border-rule-soft',
        late && '[box-shadow:inset_3px_0_var(--color-destructive)]',
      )
    },
  }

  return (
    <div class="theme-papier flex h-screen flex-col overflow-hidden bg-background text-foreground">
      <Masthead
        subtitle="Suivi · Allocation & expédition"
        active="tracking"
        meta={
          <>
            <div class="font-fraunces text-[12px] font-bold capitalize not-italic text-terra">{refLabel()}</div>
            <div>
              <b class="font-bold text-foreground">{mode() === 'reactif' ? view().total : proView().total}</b> lignes ouvertes
              <Show when={view().referenceDate}> · réf. <b class="font-bold text-foreground">{view().referenceDate}</b></Show>
            </div>
          </>
        }
        actions={
          <div class="flex h-[30px] items-center gap-1.5 rounded-full border border-rule bg-card px-3 transition-shadow focus-within:border-terra focus-within:ring-2 focus-within:ring-terra/25">
            <span class="material-symbols-outlined text-[17px] text-muted-foreground">search</span>
            <input
              class="w-[200px] border-0 bg-transparent px-0 text-[12px] font-medium text-foreground shadow-none outline-none"
              placeholder="Commande, article, client…"
              type="text"
              autocomplete="off"
              value={query()}
              onInput={(e) => setQuery(e.currentTarget.value)}
            />
          </div>
        }
      />

      {/* ═══ Bandeau KPI ═══ */}
      <Show
        when={mode() === 'reactif'}
        fallback={
          <section class="flex-none grid grid-cols-5 border-b border-rule">
            <Kpi label="À temps" value={proView().verdictCounts.time} sub="réalisables" dot="var(--color-ferme)" valClass="text-ferme" />
            <Kpi label="En stock" value={proView().verdictCounts.stock} sub="couvertes par stock" dot="var(--color-ferme)" valClass="text-ferme" />
            <Kpi label="En retard" value={proView().verdictCounts.late} sub="OF après l'expé" dot="var(--color-suggere)" valClass="text-suggere" />
            <Kpi label="Bloquées" value={proView().verdictCounts.blocked} sub="composant manquant" dot="var(--color-destructive)" valClass="text-destructive" />
            <Kpi label="Sans couverture" value={proView().verdictCounts.uncov} sub="aucun OF/supply" dot="var(--color-destructive)" valClass="text-destructive" last />
          </section>
        }
      >
        <section class="flex-none grid grid-cols-5 border-b border-rule">
          <Kpi label="À expédier" value={counts().A_EXPEDIER} sub="besoin net ≤ 0 · prêtes" dot="var(--color-ferme)" valClass="text-ferme" />
          <Kpi label="Allocation à faire" value={counts().ALLOCATION_A_FAIRE} sub="couvertes par stock virtuel" dot="var(--color-suggere)" valClass="text-suggere" />
          <Kpi label="Retard" value={counts().RETARD_PROD} sub="date expé dépassée" dot="var(--color-destructive)" valClass="text-destructive" />
          <Kpi label="Signal CQ" value={view().cqCount} sub="stock sous contrôle qualité" dot="var(--color-terra)" valClass="text-terra" />
          <Kpi label="RAS" value={counts().RAS} sub="sous contrôle" dot="var(--color-muted-foreground)" valClass="text-planifie" last />
        </section>
      </Show>

      {/* ═══ Toolbar ═══ */}
      <div class="flex flex-none flex-wrap items-center gap-2.5 border-b border-rule px-7 py-2">
        {/* Bascule Réactif / Proactif */}
        <div class="inline-flex items-center rounded-md border border-rule bg-card p-0.5">
          <button
            type="button"
            class={`rounded-[5px] px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider transition-colors ${
              mode() === 'reactif' ? 'bg-terra-soft text-terra' : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setMode('reactif')}
            title="Suivi as-is : statuts allocation/expédition + causes de retard"
          >
            Réactif
          </button>
          <button
            type="button"
            class={`rounded-[5px] px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider transition-colors ${
              mode() === 'proactif' ? 'bg-terra-soft text-terra' : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setMode('proactif')}
            title="Réalisabilité projetée : consommation séquentielle des composants entre OFs"
          >
            Proactif
          </button>
        </div>
        <Show when={mode() === 'reactif'}>
          <div class="inline-flex items-center gap-1 rounded-md border border-rule bg-card p-0.5">
            <span class="px-1.5 font-mono text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Statut</span>
            {statusChip('all', 'Tous')}
            {statusChip('ret', 'Retard')}
            {statusChip('alc', 'À allouer')}
            {statusChip('exp', 'À expédier')}
          </div>
        </Show>
        <Show when={mode() === 'proactif'}>
          <div class="inline-flex items-center gap-1 rounded-md border border-rule bg-card p-0.5">
            <span class="px-1.5 font-mono text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Verdict</span>
            {verdictChip('all', 'Tous')}
            {verdictChip('blocked', 'Bloquée')}
            {verdictChip('uncov', 'Sans couverture')}
            {verdictChip('late', 'Retard')}
          </div>
        </Show>
        <div class="inline-flex items-center gap-1 rounded-md border border-rule bg-card p-0.5">
          <span class="px-1.5 font-mono text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Type</span>
          <For each={['MTS', 'MTO', 'NOR']}>
            {(t) => (
              <button
                type="button"
                class={`rounded-[5px] px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-wider transition-colors ${
                  typeFilter().has(t) ? 'bg-terra-soft text-terra' : 'text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => toggleType(t)}
              >
                {t}
              </button>
            )}
          </For>
        </div>
        {/* Filtre atelier (#36) — chips STOLOC, apparaît dès qu'un atelier est connu. Transverse aux 2 vues. */}
        <Show when={ateliers().length > 0}>
          <div class="inline-flex flex-wrap items-center gap-1 rounded-md border border-rule bg-card p-0.5">
            <span class="px-1.5 font-mono text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Atelier</span>
            <For each={ateliers()}>
              {(a) => (
                <button
                  type="button"
                  class={`rounded-[5px] px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-wider transition-colors ${
                    atelierFilter().has(a.code) ? 'bg-terra-soft text-terra' : 'text-muted-foreground hover:text-foreground'
                  }`}
                  onClick={() => toggleAtelier(a.code)}
                  title={a.label}
                >
                  {a.label}
                </button>
              )}
            </For>
            <Show when={atelierFilter().size > 0}>
              <button
                type="button"
                class="rounded-[5px] px-1.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
                onClick={() => setAtelierFilter(new Set())}
                title="Réinitialiser le filtre atelier"
              >
                ✕
              </button>
            </Show>
          </div>
        </Show>
        <div class="ml-auto flex items-center gap-2">
          {/* Durée de chargement X3 */}
          <Show when={mode() === 'reactif' ? data.loading : proData.loading}>
            <span class="font-mono text-[11px] tabular-nums text-muted-foreground">
              {fmtMs(mode() === 'reactif' ? elapsed() : proElapsed())}
            </span>
          </Show>
          <Show when={mode() === 'reactif' ? (!data.loading && rowsMs() !== null) : (!proData.loading && proMs() !== null)}>
            <span class="font-mono text-[11px] tabular-nums text-muted-foreground/60" title="Durée dernier chargement X3">
              {fmtMs((mode() === 'reactif' ? rowsMs() : proMs())!)}
            </span>
          </Show>
          <button
            type="button"
            onClick={() => setBust((b) => b + 1)}
            disabled={mode() === 'reactif' ? data.loading : proData.loading}
            class="inline-flex items-center gap-1 rounded-full border border-rule bg-card px-3 py-1 text-[11px] font-semibold transition-colors hover:border-terra disabled:opacity-50"
            title="Recharger les données X3 (cache → re-fetch live)"
          >
            <span
              class="material-symbols-outlined text-[14px] text-muted-foreground"
              classList={{ 'animate-spin': mode() === 'reactif' ? data.loading : proData.loading }}
            >
              refresh
            </span>
            Actualiser
          </button>
          <Link
            href={`${route('suivi.board')}?referenceDate=${encodeURIComponent(new Date().toISOString().slice(0, 10))}`}
            preserveScroll
            class="inline-flex items-center gap-1 rounded-full border border-rule bg-card px-3 py-1 text-[11px] font-semibold transition-colors hover:border-terra"
            title="Recharger à aujourd'hui"
          >
            <span class="material-symbols-outlined text-[14px] text-muted-foreground">calendar_month</span>
            Aujourd'hui
          </Link>
        </div>
      </div>

      <Show
        when={mode() === 'reactif'}
        fallback={
          <>
            {/* ═══ Proactif : X3 injoignable ═══ */}
            <Show when={proView().x3Error}>
              <div class="flex flex-none items-center gap-2 border-b border-destructive/30 bg-destructive/10 px-7 py-2 text-[12px] text-foreground">
                <span class="material-symbols-outlined text-[16px] text-destructive">warning</span>
                <span class="font-bold">Erreur chargement réalisabilité :</span>
                <span class="font-mono">{proView().x3Error}</span>
              </div>
            </Show>

            {/* ═══ Proactif : table ═══ */}
            <Show
              when={!proData.loading}
              fallback={
                <div class="flex flex-1 items-center justify-center gap-2 text-muted-foreground">
                  <span class="material-symbols-outlined animate-spin text-[20px]">progress_activity</span>
                  <span class="text-[13px] font-medium">Calcul de la réalisabilité…</span>
                </div>
              }
            >
              <Show
                when={!proData.error}
                fallback={
                  <div class="flex flex-1 items-center justify-center gap-2 text-[13px] text-destructive">
                    <span class="material-symbols-outlined text-[20px]">error</span>
                    Échec du calcul de réalisabilité.
                  </div>
                }
              >
                <div class="flex-1 overflow-hidden p-5">
                  <DataTable
                    columns={proactiveColumns}
                    rows={proRows}
                    sorting={proSorting}
                    onSortingChange={setProSorting}
                    indexColumn={proIndexCol}
                    getRowClass={(row) => {
                      const k = row.verdictKey
                      const late = k === 'late' || k === 'blocked' || k === 'uncov'
                      return cx('border-t border-rule-soft transition-colors', late ? 'bg-destructive/10 hover:bg-destructive/[0.18]' : 'hover:bg-foreground/[0.04]')
                    }}
                    tableClass="min-w-[1320px] table-fixed"
                    scrollContainerClass="h-full border-0 rounded-none shadow-none"
                    theadRowClass="sticky top-0 z-10 bg-secondary"
                    emptyState={
                      <div class="flex flex-1 items-center justify-center p-10 text-center font-fraunces text-[14px] italic text-muted-foreground">
                        <div class="flex flex-col items-center gap-2">
                          <span class="material-symbols-outlined text-[32px] text-muted-foreground/50">
                            {proView().x3Error ? 'cloud_off' : 'task_alt'}
                          </span>
                          {proView().x3Error ? 'Données indisponibles (X3 injoignable).' : 'Toutes les commandes ouvertes sont couvertes.'}
                        </div>
                      </div>
                    }
                  />
                </div>
              </Show>
            </Show>
          </>
        }
      >
      {/* ═══ X3 injoignable ═══ */}
      <Show when={view().x3Error}>
        <div class="flex flex-none items-center gap-2 border-b border-destructive/30 bg-destructive/10 px-7 py-2 text-[12px] text-foreground">
          <span class="material-symbols-outlined text-[16px] text-destructive">warning</span>
          <span class="font-bold">Erreur chargement suivi :</span>
          <span class="font-mono">{view().x3Error}</span>
        </div>
      </Show>

      {/* ═══ Table ═══ */}
      <Show
        when={!data.loading}
        fallback={
          <div class="flex flex-1 items-center justify-center gap-2 text-muted-foreground">
            <span class="material-symbols-outlined animate-spin text-[20px]">progress_activity</span>
            <span class="text-[13px] font-medium">Calcul du suivi…</span>
          </div>
        }
      >
        <Show
          when={!data.error}
          fallback={
            <div class="flex flex-1 items-center justify-center gap-2 text-[13px] text-destructive">
              <span class="material-symbols-outlined text-[20px]">error</span>
              Échec du calcul du suivi.
            </div>
          }
        >
          <div class="flex-1 overflow-hidden p-5">
            <DataTable
              columns={reactiveColumns}
              rows={reactiveRows}
              sorting={reactiveSorting}
              onSortingChange={setReactiveSorting}
              indexColumn={reactiveIndexCol}
              getRowClass={(row) => cx('border-t border-rule-soft transition-colors', row.late ? 'bg-destructive/10 hover:bg-destructive/[0.18]' : 'hover:bg-foreground/[0.04]')}
              tableClass="min-w-[1300px] table-fixed"
              scrollContainerClass="h-full border-0 rounded-none shadow-none"
              theadRowClass="sticky top-0 z-10 bg-secondary"
              emptyState={
                <div class="flex flex-1 items-center justify-center p-10 text-center font-fraunces text-[14px] italic text-muted-foreground">
                  <div class="flex flex-col items-center gap-2">
                    <span class="material-symbols-outlined text-[32px] text-muted-foreground/50">
                      {view().x3Error ? 'cloud_off' : 'inbox'}
                    </span>
                    {view().x3Error
                      ? 'Données de suivi indisponibles (X3 injoignable).'
                      : 'Aucune ligne de commande à suivre à cette date.'}
                  </div>
                </div>
              }
            />
          </div>
        </Show>
      </Show>
      </Show>
    </div>
  )
}

/** Tuile KPI (status_counts). */
const Kpi: Component<{
  label: string
  value: number
  sub: string
  dot: string
  valClass: string
  last?: boolean
}> = (p) => (
  <div class={cx('flex flex-col gap-[3px] px-[22px] py-[13px]', !p.last && 'border-r border-rule-soft')}>
    <span class="flex items-center gap-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.13em] text-muted-foreground">
      <span class="size-2 rounded-[2px]" style={{ background: p.dot }} />
      {p.label}
    </span>
    <span class={cx('font-fraunces text-[34px] font-black leading-none tracking-tight', p.valClass)}>{p.value}</span>
    <span class="font-mono text-[11px] font-medium text-muted-foreground">{p.sub}</span>
  </div>
)

export default Tracking
