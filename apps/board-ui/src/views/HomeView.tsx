import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface HomeViewProps {
  loadState: 'idle' | 'loading' | 'ready' | 'error'
  s1RunState: 'idle' | 'running' | 'success' | 'error'
  scheduleState: 'idle' | 'running' | 'success'
  lastSourceSnapshot: Record<string, unknown> | null
  onLoadSource: () => void
  onRunS1: () => void
  onRunSchedule: () => void
}

export function HomeView({
  loadState,
  s1RunState,
  scheduleState,
  lastSourceSnapshot,
  onLoadSource,
  onRunS1,
  onRunSchedule,
}: HomeViewProps) {
  const counts = lastSourceSnapshot?.counts as Record<string, number> | undefined

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Source */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Source de donnees</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Extractions ERP centralisees. Lecture directe des fichiers CSV du dossier partage.
          </p>
          <div className="flex gap-3">
            <Button onClick={onLoadSource} disabled={loadState === 'loading'}>
              {loadState === 'loading' ? 'Chargement...' : 'Charger la source'}
            </Button>
            <Button
              variant="secondary"
              onClick={onRunS1}
              disabled={loadState !== 'ready' || s1RunState === 'running'}
            >
              {s1RunState === 'running' ? 'Run S+1 en cours...' : 'Lancer le run S+1'}
            </Button>
            <Button
              variant="outline"
              onClick={onRunSchedule}
              disabled={loadState !== 'ready' || scheduleState === 'running'}
            >
              {scheduleState === 'running' ? 'Scheduler en cours...' : 'Lancer le Scheduler'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Snapshot */}
      {counts && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Dernier chargement</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-3">
              {Object.entries(counts).map(([key, value]) => (
                <div key={key} className="bg-muted rounded-md p-3 text-center">
                  <p className="text-2xl font-bold">{value.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground capitalize">{key.replace(/_/g, ' ')}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Mode operatoire */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Mode operatoire</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
            <li>Charger la source Extractions ERP.</li>
            <li>Lancer le run S+1 (faisabilite) ou le Scheduler (planification).</li>
            <li>Analyser les resultats dans les onglets S+1 / Actions / Scheduler.</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  )
}
