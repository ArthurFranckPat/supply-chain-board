import { useEffect, useMemo, useState } from 'react'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@r/components/ui/sheet'
import {
  Clock,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Search,
  LoaderCircle,
  Calendar,
  User,
  Package,
} from 'lucide-react'
import { cn } from '@r/lib/utils'
import { Segment, SegmentButton } from '@r/components/vision/toolbar'
import { formatDateFr, type WorkstationDetailResponse } from '@r/lib/produced-hours/types'

type TimelineGranularity = 'day' | 'week' | 'month'

interface AggregatedPoint {
  key: string
  label: string
  tooltipLabel: string
  hours: number
  morningHours: number
  afternoonHours: number
  allocated: number
  qty: number
}

const MONTHS_SHORT_FR = [
  'Janv.',
  'Févr.',
  'Mars',
  'Avr.',
  'Mai',
  'Juin',
  'Juil.',
  'Août',
  'Sept.',
  'Oct.',
  'Nov.',
  'Déc.',
]

const MONTHS_FULL_FR = [
  'Janvier',
  'Février',
  'Mars',
  'Avril',
  'Mai',
  'Juin',
  'Juillet',
  'Août',
  'Septembre',
  'Octobre',
  'Novembre',
  'Décembre',
]

function getIsoWeekDetails(dateStr: string): { weekNum: number; year: number } {
  const parts = dateStr.split('-').map(Number)
  const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]))
  const day = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - day)
  const year = d.getUTCFullYear()
  const yearStart = new Date(Date.UTC(year, 0, 1))
  const weekNum = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return { weekNum, year }
}

interface WorkstationDetailSheetProps {
  poste: string | null
  from: string
  to: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function WorkstationDetailSheet({
  poste,
  from,
  to,
  open,
  onOpenChange,
}: WorkstationDetailSheetProps) {
  const [data, setData] = useState<WorkstationDetailResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [granularity, setGranularity] = useState<TimelineGranularity>('day')
  const [hoveredKey, setHoveredKey] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !poste) {
      setData(null)
      setError(null)
      setSearch('')
      setGranularity('day')
      setHoveredKey(null)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)
    setHoveredKey(null)

    const url = `/api/v1/heures-produites/detail?poste=${encodeURIComponent(poste)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`

