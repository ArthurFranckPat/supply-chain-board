import { Card, CardContent } from '@/components/ui/card'

interface KpiDashboardProps {
  score: number
  tauxService: number
  tauxOuverture: number
  nbDeviations: number
  nbJit: number
  nbChangementsSerie: number
}

function toneClass(value: number) {
  if (value >= 0.8) return 'text-green'
  if (value >= 0.5) return 'text-orange'
  return 'text-destructive'
}

function ProgressBar({ value, className = '' }: { value: number; className?: string }) {
  const pct = Math.min(100, Math.max(0, value * 100))
  return (
    <div className={`h-1.5 rounded-full bg-muted overflow-hidden ${className}`}>
      <div
        className="h-full rounded-full transition-all"
        style={{
          width: `${pct}%`,
          backgroundColor:
            value >= 0.8 ? 'var(--green)' : value >= 0.5 ? 'var(--orange)' : 'var(--destructive)',
        }}
      />
    </div>
  )
}

export function KpiDashboard({
  score,
  tauxService,
  tauxOuverture,
  nbDeviations,
  nbJit,
  nbChangementsSerie,
}: KpiDashboardProps) {
  const kpis = [
    { label: 'Score global', value: score.toFixed(3), raw: score, pct: true },
    { label: 'Taux service', value: (tauxService * 100).toFixed(1) + '%', raw: tauxService, pct: true },
    { label: 'Taux ouverture', value: (tauxOuverture * 100).toFixed(1) + '%', raw: tauxOuverture, pct: true },
    { label: 'Deviations', value: String(nbDeviations), raw: null, pct: false },
    { label: 'JIT', value: String(nbJit), raw: null, pct: false },
    { label: 'Chgmts serie', value: String(nbChangementsSerie), raw: null, pct: false },
  ]

  return (
    <div className="grid grid-cols-6 gap-3">
      {kpis.map((kpi) => (
        <Card key={kpi.label} className="py-0">
          <CardContent className="px-3.5 py-3 space-y-1.5">
            <p className="text-[11px] text-muted-foreground">{kpi.label}</p>
            <p className={`text-xl font-bold tabular-nums ${kpi.raw !== null ? toneClass(kpi.raw) : ''}`}>
              {kpi.value}
            </p>
            {kpi.pct && kpi.raw !== null && <ProgressBar value={kpi.raw} />}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
