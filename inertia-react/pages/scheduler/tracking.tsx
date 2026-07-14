import React, { useState, useMemo, useEffect } from 'react'
import { Head, usePage } from '@inertiajs/react'
import {
  Sidebar,
  ButtonToggleGroup,
  ButtonToggle,
  Search,
  DateRange as CarbonDateRange
} from 'carbon-react'
// Button (carbon-react root) est déprécié — ButtonNext est le remplaçant officiel
// (variantType remplace buttonType). Cf skill carbon-react/components/button-next.md.
import Button from 'carbon-react/esm/components/button/__next__'
import Masthead from '../../components/masthead'
import { parseIso, toIso, startOfDay } from '@/lib/vision/date-utils'

type DateRange = { start: Date | null; end: Date | null }
import { EMPTY, PROACTIVE_EMPTY, fmtMs } from '@/lib/suivi/tracking-shared'
import { cn } from '@/libs/cn'
import { useTimedFetch } from '../../lib/suivi/use_timed_fetch'
import { ReactiveView } from '../../components/tracking/reactive_view'
import { ProactiveView } from '../../components/tracking/proactive_view'
import { SuiviDetailSheet } from '../../components/tracking/suivi_detail_sheet'
import type {
  SuiviPageProps,
  SuiviStatusKey,
  ProactiveVerdictKey,
  SuiviDisplayRow,
  ProactiveDisplayRow,
  SuiviRowsResponse,
  ProactiveRowsResponse,
} from '@/lib/suivi/types'

const CarbonSidebar = Sidebar as any

const LATE_LOOKBACK_DAYS = 90
const DEFAULT_FORWARD_DAYS = 7

const TODAY = startOfDay(new Date())
const TODAY_ISO = toIso(TODAY)
const LATE_FLOOR_ISO = (() => {
  const d = new Date(TODAY)
  d.setDate(d.getDate() - LATE_LOOKBACK_DAYS)
  return toIso(d)
})()
const DEFAULT_RANGE_END = (() => {
  const d = new Date(TODAY)
  d.setDate(d.getDate() + DEFAULT_FORWARD_DAYS)
  return d
})()

