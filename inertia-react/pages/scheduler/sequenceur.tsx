import { useCallback, useEffect, useMemo, useState } from 'react'
import { Head, router } from '@inertiajs/react'
import {
  Check,
  Factory,
  FilterX,
  Package,
  RefreshCw,
  RotateCw,
  TriangleAlert,
  Wand2,
} from 'lucide-react'
import { toast } from 'sonner'

import AppLayout from '@r/layouts/app'
import { cn } from '@r/lib/utils'
import { route } from '@r/lib/routes'
import { Badge } from '@r/components/ui/badge'
import { Button } from '@r/components/ui/button'
import { Card } from '@r/components/ui/card'
import { Jauge } from '@r/components/ui/chart'
import { Pill } from '@r/components/ui/pill'
import { Separator } from '@r/components/ui/separator'
import { DynamicIcon } from '@r/components/ui/dynamic-icon'
import DataTable, { type SortingState } from '@r/components/ui/data-table'
import { rowToneClass } from '@r/components/ui/table-row'
import {
  ToolbarFilterChip,
  ToolbarFilterMenu,
  ToolbarFilterSection,
  ToolbarGroup,
  ToolbarSearch,
  ToolbarSegment,
  ToolbarSegmented,
  ToolbarSpacer,
} from '@r/components/ui/toolbar'
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  useComboboxAnchor,
} from '@r/components/ui/combobox'
import { fmtH, fmtJ, saturation, urgencyOf, type Urgency } from '@r/lib/board/engagement-format'
import type { FeasStatus, PosteNatureFilterKey } from '@r/lib/board/types'
import { fetchBoardFeasibility } from '@r/lib/board/feasibility-map'
import { useIsPrinting } from '@r/lib/use-is-printing'
import OfDetailSheet from '@r/components/of/of-detail-sheet'
import SequenceurFirmBar, { type BatchItem } from '@r/components/sequenceur/sequenceur-firm-bar'
import { createSequenceurColumns } from '@r/lib/sequenceur/columns'
import {
  ALL_POSTE_NATURES,
  ALL_STATUSES,
  POSTE_NATURE_CHIPS,
  STATUS_CHIP_TONE,
  STATUS_FILTER_CHIPS,
  URGENCY_CHIPS,
  affirmable,
  feasOk,
  matchQuery,
  natureOk,
  sortBusinessDefault,
  sortSequenceurRows,
  splitChargeHours,
  type FeasFilter,
  type PosteSummary,
  type SequenceurRow,
  type StatusKey,
} from '@r/lib/sequenceur/shared'

/**
 * Page « Séquenceur » — board /programme en table (#46/#100 unifiés).
 *
 * Migrée sur le design system (vitrine `/design-system`) :
 * • `theme="cursor"`, comme /suivi ;
 * • la barre d'outils suit le standard §17 — elle passe par la prop `toolbar`
 *   d'AppLayout et ne garde que la portée, la recherche et les actions ; les
 *   cinq contrôles de filtrage permanents (atelier, nature, statut,
 *   faisabilité, urgence) sont descendus sous le déclencheur unique
 *   `ToolbarFilterMenu`, où chaque chip porte sa gravité et son volume ;
 * • la grille CSS de 12 colonnes est remplacée par le `DataTable` dans une
 *   `Card`, avec tri d'en-tête, colonnes figées et virtualisation.
 *
 * Deux affichages ont été abandonnés dans l'échange, et remplacés plutôt que
 * supprimés :
 * • les **en-têtes de groupe par poste** (une `<table>` n'a pas de rangée de
 *   groupe) → le sélecteur de poste porte désormais, pour chaque poste, son
 *   volume d'OF, sa charge et sa saturation ;
 * • les **séparateurs de bucket d'urgence** → les chips « Urgence » du panneau
 *   portent les mêmes compteurs, et la colonne Livraison garde sa couleur
 *   d'urgence.
 *
 * Le filtre d'urgence, lui, n'est plus conditionné à la sélection d'un poste :
 * il n'y avait aucune raison métier à ce verrou, seulement la place que les
 * pills prenaient dans la rangée — place que le panneau n'a pas à compter.
 */

interface SequenceurPageProps {
  postes: PosteSummary[]
  ateliers: { code: string; label: string }[]
  rows: SequenceurRow[]
  /** Fenêtre matching/faisabilité — alignée loadOrderImpacts /programme. */
  feasibilityWindow: { from: string; to: string } | null
  x3Error: string | null
}

/** Filtres persistés au refresh (sessionStorage). */
const FILTERS_STORAGE_KEY = 'sequenceur:filters'

