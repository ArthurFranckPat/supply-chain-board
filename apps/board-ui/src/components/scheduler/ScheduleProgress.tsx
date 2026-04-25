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
    <div className="bg-card border border-border p-3 max-w-md mx-auto">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold">Calcul en cours...</h3>
        {elapsedMs > 0 && (
          <span className="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5">{formatElapsed(elapsedMs)}</span>
        )}
      </div>

      <div className="flex flex-col gap-0.5">
        {PHASES.map((phase, idx) => {
          const isCompleted = idx < currentIdx
          const isActive = idx === currentIdx
          const isPending = idx > currentIdx
          return (
            <div key={phase.key} className="flex items-start gap-2 py-1">
              <div className="mt-0.5 shrink-0 w-4 text-[11px]">
                {isCompleted ? '✓' : isActive ? '⟳' : '○'}
              </div>
              <div className="flex flex-col gap-0 min-w-0 flex-1">
                <span className={`text-[11px] font-medium ${isPending ? 'text-muted-foreground/40' : ''}`}>{phase.label}</span>
                {isActive && (
                  <div className="h-[2px] w-full bg-border mt-0.5">
                    <div className="h-full bg-primary transition-all duration-500" style={{ width: `${Math.round(((currentIdx + 1) / stepCount) * 100)}%` }} />
                  </div>
                )}
              </div>
              {isActive && <span className="text-[10px] font-mono text-primary shrink-0">{currentIdx + 1}/{stepCount}</span>}
            </div>
          )
        })}
      </div>
    </div>
  )
}
