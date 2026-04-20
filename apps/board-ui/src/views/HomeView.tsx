import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Segmented } from '@/components/ui/segmented'
import { SimpleTooltip } from '@/components/ui/tooltip'
import { Database, Play } from 'lucide-react'

export interface SchedulerOptions {
  blockingComponentsMode: string
  immediateComponents: boolean
  demandHorizonDays: number
}

interface HomeViewProps {
  loadState: 'idle' | 'loading' | 'ready' | 'error'
  scheduleState: 'idle' | 'running' | 'success'
  lastSourceSnapshot: Record<string, unknown> | null
  options: SchedulerOptions
  onLoadSource: () => void
  onRunSchedule: () => void
  onOptionsChange: (options: SchedulerOptions) => void
}

const BLOCKING_OPTIONS: Array<{ value: string; label: string; hint: string }> = [
  { value: 'blocked', label: 'Recursive', hint: 'Parcourt toute la nomenclature pour trouver les composants achetes manquants' },
  { value: 'direct', label: 'Directe', hint: 'Verifie uniquement les composants du niveau 1 de la nomenclature' },
  { value: 'both', label: 'Complete', hint: 'Combine les deux analyses pour un resultat exhaustif' },
]

const HORIZON_OPTIONS: Array<{ days: number; hint: string }> = [
  { days: 7, hint: 'Planification sur la semaine prochaine (S+1)' },
  { days: 15, hint: 'Horizon elargi couvrant S+1 et S+2' },
  { days: 30, hint: 'Horizon long couvrant S+1 a S+4' },
]

export function HomeView({
  loadState,
  scheduleState,
  lastSourceSnapshot,
  options,
  onLoadSource,
  onRunSchedule,
  onOptionsChange,
}: HomeViewProps) {
  const counts = lastSourceSnapshot?.counts as Record<string, number> | undefined
  const isReady = loadState === 'ready'

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Actions */}
      <div className="grid grid-cols-2 gap-4">
        {/* Load source */}
        <Card className="relative overflow-hidden">
          <CardContent className="p-5 flex flex-col gap-3">
            <div className="flex items-center gap-2.5">
              <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-muted">
                <Database className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold leading-none">Source</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">Extractions ERP</p>
              </div>
              {loadState === 'ready' && (
                <Badge variant="default" className="text-[10px] bg-green text-green-foreground">OK</Badge>
              )}
            </div>
            <Button
              className="w-full"
              onClick={onLoadSource}
              disabled={loadState === 'loading'}
            >
              {loadState === 'loading' ? 'Chargement...' : 'Charger la source'}
            </Button>
          </CardContent>
        </Card>

        {/* Scheduler */}
        <Card className="relative overflow-hidden">
          <CardContent className="p-5 flex flex-col gap-3">
            <div className="flex items-center gap-2.5">
              <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-muted">
                <Play className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold leading-none">Scheduler</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">Planification</p>
              </div>
            </div>
            <div className="space-y-2.5">
              {/* Disponibilite composants */}
              <div className="space-y-1.5">
                <SimpleTooltip
                  side="right"
                  content={
                    <div className="space-y-1.5 max-w-[220px]">
                      <p className="font-medium">Mode de verification composants</p>
                      <p><strong>Avec receptions :</strong> integre les commandes fournisseur a venir dans le stock disponible. Vue realiste a court terme.</p>
                      <p><strong>Stock seul :</strong> verifie uniquement le stock physique actuel. Vue conservative.</p>
                    </div>
                  }
                >
                  <button type="button" className="text-[11px] text-muted-foreground hover:text-foreground transition-colors underline decoration-dotted underline-offset-2">
                    Disponibilite composants
                  </button>
                </SimpleTooltip>
                <Segmented
                  options={[
                    { value: 'projected', label: 'Avec receptions' },
                    { value: 'immediate', label: 'Stock seul' },
                  ]}
                  value={options.immediateComponents ? 'immediate' : 'projected'}
                  onChange={(v) => onOptionsChange({ ...options, immediateComponents: v === 'immediate' })}
                />
              </div>

              {/* Horizon */}
              <div className="flex items-center gap-2">
                <SimpleTooltip
                  side="top"
                  content="Nombre de jours couverts par le calcul de demande client"
                >
                  <span className="text-[11px] text-muted-foreground shrink-0 cursor-help underline decoration-dotted underline-offset-2">Horizon</span>
                </SimpleTooltip>
                <div className="flex gap-1">
                  {HORIZON_OPTIONS.map(({ days, hint }) => (
                    <SimpleTooltip key={days} side="bottom" content={hint}>
                      <button
                        type="button"
                        onClick={() => onOptionsChange({ ...options, demandHorizonDays: days })}
                        disabled={!isReady || scheduleState === 'running'}
                        className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                          options.demandHorizonDays === days
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-muted-foreground hover:bg-accent'
                        } disabled:opacity-50`}
                      >
                        S+{Math.ceil(days / 7)}
                      </button>
                    </SimpleTooltip>
                  ))}
                </div>
              </div>

              {/* Composants manquants */}
              <div className="flex items-center gap-2">
                <SimpleTooltip
                  side="right"
                  content="Profondeur d'analyse de la nomenclature pour detecter les composants manquants"
                >
                  <span className="text-[11px] text-muted-foreground shrink-0 cursor-help underline decoration-dotted underline-offset-2">Composants manquants</span>
                </SimpleTooltip>
                <div className="flex gap-1">
                  {BLOCKING_OPTIONS.map(({ value, label, hint }) => (
                    <SimpleTooltip key={value} side="bottom" content={hint}>
                      <button
                        type="button"
                        onClick={() => onOptionsChange({ ...options, blockingComponentsMode: value })}
                        disabled={!isReady || scheduleState === 'running'}
                        className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                          options.blockingComponentsMode === value
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-muted-foreground hover:bg-accent'
                        } disabled:opacity-50`}
                      >
                        {label}
                      </button>
                    </SimpleTooltip>
                  ))}
                </div>
              </div>

              <Button
                className="w-full"
                variant="outline"
                onClick={onRunSchedule}
                disabled={!isReady || scheduleState === 'running'}
              >
                {scheduleState === 'running' ? 'Planification...' : 'Lancer le Scheduler'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Snapshot */}
      {counts && (
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-3 font-medium">Dernier chargement</p>
            <div className="grid grid-cols-7 gap-2">
              {Object.entries(counts).map(([key, value]) => (
                <div key={key} className="text-center py-2 px-1">
                  <p className="text-lg font-bold tabular-nums">{value.toLocaleString()}</p>
                  <p className="text-[10px] text-muted-foreground capitalize leading-tight">{key.replace(/_/g, ' ')}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Workflow */}
      {!counts && (
        <Card className="border-dashed">
          <CardContent className="p-6 text-center">
            <p className="text-sm text-muted-foreground">
              Chargez la source ERP pour debuter l'analyse.
            </p>
            <div className="flex items-center justify-center gap-6 mt-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="flex items-center justify-center h-5 w-5 rounded-full bg-muted text-[10px] font-bold">1</span>
                Charger
              </span>
              <span className="text-border">-</span>
              <span className="flex items-center gap-1.5">
                <span className="flex items-center justify-center h-5 w-5 rounded-full bg-muted text-[10px] font-bold">2</span>
                Analyser
              </span>
              <span className="text-border">-</span>
              <span className="flex items-center gap-1.5">
                <span className="flex items-center justify-center h-5 w-5 rounded-full bg-muted text-[10px] font-bold">3</span>
                Planifier
              </span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
