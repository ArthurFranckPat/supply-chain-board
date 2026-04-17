import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Database, Play, CalendarClock, Settings2, ChevronDown, ChevronUp } from 'lucide-react'

export interface SchedulerOptions {
  feasibilityMode: string
  blockingComponentsMode: string
  immediateComponents: boolean
  demandHorizonDays: number
}

interface HomeViewProps {
  loadState: 'idle' | 'loading' | 'ready' | 'error'
  s1RunState: 'idle' | 'running' | 'success' | 'error'
  scheduleState: 'idle' | 'running' | 'success'
  lastSourceSnapshot: Record<string, unknown> | null
  options: SchedulerOptions
  onLoadSource: () => void
  onRunS1: () => void
  onRunSchedule: () => void
  onOptionsChange: (options: SchedulerOptions) => void
}

const FEASIBILITY_LABELS: Record<string, string> = {
  immediate: 'Immediate',
  projected: 'Projetee',
}

const BLOCKING_LABELS: Record<string, string> = {
  blocked: 'Recursive',
  direct: 'Directe',
  both: 'Complete',
}

export function HomeView({
  loadState,
  s1RunState,
  scheduleState,
  lastSourceSnapshot,
  options,
  onLoadSource,
  onRunS1,
  onRunSchedule,
  onOptionsChange,
}: HomeViewProps) {
  const counts = lastSourceSnapshot?.counts as Record<string, number> | undefined
  const [showSettings, setShowSettings] = useState(false)
  const isReady = loadState === 'ready'

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Actions */}
      <div className="grid grid-cols-3 gap-4">
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

        {/* Run S+1 */}
        <Card className="relative overflow-hidden">
          <CardContent className="p-5 flex flex-col gap-3">
            <div className="flex items-center gap-2.5">
              <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-muted">
                <CalendarClock className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold leading-none">Faisabilite S+1</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">Analyse des OF</p>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex gap-1">
                {(['immediate', 'projected'] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => onOptionsChange({ ...options, feasibilityMode: mode })}
                    disabled={!isReady || s1RunState === 'running'}
                    className={`flex-1 px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                      options.feasibilityMode === mode
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground hover:bg-accent'
                    } disabled:opacity-50`}
                  >
                    {FEASIBILITY_LABELS[mode]}
                  </button>
                ))}
              </div>
              <Button
                className="w-full"
                variant="secondary"
                onClick={onRunS1}
                disabled={!isReady || s1RunState === 'running'}
              >
                {s1RunState === 'running' ? 'Analyse en cours...' : 'Lancer S+1'}
              </Button>
            </div>
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
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-muted-foreground shrink-0">Horizon</span>
                <div className="flex gap-1 flex-1">
                  {[7, 15, 30].map((d) => (
                    <button
                      key={d}
                      onClick={() => onOptionsChange({ ...options, demandHorizonDays: d })}
                      disabled={!isReady || scheduleState === 'running'}
                      className={`flex-1 px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                        options.demandHorizonDays === d
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground hover:bg-accent'
                      } disabled:opacity-50`}
                    >
                      S+{Math.ceil(d / 7)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-1">
                {(['blocked', 'direct', 'both'] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => onOptionsChange({ ...options, blockingComponentsMode: mode })}
                    disabled={!isReady || scheduleState === 'running'}
                    className={`flex-1 px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                      options.blockingComponentsMode === mode
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground hover:bg-accent'
                    } disabled:opacity-50`}
                  >
                    {BLOCKING_LABELS[mode]}
                  </button>
                ))}
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

      {/* Advanced settings toggle */}
      <button
        onClick={() => setShowSettings(!showSettings)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <Settings2 className="h-3.5 w-3.5" />
        Parametres avances
        {showSettings ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>

      {showSettings && (
        <Card>
          <CardContent className="p-4">
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2">
                <p className="text-xs font-medium">Mode composants</p>
                <p className="text-[11px] text-muted-foreground">
                  Inclure les receptions prevues dans le calcul de disponibilite
                </p>
                <div className="flex gap-1">
                  {([
                    { value: false, label: 'Avec receptions' },
                    { value: true, label: 'Stock seul' },
                  ] as const).map(({ value, label }) => (
                    <button
                      key={String(value)}
                      onClick={() => onOptionsChange({ ...options, immediateComponents: value })}
                      className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                        options.immediateComponents === value
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground hover:bg-accent'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-xs font-medium">Horizon S+1</p>
                <p className="text-[11px] text-muted-foreground">
                  Horizon fixe a 7 jours pour le run de faisabilite
                </p>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">7 jours</Badge>
                  <span className="text-[10px] text-muted-foreground">Configure dans le backend</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

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
