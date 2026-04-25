import { useState } from 'react'
import { useCalendar } from '@/hooks/useCalendar'
import { useCapacityConfig } from '@/hooks/useCapacityConfig'
import { MonthGrid } from '@/components/capacity/MonthGrid'
import { WeeklyCapacityGrid } from '@/components/capacity/WeeklyCapacityGrid'
import { Segmented } from '@/components/ui/segmented'
import { LoadingInline, LoadingError } from '@/components/ui/loading'
import { Card, CardContent } from '@/components/ui/card'
import { CalendarDays, Gauge } from 'lucide-react'
type Tab = 'calendar' | 'capacity'

export function CapacityView() {
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
            { value: 'capacity', label: 'Capacités', icon: <Gauge className="h-3.5 w-3.5" /> },
          ]}
        />
      </div>

      {activeTab === 'calendar' && (
        <Card>
          <CardContent className="p-5">
            {calendar.isLoading && (
              <LoadingInline label="du calendrier" />
            )}
            {calendar.error && (
              <LoadingError
                message={`Impossible de charger le calendrier : ${(calendar.error as Error).message}`}
                onRetry={() => calendar.refetch()}
              />
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
              <LoadingInline label="des capacités" />
            )}
            {capacity.error && (
              <LoadingError
                message={`Impossible de charger les capacités : ${(capacity.error as Error).message}`}
                onRetry={() => capacity.refetch()}
              />
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
