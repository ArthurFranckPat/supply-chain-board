/**
 * Page « Suivi des ruptures » (port React) — design system « Papier », harmonisée
 * avec /suivi (masthead FactoryOS, bandeau KPI, toolbar à bascule).
 *
 * Shell Inertia instantané (SchedulerController.shortageTracker) ; les lignes (calcul
 * lourd : faisabilité + réceptions) chargées en différé par fetch JSON (shortageRows).
 * Trois vues d'une même donnée : « Registre » (table éditoriale), « Par composant »
 * (agrégation dégâts) et « Couverture » (frise réception ↔ expédition).
 */
import { useMemo, useState } from 'react'
import type { DateRange as DayPickerRange } from 'react-day-picker'
import { Search, TriangleAlert, LoaderCircle, CircleX } from 'lucide-react'
import { DynamicIcon } from '../../components/ui/dynamic-icon'

import AppLayout from '@r/layouts/app'
import { OfDetailSheet } from '@r/components/of/of-detail-sheet'
import { useTimedFetch } from '@r/lib/suivi/use-timed-fetch'
import { ShortageRegistre, ShortageComposants, ShortageTimeline } from '@r/components/shortages'
import {
  PILL,
  Segment,
  SegmentButton,
  DateWindowPill,
  RefreshPill,
  ToolbarRow,
  ToolbarSpacer,
  FilterMenu,
} from '@r/components/vision/toolbar'
import { route } from '@/lib/routes'
import { parseIso, toIso, startOfDay, DAY_MS } from '@/lib/vision/date-utils'
import type { ShortageRowsResponse, ShortageVerdictKey } from '@/lib/shortages/types'

const fold = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

/** Bornes serveur du paramètre `days` (cf. SchedulerController.shortageTracker). */
const MIN_HORIZON = 1
const MAX_HORIZON = 90

const EMPTY: ShortageRowsResponse = {
  rows: [],
  stats: { nbRuptures: 0, nbCouvertes: 0, nbSansCouverture: 0 },
  x3Error: null,
}

interface ShortagesProps {
  horizon: number
  windowStart: string
  dateRange: string
  rowsHref: string
}

interface DateRange {
  start: Date | null
  end: Date | null
}