export function Tracking(props: SuiviPageProps) {
  const [bust, setBust] = useState(0)

  // ── Vue réactive (suivi as-is) ──
  const rowsUrl = useMemo(() => {
    return `${props.rowsHref}${bust ? `?refresh=${bust}` : ''}`
  }, [props.rowsHref, bust])
  
  const {
    data: rawData,
    loading: dataLoading,
    error: dataError,
    ms: rowsMs,
    elapsed,
  } = useTimedFetch<SuiviRowsResponse>(rowsUrl)
  
  const view = rawData ?? EMPTY

  // ── Vue proactive (réalisabilité projetée) ──
  const [mode, setMode] = useState<'reactif' | 'proactif'>('reactif')

  const proactiveRowsUrl = useMemo(() => {
    return `${props.proactiveRowsHref}${bust ? `?refresh=${bust}` : ''}`
  }, [props.proactiveRowsHref, bust])

  const {
    data: rawProData,
    loading: proDataLoading,
    error: proError,
    ms: proMs,
    elapsed: proElapsed,
  } = useTimedFetch<ProactiveRowsResponse>(proactiveRowsUrl)
  
  const proView = rawProData ?? PROACTIVE_EMPTY

  // Plage de dates d'expédition - filtrage client
  const [dateRange, setDateRange] = useState<DateRange>({ start: TODAY, end: DEFAULT_RANGE_END })

  const inRangeOrLate = (dateExpIso: string | null): boolean => {
    if (!dateExpIso) return true
    const { start, end } = dateRange
    if (start && end) {
      const s = toIso(start)
      const e = toIso(end)
      if (dateExpIso >= s && dateExpIso <= e) return true
    }
    return dateExpIso < TODAY_ISO && dateExpIso >= LATE_FLOOR_ISO
  }

  // Filtres client
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<SuiviStatusKey | 'all'>('all')
  const [verdictFilter, setVerdictFilter] = useState<ProactiveVerdictKey | 'all'>('all')
  const [typeFilter, setTypeFilter] = useState<Set<string>>(new Set(['MTS', 'MTO']))
  const [atelierFilter, setAtelierFilter] = useState<Set<string>>(new Set())

  const [selectedRow, setSelectedRow] = useState<{
    type: 'reactif' | 'proactif'
    row: SuiviDisplayRow | ProactiveDisplayRow
  } | null>(null)

  const toggleType = (t: string) => {
    setTypeFilter((prev) => {
      const next = new Set(prev)
      if (next.has(t)) {
        next.delete(t)
      } else {
        next.add(t)
      }
      return next
    })
  }

  const toggleAtelier = (code: string) => {
    setAtelierFilter((prev) => {
      const next = new Set(prev)
      if (next.has(code)) {
        next.delete(code)
      } else {
        next.add(code)
      }
      return next
    })
  }

  const ateliers = mode === 'proactif' ? proView.ateliers : view.ateliers

  // Filtrage
  const reactiveFilteredRows = useMemo(() => {
    const all = view.rows
    const q = query.trim().toLowerCase()
    let r = all.filter(
      (row) =>
        (statusFilter === 'all' || row.statusKey === statusFilter) &&
        typeFilter.has(row.type) &&
        (atelierFilter.size === 0 || atelierFilter.has(row.atelier)) &&
        inRangeOrLate(row.dateExpIso)
    )
    if (q) {
      const terms = q.split(/\s+/)
      r = r.filter((row) => terms.every((t) => row.filter.includes(t)))
    }
    return r
  }, [view.rows, query, statusFilter, typeFilter, atelierFilter, dateRange])

  const proFilteredRows = useMemo(() => {
    const all = proView.rows
    const q = query.trim().toLowerCase()
    let r = all.filter(
      (row) =>
        (verdictFilter === 'all' || row.verdictKey === verdictFilter) &&
        typeFilter.has(row.type) &&
        (atelierFilter.size === 0 || atelierFilter.has(row.atelier)) &&
        inRangeOrLate(row.dateExpIso)
    )
    if (q) {
      const terms = q.split(/\s+/)
      r = r.filter((row) => terms.every((t) => row.filter.includes(t)))
    }
    return r
  }, [proView.rows, query, verdictFilter, typeFilter, atelierFilter, dateRange])

  const refLabel = TODAY.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })

  const fmtFrDate = (iso: string) => {
    const d = parseIso(iso)
    return d ? d.toLocaleDateString('fr-FR') : iso
  }

  const applyRange = (r: DateRange) => {
    setDateRange(r)
  }

  const selectedRowKey = useMemo(() => {
    if (!selectedRow) return null
    return `${selectedRow.row.numCommande}::${selectedRow.row.article}`
  }, [selectedRow])

  const isFiltered = query.trim() !== '' ||
    (mode === 'reactif' && statusFilter !== 'all') ||
    (mode === 'proactif' && verdictFilter !== 'all') ||
    (!typeFilter.has('MTS') || !typeFilter.has('MTO')) ||
    atelierFilter.size > 0

  const filteredCount = mode === 'reactif' ? reactiveFilteredRows.length : proFilteredRows.length
  const totalCount = mode === 'reactif' ? view.total : proView.total

  const statusChip = (k: SuiviStatusKey | 'all', label: string, count?: number) => {
    const on = statusFilter === k
    return (
      <button
        type="button"
        className={cn(
          "inline-flex items-center gap-1 rounded-[5px] px-2.5 py-1 font-mono text-[10px] font-bold tracking-wider transition-colors",
          on ? 'bg-brand-soft text-brand' : 'text-muted-foreground hover:text-foreground'
        )}
        onClick={() => setStatusFilter(on ? 'all' : k)}
      >
        {label}
        {count !== undefined && count > 0 && (
          <span className={cn(
            "rounded-full px-1.5 py-px text-[8px] font-extrabold tabular-nums leading-none",
            on ? 'bg-brand/15 text-brand' : 'bg-foreground/[0.06] text-muted-foreground'
          )}>
            {count}
          </span>
        )}
      </button>
    )
  }

  const verdictChip = (k: ProactiveVerdictKey | 'all', label: string, count?: number) => {
    const on = verdictFilter === k
    return (
      <button
        type="button"
        className={cn(
          "inline-flex items-center gap-1 rounded-[5px] px-2.5 py-1 font-mono text-[10px] font-bold tracking-wider transition-colors",
          on ? 'bg-brand-soft text-brand' : 'text-muted-foreground hover:text-foreground'
        )}
        onClick={() => setVerdictFilter(on ? 'all' : k)}
      >
        {label}
        {count !== undefined && count > 0 && (
          <span className={cn(
            "rounded-full px-1.5 py-px text-[8px] font-extrabold tabular-nums leading-none",
            on ? 'bg-brand/15 text-brand' : 'bg-foreground/[0.06] text-muted-foreground'
          )}>
            {count}
          </span>
        )}
      </button>
    )
  }

  const activeLoading = mode === 'reactif' ? dataLoading : proDataLoading
  const activeElapsed = mode === 'reactif' ? elapsed : proElapsed
  const activeMs = mode === 'reactif' ? rowsMs : proMs

  return (
    <>
      <Head title="Suivi des allocations & expéditions" />
      <div className="theme-navy flex h-screen flex-col overflow-hidden bg-background text-foreground">
        <Masthead
          subtitle="Suivi · Allocation & expédition"
          active="tracking"
          meta={
            <>
              <div className="font-sans text-[12px] font-bold capitalize not-italic text-brand">
                {refLabel}
              </div>
              <div>
                <b className="font-bold text-foreground">
                  {mode === 'reactif' ? view.total : proView.total}
                </b>{' '}
                lignes ouvertes
              </div>
            </>
          }
          actions={
            // Carbon Search — icône intégrée, plus de div+input custom.
            // id requis par Carbon ; `placeholder`/`searchWidth` sont dépréciés côté
            // Carbon (no-op silencieux → placeholder jamais affiché, largeur retombe
            // à 100 % du conteneur) : `aria-label` remplace le placeholder (a11y).
            // `inputWidth` (remplaçant docs de `searchWidth`) est un % (number), pas
            // un px — inutilisable ici sans `label` ; on fixe la largeur par className.
            <Search
              id="suivi-query"
              size="small"
              value={query}
              onChange={(ev: any) => setQuery(ev.target.value)}
              aria-label="Commande, article, client…"
              className="w-[220px]"
            />
          }
        />

        {/* ═══ Toolbar ═══ */}
        <div className="flex flex-none items-center gap-2.5 border-b border-rule px-7 py-2 select-none">
          <div className="flex min-w-0 flex-1 items-center gap-2.5 overflow-x-auto no-scrollbar">
            {/* Bascule Réactif / Proactif — Carbon ButtonToggleGroup (single-select).
                size="small" (32px) : sans ça le group retombe sur "medium" (40px) par
                défaut, dépareillé du bouton Actualiser (déjà small) et des chips
                custom (~26px) juste à côté dans la même rangée — cf toolbar #77. */}
            {/* shrink-0 : sans ça, ButtonToggleGroup (seul enfant de la rangée sans
                shrink-0, contrairement aux groupes de chips voisins) se fait comprimer
                par le flex parent quand la toolbar déborde — son wrapper interne
                (flex-wrap: wrap) bascule alors Proactif sous Réactif au lieu de côte à côte. */}
            <div className="shrink-0">
              <ButtonToggleGroup
                id="suivi-mode-toggle"
                size="small"
                value={mode}
                onChange={(_ev, val) => { if (val) setMode(val as 'reactif' | 'proactif') }}
                aria-label="Mode de suivi"
              >
                <ButtonToggle value="reactif" allowDeselect={false}>Réactif</ButtonToggle>
                <ButtonToggle value="proactif" allowDeselect={false}>Proactif</ButtonToggle>
              </ButtonToggleGroup>
            </div>
            
            {mode === 'reactif' ? (
              <div className="inline-flex shrink-0 items-center gap-1 rounded-md border border-rule bg-card p-0.5">
                <span className="px-1.5 font-mono text-[9px] font-bold tracking-wider text-muted-foreground">
                  Statut
                </span>
                {statusChip('all', 'Tous', view.total)}
                {statusChip('ret', 'Retard', view.statusCounts.RETARD_PROD)}
                {statusChip('alc', 'À allouer', view.statusCounts.ALLOCATION_A_FAIRE)}
                {statusChip('exp', 'À expédier', view.statusCounts.A_EXPEDIER)}
              </div>
            ) : (
              <div className="inline-flex shrink-0 items-center gap-1 rounded-md border border-rule bg-card p-0.5">
                <span className="px-1.5 font-mono text-[9px] font-bold tracking-wider text-muted-foreground">
                  Verdict
                </span>
                {verdictChip('all', 'Tous', proView.total)}
                {verdictChip('blocked', 'Bloquée', proView.verdictCounts.blocked)}
                {verdictChip('uncov', 'Sans couverture', proView.verdictCounts.uncov)}
                {verdictChip('late', 'Retard', proView.verdictCounts.late)}
                {verdictChip('risk', 'À risque', proView.verdictCounts.risk)}
              </div>
            )}
            
            <div className="inline-flex shrink-0 items-center gap-1 rounded-md border border-rule bg-card p-0.5">
              <span className="px-1.5 font-mono text-[9px] font-bold tracking-wider text-muted-foreground">
                Type
              </span>
              {['MTS', 'MTO', 'NOR'].map((t) => (
                <button
                  key={t}
                  type="button"
                  className={cn(
                    "rounded-[5px] px-2 py-1 font-mono text-[10px] font-bold tracking-wider transition-colors",
                    typeFilter.has(t) ? 'bg-brand-soft text-brand' : 'text-muted-foreground hover:text-foreground'
                  )}
                  onClick={() => toggleType(t)}
                >
                  {t}
                </button>
              ))}
            </div>

            {/* Filtre atelier chips */}
            {ateliers && ateliers.length > 0 && (
              <div className="inline-flex shrink-0 flex-nowrap items-center gap-1 rounded-md border border-rule bg-card p-0.5">
                <span className="px-1.5 font-mono text-[9px] font-bold tracking-wider text-muted-foreground">
                  Atelier
                </span>
                {ateliers.map((a) => (
                  <button
                    key={a.code}
                    type="button"
                    className={cn(
                      "rounded-[5px] px-2 py-1 font-mono text-[10px] font-bold tracking-wider transition-colors",
                      atelierFilter.has(a.code) ? 'bg-brand-soft text-brand' : 'text-muted-foreground hover:text-foreground'
                    )}
                    onClick={() => toggleAtelier(a.code)}
                    title={a.label}
                  >
                    {a.label.replace(/^ATELIER\s+/i, '')}
                  </button>
                ))}
                {atelierFilter.size > 0 && (
                  <button
                    type="button"
                    className="rounded-[5px] px-1.5 py-1 font-mono text-[10px] font-bold tracking-wider text-muted-foreground transition-colors hover:text-foreground"
                    onClick={() => setAtelierFilter(new Set())}
                    title="Réinitialiser le filtre atelier"
                  >
                    ✕
                  </button>
                )}
              </div>
            )}
          </div>
          
          <div className="ml-auto shrink-0 flex items-center gap-2">
            {isFiltered && (
              <span className="font-mono text-[11px] font-bold tabular-nums text-brand">
                {filteredCount} <span className="text-muted-foreground font-medium">/ {totalCount}</span>
              </span>
            )}
            
            {activeLoading && (
              <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                {fmtMs(activeElapsed)}
              </span>
            )}
            
            {!activeLoading && activeMs !== null && (
              <span
                className="font-mono text-[11px] tabular-nums text-muted-foreground/60"
                title="Durée dernier chargement X3"
              >
                {fmtMs(activeMs)}
              </span>
            )}
            
            {/* ButtonNext — iconType "refresh" natif. isLoading affiche le spinner
                Carbon (remplace le animate-spin manuel sur Material icon).
                variantType (pas buttonType, déprécié sur l'ancien Button). */}
            <Button
              variantType="tertiary"
              iconType="refresh"
              size="small"
              onClick={() => setBust((b) => b + 1)}
              disabled={activeLoading}
              aria-label="Recharger les données X3 (cache → re-fetch live)"
            >
              Actualiser
            </Button>
            
            {/* Carbon DateRange — datepicker intégré (fini le popover custom + Calendar).
                Locale fr-FR → format dd/mm/yyyy (configuré via I18nProvider dans app.tsx).
                value = [startStr, endStr] au format JJ/MM/AAAA.
                startDateProps/endDateProps size="small" (32px) : DateRange lui-même
                n'expose pas de `size`, mais le relaie à ses deux DateInput internes
                (DateInputProps hérite de TextboxProps sans omettre `size`) — sans ça
                les deux champs retombent en medium (40px), dépareillés du reste
                de la toolbar (mode toggle/Search/Actualiser, tous small). */}
            {/* DateRange Carbon — compact : labels inline ("Du"/"Au" à côté des
                inputs, pas au-dessus), champs en size=small + maxWidth serré pour
                tenir dans la toolbar sans débordement. startDateProps/endDateProps
                forwardent vers les DateInput internes (size + maxWidth natifs). */}
            <CarbonDateRange
              id="suivi-date-range"
              labelsInline
              startDateProps={{ size: 'small', maxWidth: '110px', labelInline: true }}
              endDateProps={{ size: 'small', maxWidth: '110px', labelInline: true }}
              value={[
                dateRange.start ? fmtFrDate(toIso(dateRange.start)) : '',
                dateRange.end ? fmtFrDate(toIso(dateRange.end)) : '',
              ]}
              onChange={(ev: any) => {
                const [s, e] = ev.target.value as [{ rawValue: string | null }, { rawValue: string | null }]
                // rawValue est en ISO (YYYY-MM-DD) si valide, null sinon.
                const start = s?.rawValue ? parseIso(s.rawValue) : null
                const end = e?.rawValue ? parseIso(e.rawValue) : null
                applyRange({ start, end })
              }}
              startLabel="Du"
              endLabel="Au"
            />
          </div>
        </div>

        {mode === 'reactif' ? (
          <ReactiveView
            view={view}
            filteredRows={reactiveFilteredRows}
            loading={dataLoading}
            error={!!dataError}
            onResetFilters={() => {
              setQuery('')
              setStatusFilter('all')
              setVerdictFilter('all')
              setTypeFilter(new Set(['MTS', 'MTO']))
              setAtelierFilter(new Set())
            }}
            onRowClick={(row: SuiviDisplayRow) => setSelectedRow({ type: 'reactif', row })}
            selectedRowKey={selectedRowKey}
          />
        ) : (
          <ProactiveView
            view={proView}
            filteredRows={proFilteredRows}
            loading={proDataLoading}
            error={!!proError}
            onResetFilters={() => {
              setQuery('')
              setStatusFilter('all')
              setVerdictFilter('all')
              setTypeFilter(new Set(['MTS', 'MTO']))
              setAtelierFilter(new Set())
            }}
            onRowClick={(row: ProactiveDisplayRow) => setSelectedRow({ type: 'proactif', row })}
            selectedRowKey={selectedRowKey}
          />
        )}

        {/* Drawer diagnostic de ligne avec Carbon React Sidebar */}
        <CarbonSidebar
          open={selectedRow !== null}
          onCancel={() => setSelectedRow(null)}
          header="Diagnostic de la ligne"
          subHeader="Détails opérationnels et goulets d'étranglement de la commande client."
          size="medium"
        >
          {selectedRow && (
            <div className="overflow-y-auto h-full px-2">
              <SuiviDetailSheet type={selectedRow.type} row={selectedRow.row} />
            </div>
          )}
        </CarbonSidebar>
      </div>
    </>
  )
}

export default Tracking
