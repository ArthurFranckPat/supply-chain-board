import { useState } from 'react'
import { useCalendar } from '@/hooks/useCalendar'
import { useCapacityConfig } from '@/hooks/useCapacityConfig'
import { MonthGrid } from '@/components/capacity/MonthGrid'
import { WeeklyCapacityGrid } from '@/components/capacity/WeeklyCapacityGrid'
import { Segmented } from '@/components/ui/segmented'
import { Card, CardContent } from '@/components/ui/card'
import { CalendarDays, Gauge } from 'lucide-react'
import type { DetailItem } from '@/types/api'

interface CapacityViewProps {
  onInspect?: (item: DetailItem) => void
}

type Tab = 'calendar' | 'capacity'

export function CapacityView({ onInspect: _onInspect }: CapacityViewProps) {
  const [activeTab, setActiveTab] = useState<Tab>('calendar')
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)

  const calendar = useCalendar(year, month)
  const capacity = useCapacityConfig()

  function handleMonthChange(y: number, m: number) {
    setYear(y)
    setMonth(m)
  }

  return (
    <div className="space-y-4 max-w-[900px]">
      <div className="flex items-center justify-between">
        <Segmented
          value={activeTab}
          onChange={v => setActiveTab(v as Tab)}
          options={[
            { value: 'calendar', label: 'Calendrier', icon: <CalendarDays className="h-3.5 w-3.5" /> },
            { value: 'capacity', label: 'Capacites', icon: <Gauge className="h-3.5 w-3.5" /> },
          ]}
        />
      </div>

      {activeTab === 'calendar' && (
        <Card>
          <CardContent className="p-5">
            {calendar.isLoading && (
              <div className="py-12 text-center text-sm text-muted-foreground">
                Chargement du calendrier...
              </div>
            )}
            {calendar.error && (
              <div className="py-12 text-center text-sm text-destructive">
                Erreur : {(calendar.error as Error).message || 'Impossible de charger le calendrier'}
              </div>
            )}
            {calendar.data && (
              <MonthGrid
                year={year}
                month={month}
                days={calendar.data.days}
                holidaysFetchedAt={calendar.data.holidays_fetched_at}
                onMonthChange={handleMonthChange}
                onToggleDay={(date, reason, remove) =>
                  calendar.toggleManualOff.mutate({ date, reason, remove })
                }
                onRefreshHolidays={() => calendar.refreshHolidays.mutate()}
                isRefreshing={calendar.refreshHolidays.isPending}
              />
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === 'capacity' && (
        <Card>
          <CardContent className="p-5">
            {capacity.isLoading && (
              <div className="py-12 text-center text-sm text-muted-foreground">
                Chargement des capacites...
              </div>
            )}
            {capacity.error && (
              <div className="py-12 text-center text-sm text-destructive">
                Erreur : {(capacity.error as Error).message || 'Impossible de charger les capacites'}
              </div>
            )}
            {capacity.data && (
              <WeeklyCapacityGrid
                config={capacity.data}
                onUpdatePoste={data => capacity.updatePoste.mutate(data)}
                onSetOverride={data => capacity.setOverride.mutate(data)}
                onRemoveOverride={data => capacity.removeOverride.mutate(data)}
              />
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
