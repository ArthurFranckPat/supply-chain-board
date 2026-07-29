import { useCallback, useEffect, useMemo, useState } from 'react'
import { Head, router } from '@inertiajs/react'
import {
  Check,
  CircleCheck,
  FlaskConical,
  Info,
  Package,
  RefreshCw,
  Search,
  TriangleAlert,
} from 'lucide-react'
import { toast } from 'sonner'

import AppLayout from '@r/layouts/app'
import { cn } from '@r/lib/utils'
import { route } from '@r/lib/routes'
import {
  PILL,
  Segment,
  SegmentButton,
  ToolbarRow,
  ToolbarSpacer,
} from '@r/components/vision/toolbar'
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  useComboboxAnchor,
} from '@r/components/ui/combobox'
import {
  type EngagementRow,
  type Urgency,
  URGENCY_RANK,
  fmtDateFr,
  fmtH,
  fmtJ,
  saturation,
  urgencyColor,
  urgencyOf,
} from '@r/lib/board/engagement-format'
import type { FeasStatus } from '@r/lib/board/types'
import { buildFeasibilityMap, feasibilityWindowFromDates } from '@r/lib/board/feasibility-map'
import OfDetailSheet from '@r/components/of/of-detail-sheet'
import SequenceurFirmBar, { type BatchItem } from '@r/components/sequenceur/sequenceur-firm-bar'

/**
 * Page « Séquenceur » — engagement OF par poste (#46) + mode « À lancer » (#100).
 *
 * `/sequenceur` (aucun poste) : dataset léger, tous postes, SANS matching commande.
 * `/sequenceur/:poste` : matching commande scopé.
 * Query `?vue=lancer` : planifiés/suggérés + faisabilité + affermissement batch.
 */

interface PosteSummary {
  code: string
  label: string
  count: number
  totalHours: number
  weeklyCapacityHours: number | null
  atelier: string
  atelierLabel: string
}

type SequenceurRow = EngagementRow & {
  posteCode: string
  posteLabel: string
  status?: number
  statusLabel?: string
}

type VueMode = 'engagement' | 'lancer'
type FeasFilter = 'all' | 'ok' | 'qc' | 'blocked' | 'unknown'

interface SequenceurPageProps {
  postes: PosteSummary[]
  ateliers: { code: string; label: string }[]
  rows: SequenceurRow[]
  selectedPoste: string | null
  /** true = commandes/livraison chargées (poste unique). */
  detail: boolean
  vue: VueMode
  x3Error: string | null
}

const ROW_GRID_ALL = 'grid-cols-[6rem_7rem_6.5rem_1.5fr_6rem_1.3fr_5.5rem_4rem_4rem]'
const ROW_GRID_ONE = 'grid-cols-[7rem_6.5rem_1.5fr_6rem_1.3fr_5.5rem_4rem_4rem]'
const ROW_GRID_LANCER_ALL = 'grid-cols-[2rem_6rem_7rem_5.5rem_6.5rem_1.3fr_5rem_1.2fr_5rem_4rem]'
const ROW_GRID_LANCER_ONE = 'grid-cols-[2rem_7rem_5.5rem_6.5rem_1.3fr_5rem_1.2fr_5rem_4rem]'

const ATELIER_STORAGE_KEY = 'sequenceur:ateliers'

function readStoredAteliers(): Set<string> {
  try {
    const raw = sessionStorage.getItem(ATELIER_STORAGE_KEY)
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set()
  } catch {
    return new Set()
  }
}

function writeStoredAteliers(codes: Set<string>) {
  try {
    sessionStorage.setItem(ATELIER_STORAGE_KEY, JSON.stringify([...codes]))
  } catch {
    // sessionStorage indisponible — filtre session seule.
  }
}

function sequenceurUrl(poste: string | null, vue: VueMode): string {
  const base = poste ? route('sequenceur.show', { poste }) : route('sequenceur.index')
  return vue === 'lancer' ? `${base}?vue=lancer` : base
}

function goto(poste: string | null, vue: VueMode) {
  router.visit(sequenceurUrl(poste, vue))
}

function feasBadge(st: FeasStatus['st'] | 'unknown' | undefined) {
  if (st === 'ok')
    return {
      label: 'Lançable',
      className: 'bg-ferme/15 text-ferme',
      icon: CircleCheck,
    }
  if (st === 'qc')
    return {
      label: 'Sous CQ',
      className: 'bg-suggere/15 text-suggere',
      icon: FlaskConical,
    }
  if (st === 'blocked')
    return {
      label: 'Bloqué',
      className: 'bg-destructive/10 text-destructive',
      icon: TriangleAlert,
    }
  return {
    label: 'N/D',
    className: 'bg-secondary text-muted-foreground',
    icon: RefreshCw,
  }
}