type StoredFilters = {
  ateliers: string[]
  posteNatures: PosteNatureFilterKey[]
  query: string
  urgencyFilter: Urgency | 'all'
  feasFilter: FeasFilter
  statusFilter: StatusKey[]
  /** Poste sélectionné (filtre client) — aussi synchronisé en `?poste=`. */
  poste: string | null
}

function defaultFilters(): StoredFilters {
  return {
    ateliers: [],
    posteNatures: [...ALL_POSTE_NATURES],
    query: '',
    urgencyFilter: 'all',
    feasFilter: 'all',
    statusFilter: [...ALL_STATUSES],
    poste: null,
  }
}

function readStoredFilters(): StoredFilters {
  const defaults = defaultFilters()
  try {
    const raw = sessionStorage.getItem(FILTERS_STORAGE_KEY)
    if (!raw) {
      // Migration clé atelier seule (avant bundling des filtres).
      const legacy = sessionStorage.getItem('sequenceur:ateliers')
      if (legacy) {
        defaults.ateliers = JSON.parse(legacy) as string[]
      }
      return defaults
    }
    const parsed = JSON.parse(raw) as Partial<StoredFilters>
    return {
      ateliers: Array.isArray(parsed.ateliers) ? parsed.ateliers : [],
      posteNatures:
        Array.isArray(parsed.posteNatures) && parsed.posteNatures.length > 0
          ? (parsed.posteNatures.filter((n) =>
              ALL_POSTE_NATURES.includes(n)
            ) as PosteNatureFilterKey[])
          : [...ALL_POSTE_NATURES],
      query: typeof parsed.query === 'string' ? parsed.query : '',
      urgencyFilter:
        parsed.urgencyFilter === 'overdue' ||
        parsed.urgencyFilter === 'week' ||
        parsed.urgencyFilter === 'later' ||
        parsed.urgencyFilter === 'all'
          ? parsed.urgencyFilter
          : 'all',
      feasFilter:
        parsed.feasFilter === 'ok' ||
        parsed.feasFilter === 'qc' ||
        parsed.feasFilter === 'blocked' ||
        parsed.feasFilter === 'unknown' ||
        parsed.feasFilter === 'all'
          ? parsed.feasFilter
          : 'all',
      statusFilter:
        Array.isArray(parsed.statusFilter) && parsed.statusFilter.length > 0
          ? (parsed.statusFilter.filter((s) =>
              ALL_STATUSES.includes(s as StatusKey)
            ) as StatusKey[])
          : [...ALL_STATUSES],
      poste: typeof parsed.poste === 'string' && parsed.poste ? parsed.poste : null,
    }
  } catch {
    return defaults
  }
}

function writeStoredFilters(patch: Partial<StoredFilters>) {
  try {
    const cur = readStoredFilters()
    const next = { ...cur, ...patch }
    sessionStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(next))
  } catch {
    // sessionStorage indisponible — filtre session React seule.
  }
}

/** Poste initial : `?poste=` prime sur sessionStorage. */
function readInitialPoste(stored: StoredFilters): string | null {
  try {
    const q = new URLSearchParams(window.location.search).get('poste')?.trim()
    if (q) return q
  } catch {
    // SSR / pas de window
  }
  return stored.poste
}

function syncPosteQueryParam(poste: string | null) {
  try {
    const url = new URL(window.location.href)
    if (poste) url.searchParams.set('poste', poste)
    else url.searchParams.delete('poste')
    url.searchParams.delete('vue')
    window.history.replaceState({}, '', url)
  } catch {
    // ignore
  }
}

const FEAS_CHIPS: {
  k: FeasFilter
  label: string
  tone: 'neutral' | 'ok' | 'warning' | 'critical'
}[] = [
  { k: 'all', label: 'Tous', tone: 'neutral' },
  { k: 'ok', label: 'Lançables', tone: 'ok' },
  { k: 'qc', label: 'Sous CQ', tone: 'warning' },
  { k: 'blocked', label: 'Bloqués', tone: 'critical' },
]

const URGENCY_TONE: Record<Urgency | 'all', 'neutral' | 'ok' | 'warning' | 'critical'> = {
  all: 'neutral',
  overdue: 'critical',
  week: 'warning',
  later: 'neutral',
}

