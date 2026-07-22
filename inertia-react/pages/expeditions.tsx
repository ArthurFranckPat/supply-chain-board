import { useMemo, useState } from 'react'
import type { DateRange as DayPickerRange } from 'react-day-picker'
import { X, Minus, Plus, TriangleAlert, Search, LoaderCircle, CircleX, CloudOff, Truck } from 'lucide-react'

import AppLayout from '@r/layouts/app'
import {
  PILL,
  Segment,
  SegmentButton,
  DateWindowPill,
  RefreshPill,
  ToolbarRow,
} from '@r/components/vision/toolbar'
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
        <ToolbarRow>
          {/* Sélecteur de plage — pas de date future (expédition = passé/J-1). */}
          <div className="flex items-center gap-1">
            <DateWindowPill
              open={calendarOpen}
              onOpenChange={setCalendarOpen}
              selected={{
                from: range?.start ?? new Date(props.referenceDate),
                to: range?.end ?? new Date(props.referenceDate),
              }}
              onSelect={applyRange}
              disabled={{ after: new Date() }}
            />
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
                <X size={14} strokeWidth={1.75} />
              </button>
            )}
          </div>

          {/* Tolérance de regroupement camion (issue #44) */}
          <div className="flex items-center gap-1 rounded-md border border-rule bg-card p-0.5">
            <span className="px-1.5 font-mono text-[9px] font-semibold text-muted-foreground">
              Regroupement
            </span>
            <button
              type="button"
              onClick={() => gapStep(-1)}
              className="flex size-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              title="Diminuer la tolérance"
              aria-label="Diminuer la tolérance"
            >
              <Minus size={13} strokeWidth={1.75} />
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
              <Plus size={13} strokeWidth={1.75} />
            </button>
          </div>

          {/* Filtre anomalies */}
          <button
            type="button"
            onClick={() => setAnomalyOnly((v) => !v)}
            className={cn(
              'flex items-center gap-1 rounded-md border px-2.5 py-1.5 font-mono text-[10px] font-semibold transition-colors',
              anomalyOnly
                ? 'border-destructive/40 bg-destructive/10 text-destructive'
                : 'border-rule bg-card text-muted-foreground hover:text-foreground'
            )}
          >
            <TriangleAlert size={13} strokeWidth={1.75} />
            Anomalies seules
          </button>

          <div className="ml-auto flex items-center gap-2">
            {/* Recherche — systématiquement à droite (convention toolbar). */}
            <div className={PILL}>
              <Search size={17} strokeWidth={1.75} className="text-muted-foreground" />
              <input
                className="w-[160px] border-0 bg-transparent px-0 text-xs font-medium text-foreground shadow-none outline-none"
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
            <RefreshPill loading={loading} onClick={() => setBust((b) => b + 1)} />
          </div>
        </ToolbarRow>

        {/* ═══ Toggle vue + tri manifeste ═══ */}
        <div className="flex flex-none items-center gap-2.5 border-b border-rule-soft px-7 py-1.5">
          <Segment role="radiogroup" ariaLabel="Vue">
            <SegmentButton role="radio" active={view === 'manifeste'} onClick={() => setView('manifeste')}>
              Manifestes
            </SegmentButton>
            <SegmentButton role="radio" active={view === 'frise'} onClick={() => setView('frise')}>
              Frise de charge
            </SegmentButton>
          </Segment>

          {/* Tri segmenté — propre au manifeste */}
          {view === 'manifeste' && (
            <Segment role="radiogroup" ariaLabel="Tri manifeste">
              <SegmentButton role="radio" active={mSort === 'time'} onClick={() => setMSort('time')}>
                Par heure
              </SegmentButton>
              <SegmentButton role="radio" active={mSort === 'load'} onClick={() => setMSort('load')}>
                Par charge
              </SegmentButton>
              <SegmentButton role="radio" active={mSort === 'client'} onClick={() => setMSort('client')}>
                Par client
              </SegmentButton>
            </Segment>
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
            <TriangleAlert size={16} strokeWidth={1.75} className="text-destructive" />
            <span className="font-bold">Erreur chargement expéditions :</span>
            <span className="font-mono">{x3Error}</span>
          </div>
        )}

        {/* ═══ Vue ═══ */}
        {loading ? (
          <div className="flex flex-1 items-center justify-center gap-2 text-muted-foreground">
            <LoaderCircle size={20} strokeWidth={1.75} className="animate-spin" />
            <span className="text-[13px] font-medium">Calcul des expéditions…</span>
          </div>
        ) : error ? (
          <div className="flex flex-1 items-center justify-center gap-2 text-[13px] text-destructive">
            <CircleX size={20} strokeWidth={1.75} />
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
            {x3Error ? (
              <CloudOff size={32} strokeWidth={1.75} className="text-muted-foreground/50" />
            ) : (
              <Truck size={32} strokeWidth={1.75} className="text-muted-foreground/50" />
            )}
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

/** Pastille légende (frise). */
function Legend({ sw, label }: { sw: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn('h-[9px] w-5 rounded-[2px]', sw)} />
      {label}
    </span>
  )
}
