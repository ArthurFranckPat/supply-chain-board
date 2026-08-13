import { useMemo, useState } from 'react'
import type { DateRange as DayPickerRange } from 'react-day-picker'
import { Minus, Plus, TriangleAlert, CircleX, CloudOff, Truck } from 'lucide-react'

import AppLayout from '@r/layouts/app'
import { LoadingState } from '@r/components/ui/loading-state'
import { Separator } from '@r/components/ui/separator'
import {
  ToolbarDateWindow,
  ToolbarFilterChip,
  ToolbarFilterMenu,
  ToolbarFilterSection,
  ToolbarGroup,
  ToolbarRefresh,
  ToolbarSearch,
  ToolbarSegment,
  ToolbarSegmented,
  ToolbarSpacer,
} from '@r/components/ui/toolbar'
import { CamionDetailSheet, type CamionDtl } from '@r/components/expeditions/camion-detail-sheet'
import { ManifesteView, type ManifesteSort } from '@r/components/expeditions/manifeste-view'
import { FriseView } from '@r/components/expeditions/frise-view'
import { PrevisionView } from '@r/components/expeditions/prevision-view'
import type { ForecastResponse } from '@r/components/expeditions/forecast-types'
import { useTimedFetch } from '@r/lib/suivi/use-timed-fetch'

/**
 * Page « Expéditions » (issue #44 + #104) — rétroviseur STOJOU (Manifeste / Frise)
 * + prévision de charge transport J→J+n depuis l'ordonnancement.
 *
 * Coquille Inertia instantanée ; calculs lourds en différé via useTimedFetch.
 *
 * Migrée sur le design system cursor (vitrine `/design-system`) :
 * • `theme="cursor"` ; la barre passe par la prop `toolbar` d'AppLayout ;
 * • la barre suit le standard §18 : bascule de vue + fenêtre (ou horizon) +
 *   menu Filtres unique, recherche et actualiser — plus de `vision/toolbar` ;
 * • Prévision : grilles CSS → table canonique (`TableHead` / `CellStack` /
 *   `CellNumber`) ; Manifeste et Frise restent des visualisations dédiées ;
 * • plus de `font-fraunces` / `border-rule` / `text-brand` dans le chrome.
 */

type ViewMode = 'manifeste' | 'frise' | 'prevision'

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
  forecastHref: string
  defaultGapMinutes: number
  maxPalettesCamion: number
  forecastDefaultDays: number
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
  } else if (sort === 'charge') {
    out.sort((a, b) => srcRank(a) - srcRank(b) || b.nbPalettes - a.nbPalettes)
  } else {
    out.sort((a, b) => srcRank(a) - srcRank(b) || a.client.localeCompare(b.client))
  }
  return out
}

interface DateRangeSel {
  start: Date | null
  end: Date | null
}

