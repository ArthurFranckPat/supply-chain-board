import { CheckCircle2, Loader2 } from 'lucide-react'
import type { RunState } from '@/types/api'

const PHASES = [
  { key: 'loading_data', label: 'Chargement des données ERP' },
  { key: 'loading_capacity', label: 'Chargement des capacités' },
  { key: 'preparing_data', label: 'Préparation des données' },
  { key: 'resolving_constraints', label: 'Résolution des contraintes' },
  { key: 'computing_schedule', label: 'Calcul du planning' },
  { key: 'generating_reports', label: 'Génération des rapports' },
  { key: 'finalizing', label: 'Finalisation' },
] as const

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  return `${m}m ${s % 60}s`
}

interface ScheduleProgressProps {
  runState: RunState
}

export function ScheduleProgress({ runState }: ScheduleProgressProps) {
  const currentIdx = runState.step_index ?? 0
  const stepCount = runState.step_count ?? PHASES.length
  const elapsedMs = runState.elapsed_ms ?? 0

  return (
    <div className="bg-card border border-border rounded-2xl p-6 max-w-md mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-sm font-semibold text-foreground">
          Calcul du planning en cours...
        </h3>
        {elapsedMs > 0 && (
          <span className="text-[11px] font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded">
            {formatElapsed(elapsedMs)} écoulées
          </span>
        )}
      </div>

      {/* Stepper */}
      <div className="flex flex-col gap-1">
        {PHASES.map((phase, idx) => {
          const isCompleted = idx < currentIdx
          const isActive = idx === currentIdx
          const isPending = idx > currentIdx

          return (
            <div key={phase.key} className="flex items-start gap-3 py-1.5">
              {/* Icon */}
              <div className="mt-0.5 shrink-0">
                {isCompleted && (
                  <CheckCircle2 className="h-4 w-4 text-teal-700" />
                )}
                {isActive && (
                  <Loader2 className="h-4 w-4 text-teal-700 animate-spin" />
                )}
                {isPending && (
                  <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/20" />
                )}
              </div>

              {/* Label */}
              <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                <span
                  className={`text-xs font-medium ${
                    isPending ? 'text-muted-foreground/40' : 'text-foreground'
                  }`}
                >
                  {phase.label}
                </span>
                {isActive && (
                  <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-teal-700 rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.round(((currentIdx + 1) / stepCount) * 100)}%`,
                      }}
                    />
                  </div>
                )}
              </div>

              {/* Step indicator */}
              {isCompleted && (
                <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                  ✓
                </span>
              )}
              {isActive && (
                <span className="text-[10px] font-mono text-teal-700 shrink-0">
                  {currentIdx + 1}/{stepCount}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
