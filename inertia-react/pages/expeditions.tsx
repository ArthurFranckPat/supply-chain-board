import { useMemo, useState } from 'react'
import { fr } from 'react-day-picker/locale'
import type { DateRange as DayPickerRange } from 'react-day-picker'

import AppLayout from '@r/layouts/app'
import { Calendar } from '@r/components/ui/calendar'
import { CamionDetailSheet, type CamionDtl } from '@r/components/expeditions/camion-detail-sheet'
import { ManifesteView, type ManifesteSort } from '@r/components/expeditions/manifeste-view'
import { FriseView } from '@r/components/expeditions/frise-view'
import { useTimedFetch } from '@r/lib/suivi/use-timed-fetch'
import { cn } from '@r/lib/utils'

/**
 * Page « Expéditions » (issue #44) — port React iso du Solid
 * inertia/pages/expeditions.tsx. Onglet dédié aux expéditions client (STOJOU
 * TRSTYP_0=4). Deux vues : Manifeste (cartes camion) + Frise (timeline).
 *
 * Coquille Inertia instantanée ; le calcul lourd (X3 + clustering camion) est
 * chargé en différé via useTimedFetch sur rowsHref.
 */

type ViewMode = 'manifeste' | 'frise'

interface ExpeditionKpi {
  label: string
  totalUc: number
  nbCamions: number
  gapMinutes: number
  maxPalettesCamion: number
  camionCapacitePalettes: number
  camions: CamionDtl[]
}
interface ExpeditionsRowsResponse {
  expeditions: ExpeditionKpi
  x3Error: string | null
}
interface ExpeditionsPageProps {
  referenceDate: string
  rowsHref: string
  defaultGapMinutes: number
  maxPalettesCamion: number
}

const EMPTY = (defaultGapMinutes: number, maxPalettesCamion: number): ExpeditionsRowsResponse => ({
  expeditions: {
    label: '',
    totalUc: 0,
    nbCamions: 0,
    gapMinutes: defaultGapMinutes,
    maxPalettesCamion,
    camionCapacitePalettes: 33,
    camions: [],
  },
  x3Error: null,
})

const fold = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

/** Tiebreaker primaire : les navettes (source de vérité) précèdent toujours les
 *  clusters heuristiques, quel que soit le tri choisi (issue #44 affinage). */
const srcRank = (c: CamionDtl) => (c.source === 'navette' ? 0 : 1)

/** Tri applicable à la vue manifeste (la frise reste triée par heure). */
function sortRows(rows: CamionDtl[], sort: ManifesteSort): CamionDtl[] {
  const out = [...rows]
  if (sort === 'time') {
    out.sort((a, b) => srcRank(a) - srcRank(b) || a.debut.localeCompare(b.debut))
  } else if (sort === 'load') {
    out.sort((a, b) => srcRank(a) - srcRank(b) || b.nbPalettes - a.nbPalettes)
  } else {
    out.sort((a, b) => srcRank(a) - srcRank(b) || a.client.localeCompare(b.client))
  }
  return out
}

