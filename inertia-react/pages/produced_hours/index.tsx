import { useState, useMemo, useCallback } from 'react'
import { Head, router } from '@inertiajs/react'
import type { DateRange as DayPickerRange } from 'react-day-picker'
import { LayoutGrid, Table as TableIcon, Search, X } from 'lucide-react'
import AppLayout from '@r/layouts/app'
import { cn } from '@r/lib/utils'
import {
  DateWindowPill,
  RefreshPill,
  Segment,
  SegmentButton,
  ToolbarRow,
  ToolbarSpacer,
  FilterMenu,
} from '@r/components/vision/toolbar'
import {
  formatDateFr,
  type ProducedHoursPayload,
  type ProducedHoursViewMode,
} from '@r/lib/produced-hours/types'
import { ProducedHoursCards } from '@r/components/produced-hours/produced-hours-cards'
import { ProducedHoursTable } from '@r/components/produced-hours/produced-hours-table'
import { WorkstationDetailSheet } from '@r/components/produced-hours/workstation-detail-sheet'

interface ProducedHoursPageProps extends ProducedHoursPayload {}

function pad(n: number) {
  return String(n).padStart(2, '0')
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export default function ProducedHoursPage(initialProps: ProducedHoursPageProps) {
  const [data, setData] = useState<ProducedHoursPayload>(initialProps)
  const [loading, setLoading] = useState(false)
  const [from, setFrom] = useState(initialProps.from)
  const [to, setTo] = useState(initialProps.to)
  const [viewMode, setViewMode] = useState<ProducedHoursViewMode>('cards')
  const [search, setSearch] = useState('')
  const [selectedAtelier, setSelectedAtelier] = useState<string>('ALL')
  const [selectedPoste, setSelectedPoste] = useState<string | null>(null)
  const [calendarOpen, setCalendarOpen] = useState(false)

  // Fetch updated summary from API
  const fetchData = useCallback(async (newFrom: string, newTo: string) => {
    setLoading(true)
    try {
      const res = await fetch(
        `/api/v1/heures-produites/summary?from=${encodeURIComponent(newFrom)}&to=${encodeURIComponent(newTo)}`
      )
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json: ProducedHoursPayload = await res.json()
      setData(json)
      setFrom(newFrom)
      setTo(newTo)
    } catch (err) {
      console.error('Failed to fetch produced hours:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  // Quick date presets
  const applyPreset = (preset: 'current-month' | 'last-month' | 'last-30' | 'current-week') => {
    const now = new Date()
    let dFrom: Date
    let dTo: Date = now

    if (preset === 'current-month') {
      dFrom = new Date(now.getFullYear(), now.getMonth(), 1)
      dTo = now
    } else if (preset === 'last-month') {
      dFrom = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      dTo = new Date(now.getFullYear(), now.getMonth(), 0)
    } else if (preset === 'last-30') {
      dFrom = new Date(now.getTime() - 30 * 86_400_000)
      dTo = now
    } else {
      // current-week (Monday to today)
      const day = now.getDay()
      const diff = (day === 0 ? -6 : 1) - day
      dFrom = new Date(now.getTime() + diff * 86_400_000)
      dTo = now
    }

    const sFrom = formatDate(dFrom)
    const sTo = formatDate(dTo)
    fetchData(sFrom, sTo)
  }

  // Handle Calendar range selection
  const handleRangeSelect = (range: DayPickerRange | undefined) => {
    if (!range?.from) return
    const sFrom = formatDate(range.from)
    const sTo = range.to ? formatDate(range.to) : sFrom
    fetchData(sFrom, sTo)
    if (range.to) setCalendarOpen(false)
  }

  // Filter workstations
  const filteredWorkstations = useMemo(() => {
    return data.workstations.filter((w) => {
      if (selectedAtelier !== 'ALL' && w.atelier !== selectedAtelier) {
        return false
      }
      if (search.trim()) {
        const q = search.trim().toLowerCase()
        const matchCode = w.poste.toLowerCase().includes(q)
        const matchName = w.name.toLowerCase().includes(q)
        const matchAtelier = w.atelier.toLowerCase().includes(q)
        if (!matchCode && !matchName && !matchAtelier) return false
      }
      return true
    })
  }, [data.workstations, selectedAtelier, search])

  // Date objects for Calendar
  const dateRangeObj = useMemo(() => {
    const parse = (s: string) => {
      const parts = s.split('-').map(Number)
      return new Date(parts[0], parts[1] - 1, parts[2])
    }
    return {
      from: from ? parse(from) : undefined,
      to: to ? parse(to) : undefined,
    }
  }, [from, to])

  return (
    <AppLayout
      active="heures_produites"
      subtitle="Heures produites par poste"
      title="Heures produites · Supply Chain"
      theme="airbnb"
      dense
      scrollable={false}
    >
      <Head title="Heures produites · Supply Chain" />

      <div className="flex h-full flex-col overflow-hidden">
        {/* Toolbar étirée sur toute la largeur (parité avec Réceptions / Charge / Ordonnancement) */}
        <ToolbarRow noWrap className="flex-none">
          {/* View switcher: Cards vs Table */}
          <Segment ariaLabel="Mode d'affichage">
            <SegmentButton
              active={viewMode === 'cards'}
              onClick={() => setViewMode('cards')}
              title="Vue grille de cartes"
            >
              <span className="flex items-center gap-1.5">
                <LayoutGrid size={13} strokeWidth={2} />
                <span>Cartes</span>
              </span>
            </SegmentButton>
            <SegmentButton
              active={viewMode === 'table'}
              onClick={() => setViewMode('table')}
              title="Vue tableau détaillé"
            >
              <span className="flex items-center gap-1.5">
                <TableIcon size={13} strokeWidth={2} />
                <span>Tableau</span>
              </span>
            </SegmentButton>
          </Segment>

          {/* Quick presets */}
          <div className="hidden items-center gap-1 sm:flex">
            <button
              type="button"
              onClick={() => applyPreset('current-month')}
              className={cn(
                'rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors',
                'border-rule bg-card text-foreground hover:border-brand hover:text-brand'
              )}
            >
              Ce mois-ci
            </button>
            <button
              type="button"
              onClick={() => applyPreset('last-month')}
              className={cn(
                'rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors',
                'border-rule bg-card text-foreground hover:border-brand hover:text-brand'
              )}
            >
              Mois dernier
            </button>
            <button
              type="button"
              onClick={() => applyPreset('last-30')}
              className={cn(
                'rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors',
                'border-rule bg-card text-foreground hover:border-brand hover:text-brand'
              )}
            >
              30 derniers jours
            </button>
          </div>

          {/* Custom Date Range Pill */}
          <DateWindowPill
            open={calendarOpen}
            onOpenChange={setCalendarOpen}
            selected={dateRangeObj}
            onSelect={handleRangeSelect}
            title="Sélectionner une plage de dates personnalisée"
          />

          {/* Atelier Filter Dropdown */}
          <FilterMenu
            label={selectedAtelier === 'ALL' ? 'Tous les ateliers' : `Atelier : ${selectedAtelier}`}
            indicators={
              selectedAtelier !== 'ALL' && <span className="size-2 rounded-full bg-brand" />
            }
          >
            <div className="min-w-[180px] p-2 text-xs">
              <div className="mb-1.5 px-2 py-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                Filtrer par atelier
              </div>
              <button
                type="button"
                onClick={() => setSelectedAtelier('ALL')}
                className={cn(
                  'flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left transition-colors',
                  selectedAtelier === 'ALL'
                    ? 'bg-surface-muted font-bold text-foreground'
                    : 'text-muted-foreground hover:bg-surface-hover hover:text-foreground'
                )}
              >
                <span>Tous les ateliers</span>
                <span className="font-mono text-[10px] text-muted-foreground">
                  ({data.workstations.length})
                </span>
              </button>

              {data.ateliers.map((at) => {
                const count = data.workstations.filter((w) => w.atelier === at).length
                return (
                  <button
                    key={at}
                    type="button"
                    onClick={() => setSelectedAtelier(at)}
                    className={cn(
                      'flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left transition-colors',
                      selectedAtelier === at
                        ? 'bg-surface-muted font-bold text-foreground'
                        : 'text-muted-foreground hover:bg-surface-hover hover:text-foreground'
                    )}
                  >
                    <span>{at}</span>
                    <span className="font-mono text-[10px] text-muted-foreground">({count})</span>
                  </button>
                )
              })}
            </div>
          </FilterMenu>

          {/* Espaceur : repousse la recherche et le rafraîchissement tout à droite */}
          <ToolbarSpacer />

          {/* Barre de recherche à droite */}
          <div className="relative min-w-[200px] max-w-[280px]">
            <Search className="absolute left-2.5 top-2 size-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Rechercher poste, nom..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-[30px] w-full rounded-full border border-rule bg-card pl-8 pr-7 text-xs text-foreground placeholder:text-muted-foreground focus:border-brand focus:outline-none"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-2 text-muted-foreground hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            )}
          </div>

          {/* Refresh Pill */}
          <RefreshPill loading={loading} onClick={() => fetchData(from, to)} />
        </ToolbarRow>

        {/* Zone de contenu scrollable pleine largeur */}
        <div className="flex-1 min-h-0 overflow-y-auto px-7 py-5">
          <div className="space-y-4 pb-12">
            {/* Workstations List / Grid */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Postes de charge ({filteredWorkstations.length})
                </div>
                <div className="text-xs text-muted-foreground">
                  Du{' '}
                  <span className="font-mono font-medium text-foreground">
                    {formatDateFr(from)}
                  </span>{' '}
                  au{' '}
                  <span className="font-mono font-medium text-foreground">{formatDateFr(to)}</span>
                </div>
              </div>

              {viewMode === 'cards' ? (
                <ProducedHoursCards
                  workstations={filteredWorkstations}
                  onSelectPoste={setSelectedPoste}
                />
              ) : (
                <ProducedHoursTable
                  workstations={filteredWorkstations}
                  onSelectPoste={setSelectedPoste}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Drilldown Drawer / Sheet */}
      <WorkstationDetailSheet
        poste={selectedPoste}
        from={from}
        to={to}
        open={Boolean(selectedPoste)}
        onOpenChange={(open) => {
          if (!open) setSelectedPoste(null)
        }}
      />
    </AppLayout>
  )
}