export default function Expeditions(props: ExpeditionsPageProps) {
  const [range, setRange] = useState<DateRangeSel | null>(null)
  const [gapMin, setGapMin] = useState<number | null>(null)
  const [query, setQuery] = useState('')
  const [anomalyOnly, setAnomalyOnly] = useState(false)
  const [bust, setBust] = useState(0)
  const [view, setView] = useState<ViewMode>('manifeste')
  const [mSort, setMSort] = useState<ManifesteSort>('time')
  const [selectedCamion, setSelectedCamion] = useState<CamionDtl | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [horizonDays, setHorizonDays] = useState(props.forecastDefaultDays)

  const isPrevision = view === 'prevision'
  const refDate = useMemo(() => new Date(props.referenceDate), [props.referenceDate])

  const rowsUrl = useMemo(() => {
    if (isPrevision) return null
    let u = props.rowsHref
    if (range?.start) {
      const fmt = (d: Date) => d.toISOString().slice(0, 10)
      u += `&expFrom=${fmt(range.start)}&expTo=${fmt(range.end ?? range.start)}`
    }
    if (gapMin !== null) u += `&expGapMin=${gapMin}`
    if (bust) u += `&refresh=${bust}`
    return u
  }, [props.rowsHref, range, gapMin, bust, isPrevision])

  const forecastUrl = useMemo(() => {
    if (!isPrevision) return null
    let u = props.forecastHref.replace(/([?&])days=\d+/, `$1days=${horizonDays}`)
    if (!/[?&]days=/.test(u)) {
      u += (u.includes('?') ? '&' : '?') + `days=${horizonDays}`
    }
    if (bust) u += `&refresh=${bust}`
    return u
  }, [props.forecastHref, horizonDays, bust, isPrevision])

  const rowsFetch = useTimedFetch<ExpeditionsRowsResponse>(rowsUrl)
  const forecastFetch = useTimedFetch<ForecastResponse>(forecastUrl)

  const loading = isPrevision ? forecastFetch.loading : rowsFetch.loading
  const error = isPrevision ? forecastFetch.error : rowsFetch.error

  const viewData = rowsFetch.data ?? EMPTY(props.defaultGapMinutes, props.maxPalettesCamion)
  const exp = viewData.expeditions
  const x3Error = isPrevision ? (forecastFetch.data?.x3Error ?? null) : viewData.x3Error
  const forecast = forecastFetch.data?.forecast ?? null

  // gap effectif = override utilisateur, sinon valeur serveur, sinon défaut.
  const gapEff = gapMin ?? exp.gapMinutes ?? props.defaultGapMinutes

  const baseRows = useMemo(() => {
    const q = fold(query)
    let rows = exp.camions
    if (q) rows = rows.filter((c) => fold(c.client).includes(q) || fold(c.bprnum).includes(q))
    if (anomalyOnly) rows = rows.filter((c) => c.anomalie)
    return rows
  }, [query, anomalyOnly, exp])

  const manifesteRows = useMemo(() => sortRows(baseRows, mSort), [baseRows, mSort])
  const friseRows = useMemo(() => sortRows(baseRows, 'time'), [baseRows])

  const anomalyCount = useMemo(() => exp.camions.filter((c) => c.anomalie).length, [exp.camions])

  const openCamion = (c: CamionDtl) => {
    setSelectedCamion({ ...c, maxPalettesCamion: exp.maxPalettesCamion })
    setDetailOpen(true)
  }

  const applyRange = (r: DayPickerRange) => {
    setRange({ start: r.from ?? null, end: r.to ?? null })
  }

  const hasRetroContent = baseRows.length > 0 || !!x3Error
  const hasForecastContent = !!forecast || !!x3Error
  const gapStep = (delta: number) => setGapMin((v) => Math.max(0, (v ?? gapEff) + delta))
  const horizonStep = (delta: number) => setHorizonDays((v) => Math.min(30, Math.max(4, v + delta)))

  const filterActiveCount =
    (view === 'manifeste' && mSort !== 'time' ? 1 : 0) +
    (gapMin !== null ? 1 : 0) +
    (anomalyOnly ? 1 : 0)

  const dateValue: DayPickerRange = range?.start
    ? { from: range.start, to: range.end ?? range.start }
    : { from: refDate, to: refDate }

  /* ── Barre d'outils (standard §18) ───────────────────────────────────────
     Zone 01 portée : la bascule de vue, puis la fenêtre (rétroviseur) ou
     l'horizon (prévision). Zone 02 : le déclencheur unique de filtres.
     Zone 03 : la recherche. Zone 04 : volume / durée puis actualiser.
     Pas de conteneur `<Toolbar>` : la prop d'AppLayout en est déjà un. */
  const toolbar = (
    <>
      <ToolbarGroup>
        <ToolbarSegmented semantics="tabs" aria-label="Vue">
          <ToolbarSegment
            active={view === 'manifeste'}
            title="Cartes camion du jour, une par cluster / navette"
            onClick={() => setView('manifeste')}
          >
            Manifestes
          </ToolbarSegment>
          <ToolbarSegment
            active={view === 'frise'}
            title="Frise temporelle de charge quai"
            onClick={() => setView('frise')}
          >
            Frise
          </ToolbarSegment>
          <ToolbarSegment
            active={view === 'prevision'}
            title="Prévision de charge transport J → J+n"
            onClick={() => setView('prevision')}
          >
            Prévision
          </ToolbarSegment>
        </ToolbarSegmented>

        {isPrevision ? (
          <Stepper
            label="Horizon"
            value={`${horizonDays} j`}
            onStep={horizonStep}
            titleDec="Réduire l'horizon"
            titleInc="Étendre l'horizon"
            ariaDec="Réduire l'horizon"
            ariaInc="Étendre l'horizon"
          />
        ) : (
          <ToolbarDateWindow
            value={dateValue}
            onCommit={applyRange}
            title="Fenêtre du rétroviseur : expéditions dont la date tombe dans la plage"
          />
        )}

        {!isPrevision && (
          <ToolbarFilterMenu activeCount={filterActiveCount} width={300}>
            {view === 'manifeste' && (
              <>
                <ToolbarFilterSection>Tri manifeste</ToolbarFilterSection>
                <ToolbarSegmented semantics="tabs" flat className="w-full">
                  <ToolbarSegment active={mSort === 'time'} onClick={() => setMSort('time')}>
                    Par heure
                  </ToolbarSegment>
                  <ToolbarSegment active={mSort === 'charge'} onClick={() => setMSort('charge')}>
                    Par charge
                  </ToolbarSegment>
                  <ToolbarSegment active={mSort === 'client'} onClick={() => setMSort('client')}>
                    Par client
                  </ToolbarSegment>
                </ToolbarSegmented>
                <Separator className="my-2" />
              </>
            )}

            <ToolbarFilterSection>Regroupement</ToolbarFilterSection>
            <Stepper
              label="Tolérance"
              value={`± ${gapEff} min`}
              onStep={gapStep}
              titleDec="Diminuer la tolérance"
              titleInc="Augmenter la tolérance"
              ariaDec="Diminuer la tolérance"
              ariaInc="Augmenter la tolérance"
            />

            <Separator className="my-2" />
            <ToolbarFilterSection>Anomalies</ToolbarFilterSection>
            <ToolbarSegmented semantics="toggles" flat className="w-full flex-wrap">
              <ToolbarFilterChip
                label="Tous"
                count={exp.camions.length}
                tone="neutral"
                active={!anomalyOnly}
                onClick={() => setAnomalyOnly(false)}
              />
              <ToolbarFilterChip
                label="Anomalies seules"
                count={anomalyCount}
                tone="critical"
                active={anomalyOnly}
                onClick={() => setAnomalyOnly((v) => !v)}
              />
            </ToolbarSegmented>
          </ToolbarFilterMenu>
        )}
      </ToolbarGroup>

      <ToolbarSpacer />

      {!isPrevision && <ToolbarSearch value={query} onChange={setQuery} placeholder="Client…" />}

      <ToolbarRefresh loading={loading} onClick={() => setBust((b) => b + 1)} />
    </>
  )

  return (
    <AppLayout
      title="Expéditions"
      active="expeditions"
      subtitle="Expéditions · Livraisons client"
      theme="cursor"
      dense
      scrollable={false}
      toolbar={toolbar}
    >
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        {x3Error && (
          <div className="flex flex-none items-center gap-2 border-b border-destructive/30 bg-destructive/10 px-6 py-2 text-[12px] text-foreground">
            <TriangleAlert size={16} strokeWidth={1.75} className="text-destructive" />
            <span className="font-bold">Erreur chargement :</span>
            <span className="font-mono">{x3Error}</span>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-hidden">
          {loading ? (
            <LoadingState
              className="h-full"
              variant="orb"
              orbState="searching"
              title={isPrevision ? 'Calcul de la prévision…' : 'Calcul des expéditions…'}
              description={
                isPrevision
                  ? 'Ordonnancement · file quai · cadence atelier'
                  : 'Lecture STOJOU · regroupement camions'
              }
            />
          ) : error ? (
            <LoadingState
              className="h-full"
              icon={<CircleX size={20} strokeWidth={1.75} className="text-destructive" />}
              title={
                isPrevision
                  ? 'Échec du calcul de la prévision.'
                  : 'Échec du calcul des expéditions.'
              }
              description="Réessaye : le cache X3 est court."
            />
          ) : isPrevision ? (
            hasForecastContent && forecast ? (
              <PrevisionView forecast={forecast} />
            ) : (
              <EmptyState x3Error={x3Error} prevision />
            )
          ) : hasRetroContent ? (
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
            <EmptyState x3Error={x3Error} />
          )}
        </div>

        <CamionDetailSheet camion={selectedCamion} open={detailOpen} onOpenChange={setDetailOpen} />
      </div>
    </AppLayout>
  )
}

function EmptyState({ x3Error, prevision }: { x3Error: string | null; prevision?: boolean }) {
  return (
    <LoadingState
      className="h-full"
      icon={
        x3Error ? (
          <CloudOff size={32} strokeWidth={1.75} className="text-muted-foreground/50" />
        ) : (
          <Truck size={32} strokeWidth={1.75} className="text-muted-foreground/50" />
        )
      }
      title={
        x3Error
          ? 'Données indisponibles (X3 injoignable).'
          : prevision
            ? 'Aucune demande d’expédition sur l’horizon.'
            : 'Aucune expédition sur la période.'
      }
    />
  )
}

/** Cran ± pour l'horizon (zone 01) et le gap de regroupement (zone 02). */
function Stepper({
  label,
  value,
  onStep,
  titleDec,
  titleInc,
  ariaDec,
  ariaInc,
}: {
  label: string
  value: string
  onStep: (delta: number) => void
  titleDec: string
  titleInc: string
  ariaDec: string
  ariaInc: string
}) {
  return (
    <div className="flex items-center gap-0.5">
      <span className="px-1.5 font-mono text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <button
        type="button"
        onClick={() => onStep(-1)}
        className="inline-flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        title={titleDec}
        aria-label={ariaDec}
      >
        <Minus size={13} strokeWidth={1.75} />
      </button>
      <span className="min-w-[40px] text-center font-mono text-xs font-medium tabular-nums text-foreground">
        {value}
      </span>
      <button
        type="button"
        onClick={() => onStep(1)}
        className="inline-flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        title={titleInc}
        aria-label={ariaInc}
      >
        <Plus size={13} strokeWidth={1.75} />
      </button>
    </div>
  )
}