export default function Sequenceur(props: SequenceurPageProps) {
  const vue = props.vue === 'lancer' ? 'lancer' : 'engagement'
  const isLancer = vue === 'lancer'
  const anchorRef = useComboboxAnchor()
  const [posteQuery, setPosteQuery] = useState('')
  const [urgencyFilter, setUrgencyFilter] = useState<Urgency | 'all'>('all')
  const [query, setQuery] = useState('')
  const [atelierFilter, setAtelierFilter] = useState<Set<string>>(readStoredAteliers)
  const [feasFilter, setFeasFilter] = useState<FeasFilter>('all')
  const [feasibility, setFeasibility] = useState<Record<string, FeasStatus>>({})
  const [feasLoading, setFeasLoading] = useState(false)
  const [feasDone, setFeasDone] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [batch, setBatch] = useState<Record<string, BatchItem>>({})
  const [batchRunning, setBatchRunning] = useState(false)
  const [detailOf, setDetailOf] = useState<string | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)

  const toggleAtelier = (code: string) => {
    setAtelierFilter((prev) => {
      const next = new Set(prev)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      writeStoredAteliers(next)
      return next
    })
  }
  const posteAtelier = useMemo(
    () => new Map(props.postes.map((p) => [p.code, p.atelier])),
    [props.postes]
  )
  const posteByCode = useMemo(() => new Map(props.postes.map((p) => [p.code, p])), [props.postes])
  const posteRank = useMemo(() => new Map(props.postes.map((p, i) => [p.code, i])), [props.postes])

  const [posteFilter, setPosteFilter] = useState<string | null>(props.selectedPoste)
  useEffect(() => {
    setPosteFilter(props.selectedPoste)
  }, [props.selectedPoste])

  // Reset sélection / faisabilité quand le dataset change (vue, poste, rows).
  useEffect(() => {
    setSelected(new Set())
    setBatch({})
    setFeasibility({})
    setFeasDone(false)
    setFeasFilter('all')
  }, [vue, props.selectedPoste, props.rows])

  function selectPoste(poste: string | null) {
    setPosteFilter(poste)
    goto(poste, vue)
  }

  function selectVue(next: VueMode) {
    goto(posteFilter, next)
  }

  const activePoste = posteFilter ? props.postes.find((p) => p.code === posteFilter) : null
  const showPosteCol = !posteFilter

  const filteredPostes = useMemo(() => {
    const q = posteQuery.trim().toLowerCase()
    return props.postes
      .filter((p) => atelierFilter.size === 0 || atelierFilter.has(p.atelier))
      .filter((p) => !q || p.code.toLowerCase().includes(q) || p.label.toLowerCase().includes(q))
  }, [props.postes, posteQuery, atelierFilter])

  const runFeasibility = useCallback(async () => {
    if (feasLoading || props.rows.length === 0) return
    const { from, to } = feasibilityWindowFromDates(props.rows.map((r) => r.dateDebutIso))
    setFeasLoading(true)
    try {
      const body: Record<string, string> = { from, to, mode: 'sequential' }
      if (posteFilter) body.workstation = posteFilter.toLowerCase()
      const res = await fetch(route('planning_board.board_feasibility'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = (await res.json()) as {
        ofs?: {
          numOf: string
          feasible?: boolean
          missingComponents?: Record<string, unknown>
          qcComponents?: Record<string, number>
        }[]
      }
      const { map } = buildFeasibilityMap(data.ofs ?? [])
      // Ne garder que les OF de la page (pipeline board peut en renvoyer d'autres).
      const scoped: Record<string, FeasStatus> = {}
      let nbOk = 0
      let nbBlocked = 0
      let nbQc = 0
      for (const r of props.rows) {
        const st = map[r.numOf]
        if (!st) continue
        scoped[r.numOf] = st
        if (st.st === 'ok') nbOk++
        else if (st.st === 'qc') nbQc++
        else if (st.st === 'blocked') nbBlocked++
      }
      setFeasibility(scoped)
      setFeasDone(true)
      // Défaut utile : une fois calculée, bascule sur « Lançables » s'il y en a.
      if (nbOk > 0) setFeasFilter('ok')
      const parts = [
        nbBlocked > 0 ? `${nbBlocked} bloqué(s)` : null,
        nbQc > 0 ? `${nbQc} sous CQ` : null,
        `${nbOk} lançable(s)`,
      ].filter(Boolean)
      toast(parts.join(' · '))
    } catch (err) {
      toast(`Échec faisabilité : ${(err as Error).message}`)
    } finally {
      setFeasLoading(false)
    }
  }, [feasLoading, props.rows, posteFilter])

  // Auto-calcul à l'entrée du mode « À lancer » (une fois le dataset prêt).
  useEffect(() => {
    if (!isLancer || feasDone || feasLoading || props.rows.length === 0) return
    void runFeasibility()
    // Intentionnel : ne pas re-déclencher à chaque recréation de runFeasibility
    // (feasLoading flipperait en boucle). Relance via bouton ou changement dataset.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLancer, props.rows, feasDone])

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const rows = props.rows
      .filter((r) => !posteFilter || r.posteCode === posteFilter)
      .filter(
        (r) => atelierFilter.size === 0 || atelierFilter.has(posteAtelier.get(r.posteCode) ?? '')
      )
      .filter(
        (r) =>
          !props.detail || urgencyFilter === 'all' || urgencyOf(r.livraisonIso) === urgencyFilter
      )
      .filter((r) => {
        if (!isLancer || feasFilter === 'all') return true
        const st = feasibility[r.numOf]?.st
        if (feasFilter === 'unknown') return !st
        return st === feasFilter
      })
      .filter((r) => {
        if (!q) return true
        const haystack = [
          r.numOf,
          r.article,
          r.designation ?? '',
          r.posteCode,
          r.statusLabel ?? '',
          ...r.commandes.flatMap((c) => [c.numCommande, c.client ?? '']),
        ]
          .join(' ')
          .toLowerCase()
        return haystack.includes(q)
      })
    return [...rows].sort((a, b) => {
      if (isLancer && feasDone) {
        // Lançables d'abord, puis CQ, bloqués, inconnus.
        const rank = (id: string) => {
          const st = feasibility[id]?.st
          if (st === 'ok') return 0
          if (st === 'qc') return 1
          if (st === 'blocked') return 2
          return 3
        }
        const ra = rank(a.numOf)
        const rb = rank(b.numOf)
        if (ra !== rb) return ra - rb
      }
      if (showPosteCol) {
        const ra = posteRank.get(a.posteCode) ?? Infinity
        const rb = posteRank.get(b.posteCode) ?? Infinity
        if (ra !== rb) return ra - rb
      }
      const aNoCmd = props.detail && a.commandes.length === 0
      const bNoCmd = props.detail && b.commandes.length === 0
      if (aNoCmd !== bNoCmd) return aNoCmd ? 1 : -1
      const ua = urgencyOf(a.livraisonIso)
      const ub = urgencyOf(b.livraisonIso)
      if (URGENCY_RANK[ua] !== URGENCY_RANK[ub]) return URGENCY_RANK[ua] - URGENCY_RANK[ub]
      if (!a.livraisonIso && !b.livraisonIso) return a.numOf.localeCompare(b.numOf)
      if (!a.livraisonIso) return 1
      if (!b.livraisonIso) return -1
      return a.livraisonIso.localeCompare(b.livraisonIso) || a.numOf.localeCompare(b.numOf)
    })
  }, [
    props.rows,
    props.detail,
    posteFilter,
    atelierFilter,
    posteAtelier,
    urgencyFilter,
    query,
    posteRank,
    showPosteCol,
    isLancer,
    feasFilter,
    feasibility,
    feasDone,
  ])

  const feasCounts = useMemo(() => {
    let ok = 0
    let qc = 0
    let blocked = 0
    let unknown = 0
    for (const r of props.rows) {
      if (posteFilter && r.posteCode !== posteFilter) continue
      if (atelierFilter.size > 0 && !atelierFilter.has(posteAtelier.get(r.posteCode) ?? ''))
        continue
      const st = feasibility[r.numOf]?.st
      if (st === 'ok') ok++
      else if (st === 'qc') qc++
      else if (st === 'blocked') blocked++
      else unknown++
    }
    return { ok, qc, blocked, unknown }
  }, [props.rows, posteFilter, atelierFilter, posteAtelier, feasibility])

  const rowGroups = useMemo(() => {
    if (!showPosteCol) return [{ posteCode: null as string | null, rows: filteredRows }]
    const groups: { posteCode: string; rows: SequenceurRow[] }[] = []
    for (const r of filteredRows) {
      const last = groups[groups.length - 1]
      if (!last || last.posteCode !== r.posteCode) {
        groups.push({ posteCode: r.posteCode, rows: [r] })
      } else {
        last.rows.push(r)
      }
    }
    return groups
  }, [filteredRows, showPosteCol])

  const totalHours = Math.round(filteredRows.reduce((s, r) => s + r.hours, 0) * 100) / 100
  const sat = activePoste
    ? saturation(activePoste.totalHours, activePoste.weeklyCapacityHours)
    : null
  const weeksEngaged =
    activePoste && activePoste.weeklyCapacityHours
      ? Math.round((activePoste.totalHours / activePoste.weeklyCapacityHours) * 10) / 10
      : null

  const rowGrid = isLancer
    ? showPosteCol
      ? ROW_GRID_LANCER_ALL
      : ROW_GRID_LANCER_ONE
    : showPosteCol
      ? ROW_GRID_ALL
      : ROW_GRID_ONE

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectAllLaunchable() {
    const next = new Set<string>()
    for (const r of filteredRows) {
      if (feasibility[r.numOf]?.st === 'ok') next.add(r.numOf)
    }
    setSelected(next)
  }

  async function batchFirm(ids: string[]) {
    if (batchRunning || ids.length === 0) return
    setBatchRunning(true)
    setBatch(Object.fromEntries(ids.map((id) => [id, { st: 'running' as const }])))
    let nbOk = 0
    let nbErr = 0
    let nbPrintKo = 0
    const firmed: string[] = []
    for (const id of ids) {
      try {
        const res = await fetch(route('planning.order_firm', { orderNum: id }), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ batch: true }),
        })
        const data = (await res.json()) as {
          ok: boolean
          mfgNum?: string
          error?: string
          print?: { ok: boolean }
        }
        if (data.ok && data.mfgNum) {
          if (data.print && !data.print.ok) nbPrintKo++
          setBatch((s) => ({ ...s, [id]: { st: 'ok', msg: data.mfgNum } }))
          firmed.push(id)
          nbOk++
        } else {
          setBatch((s) => ({
            ...s,
            [id]: { st: 'error', msg: data.error ?? 'Refusé par X3' },
          }))
          nbErr++
        }
      } catch (e) {
        setBatch((s) => ({ ...s, [id]: { st: 'error', msg: (e as Error).message } }))
        nbErr++
      }
    }
    setBatchRunning(false)
    const firmText =
      nbErr === 0 ? `${nbOk} OF affermi(s)` : `${nbOk} affermi(s) · ${nbErr} échec(s)`
    toast(nbPrintKo > 0 ? `${firmText} · ${nbPrintKo} dossier(s) non imprimé(s)` : firmText)
    setSelected((prev) => {
      const next = new Set(prev)
      for (const id of firmed) next.delete(id)
      return next
    })
    if (nbOk > 0) setTimeout(() => router.reload(), 1500)
  }

  const metaLabel = isLancer ? 'candidats' : 'OF'
  const title = isLancer ? 'Séquenceur · À lancer' : 'Séquenceur · Engagement postes'

  return (
    <AppLayout
      title={title}
      active="sequenceur"
      subtitle={
        isLancer
          ? 'Séquenceur · OF lançables (planifiés / suggérés)'
          : 'Séquenceur · engagement OF par poste'
      }
      theme="airbnb"
      dense
      scrollable={false}
      meta={
        <div>
          <b className="font-bold text-foreground">{filteredRows.length}</b> {metaLabel} ·{' '}
          <b className="font-bold text-foreground">{fmtH(totalHours)}</b> h
          {isLancer && feasDone && (
            <>
              {' '}
              · <b className="font-bold text-ferme">{feasCounts.ok}</b> lançables
            </>
          )}
        </div>
      }
    >
      <Head title={isLancer ? 'Séquenceur · À lancer' : 'Séquenceur'} />
      <div className="flex h-full min-h-0 flex-col">
        {props.x3Error && (
          <div className="flex flex-none items-center gap-2 border-b border-brand/30 bg-brand-soft px-7 py-2 text-[12px] text-foreground">
            <TriangleAlert size={16} strokeWidth={1.75} className="text-brand" />
            <span className="font-bold">Matching partiel :</span>
            <span className="font-mono">{props.x3Error}</span>
          </div>
        )}

        <ToolbarRow className="text-xs font-semibold text-secondary-foreground">
          <Segment role="radiogroup" ariaLabel="Vue séquenceur">
            <SegmentButton role="radio" active={!isLancer} onClick={() => selectVue('engagement')}>
              Engagement
            </SegmentButton>
            <SegmentButton role="radio" active={isLancer} onClick={() => selectVue('lancer')}>
              À lancer
            </SegmentButton>
          </Segment>

          <div ref={anchorRef}>
            <Combobox
              value={posteFilter ?? ''}
              onValueChange={(v) => selectPoste(v ? String(v) : null)}
              onInputValueChange={setPosteQuery}
            >
              <ComboboxInput placeholder="Tous les postes" className="w-[220px]" showClear />
              <ComboboxContent anchor={anchorRef}>
                <ComboboxList>
                  {filteredPostes.length === 0 ? (
                    <ComboboxEmpty>Aucun poste ne correspond.</ComboboxEmpty>
                  ) : (
                    filteredPostes.map((p) => (
                      <ComboboxItem key={p.code} value={p.code}>
                        <span className="font-mono text-[12px] font-semibold">{p.code}</span>
                        <span className="truncate text-muted-foreground">{p.label}</span>
                        {isLancer && p.count > 0 && (
                          <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                            {p.count}
                          </span>
                        )}
                      </ComboboxItem>
                    ))
                  )}
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
          </div>

          {props.ateliers.length > 0 && (
            <Segment className="flex-wrap">
              {props.ateliers.map((a) => (
                <SegmentButton
                  key={a.code}
                  active={atelierFilter.has(a.code)}
                  onClick={() => toggleAtelier(a.code)}
                  title={a.code}
                >
                  {a.label}
                </SegmentButton>
              ))}
            </Segment>
          )}

          {isLancer ? (
            <Segment role="radiogroup" ariaLabel="Faisabilité">
              {(
                [
                  ['all', 'Tous', null as number | null],
                  ['ok', 'Lançables', feasDone ? feasCounts.ok : null],
                  ['qc', 'Sous CQ', feasDone ? feasCounts.qc : null],
                  ['blocked', 'Bloqués', feasDone ? feasCounts.blocked : null],
                ] as const
              ).map(([id, label, count]) => (
                <SegmentButton
                  key={id}
                  role="radio"
                  active={feasFilter === id}
                  onClick={() => setFeasFilter(id)}
                >
                  {label}
                  {count !== null && count > 0 && (
                    <span className="ml-1 tabular-nums opacity-70">{count}</span>
                  )}
                </SegmentButton>
              ))}
            </Segment>
          ) : props.detail ? (
            <Segment role="radiogroup" ariaLabel="Urgence">
              {(
                [
                  ['all', 'Toutes'],
                  ['overdue', 'En retard'],
                  ['week', 'Cette semaine'],
                  ['later', 'À venir'],
                ] as const
              ).map(([id, label]) => (
                <SegmentButton
                  key={id}
                  role="radio"
                  active={urgencyFilter === id}
                  onClick={() => setUrgencyFilter(id)}
                >
                  {label}
                </SegmentButton>
              ))}
            </Segment>
          ) : (
            <span className="font-mono text-2xs italic text-muted-foreground">
              Sélectionnez un poste pour filtrer par urgence de livraison
            </span>
          )}

          <ToolbarSpacer />

          {isLancer && (
            <>
              <button
                type="button"
                className={cn(PILL, 'gap-1.5')}
                onClick={() => void runFeasibility()}
                disabled={feasLoading || props.rows.length === 0}
                title="Recalculer la faisabilité matières"
              >
                <RefreshCw
                  size={15}
                  strokeWidth={1.75}
                  className={cn(feasLoading && 'animate-spin')}
                />
                {feasLoading ? 'Calcul…' : 'Faisabilité'}
              </button>
              {feasDone && feasCounts.ok > 0 && (
                <button
                  type="button"
                  className={cn(PILL, 'gap-1.5')}
                  onClick={selectAllLaunchable}
                  disabled={batchRunning}
                >
                  <Check size={15} strokeWidth={1.75} />
                  Tout sélectionner ({feasCounts.ok})
                </button>
              )}
            </>
          )}

          <div className={PILL}>
            <Search size={17} strokeWidth={1.75} className="text-muted-foreground" />
            <input
              className="w-[220px] border-0 bg-transparent px-0 text-xs font-medium text-foreground shadow-none outline-none"
              placeholder="OF, article, commande, client…"
              type="text"
              autoComplete="off"
              value={query}
              onChange={(e) => setQuery(e.currentTarget.value)}
            />
          </div>
        </ToolbarRow>

        {!posteFilter && (
          <div className="flex flex-none items-center gap-2 overflow-x-auto border-b border-rule bg-secondary/40 px-7 py-2.5">
            {filteredPostes.map((p) => {
              const s = saturation(p.totalHours, p.weeklyCapacityHours)
              return (
                <button
                  key={p.code}
                  type="button"
                  onClick={() => selectPoste(p.code)}
                  className="flex flex-none items-center gap-2 rounded-lg border border-rule bg-card px-3 py-1.5 font-mono text-xs text-foreground transition-colors hover:border-brand/50"
                  title={p.label}
                >
                  <span className="font-bold">{p.code}</span>
                  <span className="text-muted-foreground">
                    {p.count} {isLancer ? 'cand.' : 'OF'}
                  </span>
                  {!isLancer && s.pct !== null && (
                    <span
                      className={cn(
                        'font-bold',
                        s.level === 'ok' && 'text-ferme',
                        s.level === 'high' && 'text-suggere',
                        s.level === 'crit' && 'text-danger'
                      )}
                    >
                      {s.pct}%
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        )}

        {activePoste && (
          <div className="flex flex-none flex-wrap items-center gap-x-4 gap-y-2 border-b border-border bg-secondary px-7 py-3">
            <Package size={18} strokeWidth={1.75} className="text-brand" />
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-[13px] font-bold text-foreground">
                {activePoste.code}
              </span>
              <span className="text-[13px] font-medium text-muted-foreground">
                {activePoste.label}
              </span>
            </div>
            <span className="flex-1" />
            {!isLancer && (
              <div className="flex items-center gap-3">
                <div className="flex items-baseline gap-1">
                  <span className="text-[17px] font-bold tabular-nums text-foreground">
                    {fmtH(activePoste.totalHours)}
                  </span>
                  <span className="font-mono text-[10px] font-semibold text-muted-foreground">
                    h
                  </span>
                  {weeksEngaged !== null && (
                    <span className="ml-1 font-mono text-[11px] font-semibold text-muted-foreground">
                      ≈ {fmtJ(activePoste.totalHours)} j
                    </span>
                  )}
                </div>
                {sat && sat.pct !== null && (
                  <div className="flex items-center gap-2">
                    <div className="relative h-1.5 w-24 overflow-hidden rounded-full bg-rule-soft">
                      <div
                        className={cn(
                          'absolute inset-y-0 left-0 rounded-full transition-all',
                          sat.level === 'ok' && 'bg-ferme',
                          sat.level === 'high' && 'bg-suggere',
                          sat.level === 'crit' && 'bg-danger'
                        )}
                        style={{ width: `${Math.min(100, sat.pct)}%` }}
                      />
                    </div>
                    <span
                      className={cn(
                        'font-mono text-[11px] font-bold tabular-nums',
                        sat.level === 'ok' && 'text-ferme',
                        sat.level === 'high' && 'text-suggere',
                        sat.level === 'crit' && 'text-danger'
                      )}
                    >
                      {sat.pct}%
                    </span>
                  </div>
                )}
              </div>
            )}
            {isLancer && feasDone && (
              <div className="flex items-center gap-3 font-mono text-[11px] font-semibold">
                <span className="text-ferme">{feasCounts.ok} lançables</span>
                {feasCounts.qc > 0 && <span className="text-suggere">{feasCounts.qc} sous CQ</span>}
                {feasCounts.blocked > 0 && (
                  <span className="text-destructive">{feasCounts.blocked} bloqués</span>
                )}
              </div>
            )}
          </div>
        )}

        {filteredRows.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-10 text-muted-foreground">
            <Package size={26} strokeWidth={1.75} />
            <span className="text-[13px] font-medium">
              {isLancer
                ? feasFilter === 'ok'
                  ? 'Aucun OF lançable pour ces filtres.'
                  : 'Aucun candidat à lancer pour ces filtres.'
                : 'Aucun OF pour ces filtres.'}
            </span>
            {isLancer && feasLoading && (
              <span className="flex items-center gap-1.5 font-mono text-[11px]">
                <RefreshCw size={14} className="animate-spin" /> Calcul de faisabilité…
              </span>
            )}
          </div>
        ) : (
          <>
            {!props.detail && (
              <div className="flex flex-none items-center gap-2 border-b border-border bg-secondary/50 px-7 py-1.5 font-mono text-[10px] text-muted-foreground">
                <Info size={14} strokeWidth={1.75} />
                <span>
                  {isLancer
                    ? 'Matching commande↔OF (même algo que /programme). Sélectionnez un poste pour filtrer urgence.'
                    : 'Sélectionnez un poste pour afficher les commandes et les dates de livraison.'}
                </span>
              </div>
            )}
            {isLancer && feasLoading && (
              <div className="flex flex-none items-center gap-2 border-b border-brand/20 bg-brand-soft/40 px-7 py-1.5 font-mono text-[10px] text-foreground">
                <RefreshCw size={14} strokeWidth={1.75} className="animate-spin text-brand" />
                <span>Calcul de faisabilité matières (même moteur que /programme)…</span>
              </div>
            )}
            <div className="flex-1 overflow-auto pb-20">
              <div
                className={cn(
                  'sticky top-0 z-10 grid items-center gap-3 border-b border-border bg-secondary px-7 py-2 font-mono text-[9px] font-bold tracking-wider text-muted-foreground',
                  rowGrid
                )}
              >
                {isLancer && <span />}
                {showPosteCol && <span>POSTE</span>}
                <span>OF</span>
                {isLancer && <span>STATUT</span>}
                <span>ARTICLE</span>
                <span>DÉSIGNATION</span>
                {isLancer ? (
                  <span>FAISABILITÉ</span>
                ) : (
                  <span className="text-right">AVANCEMENT</span>
                )}
                <span>COMMANDE(S)</span>
                <span>LIVRAISON</span>
                <span className="text-right">HEURES</span>
                {!isLancer && <span className="text-right">JOURS</span>}
              </div>

              {rowGroups.map((group) => {
                const poste = group.posteCode ? posteByCode.get(group.posteCode) : null
                const groupHours = group.rows.reduce((s, r) => s + r.hours, 0)
                return (
                  <div key={group.posteCode ?? 'all'}>
                    {showPosteCol && poste && (
                      <div className="flex items-center gap-2 border-b border-border bg-secondary/70 px-7 py-1.5 font-mono text-[10px] font-bold text-foreground">
                        <span className="text-brand">{poste.code}</span>
                        <span className="truncate text-muted-foreground">{poste.label}</span>
                        <span className="ml-auto flex items-center gap-2 text-muted-foreground">
                          <span>{group.rows.length}</span>
                          <span>{fmtH(groupHours)} h</span>
                        </span>
                      </div>
                    )}
                    {group.rows.map((r, i) => {
                      const u = urgencyOf(r.livraisonIso)
                      const bucket = props.detail && r.commandes.length === 0 ? 'none' : u
                      const prevBucket =
                        i > 0
                          ? props.detail && group.rows[i - 1].commandes.length === 0
                            ? 'none'
                            : urgencyOf(group.rows[i - 1].livraisonIso)
                          : null
                      const showSep =
                        props.detail && !isLancer && (prevBucket === null || prevBucket !== bucket)
                      let bucketCount = 0
                      if (showSep) {
                        for (let j = i; j < group.rows.length; j++) {
                          const rj = group.rows[j]
                          const bj =
                            props.detail && rj.commandes.length === 0
                              ? 'none'
                              : urgencyOf(rj.livraisonIso)
                          if (bj !== bucket) break
                          bucketCount++
                        }
                      }
                      const sepLabel =
                        bucket === 'none'
                          ? 'Sans commande'
                          : bucket === 'overdue'
                            ? 'En retard'
                            : bucket === 'week'
                              ? 'Cette semaine'
                              : 'À venir'
                      const avancement =
                        r.launched > 0 ? Math.min(100, Math.round((r.done / r.launched) * 100)) : 0
                      const feas = feasibility[r.numOf]
                      const badge = feasBadge(feas?.st ?? (feasDone ? 'unknown' : undefined))
                      const BadgeIcon = badge.icon
                      const isSelected = selected.has(r.numOf)
                      const batchItem = batch[r.numOf]
                      return (
                        <div key={`${r.posteCode}-${r.numOf}`}>
                          {showSep && (
                            <div
                              className={cn(
                                'flex items-center gap-2 px-7 pt-3 pb-1.5 font-mono text-[10px] font-bold uppercase tracking-wider',
                                bucket === 'none' && 'text-muted-foreground',
                                bucket === 'overdue' && 'text-danger',
                                bucket === 'week' && 'text-brand',
                                bucket === 'later' && 'text-muted-foreground'
                              )}
                            >
                              <span
                                className={cn(
                                  'inline-block h-0.5 flex-none w-4 rounded-full',
                                  bucket === 'none' && 'bg-rule',
                                  bucket === 'overdue' && 'bg-danger',
                                  bucket === 'week' && 'bg-brand',
                                  bucket === 'later' && 'bg-rule'
                                )}
                              />
                              {sepLabel}
                              <span className="ml-auto font-semibold normal-case tracking-normal text-muted-foreground tabular-nums">
                                {bucketCount}
                              </span>
                            </div>
                          )}
                          <div
                            className={cn(
                              'grid items-center gap-3 border-b border-rule-soft px-7 py-2 transition-colors',
                              rowGrid,
                              props.detail && r.commandes.length === 0 && 'opacity-60',
                              isSelected && 'bg-brand-soft/40',
                              batchItem?.st === 'ok' && 'bg-ferme/10',
                              batchItem?.st === 'error' && 'bg-destructive/5',
                              'hover:bg-secondary/50'
                            )}
                          >
                            {isLancer && (
                              <label className="flex cursor-pointer items-center justify-center">
                                <input
                                  type="checkbox"
                                  className="size-3.5 accent-[var(--brand)]"
                                  checked={isSelected}
                                  disabled={batchRunning}
                                  onChange={() => toggleSelect(r.numOf)}
                                  aria-label={`Sélectionner ${r.numOf}`}
                                />
                              </label>
                            )}
                            {showPosteCol && (
                              <span className="truncate font-mono text-[11px] font-bold text-foreground">
                                {r.posteCode}
                              </span>
                            )}
                            <button
                              type="button"
                              className="truncate text-left font-mono text-[12px] font-bold text-foreground hover:text-brand hover:underline"
                              onClick={() => {
                                setDetailOf(r.numOf)
                                setDetailOpen(true)
                              }}
                            >
                              {r.numOf}
                            </button>
                            {isLancer && (
                              <span
                                className={cn(
                                  'truncate font-mono text-[10px] font-semibold',
                                  r.status === 3 ? 'text-suggere' : 'text-planifie'
                                )}
                              >
                                {r.statusLabel ?? '—'}
                              </span>
                            )}
                            <span className="truncate font-mono text-[11px] font-bold text-foreground">
                              {r.article}
                            </span>
                            <span
                              className="truncate text-[12px] text-foreground/80"
                              title={r.designation ?? undefined}
                            >
                              {r.designation ?? '—'}
                            </span>
                            {isLancer ? (
                              <span
                                className={cn(
                                  'inline-flex w-fit items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[10px] font-bold',
                                  badge.className
                                )}
                                title={
                                  feas?.st === 'blocked'
                                    ? `Rupture : ${feas.missing.join(', ') || 'composant(s)'}`
                                    : feas?.st === 'qc'
                                      ? 'Couverture dépendante du stock sous CQ'
                                      : undefined
                                }
                              >
                                <BadgeIcon
                                  size={12}
                                  strokeWidth={2}
                                  className={cn(!feas && feasLoading && 'animate-spin')}
                                />
                                {badge.label}
                              </span>
                            ) : (
                              <div className="flex items-center gap-2">
                                <div className="relative h-2.5 w-full">
                                  <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-full bg-rule-soft">
                                    <div
                                      className={cn(
                                        'absolute inset-y-0 left-0 rounded-full',
                                        avancement >= 100 && 'bg-ferme',
                                        avancement > 0 && avancement < 100 && 'bg-planifie'
                                      )}
                                      style={{ width: `${avancement}%` }}
                                    />
                                  </div>
                                </div>
                                <span className="flex-none font-mono text-[10px] leading-none tabular-nums text-muted-foreground">
                                  {r.done}/{r.launched}
                                </span>
                              </div>
                            )}
                            <div className="min-w-0">
                              {r.commandes.length === 0 ? (
                                <span className="font-mono text-[11px] text-muted-foreground">
                                  —
                                </span>
                              ) : (
                                r.commandes.map((c) => (
                                  <div key={c.numCommande + (c.ligne ?? '')} className="min-w-0">
                                    <div
                                      className="flex items-center gap-1.5 overflow-hidden"
                                      title={`${c.numCommande}${c.ligne ? `·L${c.ligne}` : ''}${c.client ? ` — ${c.client}` : ''}`}
                                    >
                                      <span className="shrink-0 whitespace-nowrap font-mono text-[11px] font-bold leading-tight text-foreground">
                                        {c.numCommande}
                                      </span>
                                      {c.ligne && (
                                        <span className="shrink-0 whitespace-nowrap font-mono text-[10px] font-medium leading-tight text-muted-foreground">
                                          ·L{c.ligne}
                                        </span>
                                      )}
                                    </div>
                                    {c.client && (
                                      <div className="truncate text-[10px] font-medium leading-tight text-muted-foreground">
                                        {c.client}
                                      </div>
                                    )}
                                  </div>
                                ))
                              )}
                            </div>
                            <span
                              className={cn(
                                'font-mono text-[11px] font-bold tabular-nums',
                                urgencyColor(u)
                              )}
                            >
                              {r.livraisonIso ? fmtDateFr(r.livraisonIso) : '—'}
                            </span>
                            <span className="text-right font-mono text-[11px] font-bold tabular-nums text-foreground">
                              {fmtH(r.hours)}
                            </span>
                            {!isLancer && (
                              <span className="text-right font-mono text-[11px] tabular-nums text-muted-foreground">
                                {fmtJ(r.hours)}
                              </span>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>

      {isLancer && (
        <SequenceurFirmBar
          selected={[...selected]}
          feasibility={feasibility}
          batch={batch}
          batchRunning={batchRunning}
          onFirm={(ids) => void batchFirm(ids)}
          onClear={() => {
            setSelected(new Set())
            setBatch({})
          }}
        />
      )}

      <OfDetailSheet
        num={detailOf}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onFirmed={() => {
          setDetailOpen(false)
          setTimeout(() => router.reload(), 800)
        }}
      />
    </AppLayout>
  )
}