export default function Shortages(props: ShortagesProps) {
  const [mode, setMode] = useState<'registre' | 'composants' | 'couverture'>('registre')
  const [query, setQuery] = useState('')
  const [verdictFilter, setVerdictFilter] = useState<ShortageVerdictKey | 'all'>('all')
  const [calOpen, setCalOpen] = useState(false)
  const [selectedOf, setSelectedOf] = useState<string | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)

  // Fenêtre d'analyse : sélecteur de plage.
  const startInitial = useMemo(() => parseIso(props.windowStart), [props.windowStart])
  const windowEnd = useMemo(() => {
    if (!startInitial) return null
    const d = new Date(startInitial)
    d.setDate(d.getDate() + props.horizon)
    return d
  }, [startInitial, props.horizon])

  const [range, setRange] = useState<DateRange>({
    start: startInitial,
    end: windowEnd,
  })

  const applyRange = (r: DayPickerRange | undefined) => {
    const next: DateRange = { start: r?.from ?? null, end: r?.to ?? null }
    setRange(next)
    if (!next.start || !next.end) return
    setCalOpen(false)
    const span = Math.round((startOfDay(next.end).getTime() - startOfDay(next.start).getTime()) / DAY_MS)
    const days = Math.min(MAX_HORIZON, Math.max(MIN_HORIZON, span))
    window.location.href = route('scheduler.shortage_tracker') + `?start=${toIso(next.start)}&days=${days}`
  }

  // Fetch des données
  const { data, loading, error } = useTimedFetch<ShortageRowsResponse>(props.rowsHref)
  const viewData = data ?? EMPTY

  // Filtrage par recherche + verdict
  const filteredRows = useMemo(() => {
    const all = viewData.rows
    const q = fold(query)
    const vf = verdictFilter
    let r = vf === 'all' ? all : all.filter((row) => row.verdictKey === vf)
    if (q) r = r.filter((row) => row.filter.includes(q))
    return r
  }, [viewData.rows, query, verdictFilter])

  // Vue Couverture : tri chronologique par date d'expédition (nulls en fin).
  const timelineRows = useMemo(() => {
    return [...filteredRows].sort((a, b) => {
      const da = a.dateExpeditionIso ?? '9999-12-31'
      const db = b.dateExpeditionIso ?? '9999-12-31'
      return da < db ? -1 : da > db ? 1 : 0
    })
  }, [filteredRows])

  // Compteurs KPI (dérivés des lignes, indépendants des filtres).
  const counts = useMemo(() => {
    const c = { couvert: 0, a_risque: 0, retard: 0, sans_couverture: 0, sous_ensemble: 0 }
    for (const r of viewData.rows) c[r.verdictKey]++
    return c
  }, [viewData.rows])

  const onSelectOf = (num: string) => {
    setSelectedOf(num)
    setDetailOpen(true)
  }

  const emptyState = (
    <div className="flex flex-1 items-center justify-center p-10 text-center font-fraunces text-[14px] italic text-muted-foreground">
      <div className="flex flex-col items-center gap-2">
        <DynamicIcon name={viewData.x3Error ? 'cloud_off' : 'task_alt'} size={32} className="text-muted-foreground/50" />
        {viewData.x3Error
          ? 'Données indisponibles (X3 injoignable).'
          : 'Aucune rupture détectée dans la fenêtre.'}
      </div>
    </div>
  )

  const verdictChip = (k: ShortageVerdictKey | 'all', label: string) => {
    const on = verdictFilter === k
    const count = k === 'all' ? viewData.rows.length : counts[k]
    return (
      <SegmentButton key={k} active={on} onClick={() => setVerdictFilter(on ? 'all' : k)}>
        {label}
        {count > 0 && <span className="ml-1 opacity-60">{count}</span>}
      </SegmentButton>
    )
  }

  return (
      <AppLayout
        title="Ruptures"
        active="ruptures"
        subtitle="Ruptures · Couverture composants"
        theme="airbnb"
        dense
        scrollable={false}
        meta={
          <>
            <div className="font-fraunces text-[12px] font-bold capitalize not-italic text-brand">
              {props.dateRange}
            </div>
            <div>
              <b className="font-bold text-foreground">{viewData.stats.nbRuptures}</b> ruptures · horizon{' '}
              <b className="font-bold text-foreground">+{props.horizon} j</b>
            </div>
          </>
        }
      >
      {/* AppLayout (dense, scrollable=false) rend ses children en flux bloc
          normal (pas de flex-col) : sans ce wrapper, les `flex-1`/`h-full` de
          la toolbar et de la vue en dessous ne se dimensionnent contre rien
          et la table déborde hors de l'écran sans scroll possible. */}
      <div className="flex h-full min-h-0 flex-col">
        {/* ═══ Toolbar ═══ */}
        <ToolbarRow>
          {/* Bascule Registre / Par composant / Couverture */}
          <Segment role="radiogroup" ariaLabel="Vue">
            {(
              [
                ['registre', 'Registre', 'Table éditoriale : une ligne par composant × OF bloqué'],
                ['composants', 'Par composant', 'Agrégation : quel composant bloque le plus d\'OF ?'],
                [
                  'couverture',
                  'Couverture',
                  'Frise temporelle : réception couvrante ↔ date d\'expédition',
                ],
              ] as const
            ).map(([key, label, title]) => (
              <SegmentButton key={key} role="radio" active={mode === key} title={title} onClick={() => setMode(key)}>
                {label}
              </SegmentButton>
            ))}
          </Segment>

          {/* Fenêtre — sélecteur de plage */}
          <DateWindowPill
            open={calOpen}
            onOpenChange={setCalOpen}
            selected={{ from: range.start ?? undefined, to: range.end ?? undefined }}
            onSelect={applyRange}
            title="Fenêtre d'analyse : OF dont le démarrage tombe dans la plage"
          />

          {/* Filtre verdict — déclencheur unique (6 chips empilaient trop
              large la rangée sur écran étroit). */}
          <FilterMenu
            label="Verdict"
            indicators={
              verdictFilter !== 'all' ? (
                <span className="ml-0.5 size-1.5 rounded-full bg-brand" aria-hidden="true" />
              ) : null
            }
          >
            <Segment className="w-full flex-wrap">
              {verdictChip('all', 'Tous')}
              {verdictChip('sans_couverture', 'Sans couv.')}
              {verdictChip('sous_ensemble', 'S/E')}
              {verdictChip('retard', 'Retard')}
              {verdictChip('a_risque', 'À risque')}
              {verdictChip('couvert', 'Couvert')}
            </Segment>
          </FilterMenu>

          <ToolbarSpacer />

          {/* Recherche — systématiquement à droite (convention toolbar). */}
          <div className={PILL}>
            <Search size={17} strokeWidth={1.75} className="text-muted-foreground" />
            <input
              className="w-[200px] border-0 bg-transparent px-0 text-xs font-medium text-foreground shadow-none outline-none"
              placeholder="Composant, OF, commande, fournisseur…"
              type="text"
              autoComplete="off"
              value={query}
              onChange={(e) => setQuery(e.currentTarget.value)}
            />
          </div>
          <RefreshPill
            href={`${route('scheduler.shortage_tracker')}?start=${props.windowStart}&days=${props.horizon}&refresh=1`}
          />
        </ToolbarRow>

        {/* ═══ X3 injoignable ═══ */}
        {viewData.x3Error && (
          <div className="flex flex-none items-center gap-2 border-b border-destructive/30 bg-destructive/10 px-7 py-2 text-[12px] text-foreground">
            <TriangleAlert size={16} strokeWidth={1.75} className="text-destructive" />
            <span className="font-bold">Erreur chargement ruptures :</span>
            <span className="font-mono">{viewData.x3Error}</span>
          </div>
        )}

        {/* ═══ Vue active ═══ */}
        {loading && !data ? (
          <div className="flex flex-1 items-center justify-center gap-2 text-muted-foreground">
            <LoaderCircle size={20} strokeWidth={1.75} className="animate-spin" />
            <span className="text-[13px] font-medium">Calcul des ruptures…</span>
          </div>
        ) : error ? (
          <div className="flex flex-1 items-center justify-center gap-2 text-[13px] text-destructive">
            <CircleX size={20} strokeWidth={1.75} className="text-destructive" />
            Échec du calcul des ruptures.
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-hidden p-5">
            {mode === 'registre' && (
              <ShortageRegistre
                rows={filteredRows}
                onSelectOf={onSelectOf}
                emptyState={emptyState}
              />
            )}
            {mode === 'composants' && (
              <ShortageComposants
                rows={filteredRows}
                onSelectOf={onSelectOf}
                emptyState={emptyState}
              />
            )}
            {mode === 'couverture' && (
              <ShortageTimeline
                rows={timelineRows}
                windowStartIso={props.windowStart}
                horizon={props.horizon}
                onSelectOf={onSelectOf}
                emptyState={emptyState}
              />
            )}
          </div>
        )}
      </div>

        <OfDetailSheet num={selectedOf} open={detailOpen} onOpenChange={setDetailOpen} />
    </AppLayout>
  )
}
