import type { RunState } from '@/types/api'

// ── Phases Glouton (classique) ──────────────────────────────────────
const GREEDY_PHASES = [
  { key: 'loading_data', label: 'Chargement des données ERP' },
  { key: 'loading_capacity', label: 'Chargement des capacités' },
  { key: 'preparing_data', label: 'Préparation des données' },
  { key: 'resolving_constraints', label: 'Résolution des contraintes' },
  { key: 'computing_schedule', label: 'Calcul du planning' },
  { key: 'generating_reports', label: 'Génération des rapports' },
  { key: 'finalizing', label: 'Finalisation' },
] as const

// ── Phases AG (dédiées) ─────────────────────────────────────────────
const GA_PHASES: Record<string, string> = {
  ga_preparation: 'Préparation des données',
  ga_seed: 'Calcul du seed glouton',
  ga_init: 'Initialisation de la population',
  ga_evolution: 'Évolution génétique',
  ga_decode: 'Décodage du meilleur planning',
  ga_reports: 'Génération des rapports',
}

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  return `${m}m ${s % 60}s`
}

function parseGaEvolution(label: string): {
  generation: number
  total: number
  pct: number
  best: number
} | null {
  // Format: "Génération 12/50 (24%) — best=0.850"
  const m = label.match(/Génération\s+(\d+)\/(\d+)\s+\((\d+)%\)\s+—\s+best=([\d.]+)/)
  if (!m) return null
  return { generation: parseInt(m[1]), total: parseInt(m[2]), pct: parseInt(m[3]), best: parseFloat(m[4]) }
}

interface ScheduleProgressProps {
  runState: RunState
}

// ═══════════════════════════════════════════════════════════════════
//  Mode AG
// ═══════════════════════════════════════════════════════════════════

function GaProgress({ runState }: { runState: RunState }) {
  const elapsedMs = runState.elapsed_ms ?? 0
  const currentIdx = runState.step_index ?? 0
  const stepCount = runState.step_count ?? 6
  const stepKey = runState.step_key ?? ''
  const stepLabel = runState.step_label ?? ''
  const isEvolution = stepKey === 'ga_evolution'
  const evoStats = isEvolution ? parseGaEvolution(stepLabel) : null

  const phases = Object.entries(GA_PHASES)

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary" />
          </span>
          <span className="text-xs font-semibold">Algorithme génétique V2</span>
        </div>
        <span className="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5">
          {formatElapsed(elapsedMs)}
        </span>
      </div>

      {/* Phase list */}
      <div className="flex flex-col gap-0.5">
        {phases.map(([key, label], idx) => {
          const isCompleted = idx < currentIdx
          const isActive = idx === currentIdx
          const isPending = idx > currentIdx
          return (
            <div key={key} className="flex items-start gap-2 py-1">
              <div className="mt-0.5 shrink-0 w-4 text-[11px] text-center">
                {isCompleted ? '✓' : isActive ? '⟳' : '○'}
              </div>
              <div className="flex flex-col gap-0 min-w-0 flex-1">
                <span className={`text-[11px] font-medium ${isPending ? 'text-muted-foreground/40' : ''}`}>
                  {label}
                </span>
                {isActive && isEvolution && evoStats && (
                  <div className="mt-1 space-y-1">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="font-mono text-muted-foreground">
                        Génération {evoStats.generation} / {evoStats.total}
                      </span>
                      <span className="font-mono font-semibold">{evoStats.pct}%</span>
                    </div>
                    <div className="h-1.5 w-full bg-border rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all duration-300"
                        style={{ width: `${evoStats.pct}%` }}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-muted/50 border border-border p-1.5 text-center">
                        <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Meilleur score</p>
                        <p className="text-sm font-bold font-mono text-primary">{evoStats.best.toFixed(3)}</p>
                      </div>
                    </div>
                  </div>
                )}
                {isActive && !isEvolution && (
                  <div className="h-[2px] w-full bg-border mt-0.5">
                    <div className="h-full bg-primary animate-pulse" style={{ width: '60%' }} />
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

// ═══════════════════════════════════════════════════════════════════
//  Mode Glouton
// ═══════════════════════════════════════════════════════════════════

function GreedyProgress({ runState }: { runState: RunState }) {
  const currentIdx = runState.step_index ?? 0
  const stepCount = runState.step_count ?? GREEDY_PHASES.length
  const elapsedMs = runState.elapsed_ms ?? 0

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold">Calcul en cours...</h3>
        {elapsedMs > 0 && (
          <span className="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5">{formatElapsed(elapsedMs)}</span>
        )}
      </div>
      <div className="flex flex-col gap-0.5">
        {GREEDY_PHASES.map((phase, idx) => {
          const isCompleted = idx < currentIdx
          const isActive = idx === currentIdx
          const isPending = idx > currentIdx
          return (
            <div key={phase.key} className="flex items-start gap-2 py-1">
              <div className="mt-0.5 shrink-0 w-4 text-[11px] text-center">
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
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════
//  Entry point
// ═══════════════════════════════════════════════════════════════════

export function ScheduleProgress({ runState }: ScheduleProgressProps) {
  const isGa = runState.algorithm === 'ga' || runState.step_key?.startsWith('ga_')

  return (
    <div className="bg-card border border-border p-3 max-w-md mx-auto">
      {isGa ? (
        <GaProgress runState={runState} />
      ) : (
        <GreedyProgress runState={runState} />
      )}
    </div>
  )
}
