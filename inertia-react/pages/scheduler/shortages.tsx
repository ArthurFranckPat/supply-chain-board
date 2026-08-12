/**
 * Page « Suivi des ruptures » (port React) — design system Cursor, harmonisée
 * avec les autres pages migrées (toolbar unifiée ui/toolbar).
 *
 * Shell Inertia instantané (SchedulerController.shortageTracker) ; les lignes (calcul
 * lourd : faisabilité + réceptions) chargées en différé par fetch JSON (shortageRows).
 * Deux vues d'une même donnée : « Registre » (table éditoriale) et « Par composant »
 * (agrégation dégâts).
 */
import { useMemo, useState } from 'react'
import { router } from '@inertiajs/react'
import type { DateRange as DayPickerRange } from 'react-day-picker'
import { TriangleAlert, CircleX } from 'lucide-react'
import { LoadingState } from '@r/components/ui/loading-state'
import { DynamicIcon } from '../../components/ui/dynamic-icon'

import AppLayout from '@r/layouts/app'
import { OfDetailSheet } from '@r/components/of/of-detail-sheet'
import { useTimedFetch } from '@r/lib/suivi/use-timed-fetch'
import { ShortageRegistre, ShortageComposants } from '@r/components/shortages'
import {
  Toolbar,
  ToolbarSegmented,
  ToolbarSegment,
  ToolbarSearch,
  ToolbarRefresh,
  ToolbarSpacer,
  ToolbarDateWindow,
  ToolbarFilterMenu,
  ToolbarFilterChip,
} from '@r/components/ui/toolbar'
import { route } from '@r/lib/routes'
import { parseIso, toIso, startOfDay, DAY_MS } from '@r/lib/vision/date-utils'
import type { ShortageRowsResponse, ShortageVerdictKey } from '@r/lib/shortages/types'

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
  const [mode, setMode] = useState<'registre' | 'composants'>('registre')
  const [query, setQuery] = useState('')
  const [verdictFilter, setVerdictFilter] = useState<ShortageVerdictKey | 'all'>('all')
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

  const applyRange = (r: DayPickerRange) => {
    const next: DateRange = { start: r.from ?? null, end: r.to ?? null }
    setRange(next)
    if (!next.start || !next.end) return
    const span = Math.round(
      (startOfDay(next.end).getTime() - startOfDay(next.start).getTime()) / DAY_MS
    )
    const days = Math.min(MAX_HORIZON, Math.max(MIN_HORIZON, span))
    window.location.href =
      route('scheduler.shortage_tracker') + `?start=${toIso(next.start)}&days=${days}`
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
    <div className="flex flex-1 items-center justify-center p-10 text-center text-[14px] text-muted-foreground">
      <div className="flex flex-col items-center gap-2">
        <DynamicIcon
          name={viewData.x3Error ? 'cloud_off' : 'task_alt'}
          size={32}
          className="text-muted-foreground/50"
        />
        {viewData.x3Error
          ? 'Données indisponibles (X3 injoignable).'
          : 'Aucune rupture détectée dans la fenêtre.'}
      </div>
    </div>
  )

  const verdictChip = (k: ShortageVerdictKey | 'all', label: string, tone: 'critical' | 'warning' | 'ok' | 'neutral') => {
    const on = verdictFilter === k
    const count = k === 'all' ? viewData.rows.length : counts[k]
    return (
      <ToolbarFilterChip
        key={k}
        label={label}
        count={count}
        tone={tone}
        active={on}
        onClick={() => setVerdictFilter(on ? 'all' : k)}
      />
    )
  }

  return (
    <AppLayout
      title="Ruptures"
      active="ruptures"
      subtitle="Ruptures · Couverture composants"
      theme="cursor"
      dense
      scrollable={false}
      meta={
        <>
          <div className="text-[12px] font-medium capitalize text-foreground">
            {props.dateRange}
          </div>
          <div>
            <b className="font-semibold text-foreground">{viewData.stats.nbRuptures}</b> ruptures ·
            horizon <b className="font-semibold text-foreground">+{props.horizon} j</b>
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
        <Toolbar>
          {/* Bascule Registre / Par composant */}
          <ToolbarSegmented semantics="tabs" aria-label="Vue">
            {(
              [
                ['registre', 'Registre', 'Table éditoriale : une ligne par composant × OF bloqué'],
                [
                  'composants',
                  'Par composant',
                  "Agrégation : quel composant bloque le plus d'OF ?",
                ],
              ] as const
            ).map(([key, label, title]) => (
              <ToolbarSegment
                key={key}
                active={mode === key}
                title={title}
                onClick={() => setMode(key)}
              >
                {label}
              </ToolbarSegment>
            ))}
          </ToolbarSegmented>

          {/* Fenêtre — sélecteur de plage */}
          <ToolbarDateWindow
            value={range.start && range.end ? { from: range.start, to: range.end } : undefined}
            onCommit={applyRange}
            title="Fenêtre d'analyse : OF dont le démarrage tombe dans la plage"
          />

          {/* Filtre verdict — déclencheur unique. */}
          <ToolbarFilterMenu
            label="Verdict"
            activeCount={verdictFilter !== 'all' ? 1 : 0}
          >
            <ToolbarSegmented flat semantics="toggles" className="flex-wrap">
              {verdictChip('all', 'Tous', 'neutral')}
              {verdictChip('sans_couverture', 'Sans couv.', 'critical')}
              {verdictChip('sous_ensemble', 'S/E', 'warning')}
              {verdictChip('retard', 'Retard', 'critical')}
              {verdictChip('a_risque', 'À risque', 'warning')}
              {verdictChip('couvert', 'Couvert', 'ok')}
            </ToolbarSegmented>
          </ToolbarFilterMenu>

          <ToolbarSpacer />

          {/* Recherche — systématiquement à droite (convention toolbar). */}
          <ToolbarSearch
            value={query}
            onChange={setQuery}
            placeholder="Composant, OF, commande, fournisseur…"
          />
          <ToolbarRefresh
            onClick={() =>
              router.visit(
                `${route('scheduler.shortage_tracker')}?start=${props.windowStart}&days=${props.horizon}&refresh=1`
              )
            }
          />
        </Toolbar>

        {/* ═══ X3 injoignable ═══ */}
        {viewData.x3Error && (
          <div className="flex flex-none items-center gap-2 border-b border-destructive/30 bg-destructive/10 px-7 py-2 text-[12px] text-foreground">
            <TriangleAlert size={16} strokeWidth={1.75} className="text-destructive" />
            <span className="font-bold">Erreur chargement ruptures :</span>
            <span className="font-mono">{viewData.x3Error}</span>
          </div>
        )}

        {/* ═══ OF à solder (offre fantôme écartée du calcul) ═══ */}
        {(viewData.phantomOfs?.length ?? 0) > 0 && (
          <div className="flex flex-none items-start gap-2 border-b border-suggere/30 bg-suggere/10 px-7 py-2 text-[12px] text-foreground">
            <TriangleAlert size={16} strokeWidth={1.75} className="mt-px text-suggere" />
            <div className="min-w-0">
              <span className="font-bold">{viewData.phantomOfs!.length} OF à solder</span>{' '}
              <span className="text-muted-foreground">
                — gamme pointée en totalité, reste annoncé non produit. Écartés de la couverture.
              </span>
              <div className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
                {viewData
                  .phantomOfs!.slice(0, 8)
                  .map((p) => `${p.numOf} (${p.article}, reste ${p.qteRestante})`)
                  .join(' · ')}
                {viewData.phantomOfs!.length > 8 && ` · +${viewData.phantomOfs!.length - 8}`}
              </div>
            </div>
          </div>
        )}

        {/* ═══ Vue active ═══ */}
        {loading && !data ? (
          <LoadingState
            className="flex-1"
            variant="orb"
            orbState="searching"
            title="Calcul des ruptures…"
          />
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
          </div>
        )}
      </div>

      <OfDetailSheet num={selectedOf} open={detailOpen} onOpenChange={setDetailOpen} />
    </AppLayout>
  )
}
