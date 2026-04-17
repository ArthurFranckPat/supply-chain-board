import { Card, CardContent } from '@/components/ui/card'

interface KpiDashboardProps {
  score: number
  tauxService: number
  tauxOuverture: number
  nbDeviations: number
  nbJit: number
  nbChangementsSerie: number
}

function tone(value: number) {
  if (value >= 0.8) return 'text-green'
  if (value >= 0.5) return 'text-orange'
  return 'text-destructive'
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
    { label: 'Score', value: score.toFixed(3), className: tone(score) },
    { label: 'Taux service', value: (tauxService * 100).toFixed(1) + '%', className: tone(tauxService) },
    { label: 'Taux ouverture', value: (tauxOuverture * 100).toFixed(1) + '%', className: tone(tauxOuverture) },
    { label: 'Deviations', value: String(nbDeviations), className: nbDeviations > 0 ? 'text-orange' : '' },
    { label: 'JIT', value: String(nbJit), className: '' },
    { label: 'Changements serie', value: String(nbChangementsSerie), className: '' },
  ]

  return (
    <div className="grid grid-cols-6 gap-3">
      {kpis.map((kpi) => (
        <Card key={kpi.label} className="py-3">
          <CardContent className="px-4 py-0 text-center">
            <p className="text-xs text-muted-foreground mb-1">{kpi.label}</p>
            <p className={`text-xl font-bold ${kpi.className}`}>{kpi.value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