const fmtMs = (ms: number) => (ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`)

const fmtDay = (d: Date) =>
  `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`

interface DateRangeSel {
  start: Date | null
  end: Date | null
}

export default function Expeditions(props: ExpeditionsPageProps) {
  const [range, setRange] = useState<DateRangeSel | null>(null)
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [gapMin, setGapMin] = useState<number | null>(null)
  const [query, setQuery] = useState('')
  const [anomalyOnly, setAnomalyOnly] = useState(false)
  const [bust, setBust] = useState(0)
  const [view, setView] = useState<ViewMode>('manifeste')
  const [mSort, setMSort] = useState<ManifesteSort>('time')
  const [selectedCamion, setSelectedCamion] = useState<CamionDtl | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)

  const rangeLabel = useMemo(() => {
    if (!range?.start) return null
    if (!range.end || range.start.toDateString() === range.end.toDateString())
      return fmtDay(range.start)
    return `${fmtDay(range.start)} → ${fmtDay(range.end)}`
  }, [range])

  const url = useMemo(() => {
    let u = props.rowsHref
    if (range?.start) {
      const fmt = (d: Date) => d.toISOString().slice(0, 10)
      u += `&expFrom=${fmt(range.start)}&expTo=${fmt(range.end ?? range.start)}`
    }
    if (gapMin !== null) u += `&expGapMin=${gapMin}`
    if (bust) u += `&refresh=${bust}`
    return u
  }, [props.rowsHref, range, gapMin, bust])

  const { data, loading, error, ms, elapsed } = useTimedFetch<ExpeditionsRowsResponse>(url)

  const viewData = data ?? EMPTY(props.defaultGapMinutes, props.maxPalettesCamion)
  const exp = viewData.expeditions
  const x3Error = viewData.x3Error

  // gap effectif = override utilisateur, sinon valeur serveur, sinon défaut.
  const gapEff = gapMin ?? exp.gapMinutes ?? props.defaultGapMinutes

  const baseRows = useMemo(() => {
    const q = fold(query)
    let rows = exp.camions
    if (q) rows = rows.filter((c) => fold(c.client).includes(q) || fold(c.bprnum).includes(q))
    if (anomalyOnly) rows = rows.filter((c) => c.anomalie)
    return rows
    // exp dérive de data — pas besoin de le lister (réf change au fetch).
  }, [query, anomalyOnly, exp])

  const manifesteRows = useMemo(() => sortRows(baseRows, mSort), [baseRows, mSort])
  const friseRows = useMemo(() => sortRows(baseRows, 'time'), [baseRows])

  const openCamion = (c: CamionDtl) => {
    setSelectedCamion({ ...c, maxPalettesCamion: exp.maxPalettesCamion })
    setDetailOpen(true)
  }

  const applyRange = (r: DayPickerRange | undefined) => {
    const next: DateRangeSel = { start: r?.from ?? null, end: r?.to ?? null }
    setRange(next)
    if (next.start && next.end) setCalendarOpen(false)
  }

  const hasContent = baseRows.length > 0 || !!x3Error
  const gapStep = (delta: number) => setGapMin((v) => Math.max(0, (v ?? gapEff) + delta))

  return (
    <AppLayout
      title="Expéditions"
      active="expeditions"
      subtitle="Expéditions · Livraisons client"
      theme="airbnb"
      dense
      scrollable={false}
      meta={
        <>
          <div className="font-fraunces text-[12px] font-bold capitalize not-italic text-brand">
            {exp.label || '—'}
          </div>
          <div>
            <b className="font-bold text-foreground">{exp.nbCamions}</b> camion
            {exp.nbCamions > 1 ? 's' : ''}
          </div>
        </>
      }
    >

        {/* ═══ Toolbar ═══ */}
        <div className="flex flex-none flex-wrap items-center gap-2.5 border-b border-rule px-7 py-2">
          {/* Sélecteur de plage */}
          <div className="relative">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setCalendarOpen((v) => !v)}
                className="flex items-center gap-1.5 rounded border border-rule bg-card px-2.5 py-1.5 font-mono text-[11px] text-foreground transition-colors hover:bg-secondary/60"
              >
                <span className="material-symbols-outlined text-[14px] text-muted-foreground">
                  calendar_today
                </span>
                <span>{rangeLabel ?? 'J-1'}</span>
              </button>
              {range?.start && (
                <button
                  type="button"
                  onClick={() => {
                    setRange(null)
                    setCalendarOpen(false)
                  }}
                  className="flex size-6 items-center justify-center rounded text-muted-foreground hover:text-foreground"
                  title="Réinitialiser"
                >
                  <span className="material-symbols-outlined text-[14px]">close</span>
                </button>
              )}
            </div>
            {calendarOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setCalendarOpen(false)} />
                <div className="absolute left-0 top-full z-20 mt-1">
                  <Calendar
                    mode="range"
                    locale={fr}
                    numberOfMonths={2}
                    selected={{
                      from: range?.start ?? undefined,
                      to: range?.end ?? undefined,
                    }}
                    onSelect={applyRange}
                    disabled={{ after: new Date() }}
                  />
                </div>
              </>
            )}
          </div>

          {/* Tolérance de regroupement camion (issue #44) */}
          <div className="flex items-center gap-1 rounded-md border border-rule bg-card p-0.5">
            <span className="px-1.5 font-mono text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
              Regroupement
            </span>
            <button
              type="button"
              onClick={() => gapStep(-1)}
              className="flex size-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              title="Diminuer la tolérance"
              aria-label="Diminuer la tolérance"
            >
              <span className="material-symbols-outlined text-[13px]">remove</span>
            </button>
            <span className="min-w-[48px] text-center font-mono text-[10px] font-bold tabular-nums text-foreground">
              ± {gapEff} min
            </span>
            <button
              type="button"
              onClick={() => gapStep(1)}
              className="flex size-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              title="Augmenter la tolérance"
              aria-label="Augmenter la tolérance"
            >
              <span className="material-symbols-outlined text-[13px]">add</span>
            </button>
          </div>

          {/* Filtre anomalies */}
          <button
            type="button"
            onClick={() => setAnomalyOnly((v) => !v)}
            className={cn(
              'flex items-center gap-1 rounded-md border px-2.5 py-1.5 font-mono text-[10px] font-bold uppercase tracking-wider transition-colors',
              anomalyOnly
                ? 'border-destructive/40 bg-destructive/10 text-destructive'
                : 'border-rule bg-card text-muted-foreground hover:text-foreground'
            )}
          >
            <span className="material-symbols-outlined text-[13px]">warning</span>
            Anomalies seules
          </button>

          <div className="ml-auto flex items-center gap-2">
            {/* Recherche — systématiquement à droite (convention toolbar). */}
            <div className="flex h-[30px] items-center gap-1.5 rounded-full border border-rule bg-card px-3 transition-shadow focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/25">
              <span className="material-symbols-outlined text-[17px] text-muted-foreground">search</span>
              <input
                className="w-[160px] border-0 bg-transparent px-0 text-[12px] font-medium text-foreground shadow-none outline-none"
                placeholder="Client…"
                type="text"
                autoComplete="off"
                value={query}
                onChange={(e) => setQuery(e.currentTarget.value)}
              />
            </div>
            {loading && (
              <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                {fmtMs(elapsed)}
              </span>
            )}
            {!loading && ms !== null && (
              <span
                className="font-mono text-[11px] tabular-nums text-muted-foreground/60"
                title="Durée dernier chargement X3"
              >
                {fmtMs(ms)}
              </span>
            )}
            <button
              type="button"
              onClick={() => setBust((b) => b + 1)}
              disabled={loading}
              className="inline-flex items-center gap-1 rounded-full border border-rule bg-card px-3 py-1 text-[11px] font-semibold transition-colors hover:border-brand disabled:opacity-50"
              title="Recharger les données X3"
            >
              <span
                className={cn(
                  'material-symbols-outlined text-[14px] text-muted-foreground',
                  loading && 'animate-spin'
                )}
              >
                refresh
              </span>
              Actualiser
            </button>
          </div>
        </div>

        {/* ═══ Toggle vue + tri manifeste ═══ */}
        <div className="flex flex-none items-center gap-2.5 border-b border-rule-soft px-7 py-1.5">
          <div className="flex items-center overflow-hidden rounded-md border border-rule bg-card">
            <ViewTab
              active={view === 'manifeste'}
              onClick={() => setView('manifeste')}
              icon="grid_view"
              label="Manifestes"
            />
            <ViewTab
              active={view === 'frise'}
              onClick={() => setView('frise')}
              icon="timeline"
              label="Frise de charge"
            />
          </div>

          {/* Tri segmenté — propre au manifeste */}
          {view === 'manifeste' && (
            <div className="flex items-center overflow-hidden rounded-md border border-rule bg-card">
              <SegTab active={mSort === 'time'} onClick={() => setMSort('time')} label="Par heure" />
              <SegTab active={mSort === 'load'} onClick={() => setMSort('load')} label="Par charge" />
              <SegTab
                active={mSort === 'client'}
                onClick={() => setMSort('client')}
                label="Par client"
              />
            </div>
          )}

          {/* Légende (frise) — paliers de taux de remplissage */}
          {view === 'frise' && (
            <div className="flex flex-wrap items-center gap-4 font-mono text-[10px] text-muted-foreground">
              <Legend sw="bg-ferme" label="Léger (&lt;45%)" />
              <Legend sw="bg-planifie" label="Normal (45–90%)" />
              <Legend sw="bg-suggere" label="Proche du max (90–100%)" />
              <Legend sw="bg-destructive" label="Débord (&gt;100%)" />
            </div>
          )}

          <span className="ml-auto font-mono text-[11px] text-muted-foreground">
            {baseRows.length} camion{baseRows.length > 1 ? 's' : ''}
          </span>
        </div>

        {/* ═══ X3 injoignable ═══ */}
        {x3Error && (
          <div className="flex flex-none items-center gap-2 border-b border-destructive/30 bg-destructive/10 px-7 py-2 text-[12px] text-foreground">
            <span className="material-symbols-outlined text-[16px] text-destructive">warning</span>
            <span className="font-bold">Erreur chargement expéditions :</span>
            <span className="font-mono">{x3Error}</span>
          </div>
        )}

        {/* ═══ Vue ═══ */}
        {loading ? (
          <div className="flex flex-1 items-center justify-center gap-2 text-muted-foreground">
            <span className="material-symbols-outlined animate-spin text-[20px]">
              progress_activity
            </span>
            <span className="text-[13px] font-medium">Calcul des expéditions…</span>
          </div>
        ) : error ? (
          <div className="flex flex-1 items-center justify-center gap-2 text-[13px] text-destructive">
            <span className="material-symbols-outlined text-[20px]">error</span>
            Échec du calcul des expéditions.
          </div>
        ) : hasContent ? (
          view === 'manifeste' ? (
            <ManifesteView
              rows={manifesteRows}
              maxPalettesCamion={exp.maxPalettesCamion}
              camionCapacitePalettes={exp.camionCapacitePalettes}
              selectedCamion={selectedCamion}
              onSelect={openCamion}
            />
          ) : (
            <FriseView
              rows={friseRows}
              maxPalettesCamion={exp.maxPalettesCamion}
              camionCapacitePalettes={exp.camionCapacitePalettes}
              selectedCamion={selectedCamion}
              onSelect={openCamion}
            />
          )
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-10 text-center">
            <span className="material-symbols-outlined text-[32px] text-muted-foreground/50">
              {x3Error ? 'cloud_off' : 'local_shipping'}
            </span>
            <span className="font-fraunces text-[14px] italic text-muted-foreground">
              {x3Error
                ? 'Données indisponibles (X3 injoignable).'
                : 'Aucune expédition sur la période.'}
            </span>
          </div>
        )}

        <CamionDetailSheet
          camion={selectedCamion}
          open={detailOpen}
          onOpenChange={setDetailOpen}
        />
    </AppLayout>
  )
}

/** Onglet de bascule de vue (manifeste / frise). */
function ViewTab({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: string
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-wider transition-colors',
        active ? 'bg-brand/10 text-brand' : 'text-muted-foreground hover:text-foreground'
      )}
    >
      <span className="material-symbols-outlined text-[14px]">{icon}</span>
      {label}
    </button>
  )
}

/** Onglet segmenté (tri manifeste). */
function SegTab({
  active,
  onClick,
  label,
}: {
  active: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'border-r border-rule-soft px-2.5 py-1.5 font-mono text-[10px] font-bold uppercase tracking-wider transition-colors last:border-r-0',
        active ? 'bg-brand/10 text-brand' : 'text-muted-foreground hover:text-foreground'
      )}
    >
      {label}
    </button>
  )
}

/** Pastille légende (frise). */
function Legend({ sw, label }: { sw: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn('h-[9px] w-5 rounded-[2px]', sw)} />
      {label}
    </span>
  )
}
