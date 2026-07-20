import { useMemo, useState } from 'react'
import { fr } from 'react-day-picker/locale'
import type { DateRange as DayPickerRange } from 'react-day-picker'

import AppLayout from '@r/layouts/app'
import { Calendar } from '@r/components/ui/calendar'
import { ReceptionTableau, ReceptionCalendrier } from '@r/components/receptions/reception-views'
import { useTimedFetch } from '@r/lib/suivi/use-timed-fetch'
import { cn } from '@r/lib/utils'
import type { ReceptionsRowsResponse, ReceptionViewKind } from '@/lib/receptions/types'

/**
 * Page « Réceptions fournisseurs » (port React — structure iso du Solid
 * inertia/pages/receptions.tsx).
 *
 * Coquille Inertia instantanée ; le calcul lourd (X3 + palette + agrégation)
 * est chargé en différé via useTimedFetch sur rowsHref. Même motif que
 * /expeditions, /ruptures, /suivi.
 */

const fold = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

const EMPTY: ReceptionsRowsResponse = {
  rows: [],
  chargeByDay: [],
  stats: {
    totalPalettes: 0,
    totalLignes: 0,
    totalFournisseurs: 0,
    picPalettes: 0,
    picJour: null,
    lignesEstimees: 0,
    lignesSansCoef: 0,
  },
  range: { from: '', to: '', horizonDays: 0 },
  x3Error: null,
}

interface ReceptionsPageProps {
  from: string
  to: string
  horizon: number
  rowsHref: string
  todayHref: string
  defaultHorizon: number
}

interface DateRangeSel {
  start: Date | null
  end: Date | null
}

