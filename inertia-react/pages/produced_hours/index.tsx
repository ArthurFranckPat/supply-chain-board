import { useState, useMemo, useCallback } from 'react'
import { Head } from '@inertiajs/react'
import type { DateRange as DayPickerRange } from 'react-day-picker'
import { Search, X, Loader2 } from 'lucide-react'
import AppLayout from '@r/layouts/app'
import { cn } from '@r/lib/utils'
import {
  DateWindowPill,
  RefreshPill,
  ToolbarRow,
  ToolbarSpacer,
  FilterMenu,
  Segment,
  SegmentButton,
} from '@r/components/vision/toolbar'
import {
  formatDateFr,
  type ProducedHoursPayload,
  type ProducedOrdersPayload,
  type OrderDateMode,
} from '@r/lib/produced-hours/types'
import { ProducedHoursTable } from '@r/components/produced-hours/produced-hours-table'
import { ProducedOrdersTable } from '@r/components/produced-hours/produced-orders-table'
import { WorkstationDetailSheet } from '@r/components/produced-hours/workstation-detail-sheet'
import { OrderWorkstationDetailSheet } from '@r/components/produced-hours/order-workstation-detail-sheet'

interface ProducedHoursPageProps extends Partial<ProducedHoursPayload> {
  initialView?: 'heures' | 'commandes'
  initialDateMode?: OrderDateMode
  hoursPayload?: ProducedHoursPayload | null
  ordersPayload?: ProducedOrdersPayload | null
}