export default function Sequenceur(props: SequenceurPageProps) {
  const anchorRef = useComboboxAnchor()
  const stored = useMemo(() => readStoredFilters(), [])
  const printing = useIsPrinting()
  const [posteQuery, setPosteQuery] = useState('')
  const [urgencyFilter, setUrgencyFilter] = useState<Urgency | 'all'>(stored.urgencyFilter)
  const [query, setQuery] = useState(stored.query)
  const [atelierFilter, setAtelierFilter] = useState<Set<string>>(() => new Set(stored.ateliers))
  const [posteNatureFilter, setPosteNatureFilter] = useState<Set<PosteNatureFilterKey>>(
    () => new Set(stored.posteNatures)
  )
  const [statusFilter, setStatusFilter] = useState<Set<StatusKey>>(
    () => new Set(stored.statusFilter)
  )
  const [feasFilter, setFeasFilter] = useState<FeasFilter>(stored.feasFilter)
  const [feasibility, setFeasibility] = useState<Record<string, FeasStatus>>({})
  const [feasLoading, setFeasLoading] = useState(false)
  const [feasDone, setFeasDone] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [batch, setBatch] = useState<Record<string, BatchItem>>({})
  const [batchRunning, setBatchRunning] = useState(false)
  const [detailOf, setDetailOf] = useState<string | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  /** Tri colonnes (cycle du DataTable) — vide = tri métier défaut. */
  const [sorting, setSorting] = useState<SortingState[]>([])

  const toggleAtelier = (code: string) => {
    setAtelierFilter((prev) => {
      const next = new Set(prev)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      writeStoredFilters({ ateliers: [...next] })
      return next
    })
  }

  const togglePosteNature = (n: PosteNatureFilterKey) => {
    setPosteNatureFilter((prev) => {
      const next = new Set(prev)
      if (next.has(n)) next.delete(n)
      else next.add(n)
      writeStoredFilters({ posteNatures: [...next] })
      return next
    })
  }

  const toggleStatus = (k: StatusKey) => {
    setStatusFilter((prev) => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      writeStoredFilters({ statusFilter: [...next] })
      return next
    })
  }

  const setQueryPersisted = (value: string) => {
    setQuery(value)
    writeStoredFilters({ query: value })
  }

  const setUrgencyPersisted = (value: Urgency | 'all') => {
    setUrgencyFilter(value)
    writeStoredFilters({ urgencyFilter: value })
  }

  const setFeasFilterPersisted = (value: FeasFilter) => {
    setFeasFilter(value)
    writeStoredFilters({ feasFilter: value })
  }

  const posteAtelier = useMemo(
    () => new Map(props.postes.map((p) => [p.code, p.atelier])),
    [props.postes]
  )
  const posteNature = useMemo(
    () => new Map(props.postes.map((p) => [p.code, p.nature])),
    [props.postes]
  )
  const posteRank = useMemo(() => new Map(props.postes.map((p, i) => [p.code, i])), [props.postes])

  const [posteFilter, setPosteFilter] = useState<string | null>(() => readInitialPoste(stored))

  // Sync URL une fois au montage si sessionStorage avait un poste sans query.
  useEffect(() => {
    syncPosteQueryParam(posteFilter)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Reset sélection / faisabilité quand le dataset change.
  useEffect(() => {
    setSelected(new Set())
    setBatch({})
    setFeasibility({})
    setFeasDone(false)
  }, [props.rows])

  function selectPoste(poste: string | null) {
    setPosteFilter(poste)
    writeStoredFilters({ poste })
    syncPosteQueryParam(poste)
  }

  /** L'état vide doit pouvoir se réparer : un bouton, pas un mode d'emploi. */
  const resetFilters = () => {
    const d = defaultFilters()
    setQuery(d.query)
    setAtelierFilter(new Set(d.ateliers))
    setPosteNatureFilter(new Set(d.posteNatures))
    setStatusFilter(new Set(d.statusFilter))
    setUrgencyFilter(d.urgencyFilter)
    setFeasFilter(d.feasFilter)
    // Le poste n'est pas un filtre mais la PORTÉE de la page : le réinitialiser
    // renverrait ailleurs que là où l'utilisateur regarde.
    writeStoredFilters({ ...d, poste: posteFilter })
  }

  const activePoste = posteFilter ? props.postes.find((p) => p.code === posteFilter) : null
  const showPosteCol = !posteFilter

  const filteredPostes = useMemo(() => {
    const q = posteQuery.trim().toLowerCase()
    return props.postes
      .filter((p) => natureOk(p.nature, posteNatureFilter))
      .filter((p) => atelierFilter.size === 0 || atelierFilter.has(p.atelier))
      .filter((p) => !q || p.code.toLowerCase().includes(q) || p.label.toLowerCase().includes(q))
  }, [props.postes, posteQuery, atelierFilter, posteNatureFilter])

  const runFeasibility = useCallback(async () => {
    if (feasLoading || props.rows.length === 0 || !props.feasibilityWindow) return
    const { from, to } = props.feasibilityWindow
    setFeasLoading(true)
    try {
      const { map } = await fetchBoardFeasibility({
        from,
        to,
        mode: 'sequential',
        ...(posteFilter ? { workstation: posteFilter } : {}),
      })
      // Ne garder que les OF candidats affichés (réponse board = fenêtre STRDAT entière).
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
      if (nbOk > 0) setFeasFilterPersisted('ok')
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
  }, [feasLoading, props.rows, props.feasibilityWindow, posteFilter])

  /**
   * Base commune aux compteurs de chips et à la table : portée (poste, nature,
   * atelier) + recherche. Chaque compteur y ajoute ensuite tous les filtres
   * SAUF le sien — un compte de chip doit dire ce qu'il resterait si on la
   * cochait, pas ce qui reste déjà.
   */
  const baseRows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return props.rows
      .filter((r) => !posteFilter || r.posteCode === posteFilter)
      .filter((r) => natureOk(posteNature.get(r.posteCode), posteNatureFilter))
      .filter(
        (r) => atelierFilter.size === 0 || atelierFilter.has(posteAtelier.get(r.posteCode) ?? '')
      )
      .filter((r) => matchQuery(r, q))
  }, [props.rows, posteFilter, posteNature, posteNatureFilter, atelierFilter, posteAtelier, query])

  const statusOk = useCallback(
    (r: SequenceurRow) => statusFilter.has((r.status ?? 1) as StatusKey),
    [statusFilter]
  )
  const urgencyMatch = useCallback(
    (r: SequenceurRow) => urgencyFilter === 'all' || urgencyOf(r.livraisonIso) === urgencyFilter,
    [urgencyFilter]
  )

  const statusCounts = useMemo(() => {
    const out: Record<StatusKey, number> = { 1: 0, 2: 0, 3: 0 }
    for (const r of baseRows) {
      if (!urgencyMatch(r) || !feasOk(r, feasFilter, feasibility)) continue
      const k = r.status ?? 1
      if (k === 1 || k === 2 || k === 3) out[k]++
    }
    return out
  }, [baseRows, urgencyMatch, feasFilter, feasibility])

  const feasCounts = useMemo(() => {
    const out = { all: 0, ok: 0, qc: 0, blocked: 0, unknown: 0 }
    for (const r of baseRows) {
      if (!statusOk(r) || !urgencyMatch(r)) continue
      out.all++
      const st = feasibility[r.numOf]?.st
      if (st === 'ok') out.ok++
      else if (st === 'qc') out.qc++
      else if (st === 'blocked') out.blocked++
      else out.unknown++
    }
    return out
  }, [baseRows, statusOk, urgencyMatch, feasibility])

  const urgencyCounts = useMemo(() => {
    const out: Record<Urgency | 'all', number> = { all: 0, overdue: 0, week: 0, later: 0 }
    for (const r of baseRows) {
      if (!statusOk(r) || !feasOk(r, feasFilter, feasibility)) continue
      out.all++
      out[urgencyOf(r.livraisonIso)]++
    }
    return out
  }, [baseRows, statusOk, feasFilter, feasibility])

  const filteredRows = useMemo(() => {
    const rows = baseRows.filter(
      (r) => statusOk(r) && urgencyMatch(r) && feasOk(r, feasFilter, feasibility)
    )
    if (sorting.length > 0) return sortSequenceurRows(rows, sorting, feasibility)
    return sortBusinessDefault(rows, {
      feasDone,
      feasibility,
      posteRank: showPosteCol ? posteRank : null,
      demoteSansCommande: !showPosteCol,
    })
  }, [
    baseRows,
    statusOk,
    urgencyMatch,
    feasFilter,
    feasibility,
    sorting,
    feasDone,
    showPosteCol,
    posteRank,
  ])

  // Sélectionnables (affermissables) parmi les lignes affichées + faisabilité ok —
  // seul périmètre légitime pour « Tout sélectionner » (les fermes ne s'affermissent pas).
  const affirmableOkCount = useMemo(
    () =>
      filteredRows.filter((r) => affirmable(r.status) && feasibility[r.numOf]?.st === 'ok').length,
    [filteredRows, feasibility]
  )

  const totalHours = Math.round(filteredRows.reduce((s, r) => s + r.hours, 0) * 100) / 100
  /** Postes réellement représentés dans la table, pas ceux que le filtre laisse passer. */
  const postesAffiches = useMemo(
    () => new Set(filteredRows.map((r) => r.posteCode)).size,
    [filteredRows]
  )
  const chargeSplit = useMemo(() => splitChargeHours(filteredRows), [filteredRows])
  const sat = activePoste
    ? saturation(activePoste.totalHours, activePoste.weeklyCapacityHours)
    : null

  /** Un filtre est « actif » quand il s'ÉCARTE du défaut, pas quand il est coché. */
  const activeFilterCount =
    (atelierFilter.size > 0 ? 1 : 0) +
    (ALL_POSTE_NATURES.some((n) => !posteNatureFilter.has(n)) ? 1 : 0) +
    (ALL_STATUSES.some((s) => !statusFilter.has(s)) ? 1 : 0) +
    (feasFilter !== 'all' ? 1 : 0) +
    (urgencyFilter !== 'all' ? 1 : 0)
  const isFiltered = activeFilterCount > 0 || !!query.trim()

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  function selectAllLaunchable() {
    const next = new Set<string>()
    for (const r of filteredRows) {
      if (affirmable(r.status) && feasibility[r.numOf]?.st === 'ok') next.add(r.numOf)
    }
    setSelected(next)
  }

  const openOf = useCallback((numOf: string) => {
    setDetailOf(numOf)
    setDetailOpen(true)
  }, [])

  const columns = useMemo(
    () =>
      createSequenceurColumns({
        showPosteCol,
        feasibility,
        feasDone,
        selected,
        batch,
        batchRunning,
        onToggleSelect: toggleSelect,
        onOpenOf: openOf,
      }),
    [showPosteCol, feasibility, feasDone, selected, batch, batchRunning, toggleSelect, openOf]
  )

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

  /* ── Barre d'outils (standard §17) ─────────────────────────────────────
     Zone 01 portée : le sélecteur de poste. Zone 02 : le déclencheur unique de
     filtres. Zone 03 : la recherche. Zone 04 : les actions. Ni fenêtre de
     dates ni « actualiser » — la page n'en a pas. */
  const toolbar = (
    <>
      <ToolbarGroup>
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
                  filteredPostes.map((p) => {
                    // Le sélecteur porte la synthèse par poste que les en-têtes
                    // de groupe de l'ancienne table donnaient : volume, charge,
                    // saturation — là où le poste se choisit.
                    const s = saturation(p.totalHours, p.weeklyCapacityHours)
                    return (
                      <ComboboxItem key={p.code} value={p.code}>
                        <span className="font-mono text-xs font-semibold">{p.code}</span>
                        <span className="truncate text-muted-foreground">{p.label}</span>
                        <span className="ml-auto flex shrink-0 items-baseline gap-2 font-mono text-2xs tabular-nums text-muted-foreground">
                          <span>{p.count} OF</span>
                          <span>{fmtH(p.totalHours)} h</span>
                          {s.pct !== null && (
                            <span
                              className={cn(
                                'font-semibold',
                                s.level === 'ok' && 'text-ferme',
                                s.level === 'high' && 'text-suggere',
                                s.level === 'crit' && 'text-destructive'
                              )}
                            >
                              {s.pct} %
                            </span>
                          )}
                        </span>
                      </ComboboxItem>
                    )
                  })
                )}
              </ComboboxList>
            </ComboboxContent>
          </Combobox>
        </div>

        <ToolbarFilterMenu activeCount={activeFilterCount} width={300}>
          <ToolbarFilterSection>Faisabilité</ToolbarFilterSection>
          <ToolbarSegmented semantics="toggles" flat className="w-full flex-wrap">
            {FEAS_CHIPS.map(({ k, label, tone }) => (
              <ToolbarFilterChip
                key={k}
                label={label}
                tone={tone}
                count={k === 'all' ? feasCounts.all : feasDone ? feasCounts[k] : undefined}
                active={feasFilter === k}
                onClick={() => setFeasFilterPersisted(k)}
                title={
                  feasDone
                    ? undefined
                    : 'Lancez le calcul de faisabilité pour connaître les volumes'
                }
              />
            ))}
          </ToolbarSegmented>

          <Separator className="my-2" />
          <ToolbarFilterSection>Statut</ToolbarFilterSection>
          <ToolbarSegmented semantics="toggles" flat className="w-full flex-wrap">
            {STATUS_FILTER_CHIPS.map(({ k, label }) => (
              <ToolbarFilterChip
                key={k}
                label={label}
                tone={STATUS_CHIP_TONE[k]}
                count={statusCounts[k]}
                active={statusFilter.has(k)}
                onClick={() => toggleStatus(k)}
              />
            ))}
          </ToolbarSegmented>

          <Separator className="my-2" />
          <ToolbarFilterSection>Urgence de livraison</ToolbarFilterSection>
          <ToolbarSegmented semantics="toggles" flat className="w-full flex-wrap">
            {URGENCY_CHIPS.map(({ k, label }) => (
              <ToolbarFilterChip
                key={k}
                label={label}
                tone={URGENCY_TONE[k]}
                count={urgencyCounts[k]}
                active={urgencyFilter === k}
                onClick={() => setUrgencyPersisted(k)}
              />
            ))}
          </ToolbarSegmented>

          <Separator className="my-2" />
          <ToolbarFilterSection>Nature de poste</ToolbarFilterSection>
          <ToolbarSegmented semantics="toggles" flat className="w-full">
            {POSTE_NATURE_CHIPS.map(({ k, label }) => (
              <ToolbarSegment
                key={k}
                active={posteNatureFilter.has(k)}
                onClick={() => togglePosteNature(k)}
              >
                {label}
              </ToolbarSegment>
            ))}
          </ToolbarSegmented>

          {props.ateliers.length > 0 && (
            <>
              <Separator className="my-2" />
              <div className="flex items-center justify-between">
                <ToolbarFilterSection>Atelier</ToolbarFilterSection>
                {atelierFilter.size > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      setAtelierFilter(new Set())
                      writeStoredFilters({ ateliers: [] })
                    }}
                    title="Réinitialiser le filtre atelier"
                    aria-label="Réinitialiser le filtre atelier"
                  >
                    <FilterX size={12} strokeWidth={2} aria-hidden="true" />
                  </Button>
                )}
              </div>
              <ToolbarSegmented semantics="toggles" flat className="w-full flex-wrap">
                {props.ateliers.map((a) => (
                  <ToolbarSegment
                    key={a.code}
                    active={atelierFilter.has(a.code)}
                    onClick={() => toggleAtelier(a.code)}
                    title={a.code}
                  >
                    {a.label.replace(/^ATELIER\s+/i, '')}
                  </ToolbarSegment>
                ))}
              </ToolbarSegmented>
            </>
          )}
        </ToolbarFilterMenu>
      </ToolbarGroup>

      <ToolbarSpacer />

      <ToolbarSearch
        value={query}
        onChange={setQueryPersisted}
        placeholder="OF, article, commande, client…"
      />

      {/* Taille par défaut, pas `sm` : dans la rangée, tout est au palier base
          (28 px). `sm` reste pour les pills posées dans une carte. */}
      <Pill
        variant="outline"
        className="gap-1.5"
        onClick={() => void runFeasibility()}
        disabled={feasLoading || props.rows.length === 0}
        title="Calculer la faisabilité matières des OF affichés"
      >
        {feasLoading ? (
          <RefreshCw size={14} strokeWidth={1.75} className="animate-spin" />
        ) : (
          <Wand2 size={14} strokeWidth={1.75} />
        )}
        {feasLoading ? 'Calcul…' : 'Faisabilité'}
      </Pill>

      {feasDone && affirmableOkCount > 0 && (
        <Pill
          variant="active"
          className="gap-1.5"
          onClick={selectAllLaunchable}
          disabled={batchRunning}
          title="Sélectionner tous les OF lançables affichés"
        >
          <Check size={14} strokeWidth={2} />
          Tout sélectionner ({affirmableOkCount})
        </Pill>
      )}
    </>
  )

  return (
    <AppLayout
      title="Séquenceur"
      active="sequenceur"
      subtitle="Séquenceur"
      theme="cursor"
      dense
      scrollable={false}
      toolbar={toolbar}
      // Pas de `meta` : le volume et la charge se comptent une seule fois, dans
      // le bandeau de synthèse — où ils sont le résultat des filtres qui les
      // entourent, et non un total qui devient faux dès qu'on en pose un.
    >
      <Head title="Séquenceur" />
      <div className="flex h-full min-h-0 flex-col">
        {props.x3Error && (
          <div className="flex flex-none items-center gap-2 border-b border-destructive/30 bg-destructive/10 px-5 py-2 text-xs text-foreground">
            <TriangleAlert size={16} strokeWidth={1.75} className="shrink-0 text-destructive" />
            <span className="font-semibold">Matching partiel :</span>
            <span className="truncate font-mono">{props.x3Error}</span>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="ml-auto shrink-0"
              onClick={() => router.reload()}
            >
              <RotateCw size={12} strokeWidth={1.75} />
              Réessayer
            </Button>
          </div>
        )}

        <div
          data-print-unclip
          className="flex min-h-0 flex-1 flex-col gap-3 p-5 print:h-auto print:overflow-visible print:p-0"
        >
          {/* ═══ Synthèse — la portée en cours, chiffrée une seule fois ═══ */}
          <Card padding="none" className="flex-none px-4 py-2.5">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              <div className="flex min-w-0 items-center gap-2">
                {activePoste ? (
                  <Package
                    size={16}
                    strokeWidth={1.75}
                    className="shrink-0 text-muted-foreground"
                  />
                ) : (
                  <Factory
                    size={16}
                    strokeWidth={1.75}
                    className="shrink-0 text-muted-foreground"
                  />
                )}
                {activePoste ? (
                  <>
                    <span className="font-mono text-cell-lg font-bold text-foreground">
                      {activePoste.code}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {activePoste.label}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-cell-lg font-semibold text-foreground">
                      Tous les postes
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {postesAffiches} poste{postesAffiches > 1 ? 's' : ''}
                    </span>
                  </>
                )}
              </div>

              <span className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-1.5">
                {/* Volume : les OF de la portée filtrée. */}
                <span className="flex items-baseline gap-1">
                  <span className="font-mono text-cell-lg font-bold tabular-nums text-foreground">
                    {filteredRows.length}
                  </span>
                  <span className="text-2xs text-muted-foreground">OF</span>
                </span>

                <span className="h-4 w-px shrink-0 bg-border" aria-hidden="true" />

                {/* Charge : heures + durée, la mesure unique de la portée. */}
                <span className="flex items-baseline gap-1">
                  <span className="font-mono text-cell-lg font-bold tabular-nums text-foreground">
                    {fmtH(totalHours)}
                  </span>
                  <span className="text-2xs text-muted-foreground">h · {fmtJ(totalHours)} j</span>
                </span>

                <span className="h-4 w-px shrink-0 bg-border" aria-hidden="true" />

                {/* Engagement : la décomposition du total, empilée sous lui.
                    Sous .theme-cursor, ferme et planifié partagent le même
                    vert : « lançable » se distingue par l'encre neutre, pas
                    par une seconde teinte qui n'existe pas. */}
                <span className="flex flex-col gap-px font-mono text-1.5xs font-semibold leading-tight tabular-nums">
                  <span className="text-ferme">{fmtH(chargeSplit.ferme)} h ferme</span>
                  <span className="text-foreground">{fmtH(chargeSplit.lancable)} h lançable</span>
                </span>

                {sat && sat.pct !== null && (
                  <>
                    <span className="h-4 w-px shrink-0 bg-border" aria-hidden="true" />
                    <span
                      className="flex items-center gap-2"
                      title="Charge engagée / capacité hebdomadaire"
                    >
                    {/* Largeur portée par CE conteneur, jamais par la jauge :
                        l'hôte du graphique porte un `width: 100%` EN LIGNE, qui
                        bat n'importe quelle classe utilitaire. Une jauge laissée
                        élastique absorbait toute la place libre de la carte, et
                        comme la mesure du conteneur arrive une frame après le
                        recalcul de la rangée, la barre se ré-étirait visiblement
                        à chaque filtre — l'animation n'était pas dans le
                        graphique (`svgAnimation: false`) mais dans la mise en
                        page. 160 px = l'`initialWidth` de la primitive : le
                        prérendu tombe juste, il n'y a plus rien à re-mesurer. */}
                    <span className="w-40 shrink-0">
                      <Jauge
                        valeur={activePoste?.totalHours ?? 0}
                        max={Math.max(
                          activePoste?.weeklyCapacityHours ?? 0,
                          activePoste?.totalHours ?? 0
                        )}
                        seuil={activePoste?.weeklyCapacityHours ?? null}
                        palier={sat.level}
                        epaisseur={6}
                        ariaLabel={`Saturation du poste ${activePoste?.code}`}
                      />
                    </span>
                    <span
                      className={cn(
                        'shrink-0 whitespace-nowrap font-mono text-1.5xs font-bold tabular-nums',
                        sat.level === 'ok' && 'text-ferme',
                        sat.level === 'high' && 'text-suggere',
                        sat.level === 'crit' && 'text-destructive'
                      )}
                    >
                      {sat.pct} %
                    </span>
                    </span>
                  </>
                )}

                {feasDone && (
                  <>
                    <span className="h-4 w-px shrink-0 bg-border" aria-hidden="true" />
                    <span className="flex items-center gap-1.5">
                    <Badge variant="success" className="font-mono text-2xs font-semibold">
                      {feasCounts.ok} lançables
                    </Badge>
                    {feasCounts.qc > 0 && (
                      <Badge variant="warning" className="font-mono text-2xs font-semibold">
                        {feasCounts.qc} sous CQ
                      </Badge>
                    )}
                    {feasCounts.blocked > 0 && (
                      <Badge variant="destructive" className="font-mono text-2xs font-semibold">
                        {feasCounts.blocked} bloqués
                      </Badge>
                    )}
                    </span>
                  </>
                )}

                {activePoste && (
                  <Pill
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    onClick={() =>
                      router.visit(`${route('cockpit.index')}?poste=${activePoste.code}`)
                    }
                    title={`Cockpit du poste ${activePoste.code} — le passé constaté`}
                  >
                    <Factory size={13} strokeWidth={1.75} />
                    Cockpit
                  </Pill>
                )}
              </span>
            </div>
          </Card>

          {/* ═══ Table ═══ */}
          <Card
            padding="none"
            className="min-h-0 flex-1 overflow-hidden print:h-auto print:overflow-visible print:border-0"
          >
            <DataTable
              columns={columns}
              rows={filteredRows}
              sorting={sorting}
              onSortingChange={setSorting}
              tableClass="min-w-[1120px] table-fixed"
              // Deux colonnes de tête figées : la sélection et l'identité de
              // ligne (poste en vue globale, sinon l'OF).
              stickyCols={showPosteCol ? 3 : 2}
              estimateRowSize={56}
              scrollContainerClass="h-full overflow-auto rounded-none border-0 bg-transparent shadow-none print:h-auto print:overflow-visible"
              theadRowClass="sticky top-0 z-10 bg-transparent"
              getRowKey={(r) => `${r.posteCode}-${r.numOf}`}
              // La sélection reste un fond (c'est un état de l'utilisateur, pas
              // une gravité de la donnée) ; le verdict du lot d'affermissement
              // passe en barre de bord, comme partout ailleurs.
              getRowClass={(r) =>
                cn(
                  selected.has(r.numOf) && 'bg-primary/[0.04]',
                  rowToneClass(
                    batch[r.numOf]?.st === 'ok'
                      ? 'ok'
                      : batch[r.numOf]?.st === 'error'
                        ? 'critical'
                        : null
                  ),
                  !showPosteCol && r.commandes.length === 0 && 'opacity-60'
                )
              }
              // Une table virtualisée n'a dans le DOM que sa fenêtre visible :
              // à l'impression, elle ne sortirait qu'une vingtaine de lignes.
              virtualize={!printing}
              emptyState={
                <SequenceurEmptyState
                  isFiltered={isFiltered}
                  feasFilter={feasFilter}
                  onResetFilters={resetFilters}
                />
              }
            />
          </Card>
        </div>
      </div>

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

/**
 * État vide — il doit nommer LA raison. « Aucun OF lançable » et « rien à
 * séquencer » se réparent différemment : le premier par les filtres, le second
 * par le calcul de faisabilité ou par une autre portée.
 */
function SequenceurEmptyState(props: {
  isFiltered: boolean
  feasFilter: FeasFilter
  onResetFilters: () => void
}) {
  const cas = props.feasFilter === 'ok' ? 'lancables' : props.isFiltered ? 'filtres' : 'vide'

  const titre = {
    lancables: 'Aucun OF lançable',
    filtres: 'Aucun résultat',
    vide: 'Rien à séquencer',
  }[cas]

  const texte = {
    lancables:
      'Aucun OF affiché n’a toutes ses matières disponibles. Relâchez le filtre de faisabilité pour voir ce qui bloque.',
    filtres: 'Aucun OF ne correspond aux filtres ou à la recherche en cours.',
    vide: 'Aucun OF ouvert sur ce périmètre.',
  }[cas]

  return (
    <div className="flex flex-1 items-center justify-center p-12 text-center">
      <div className="flex flex-col items-center">
        <div className="mb-4 inline-flex size-14 items-center justify-center rounded-full bg-secondary text-muted-foreground">
          <DynamicIcon
            name={cas === 'vide' ? 'check_circle' : 'search_off'}
            size={28}
            strokeWidth={1.75}
          />
        </div>
        <h3 className="mb-1 font-sans text-cell-lg font-semibold text-foreground">{titre}</h3>
        <p className="mb-5 max-w-sm font-sans text-xs leading-normal text-muted-foreground">
          {texte}
        </p>
        {cas !== 'vide' && (
          <Button type="button" variant="secondary" size="sm" onClick={props.onResetFilters}>
            <FilterX size={13} strokeWidth={1.75} />
            Réinitialiser les filtres
          </Button>
        )}
      </div>
    </div>
  )
}
