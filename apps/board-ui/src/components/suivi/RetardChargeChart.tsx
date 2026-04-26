import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { useRetardCharge } from '@/hooks/useRetardCharge'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export function RetardChargeChart() {
  const { data, loading, error } = useRetardCharge()

  if (loading) {
    return (
      <Card className="p-4">
        <Skeleton className="h-6 w-64 mb-4" />
        <Skeleton className="h-48 w-full" />
      </Card>
    )
  }

  if (error || !data || data.items.length === 0) {
    return (
      <Card className="p-4">
        <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
          Heures de retard par poste
        </h3>
        <p className="text-[11px] text-muted-foreground">
          {error ? `Erreur: ${error}` : 'Aucun retard de production'}
        </p>
      </Card>
    )
  }

  const chartData = data.items.map((item) => ({
    poste: item.poste,
    libelle: item.libelle || item.poste,
    heures: Math.round(item.heures * 100) / 100,
  }))

  const maxHeures = Math.max(...data.items.map((i) => i.heures))

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
          Heures de retard par poste
        </h3>
        <span className="text-[11px] font-mono font-semibold text-red-600">
          Total: {data.total_heures.toFixed(1)}h
        </span>
      </div>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis
              dataKey="poste"
              tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
              axisLine={{ stroke: 'hsl(var(--border))' }}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
              axisLine={{ stroke: 'hsl(var(--border))' }}
              tickLine={false}
              label={{ value: 'h', angle: -90, position: 'insideLeft', fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const entry = payload[0].payload
                return (
                  <div className="bg-card border border-border px-2 py-1 text-[11px]">
                    <p className="font-semibold">{entry.poste}</p>
                    <p className="text-muted-foreground">{entry.libelle}</p>
                    <p>{entry.heures.toFixed(2)}h de retard</p>
                  </div>
                )
              }}
            />
            <Bar dataKey="heures" radius={[4, 4, 0, 0]}>
              {chartData.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={entry.heures === maxHeures ? '#ef4444' : '#3b82f6'}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}
