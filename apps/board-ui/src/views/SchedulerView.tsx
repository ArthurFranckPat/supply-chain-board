import { useState, useMemo } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { KpiDashboard } from '@/components/scheduler/KpiDashboard'
import { PlanningTable } from '@/components/scheduler/PlanningTable'
import { UnscheduledTable } from '@/components/scheduler/UnscheduledTable'
import { OrderStatusTable } from '@/components/scheduler/OrderStatusTable'
import { StockProjection } from '@/components/scheduler/StockProjection'
import { AlertsPanel } from '@/components/scheduler/AlertsPanel'
import { CalendarDays, Ban, ShoppingCart, TrendingDown, AlertTriangle } from 'lucide-react'
import type { SchedulerResult } from '@/types/scheduler'
import type { DetailItem } from '@/types/api'

interface SchedulerViewProps {
  isLoading: boolean
  result: SchedulerResult | null
  error: string | null
  onInspect: (item: DetailItem) => void
}

export function SchedulerView({ isLoading, result, error, onInspect: _onInspect }: SchedulerViewProps) {
  const [activeTab, setActiveTab] = useState('planning')

  const stats = useMemo(() => {
    if (!result) return null
    const totalPlanned = Object.values(result.line_candidates).flat().filter((o) => o.scheduled_day).length
    const totalBlocked = Object.values(result.line_candidates).flat().filter((o) => o.blocking_components).length
    const unscheduledCount = result.unscheduled_rows.length
    const ordersLate = result.order_rows.filter((r) =>
      r.statut.toLowerCase().includes('retard') || r.statut.toLowerCase().includes('non')
    ).length
    return { totalPlanned, totalBlocked, unscheduledCount, ordersLate }
  }, [result])

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-10 w-80 rounded-lg" />
        <Skeleton className="h-96 rounded-lg" />
      </div>
    )
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-16 text-center">
          <div className="flex items-center justify-center mb-3">
            <div className="h-10 w-10 rounded-full bg-destructive/10 flex items-center justify-center">
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </div>
          </div>
          <p className="text-destructive font-semibold">Erreur Scheduler</p>
          <p className="text-sm text-muted-foreground mt-1">{error}</p>
        </CardContent>
      </Card>
    )
  }

  if (!result) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-16 text-center">
          <div className="flex items-center justify-center mb-3">
            <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
              <CalendarDays className="h-5 w-5 text-muted-foreground" />
            </div>
          </div>
          <p className="font-semibold text-muted-foreground">Aucun run scheduler disponible</p>
          <p className="text-sm text-muted-foreground mt-1">Lancez le scheduler depuis Home.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-5">
      {/* KPI strip */}
      <KpiDashboard
        score={result.score}
        tauxService={result.taux_service}
        tauxOuverture={result.taux_ouverture}
        nbDeviations={result.nb_deviations}
        nbJit={result.nb_jit}
        nbChangementsSerie={result.nb_changements_serie}
      />

      {/* Summary counters */}
      {stats && (
        <div className="grid grid-cols-4 gap-3">
          <Card className="py-0">
            <CardContent className="flex items-center gap-3 px-4 py-3">
              <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <CalendarDays className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-lg font-bold tabular-nums">{stats.totalPlanned}</p>
                <p className="text-[11px] text-muted-foreground">OF planifies</p>
              </div>
            </CardContent>
          </Card>
          <Card className="py-0">
            <CardContent className="flex items-center gap-3 px-4 py-3">
              <div className="h-9 w-9 rounded-lg bg-destructive/10 flex items-center justify-center shrink-0">
                <Ban className="h-4 w-4 text-destructive" />
              </div>
              <div>
                <p className="text-lg font-bold tabular-nums">{stats.unscheduledCount}</p>
                <p className="text-[11px] text-muted-foreground">Non planifiables (hors ligne)</p>
              </div>
            </CardContent>
          </Card>
          <Card className="py-0">
            <CardContent className="flex items-center gap-3 px-4 py-3">
              <div className="h-9 w-9 rounded-lg bg-orange/10 flex items-center justify-center shrink-0">
                <ShoppingCart className="h-4 w-4 text-orange" />
              </div>
              <div>
                <p className="text-lg font-bold tabular-nums">{stats.ordersLate}</p>
                <p className="text-[11px] text-muted-foreground">Commandes a risque</p>
              </div>
            </CardContent>
          </Card>
          <Card className="py-0">
            <CardContent className="flex items-center gap-3 px-4 py-3">
              <div className="h-9 w-9 rounded-lg bg-orange/10 flex items-center justify-center shrink-0">
                <TrendingDown className="h-4 w-4 text-orange" />
              </div>
              <div>
                <p className="text-lg font-bold tabular-nums">{stats.totalBlocked}</p>
                <p className="text-[11px] text-muted-foreground">OF bloques (rupture)</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="planning" className="gap-1.5">
            <CalendarDays className="h-3.5 w-3.5" />
            Planning
          </TabsTrigger>
          <TabsTrigger value="unscheduled" className="gap-1.5">
            <Ban className="h-3.5 w-3.5" />
            Non planifies
            {result.unscheduled_rows.length > 0 && (
              <Badge variant="destructive" className="h-4 min-w-4 px-1 text-[10px]">
                {result.unscheduled_rows.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="orders" className="gap-1.5">
            <ShoppingCart className="h-3.5 w-3.5" />
            Commandes
          </TabsTrigger>
          <TabsTrigger value="stock" className="gap-1.5">
            <TrendingDown className="h-3.5 w-3.5" />
            Stock
          </TabsTrigger>
          <TabsTrigger value="alerts" className="gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" />
            Alertes
            {result.alerts.length > 0 && (
              <Badge variant="outline" className="h-4 min-w-4 px-1 text-[10px]">
                {result.alerts.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="planning" className="mt-4">
          <PlanningTable candidates={result.line_candidates} />
        </TabsContent>

        <TabsContent value="unscheduled" className="mt-4">
          <UnscheduledTable rows={result.unscheduled_rows} />
        </TabsContent>

        <TabsContent value="orders" className="mt-4">
          <OrderStatusTable rows={result.order_rows} />
        </TabsContent>

        <TabsContent value="stock" className="mt-4">
          <StockProjection entries={result.stock_projection} />
        </TabsContent>

        <TabsContent value="alerts" className="mt-4">
          <AlertsPanel alerts={result.alerts} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
