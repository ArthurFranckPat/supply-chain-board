import { useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts'
import { usePalettes } from '@/hooks/usePalettes'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { GridTable } from '@/components/ui/GridTable'

const KPI_CARD = 'bg-card border border-border px-3 py-2 rounded-sm flex flex-col'

export function PaletteView() {
  const { data, loading, error } = usePalettes()

  const chartData = useMemo(() => {
    if (!data) return []
    // Filtrer les weekends (lundi=0, vendredi=4)
    return data.by_day
      .filter((d) => {
        const dt = new Date(d.date)
        const wd = dt.getDay()
        return wd >= 1 && wd <= 5
      })
      .map((d) => ({
        date: d.date_fmt,
        fullDate: d.date,
        camions: d.camions,
        palettes: d.total_palettes,
        std: d.palettes_standard,
        eh: d.palettes_easyhome,
      }))
  }, [data])

  if (loading) {
    return (
      <div className="flex flex-col gap-3 p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="p-4 text-[11px] text-muted-foreground">
        {error ? `Erreur: ${error}` : 'Aucune donnée'}
      </div>
    )
  }

  const { totaux, by_day, moyenne } = data
  const maxCamions = Math.max(...chartData.map((d) => d.camions), 1)

  return (
    <div className="flex flex-col gap-3 p-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <div className={KPI_CARD}>
          <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Palettes Standard</span>
          <span className="text-lg font-bold font-mono tabular-nums">{totaux.palettes_standard}</span>
          <span className="text-[9px] text-muted-foreground">800×1200</span>
        </div>
        <div className={KPI_CARD}>
          <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Palettes EasyHome</span>
          <span className="text-lg font-bold font-mono tabular-nums text-sky-600">{totaux.palettes_easyhome}</span>
          <span className="text-[9px] text-muted-foreground">1000×1200</span>
        </div>
        <div className={KPI_CARD}>
          <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Total Palettes</span>
          <span className="text-lg font-bold font-mono tabular-nums">{totaux.total_palettes}</span>
        </div>
        <div className={KPI_CARD}>
          <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Camions</span>
          <span className="text-lg font-bold font-mono tabular-nums text-amber-600">{totaux.camions}</span>
          <span className="text-[9px] text-muted-foreground">mix std+eh</span>
        </div>
        <div className={KPI_CARD}>
          <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Moy. camions / sem.</span>
          <span className="text-lg font-bold font-mono tabular-nums text-indigo-600">{moyenne.par_semaine}</span>
          <span className="text-[9px] text-muted-foreground">sur jours ouvrés</span>
        </div>
      </div>

      {/* Graphique camions par jour */}
      <Card className="p-3 overflow-hidden border-border">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
            Besoin camions par jour (jours ouvrés)
          </h3>
        </div>
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 20, right: 5, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={{ stroke: 'hsl(var(--border))' }}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={{ stroke: 'hsl(var(--border))' }}
                tickLine={false}
                allowDecimals={false}
                label={{ value: 'camions', angle: -90, position: 'insideLeft', fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const d = payload[0].payload
                  return (
                    <div className="bg-card border border-border px-2 py-1 text-[11px]">
                      <p className="font-semibold">{d.fullDate}</p>
                      <p className="text-muted-foreground">{d.palettes} palettes · {d.camions} camion{d.camions > 1 ? 's' : ''}</p>
                      <p className="text-[10px] text-muted-foreground">Std: {d.std} · EH: {d.eh}</p>
                    </div>
                  )
                }}
              />
              <ReferenceLine
                y={moyenne.par_jour}
                stroke="#6366f1"
                strokeDasharray="4 4"
                strokeWidth={1.5}
                label={{ value: `moy. ${moyenne.par_jour.toFixed(1)} camions/j`, position: 'insideTopRight', fontSize: 10, fill: '#6366f1' }}
              />
              <Bar dataKey="camions" radius={[3, 3, 0, 0]} label={{ position: 'top', fontSize: 10, fill: 'hsl(var(--foreground))' }}>
                {chartData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={entry.camions === maxCamions ? '#ef4444' : '#3b82f6'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Tableau par jour (jours ouvrés uniquement) */}
      <Card className="overflow-hidden border-border">
        <GridTable
          data={by_day.filter((d) => {
            const dt = new Date(d.date)
            const wd = dt.getDay()
            return wd >= 1 && wd <= 5
          })}
          keyExtractor={(r) => r.date}
          maxHeight="360px"
          columns={[
            { key: 'date_fmt', header: 'Date', width: '70px', align: 'left' },
            { key: 'nb_lignes', header: 'Lignes', width: '60px', align: 'right' },
            { key: 'palettes_standard', header: 'Pal. Std', width: '80px', align: 'right', cell: (r) => <span className="font-mono">{r.palettes_standard}</span> },
            { key: 'palettes_easyhome', header: 'Pal. EH', width: '80px', align: 'right', cell: (r) => <span className="font-mono text-sky-600">{r.palettes_easyhome}</span> },
            { key: 'total_palettes', header: 'Total', width: '70px', align: 'right', cell: (r) => <span className="font-mono font-semibold">{r.total_palettes}</span> },
            { key: 'camions', header: 'Camions', width: '80px', align: 'right', cell: (r) => (
              <span className={`font-mono font-bold ${r.camions >= 2 ? 'text-amber-600' : 'text-foreground'}`}>
                {r.camions}
              </span>
            )},
          ]}
        />
      </Card>
    </div>
  )
}