const fmtMs = (ms: number) => (ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`)

const fmtDay = (d: Date) =>
  `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`

export default function Receptions(props: ReceptionsPageProps) {
  const [view, setView] = useState<ReceptionViewKind>('tableau')
  const [range, setRange] = useState<DateRangeSel | null>(null)
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [bust, setBust] = useState(0)

  const rangeLabel = useMemo(() => {
    if (!range?.start) return `${fmtDay(new Date(props.from))} → ${fmtDay(new Date(props.to))}`
    if (!range.end || range.start.toDateString() === range.end.toDateString())
      return fmtDay(range.start)
    return `${fmtDay(range.start)} → ${fmtDay(range.end)}`
  }, [range, props.from, props.to])

  const url = useMemo(() => {
    const u = new URL(props.rowsHref, window.location.origin)
    if (range?.start) {
      const fmt = (d: Date) => d.toISOString().slice(0, 10)
      u.searchParams.set('from', fmt(range.start))
      u.searchParams.set('to', fmt(range.end ?? range.start))
    }
    if (bust) u.searchParams.set('refresh', String(bust))
    return `${u.pathname}?${u.searchParams.toString()}`
  }, [props.rowsHref, range, bust])

  const { data, loading, error, ms, elapsed } = useTimedFetch<ReceptionsRowsResponse>(url)

  const viewData = data ?? EMPTY
  const stats = viewData.stats
  const x3Error = viewData.x3Error
  const charge = viewData.chargeByDay

  // Filtrage par recherche + jour sélectionné (drill-down calendrier).
  const filteredRows = useMemo(() => {
    const q = fold(query)
    const day = selectedDay
    let rows = viewData.rows
    if (day) rows = rows.filter((r) => r.date === day)
    if (q) {
      rows = rows.filter(
        (r) =>
          fold(r.fournisseurNom).includes(q) ||
          fold(r.fournisseur).includes(q) ||
          fold(r.article).includes(q) ||
          fold(r.designation).includes(q) ||
          fold(r.noCommande).includes(q)
      )
    }
    return rows
    // viewData est dérivé de data (réf change au fetch) — pas besoin de le lister.
  }, [query, selectedDay, viewData])

  const applyRange = (r: DayPickerRange | undefined) => {
    const next: DateRangeSel = { start: r?.from ?? null, end: r?.to ?? null }
    setRange(next)
    if (next.start && next.end) setCalendarOpen(false)
  }

  const hasContent = viewData.rows.length > 0 || x3Error

  return (
    <AppLayout
      title="Réceptions"
      active="receptions"
      subtitle="Réceptions · Commandes fournisseurs"
      theme="airbnb"
      dense
      scrollable={false}
      meta={
        <>
          <div className="font-fraunces text-[12px] font-bold capitalize not-italic text-brand">
            {rangeLabel}
          </div>
          <div>
            <b className="font-bold text-foreground">{stats.totalPalettes}</b> palette
            {stats.totalPalettes > 1 ? 's' : ''}
            {' · '}
            <b className="font-bold text-foreground">{stats.totalLignes}</b> réception
            {stats.totalLignes > 1 ? 's' : ''}
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
                <span>{rangeLabel}</span>
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
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setCalendarOpen(false)}
                />
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
                  />
                </div>
              </>
            )}
          </div>

          {/* Recherche */}
          <div className="flex h-[30px] items-center gap-1.5 rounded-full border border-rule bg-card px-3 transition-shadow focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/25">
            <span className="material-symbols-outlined text-[17px] text-muted-foreground">search</span>
            <input
              className="w-[180px] border-0 bg-transparent px-0 text-[12px] font-medium text-foreground shadow-none outline-none"
              placeholder="Fournisseur, article, commande…"
              type="text"
              autoComplete="off"
              value={query}
              onChange={(e) => setQuery(e.currentTarget.value)}
            />
          </div>

          <div className="ml-auto flex items-center gap-2">
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

        {/* ═══ Toggle vue ═══ */}
        <div className="flex flex-none items-center gap-2.5 border-b border-rule-soft px-7 py-1.5">
          <div className="flex items-center overflow-hidden rounded-md border border-rule bg-card">
            <ViewTab
              active={view === 'tableau'}
              onClick={() => setView('tableau')}
              icon="table_rows"
              label="Tableau"
            />
            <ViewTab
              active={view === 'calendrier'}
              onClick={() => setView('calendrier')}
              icon="bar_chart"
              label="Charge par jour"
            />
          </div>

          {/* Filtre jour actif (drill-down) */}
          {selectedDay && (
            <span className="flex items-center gap-1.5 rounded-md border border-brand/30 bg-brand/5 px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-brand">
              <span className="material-symbols-outlined text-[13px]">filter_alt</span>
              {charge.find((c) => c.day === selectedDay)?.dayFmt ?? selectedDay}
              <button type="button" onClick={() => setSelectedDay(null)} className="hover:opacity-70">
                <span className="material-symbols-outlined text-[12px]">close</span>
              </button>
            </span>
          )}

          <div className="ml-auto flex items-center gap-3 font-mono text-[11px] text-muted-foreground">
            {stats.lignesEstimees > 0 && (
              <span
                className="flex items-center gap-1 text-planifie"
                title="Lignes dont le coef palette a été estimé (stock actuel SM* ou historique STOJOU)"
              >
                <span className="material-symbols-outlined text-[13px]">insights</span>
                {stats.lignesEstimees} estimé{stats.lignesEstimees > 1 ? 's' : ''}
              </span>
            )}
            {stats.lignesSansCoef > 0 && (
              <span
                className="flex items-center gap-1 text-destructive"
                title="Lignes sans coef palette ni estimation — charge réellement sous-estimée"
              >
                <span className="material-symbols-outlined text-[13px]">warning</span>
                {stats.lignesSansCoef} coef manquant{stats.lignesSansCoef > 1 ? 's' : ''}
              </span>
            )}
            <span>
              {filteredRows.length} ligne{filteredRows.length > 1 ? 's' : ''}
            </span>
          </div>
        </div>

        {/* ═══ X3 injoignable ═══ */}
        {x3Error && (
          <div className="flex flex-none items-center gap-2 border-b border-destructive/30 bg-destructive/10 px-7 py-2 text-[12px] text-foreground">
            <span className="material-symbols-outlined text-[16px] text-destructive">warning</span>
            <span className="font-bold">Erreur chargement réceptions :</span>
            <span className="font-mono">{x3Error}</span>
          </div>
        )}

        {/* ═══ Vue ═══ */}
        {loading && !data ? (
          <div className="flex flex-1 items-center justify-center gap-2 text-muted-foreground">
            <span className="material-symbols-outlined animate-spin text-[20px]">
              progress_activity
            </span>
            <span className="text-[13px] font-medium">Calcul des réceptions…</span>
          </div>
        ) : error ? (
          <div className="flex flex-1 items-center justify-center gap-2 text-[13px] text-destructive">
            <span className="material-symbols-outlined text-[20px]">error</span>
            Échec du calcul des réceptions.
          </div>
        ) : (
          <div
            className={cn(
              'flex flex-1 flex-col overflow-hidden transition-opacity duration-150',
              loading && 'pointer-events-none opacity-50'
            )}
          >
            {hasContent ? (
              view === 'tableau' ? (
                <ReceptionTableau
                  rows={filteredRows}
                  emptyState={
                    <div className="flex flex-col items-center justify-center gap-2 p-10 text-center">
                      <span className="material-symbols-outlined text-[32px] text-muted-foreground/50">
                        inbox
                      </span>
                      <span className="font-fraunces text-[14px] italic text-muted-foreground">
                        {selectedDay ? 'Aucune réception ce jour.' : 'Aucune réception sur la période.'}
                      </span>
                    </div>
                  }
                />
              ) : (
                <ReceptionCalendrier
                  charge={charge}
                  selectedDay={selectedDay}
                  onSelectDay={(day) => {
                    setSelectedDay(day)
                    if (day) setView('tableau')
                  }}
                />
              )
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 p-10 text-center">
                <span className="material-symbols-outlined text-[32px] text-muted-foreground/50">
                  {x3Error ? 'cloud_off' : 'inventory_2'}
                </span>
                <span className="font-fraunces text-[14px] italic text-muted-foreground">
                  {x3Error
                    ? 'Données indisponibles (X3 injoignable).'
                    : 'Aucune réception planifiée sur la période.'}
                </span>
              </div>
            )}
          </div>
        )}
    </AppLayout>
  )
}

/** Onglet de bascule de vue (tableau / calendrier). */
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
