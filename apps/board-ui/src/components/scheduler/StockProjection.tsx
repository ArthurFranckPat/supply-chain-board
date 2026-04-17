import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts'
import type { StockProjectionEntry } from '@/types/scheduler'

const BUFFER_THRESHOLDS: Record<string, number> = {
  BDH2216AL: 673,
  BDH2231AL: 598,
  BDH2251AL: 598,
}

const COLORS = ['#0f766e', '#b45309', '#6366f1']

interface StockProjectionProps {
  entries: StockProjectionEntry[]
}

export function StockProjection({ entries }: StockProjectionProps) {
  const { chartData, articles } = useMemo(() => {
    const articlesSet = new Set(entries.map((e) => e.article))
    const articles = [...articlesSet].sort()

    const byDay = new Map<string, Record<string, number>>()
    for (const e of entries) {
      const existing = byDay.get(e.jour) ?? {}
      existing[e.article] = e.stock_projete
      byDay.set(e.jour, existing)
    }

    const chartData = [...byDay.entries()]
      .map(([jour, values]) => ({ jour, ...values }))
      .sort((a, b) => a.jour.localeCompare(b.jour))

    return { chartData, articles }
  }, [entries])

  if (!entries.length) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <p>Aucune projection stock disponible</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Projection Stock BDH</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={350}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e2d8" />
            <XAxis
              dataKey="jour"
              tickFormatter={(v: string) => {
                try { return new Date(v).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) } catch { return v }
              }}
              tick={{ fontSize: 11 }}
            />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip
              labelFormatter={(v: string) => {
                try { return new Date(v).toLocaleDateString('fr-FR') } catch { return v }
              }}
            />
            <Legend />
            {articles.map((article, i) => (
              <Line
                key={article}
                type="monotone"
                dataKey={article}
                stroke={COLORS[i % COLORS.length]}
                strokeWidth={2}
                dot={false}
              />
            ))}
            {articles.map((article, i) => {
              const threshold = BUFFER_THRESHOLDS[article]
              if (!threshold) return null
              return (
                <ReferenceLine
                  key={`ref-${article}`}
                  y={threshold}
                  stroke={COLORS[i % COLORS.length]}
                  strokeDasharray="6 3"
                  strokeWidth={1}
                  label={{ value: `${article} seuil`, position: 'right', fontSize: 10 }}
                />
              )
            })}
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