    fetch(url)
      .then(async (res) => {
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.error || `Erreur ${res.status}`)
        }
        return res.json()
      })
      .then((json: WorkstationDetailResponse) => {
        if (!cancelled) {
          setData(json)
          setLoading(false)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Erreur inconnue')
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [open, poste, from, to])

  const periodShifts = useMemo(() => {
    if (!data?.timeline?.length) return { morning: 0, afternoon: 0 }
    let m = 0
    let a = 0
    for (const pt of data.timeline) {
      m += pt.morningHours || 0
      a += pt.afternoonHours || 0
    }
    return {
      morning: Math.round(m * 10) / 10,
      afternoon: Math.round(a * 10) / 10,
    }
  }, [data?.timeline])

  const filteredTrackings = useMemo(() => {
    if (!data?.trackings) return []
    const q = search.trim().toLowerCase()
    if (!q) return data.trackings

    return data.trackings.filter(
      (t) =>
        t.ofNum.toLowerCase().includes(q) ||
        t.article.toLowerCase().includes(q) ||
        t.designation.toLowerCase().includes(q) ||
        t.employee.toLowerCase().includes(q) ||
        t.trackingNum.toLowerCase().includes(q)
    )
  }, [data?.trackings, search])

  // Agrégation de la timeline selon la granularité sélectionnée (jour / semaine / mois)
  const aggregatedTimeline = useMemo<AggregatedPoint[]>(() => {
    if (!data?.timeline?.length) return []

    if (granularity === 'day') {
      return data.timeline.map((pt) => ({
        key: pt.date,
        label: formatDateFr(pt.date).slice(0, 5),
        tooltipLabel: formatDateFr(pt.date),
        hours: pt.hours,
        morningHours: pt.morningHours || 0,
        afternoonHours: pt.afternoonHours || 0,
        allocated: pt.allocated,
        qty: pt.qty,
      }))
    }

    if (granularity === 'week') {
      const map = new Map<string, AggregatedPoint>()
      for (const pt of data.timeline) {
        const { weekNum, year } = getIsoWeekDetails(pt.date)
        const key = `${year}-W${String(weekNum).padStart(2, '0')}`
        const existing = map.get(key)
        if (existing) {
          existing.hours += pt.hours
          existing.morningHours += pt.morningHours || 0
          existing.afternoonHours += pt.afternoonHours || 0
          existing.allocated += pt.allocated
          existing.qty += pt.qty
        } else {
          map.set(key, {
            key,
            label: `S${String(weekNum).padStart(2, '0')}`,
            tooltipLabel: `Semaine ${weekNum} (${year})`,
            hours: pt.hours,
            morningHours: pt.morningHours || 0,
            afternoonHours: pt.afternoonHours || 0,
            allocated: pt.allocated,
            qty: pt.qty,
          })
        }
      }
      return Array.from(map.values()).map((p) => ({
        ...p,
        hours: Math.round(p.hours * 10) / 10,
        morningHours: Math.round(p.morningHours * 10) / 10,
        afternoonHours: Math.round(p.afternoonHours * 10) / 10,
        allocated: Math.round(p.allocated * 10) / 10,
      }))
    }

    // granularity === 'month'
    const map = new Map<string, AggregatedPoint>()
    for (const pt of data.timeline) {
      const parts = pt.date.split('-').map(Number)
      const year = parts[0]
      const month = parts[1]
      const key = `${year}-${String(month).padStart(2, '0')}`
      const existing = map.get(key)
      if (existing) {
        existing.hours += pt.hours
        existing.morningHours += pt.morningHours || 0
        existing.afternoonHours += pt.afternoonHours || 0
        existing.allocated += pt.allocated
        existing.qty += pt.qty
      } else {
        const mShort = MONTHS_SHORT_FR[month - 1] || `${month}`
        const mFull = MONTHS_FULL_FR[month - 1] || `${month}`
        map.set(key, {
          key,
          label: `${mShort} ${String(year).slice(2)}`,
          tooltipLabel: `${mFull} ${year}`,
          hours: pt.hours,
          morningHours: pt.morningHours || 0,
          afternoonHours: pt.afternoonHours || 0,
          allocated: pt.allocated,
          qty: pt.qty,
        })
      }
    }
    return Array.from(map.values()).map((p) => ({
      ...p,
      hours: Math.round(p.hours * 10) / 10,
      morningHours: Math.round(p.morningHours * 10) / 10,
      afternoonHours: Math.round(p.afternoonHours * 10) / 10,
      allocated: Math.round(p.allocated * 10) / 10,
    }))
  }, [data?.timeline, granularity])

  // Point actuellement survolé sur le graphe (ou null)
  const activePoint = useMemo(() => {
    if (!hoveredKey) return null
    return aggregatedTimeline.find((p) => p.key === hoveredKey) ?? null
  }, [hoveredKey, aggregatedTimeline])

  // Max hours pour l'échelle du graphe selon la maille active
  const maxAggregatedHours = useMemo(() => {
    if (!aggregatedTimeline.length) return 1
    const m = Math.max(...aggregatedTimeline.map((d) => Math.max(d.hours, d.allocated)))
    return m > 0 ? m * 1.15 : 1
  }, [aggregatedTimeline])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col p-0 data-[side=right]:w-full data-[side=right]:sm:w-[760px] data-[side=right]:sm:max-w-[95vw] data-[side=right]:md:w-[900px] data-[side=right]:lg:w-[1080px] data-[side=right]:xl:w-[1200px] sm:border-l sm:border-rule"
      >
        {/* Header */}
        <SheetHeader className="border-b border-rule bg-surface-base px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex size-10 flex-none items-center justify-center rounded-xl border border-rule bg-card text-brand shadow-xs">
              <Layers className="size-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <SheetTitle className="font-mono text-lg font-bold text-foreground">
                  {poste}
                </SheetTitle>
                {data?.atelier && (
                  <span className="rounded-full bg-surface-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
                    {data.atelier}
                  </span>
                )}
                {data?.wstType === 1 ? (
                  <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">
                    Machine
                  </span>
                ) : data?.wstType === 2 ? (
                  <span className="rounded-full bg-purple-50 px-2 py-0.5 text-[11px] font-medium text-purple-700">
                    Main d'œuvre
                  </span>
                ) : null}
              </div>
              <SheetDescription className="truncate text-xs text-muted-foreground">
                {data?.name || 'Chargement du poste...'} · Période du {formatDateFr(from)} au{' '}
                {formatDateFr(to)}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading && (
            <div className="flex h-64 flex-col items-center justify-center gap-3 text-muted-foreground">
              <LoaderCircle className="size-7 animate-spin text-brand" />
              <span className="text-sm font-medium">Chargement des pointages X3...</span>
            </div>
          )}

          {error && (
            <div className="my-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              <div className="font-semibold">Erreur lors de la récupération des données</div>
              <div className="mt-1 text-xs text-red-600">{error}</div>
            </div>
          )}

          {!loading && !error && data && (
            <div className="space-y-6">
              {/* Synthèse du poste (format bandeau condensé sans cartes volumineuses) */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rule bg-card p-3.5 shadow-xs">
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">Heures réelles :</span>
                  <span className="font-mono font-bold text-foreground">
                    {data.kpis.totalHours.toLocaleString('fr-FR', { minimumFractionDigits: 1 })} h
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    (Matin {periodShifts.morning}h · Aprem {periodShifts.afternoon}h)
                  </span>
                </div>

                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">Standard gamme :</span>
                  <span className="font-mono font-bold text-foreground">
                    {data.kpis.totalAllocatedHours.toLocaleString('fr-FR', {
                      minimumFractionDigits: 1,
                    })}{' '}
                    h
                  </span>
                  <span
                    className={cn(
                      'font-mono text-xs font-semibold',
                      data.kpis.deltaHours > 0
                        ? 'text-amber-600'
                        : data.kpis.deltaHours < 0
                          ? 'text-emerald-600'
                          : 'text-muted-foreground'
                    )}
                  >
                    (
                    {data.kpis.deltaHours > 0
                      ? `+${data.kpis.deltaHours}h dép.`
                      : `${data.kpis.deltaHours}h`}
                    )
                  </span>
                </div>

                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">Efficience :</span>
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 font-mono text-xs font-bold',
                      data.kpis.efficiency >= 100
                        ? 'bg-emerald-50 text-emerald-700'
                        : data.kpis.efficiency >= 85
                          ? 'bg-amber-50 text-amber-700'
                          : 'bg-red-50 text-red-700'
                    )}
                  >
                    {data.kpis.efficiency}%
                  </span>
                </div>

                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">Volume :</span>
                  <span className="font-mono font-bold text-foreground">
                    {data.kpis.quantity.toLocaleString('fr-FR')} pcs
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    ({data.kpis.nbOfs} OFs · {data.kpis.nbTrackings} ptgs)
                  </span>
                </div>
              </div>

              {/* Timeline chart with Maille Selector */}
              {data.timeline.length > 0 && (
                <div className="rounded-xl border border-rule bg-card p-4 shadow-xs">
                  <div className="mb-3 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Activité{' '}
                        {granularity === 'day'
                          ? 'journalière'
                          : granularity === 'week'
                            ? 'hebdomadaire'
                            : 'mensuelle'}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      {/* Legend (harmonized for ALL mailles) */}
                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                        <span
                          className="inline-flex items-center gap-1.5"
                          title="Pointages du matin (6h00 – 12h59)"
                        >
                          <span className="size-2 rounded-full bg-amber-400" />
                          <span>Matin (6h–13h)</span>
                        </span>
                        <span
                          className="inline-flex items-center gap-1.5"
                          title="Pointages de l'après-midi (13h00 – 21h00)"
                        >
                          <span className="size-2 rounded-full bg-brand" />
                          <span>Aprem (13h–21h)</span>
                        </span>
                        <span
                          className="inline-flex items-center gap-1.5"
                          title="Temps alloué standard prévu en gamme"
                        >
                          <span className="size-2 rounded-full bg-slate-300" />
                          <span>Alloué standard</span>
                        </span>
                      </div>

                      {/* Maille switcher */}
                      <Segment ariaLabel="Maille d'affichage">
                        <SegmentButton
                          active={granularity === 'day'}
                          onClick={() => {
                            setGranularity('day')
                            setHoveredKey(null)
                          }}
                          title="Affichage par jour"
                        >
                          Jour
                        </SegmentButton>
                        <SegmentButton
                          active={granularity === 'week'}
                          onClick={() => {
                            setGranularity('week')
                            setHoveredKey(null)
                          }}
                          title="Affichage par semaine"
                        >
                          Semaine
                        </SegmentButton>
                        <SegmentButton
                          active={granularity === 'month'}
                          onClick={() => {
                            setGranularity('month')
                            setHoveredKey(null)
                          }}
                          title="Affichage par mois"
                        >
                          Mois
                        </SegmentButton>
                      </Segment>
                    </div>
                  </div>

                  {/* Live hover inspector / Helper text */}
                  <div className="mb-3 flex min-h-[36px] items-center justify-between rounded-lg bg-surface-muted/60 px-3 py-1.5 text-xs transition-colors border border-rule/50">
                    {activePoint ? (
                      <div className="flex flex-wrap items-center justify-between w-full gap-2 font-sans">
                        <div className="flex items-center gap-2 font-semibold text-foreground">
                          <span className="rounded bg-surface-base px-2 py-0.5 font-mono text-[11px] border border-rule shadow-2xs">
                            {activePoint.tooltipLabel}
                          </span>
                          <span className="font-mono text-brand font-bold">
                            {activePoint.hours.toLocaleString('fr-FR', {
                              minimumFractionDigits: 1,
                            })}{' '}
                            h réelles
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono">
                          <span className="inline-flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
                            <span className="size-2 rounded-full bg-amber-400" />
                            <span>
                              Matin :{' '}
                              {activePoint.morningHours.toLocaleString('fr-FR', {
                                minimumFractionDigits: 1,
                              })}{' '}
                              h
                            </span>
                          </span>
                          <span className="inline-flex items-center gap-1.5 text-orange-700 dark:text-orange-400">
                            <span className="size-2 rounded-full bg-brand" />
                            <span>
                              Aprem :{' '}
                              {activePoint.afternoonHours.toLocaleString('fr-FR', {
                                minimumFractionDigits: 1,
                              })}{' '}
                              h
                            </span>
                          </span>
                          <span className="text-muted-foreground">
                            Std :{' '}
                            {activePoint.allocated.toLocaleString('fr-FR', {
                              minimumFractionDigits: 1,
                            })}{' '}
                            h
                          </span>
                          <span className="text-muted-foreground">
                            {activePoint.qty.toLocaleString('fr-FR')} pcs
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                        <Clock className="size-3.5 text-brand" />
                        <span>
                          Survolez une barre pour voir le détail des heures (
                          {granularity === 'day'
                            ? 'journée'
                            : granularity === 'week'
                              ? 'semaine'
                              : 'mois'}
                          , matin vs après-midi).
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Zone de barres protégée contre tout débordement */}
                  <div className="w-full overflow-x-auto pb-1">
                    <div className="relative flex h-36 min-w-full items-end justify-between gap-1.5 border-b border-rule pt-4 pb-1">
                      {aggregatedTimeline.map((pt) => {
                        const hReal = Math.min(100, (pt.hours / maxAggregatedHours) * 100)
                        const hAlloc = Math.min(100, (pt.allocated / maxAggregatedHours) * 100)

                        const isFew = aggregatedTimeline.length <= 6
                        const isMid = aggregatedTimeline.length <= 14
                        const realBarWidth = isFew ? 'w-8' : isMid ? 'w-5' : 'w-3.5'
                        const allocBarWidth = isFew ? 'w-5' : isMid ? 'w-3.5' : 'w-2.5'

                        const morningRatio = pt.hours > 0 ? pt.morningHours / pt.hours : 0
                        const afternoonRatio = pt.hours > 0 ? pt.afternoonHours / pt.hours : 0
                        const isHovered = activePoint?.key === pt.key
                        const hasAnyHover = activePoint !== null

                        return (
                          <div
                            key={pt.key}
                            onMouseEnter={() => setHoveredKey(pt.key)}
                            onMouseLeave={() => setHoveredKey(null)}
                            title={`${pt.tooltipLabel} : ${pt.hours}h réelles (Matin: ${pt.morningHours}h, Aprem: ${pt.afternoonHours}h) - Standard: ${pt.allocated}h · ${pt.qty} pcs`}
                            className={cn(
                              'group relative flex h-full flex-1 min-w-[32px] cursor-pointer flex-col items-center justify-end transition-opacity duration-150',
                              hasAnyHover && !isHovered && 'opacity-40'
                            )}
                          >
                            {/* Floating Popover Bubble above the hovered bar */}
                            {isHovered && (
                              <div className="pointer-events-none absolute bottom-[92px] z-30 flex flex-col items-center whitespace-nowrap animate-in fade-in-0 zoom-in-95 duration-100">
                                <div className="rounded-lg border border-border bg-[#18181b] px-2.5 py-1.5 text-[11px] text-white shadow-xl">
                                  <div className="font-semibold pb-0.5 border-b border-white/20 mb-1 text-[10px]">
                                    {pt.tooltipLabel}
                                  </div>
                                  <div className="font-mono text-[10px] space-y-0.5">
                                    <div className="flex items-center justify-between gap-3">
                                      <span className="text-white/70">Réel total :</span>
                                      <span className="font-bold text-white">
                                        {pt.hours.toLocaleString('fr-FR', {
                                          minimumFractionDigits: 1,
                                        })}{' '}
                                        h
                                      </span>
                                    </div>
                                    <div className="flex items-center justify-between gap-3 text-amber-300">
                                      <span>Matin (6h–13h) :</span>
                                      <span className="font-bold">
                                        {pt.morningHours.toLocaleString('fr-FR', {
                                          minimumFractionDigits: 1,
                                        })}{' '}
                                        h
                                      </span>
                                    </div>
                                    <div className="flex items-center justify-between gap-3 text-orange-400">
                                      <span>Aprem (13h–21h) :</span>
                                      <span className="font-bold">
                                        {pt.afternoonHours.toLocaleString('fr-FR', {
                                          minimumFractionDigits: 1,
                                        })}{' '}
                                        h
                                      </span>
                                    </div>
                                    <div className="flex items-center justify-between gap-3 text-white/70">
                                      <span>Standard :</span>
                                      <span>
                                        {pt.allocated.toLocaleString('fr-FR', {
                                          minimumFractionDigits: 1,
                                        })}{' '}
                                        h
                                      </span>
                                    </div>
                                    <div className="flex items-center justify-between gap-3 text-white/70">
                                      <span>Quantité :</span>
                                      <span>{pt.qty.toLocaleString('fr-FR')} pcs</span>
                                    </div>
                                  </div>
                                </div>
                                <div className="-mt-1 size-2 rotate-45 border-b border-r border-border bg-[#18181b]" />
                              </div>
                            )}

                            <div className="flex h-20 w-full items-end justify-center gap-1">
                              {/* Real bar (stacked for ALL mailles: Matin / Aprem) */}
                              <div
                                style={{ height: `${Math.max(4, Math.round(hReal))}%` }}
                                className={cn(
                                  realBarWidth,
                                  'flex flex-col justify-end overflow-hidden rounded-t-sm transition-all',
                                  isHovered &&
                                    'ring-2 ring-brand ring-offset-1 ring-offset-card brightness-110'
                                )}
                              >
                                {/* Après-midi segment (top) */}
                                {pt.afternoonHours > 0 && (
                                  <div
                                    style={{
                                      height:
                                        pt.morningHours > 0
                                          ? `${Math.max(10, Math.round(afternoonRatio * 100))}%`
                                          : '100%',
                                    }}
                                    className="w-full bg-brand transition-all"
                                  />
                                )}
                                {/* Hairline division if both shifts are present */}
                                {pt.afternoonHours > 0 && pt.morningHours > 0 && (
                                  <div className="h-[1px] w-full bg-white/40" />
                                )}
                                {/* Matin segment (bottom) */}
                                {pt.morningHours > 0 && (
                                  <div
                                    style={{
                                      height:
                                        pt.afternoonHours > 0
                                          ? `${Math.max(10, Math.round(morningRatio * 100))}%`
                                          : '100%',
                                    }}
                                    className="w-full bg-amber-400 transition-all"
                                  />
                                )}
                                {pt.morningHours === 0 && pt.afternoonHours === 0 && (
                                  <div className="size-full bg-brand" />
                                )}
                              </div>

                              {/* Alloc bar */}
                              <div
                                style={{ height: `${Math.max(4, Math.round(hAlloc))}%` }}
                                className={cn(
                                  allocBarWidth,
                                  'rounded-t-xs bg-slate-300 transition-all',
                                  isHovered && 'brightness-95'
                                )}
                              />
                            </div>

                            <span
                              className={cn(
                                'mt-1 font-mono text-[9px] whitespace-nowrap transition-colors',
                                isHovered ? 'font-bold text-foreground' : 'text-muted-foreground'
                              )}
                            >
                              {pt.label}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Trackings table */}
              <div className="rounded-xl border border-rule bg-card shadow-xs">
                <div className="flex flex-col gap-2 border-b border-rule p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">
                      Pointages d'opération ({filteredTrackings.length})
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Détail issu de la table MFGOPETRK
                    </p>
                  </div>

                  <div className="relative w-full sm:w-64">
                    <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
                    <input
                      type="text"
                      placeholder="Filtrer OF, article, matricule..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="h-8 w-full rounded-md border border-rule bg-surface-base pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:border-brand focus:outline-none"
                    />
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-[760px] w-full text-left text-xs">
                    <thead className="border-b border-rule bg-surface-muted text-[11px] font-semibold text-muted-foreground">
                      <tr>
                        <th className="w-36 px-3 py-2.5 whitespace-nowrap">Date / Heure</th>
                        <th className="w-28 px-3 py-2.5 whitespace-nowrap">OF</th>
                        <th className="w-14 px-2 py-2.5 text-center whitespace-nowrap">Opé</th>
                        <th className="min-w-[180px] px-3 py-2.5">Article</th>
                        <th className="w-20 px-2 py-2.5 text-center whitespace-nowrap">
                          Opérateur
                        </th>
                        <th className="w-24 px-3 py-2.5 text-right whitespace-nowrap">Qté</th>
                        <th className="w-24 px-3 py-2.5 text-right whitespace-nowrap">Réel (h)</th>
                        <th
                          className="w-24 px-3 py-2.5 text-right whitespace-nowrap"
                          title="Temps standard de gamme prévu pour la quantité produite"
                        >
                          Standard (h)
                        </th>
                        <th className="w-20 px-3 py-2.5 text-right whitespace-nowrap">Écart</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-rule font-mono text-[11px]">
                      {filteredTrackings.length === 0 ? (
                        <tr>
                          <td
                            colSpan={9}
                            className="px-4 py-8 text-center text-xs text-muted-foreground"
                          >
                            Aucun pointage trouvé pour cette sélection.
                          </td>
                        </tr>
                      ) : (
                        filteredTrackings.map((trk, i) => (
                          <tr
                            key={`${trk.trackingNum}-${trk.lineNum}-${i}`}
                            className="transition-colors hover:bg-surface-hover"
                          >
                            <td className="px-3 py-2 text-muted-foreground whitespace-nowrap font-sans">
                              <div className="flex items-center gap-1.5">
                                <span>{formatDateFr(trk.date)}</span>
                                {trk.time && (
                                  <span className="font-mono text-[10px] text-foreground/80">
                                    {trk.time}
                                  </span>
                                )}
                                {trk.shift && (
                                  <span
                                    className={cn(
                                      'rounded px-1 py-0.2 text-[9px] font-semibold',
                                      trk.shift === 'matin'
                                        ? 'bg-amber-50 text-amber-800 border border-amber-200/60'
                                        : 'bg-orange-50 text-brand border border-orange-200/60'
                                    )}
                                    title={
                                      trk.shift === 'matin'
                                        ? 'Poste du matin (6h00 – 12h59)'
                                        : 'Poste de l’après-midi (13h00 – 21h00)'
                                    }
                                  >
                                    {trk.shift === 'matin' ? 'Matin' : 'Aprem'}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-2 font-semibold text-foreground whitespace-nowrap">
                              {trk.ofNum}
                            </td>
                            <td className="px-2 py-2 text-center text-muted-foreground whitespace-nowrap">
                              {trk.opeNum}
                            </td>
                            <td
                              className="max-w-[220px] truncate px-3 py-2 font-sans font-medium text-foreground"
                              title={trk.designation || trk.article}
                            >
                              <div className="font-mono text-xs">{trk.article}</div>
                              {trk.designation && (
                                <div className="truncate text-[10px] text-muted-foreground">
                                  {trk.designation}
                                </div>
                              )}
                            </td>
                            <td className="px-2 py-2 text-center text-muted-foreground whitespace-nowrap font-mono">
                              {trk.employee || '—'}
                            </td>
                            <td className="px-3 py-2 text-right font-semibold text-foreground whitespace-nowrap">
                              {trk.quantity.toLocaleString('fr-FR')}
                              {trk.rejectQuantity > 0 && (
                                <span className="ml-1 text-[10px] text-red-500">
                                  (+{trk.rejectQuantity} reb)
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right font-semibold text-foreground whitespace-nowrap">
                              {trk.totalHours.toLocaleString('fr-FR', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="px-3 py-2 text-right text-muted-foreground whitespace-nowrap">
                              {trk.totalAllocatedHours.toLocaleString('fr-FR', {
                                minimumFractionDigits: 2,
                              })}
                            </td>
                            <td
                              className={cn(
                                'px-3 py-2 text-right font-semibold whitespace-nowrap',
                                trk.deltaHours > 0
                                  ? 'text-amber-600'
                                  : trk.deltaHours < 0
                                    ? 'text-emerald-600'
                                    : 'text-muted-foreground'
                              )}
                            >
                              {trk.deltaHours > 0 ? `+${trk.deltaHours}` : trk.deltaHours}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
