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
import { Link } from '@inertiajs/react'
import { fr } from 'react-day-picker/locale'
import type { DateRange as DayPickerRange } from 'react-day-picker'
import { Search, RefreshCw, Calendar as CalendarIcon, ChevronDown, TriangleAlert, LoaderCircle, CircleX } from 'lucide-react'
import { DynamicIcon } from '../../components/ui/dynamic-icon'

import AppLayout from '@r/layouts/app'
import { Calendar } from '@r/components/ui/calendar'
import { OfDetailSheet } from '@r/components/of/of-detail-sheet'
import { useTimedFetch } from '@r/lib/suivi/use-timed-fetch'
import { cn } from '@r/lib/utils'
import { ShortageRegistre, ShortageComposants, ShortageTimeline } from '@r/components/shortages'
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
      <button
        type="button"
        className={cn(
          'rounded-[5px] px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider transition-colors',
          on ? 'bg-brand-soft text-brand' : 'text-muted-foreground hover:text-foreground'
        )}
        onClick={() => setVerdictFilter(on ? 'all' : k)}
      >
        {label}
        {count > 0 && (
          <span className="ml-1 opacity-60">{count}</span>
        )}
      </button>
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
        {/* ═══ Toolbar ═══ */}
        <div className="flex flex-none flex-wrap items-center gap-2.5 border-b border-rule px-7 py-2">
          {/* Bascule Registre / Par composant / Couverture */}
          <div className="inline-flex items-center rounded-md border border-rule bg-card p-0.5">
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
              <button
                key={key}
                type="button"
                className={cn(
                  'rounded-[5px] px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider transition-colors',
                  mode === key
                    ? 'bg-brand-soft text-brand'
                    : 'text-muted-foreground hover:text-foreground'
                )}
                onClick={() => setMode(key)}
                title={title}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Filtre verdict */}
          <div className="inline-flex items-center gap-1 rounded-md border border-rule bg-card p-0.5">
            <span className="px-1.5 font-mono text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
              Verdict
            </span>
            {verdictChip('all', 'Tous')}
            {verdictChip('sans_couverture', 'Sans couv.')}
            {verdictChip('sous_ensemble', 'S/E')}
            {verdictChip('retard', 'Retard')}
            {verdictChip('a_risque', 'À risque')}
            {verdictChip('couvert', 'Couvert')}
          </div>

          {/* Fenêtre — sélecteur de plage */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setCalOpen((o) => !o)}
              className="flex items-center gap-1.5 rounded-full border border-rule bg-card px-2.5 py-1 text-[11px] font-semibold text-foreground transition-colors hover:border-brand"
              title="Fenêtre d'analyse : OF dont le démarrage tombe dans la plage"
            >
              <CalendarIcon size={14} strokeWidth={1.75} className="text-muted-foreground" />
              {props.dateRange}
              <ChevronDown size={16} strokeWidth={1.75} className="text-muted-foreground" />
            </button>
            {calOpen && (
              <>
                <button
                  type="button"
                  tabIndex={-1}
                  aria-hidden="true"
                  className="fixed inset-0 z-40 cursor-default"
                  onClick={() => setCalOpen(false)}
                />
                <div className="absolute left-0 top-full z-50 mt-2">
                  <Calendar mode="range" locale={fr} numberOfMonths={2} selected={{
                    from: range.start ?? undefined,
                    to: range.end ?? undefined,
                  }} onSelect={applyRange} />
                </div>
              </>
            )}
          </div>

          <div className="ml-auto flex items-center gap-2">
            {/* Recherche — systématiquement à droite (convention toolbar). */}
            <div className="flex h-[30px] items-center gap-1.5 rounded-full border border-rule bg-card px-3 transition-shadow focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/25">
              <Search size={17} strokeWidth={1.75} className="text-muted-foreground" />
              <input
                className="w-[200px] border-0 bg-transparent px-0 text-[12px] font-medium text-foreground shadow-none outline-none"
                placeholder="Composant, OF, commande, fournisseur…"
                type="text"
                autoComplete="off"
                value={query}
                onChange={(e) => setQuery(e.currentTarget.value)}
              />
            </div>
            <Link
              href={`${route('scheduler.shortage_tracker')}?start=${props.windowStart}&days=${props.horizon}&refresh=1`}
              className="inline-flex items-center gap-1 rounded-full border border-rule bg-card px-3 py-1 text-[11px] font-semibold transition-colors hover:border-brand"
              title="Recharger les données X3 (cache → re-fetch live)"
            >
              <RefreshCw size={14} strokeWidth={1.75} className="text-muted-foreground" />
              Actualiser
            </Link>
          </div>
        </div>

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
          <div className="flex-1 overflow-hidden p-5">
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

        <OfDetailSheet num={selectedOf} open={detailOpen} onOpenChange={setDetailOpen} />
    </AppLayout>
  )
}
