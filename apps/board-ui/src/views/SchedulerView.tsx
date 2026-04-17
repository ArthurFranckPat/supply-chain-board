import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { KpiDashboard } from '@/components/scheduler/KpiDashboard'
import { PlanningTable } from '@/components/scheduler/PlanningTable'
import { UnscheduledTable } from '@/components/scheduler/UnscheduledTable'
import { OrderStatusTable } from '@/components/scheduler/OrderStatusTable'
import { StockProjection } from '@/components/scheduler/StockProjection'
import { AlertsPanel } from '@/components/scheduler/AlertsPanel'
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

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-96 rounded-lg" />
      </div>
    )
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-destructive font-semibold">Erreur Scheduler</p>
          <p className="text-sm text-muted-foreground mt-1">{error}</p>
        </CardContent>
      </Card>
    )
  }

  if (!result) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <p className="font-semibold">Aucun run scheduler disponible</p>
          <p className="text-sm">Lancez le scheduler depuis Home.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <KpiDashboard
        score={result.score}
        tauxService={result.taux_service}
        tauxOuverture={result.taux_ouverture}
        nbDeviations={result.nb_deviations}
        nbJit={result.nb_jit}
        nbChangementsSerie={result.nb_changements_serie}
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="planning">Planning</TabsTrigger>
          <TabsTrigger value="unscheduled">
            Non planifies {result.unscheduled_rows.length > 0 && `(${result.unscheduled_rows.length})`}
          </TabsTrigger>
          <TabsTrigger value="orders">Commandes</TabsTrigger>
          <TabsTrigger value="stock">Stock</TabsTrigger>
          <TabsTrigger value="alerts">
            Alertes {result.alerts.length > 0 && `(${result.alerts.length})`}
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