function pad(n: number) {
  return String(n).padStart(2, '0')
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export default function ProducedHoursPage(initialProps: ProducedHoursPageProps) {
  const [view, setView] = useState<'heures' | 'commandes'>(initialProps.initialView || 'heures')
  const [dateMode, setDateMode] = useState<OrderDateMode>(
    initialProps.initialDateMode || 'demandee'
  )

  const initialHours =
    initialProps.hoursPayload ||
    (initialProps.workstations && !('products' in (initialProps.workstations[0] || {}))
      ? (initialProps as ProducedHoursPayload)
      : null)

  const initialOrders =
    initialProps.ordersPayload ||
    (initialProps.workstations && 'products' in (initialProps.workstations[0] || {}))
      ? (initialProps as unknown as ProducedOrdersPayload)
      : null

  const [hoursData, setHoursData] = useState<ProducedHoursPayload | null>(initialHours)
  const [ordersData, setOrdersData] = useState<ProducedOrdersPayload | null>(initialOrders)

  const [loading, setLoading] = useState(false)
  const [from, setFrom] = useState(
    initialProps.from || formatDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  )
  const [to, setTo] = useState(initialProps.to || formatDate(new Date()))
  const [search, setSearch] = useState('')
  const [selectedAtelier, setSelectedAtelier] = useState<string>('ALL')
  const [selectedPoste, setSelectedPoste] = useState<string | null>(null)
  const [selectedOrderPoste, setSelectedOrderPoste] = useState<string | null>(null)
  const [calendarOpen, setCalendarOpen] = useState(false)

  // Fetch updated data from API depending on active view
  const fetchData = useCallback(
    async (
      newFrom: string,
      newTo: string,
      targetView: 'heures' | 'commandes' = view,
      targetDateMode: OrderDateMode = dateMode
    ) => {
      setLoading(true)
      try {
        if (targetView === 'commandes') {
          const res = await fetch(
            `/api/v1/heures-produites/orders-summary?from=${encodeURIComponent(newFrom)}&to=${encodeURIComponent(newTo)}&dateMode=${encodeURIComponent(targetDateMode)}`
          )
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          const json: ProducedOrdersPayload = await res.json()
          setOrdersData(json)
        } else {
          const res = await fetch(
            `/api/v1/heures-produites/summary?from=${encodeURIComponent(newFrom)}&to=${encodeURIComponent(newTo)}`
          )
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          const json: ProducedHoursPayload = await res.json()
          setHoursData(json)
        }
        setFrom(newFrom)
        setTo(newTo)
      } catch (err) {
        console.error('Failed to fetch data:', err)
      } finally {
        setLoading(false)
      }
    },
    [view, dateMode]
  )

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
    fetchData(sFrom, sTo, view, dateMode)
  }

  // Handle Calendar range selection
  const handleRangeSelect = (range: DayPickerRange | undefined) => {
    if (!range?.from) return
    const sFrom = formatDate(range.from)
    const sTo = range.to ? formatDate(range.to) : sFrom
    fetchData(sFrom, sTo, view, dateMode)
    if (range.to) setCalendarOpen(false)
  }

  // Handle View Change
  const handleViewChange = (newView: 'heures' | 'commandes') => {
    setView(newView)
    if (newView === 'commandes' && !ordersData) {
      fetchData(from, to, 'commandes', dateMode)
    } else if (newView === 'heures' && !hoursData) {
      fetchData(from, to, 'heures', dateMode)
    }
  }

  // Handle Date Mode Change
  const handleDateModeChange = (newMode: OrderDateMode) => {
    setDateMode(newMode)
    fetchData(from, to, 'commandes', newMode)
  }

  // Filter workstations for Heures Produites view
  const filteredHoursWorkstations = useMemo(() => {
    if (!hoursData) return []
    return hoursData.workstations.filter((w) => {
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
  }, [hoursData, selectedAtelier, search])

  // Filter workstations for Vision Commandes view
  const filteredOrdersWorkstations = useMemo(() => {
    if (!ordersData) return []
    return ordersData.workstations.filter((w) => {
      if (selectedAtelier !== 'ALL' && w.atelier !== selectedAtelier) {
        return false
      }
      if (search.trim()) {
        const q = search.trim().toLowerCase()
        const matchCode = w.poste.toLowerCase().includes(q)
        const matchName = w.name.toLowerCase().includes(q)
        const matchAtelier = w.atelier.toLowerCase().includes(q)
        const matchProduct = w.products.some(
          (p) => p.code.toLowerCase().includes(q) || p.name.toLowerCase().includes(q)
        )
        if (!matchCode && !matchName && !matchAtelier && !matchProduct) return false
      }
      return true
    })
  }, [ordersData, selectedAtelier, search])

  // Available ateliers
  const ateliersList = useMemo(() => {
    const list = hoursData?.ateliers || ordersData?.ateliers || ['CLP', 'S3P', 'S4P', 'S9P']
    return Array.from(new Set(list)).sort()
  }, [hoursData, ordersData])

  // Active workstations count for filter
  const allCurrentWorkstations = useMemo(() => {
    return view === 'commandes' ? ordersData?.workstations || [] : hoursData?.workstations || []
  }, [view, ordersData, hoursData])

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

  const ordersTotalPieces = useMemo(() => {
    return filteredOrdersWorkstations.reduce((acc, w) => acc + w.totalQuantity, 0)
  }, [filteredOrdersWorkstations])

  return (
    <AppLayout
      active="heures_produites"
      subtitle={
        view === 'commandes'
          ? "Vision commandes · Produits finis par ligne d'assemblage final"
          : 'Heures produites par poste'
      }
      title={
        view === 'commandes' ? 'Commandes PF · Supply Chain' : 'Heures produites · Supply Chain'
      }
      theme="airbnb"
      dense
      scrollable={false}
    >
      <Head
        title={
          view === 'commandes' ? 'Commandes PF · Supply Chain' : 'Heures produites · Supply Chain'
        }
      />

      <div className="flex h-full flex-col overflow-hidden">
        {/* Toolbar étirée sur toute la largeur */}
        <ToolbarRow noWrap className="flex-none">
          {/* Commutateur de Vision */}
          <Segment role="radiogroup" ariaLabel="Vision">
            <SegmentButton
              role="radio"
              active={view === 'heures'}
              onClick={() => handleViewChange('heures')}
            >
              Heures produites
            </SegmentButton>
            <SegmentButton
              role="radio"
              active={view === 'commandes'}
              onClick={() => handleViewChange('commandes')}
            >
              Vision commandes
            </SegmentButton>
          </Segment>

          {/* Commutateur Date demandée / acceptée (OTD) quand la vision commandes est active */}
          {view === 'commandes' && (
            <Segment
              role="radiogroup"
              ariaLabel="Date de référence"
              className="animate-in fade-in duration-150"
            >
              <SegmentButton
                role="radio"
                active={dateMode === 'demandee'}
                onClick={() => handleDateModeChange('demandee')}
                title="Date d'expédition demandée par le client (X4HSHIDAT_0)"
              >
                Demandée
              </SegmentButton>
              <SegmentButton
                role="radio"
                active={dateMode === 'acceptee'}
                onClick={() => handleDateModeChange('acceptee')}
                title="Date d'expédition promise / acceptée par l'usine (SHIDAT_0)"
              >
                Acceptée
              </SegmentButton>
            </Segment>
          )}

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
                  ({allCurrentWorkstations.length})
                </span>
              </button>

              {ateliersList.map((at) => {
                const count = allCurrentWorkstations.filter((w) => w.atelier === at).length
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
              placeholder={
                view === 'commandes'
                  ? 'Rechercher ligne, produit PF...'
                  : 'Rechercher poste, nom...'
              }
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
          <RefreshPill loading={loading} onClick={() => fetchData(from, to, view, dateMode)} />
        </ToolbarRow>

        {/* Zone de contenu scrollable pleine largeur */}
        <div className="flex-1 min-h-0 overflow-y-auto px-7 py-5">
          <div className="space-y-4 pb-12">
            {loading && !hoursData && !ordersData ? (
              <div className="flex h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-rule bg-card p-8 text-center">
                <Loader2 className="size-8 animate-spin text-brand" />
                <p className="mt-3 text-xs text-muted-foreground">
                  Chargement des données en cours...
                </p>
              </div>
            ) : view === 'commandes' ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Lignes d'assemblage final ({filteredOrdersWorkstations.length})
                    {ordersTotalPieces > 0 && (
                      <span className="ml-2 font-mono font-normal text-foreground">
                        · {ordersTotalPieces.toLocaleString('fr-FR')} pièces
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Date {dateMode === 'demandee' ? 'demandée' : 'acceptée'} du{' '}
                    <span className="font-mono font-medium text-foreground">
                      {formatDateFr(from)}
                    </span>{' '}
                    au{' '}
                    <span className="font-mono font-medium text-foreground">
                      {formatDateFr(to)}
                    </span>
                  </div>
                </div>

                <ProducedOrdersTable
                  workstations={filteredOrdersWorkstations}
                  onSelectPoste={setSelectedOrderPoste}
                />
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Postes de charge ({filteredHoursWorkstations.length})
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Du{' '}
                    <span className="font-mono font-medium text-foreground">
                      {formatDateFr(from)}
                    </span>{' '}
                    au{' '}
                    <span className="font-mono font-medium text-foreground">
                      {formatDateFr(to)}
                    </span>
                  </div>
                </div>

                <ProducedHoursTable
                  workstations={filteredHoursWorkstations}
                  onSelectPoste={setSelectedPoste}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Drilldown Drawer / Sheet pour les heures produites */}
      <WorkstationDetailSheet
        poste={selectedPoste}
        from={from}
        to={to}
        open={Boolean(selectedPoste)}
        onOpenChange={(open) => {
          if (!open) setSelectedPoste(null)
        }}
      />

      {/* Drilldown Drawer / Sheet pour la vision commandes */}
      <OrderWorkstationDetailSheet
        poste={selectedOrderPoste}
        from={from}
        to={to}
        dateMode={dateMode}
        open={Boolean(selectedOrderPoste)}
        onOpenChange={(open) => {
          if (!open) setSelectedOrderPoste(null)
        }}
      />
    </AppLayout>
  )
}
