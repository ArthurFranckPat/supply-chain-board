import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { AlertTriangle } from 'lucide-react'

interface AlertsPanelProps {
  alerts: string[]
}

export function AlertsPanel({ alerts }: AlertsPanelProps) {
  if (!alerts.length) {
    return (
      <div className="text-sm text-muted-foreground py-4 text-center">
        Aucune alerte
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {alerts.map((alert, i) => {
        const isDestructive = alert.toLowerCase().includes('non planifiable') || alert.toLowerCase().includes('bloque')
        return (
          <Alert key={i} variant={isDestructive ? 'destructive' : 'default'}>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle className="text-xs font-semibold">{isDestructive ? 'Critique' : 'Attention'}</AlertTitle>
            <AlertDescription className="text-xs">{alert}</AlertDescription>
          </Alert>
        )
      })}
    </div>
  )
}
