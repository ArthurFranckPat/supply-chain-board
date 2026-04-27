import type { RunState } from '@/types/api'

const GREEDY_PHASES = [
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

function parseGaStats(label: string): {
  generation: number
  total: number
  bestFitness: number
  meanFitness: number
  diversity: number
} | null {
  // Format attendu: "Génération 12/50 — best=0.850 mean=0.820 div=0.65"
  const match = label.match(/Génération\s+(\d+)\/(\d+)\s+—\s+best=([\d.]+)\s+mean=([\d.]+)\s+div=([\d.]+)/)
  if (!match) return null
  return {
    generation: parseInt(match[1]),
    total: parseInt(match[2]),
    bestFitness: parseFloat(match[3]),
    meanFitness: parseFloat(match[4]),
    diversity: parseFloat(match[5]),
  }
}

interface ScheduleProgressProps {
  runState: RunState
}

function GaProgress({ stats, elapsedMs }: { stats: NonNullable<ReturnType<typeof parseGaStats>>; elapsedMs: number }) {
  const pct = Math.round((stats.generation / stats.total) * 100)
  const speed = stats.generation > 0 ? (elapsedMs / 1000 / stats.generation) : 0
  const etaSec = speed > 0 ? (stats.total - stats.generation) * speed : 0

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary" />
          </span>
          <span className="text-xs font-semibold">Algorithme génétique en cours</span>
        </div>
        <span className="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5">
          {formatElapsed(elapsedMs)}
        </span>
      </div>

      {/* Progress bar */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[10px]">
          <span className="font-mono text-muted-foreground">Génération {stats.generation} / {stats.total}</span>
          <span className="font-mono font-semibold">{pct}%</span>
        </div>
        <div className="h-1.5 w-full bg-border rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
        {etaSec > 0 && (
          <p className="text-[9px] text-muted-foreground font-mono">
            ~{Math.round(etaSec)}s restantes
          </p>
        )}
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-muted/50 border border-border p-2 text-center">
          <p className="text-[9px] text-muted-foreground uppercase tracking-wider font-medium">Meilleur</p>
          <p className="text-sm font-bold font-mono text-primary">{stats.bestFitness.toFixed(3)}</p>
        </div>
        <div className="bg-muted/50 border border-border p-2 text-center">
          <p className="text-[9px] text-muted-foreground uppercase tracking-wider font-medium">Moyenne</p>
          <p className="text-sm font-bold font-mono">{stats.meanFitness.toFixed(3)}</p>
        </div>
        <div className="bg-muted/50 border border-border p-2 text-center">
          <p className="text-[9px] text-muted-foreground uppercase tracking-wider font-medium">Diversité</p>
          <p className="text-sm font-bold font-mono">{stats.diversity.toFixed(2)}</p>
        </div>
      </div>

      {/* Mini bar chart */}
      <div className="flex items-end gap-0.5 h-8 px-1">
        {Array.from({ length: 20 }).map((_, i) => {
          const pos = Math.floor((stats.generation / stats.total) * 20)
          const isActive = i < pos
          const height = isActive
            ? 30 + Math.random() * 70 // simuler un historique (le backend n'envoie pas l'historique complet)
            : 10
          return (
            <div
              key={i}
              className={`flex-1 rounded-sm transition-all ${isActive ? 'bg-primary/70' : 'bg-border'}`}
              style={{ height: `${height}%` }}
            />
          )
        })}
      </div>
    </div>
  )
}

function GreedyProgress({ runState }: { runState: RunState }) {
  const currentIdx = runState.step_index ?? 0
  const stepCount = runState.step_count ?? GREEDY_PHASES.length
  const elapsedMs = runState.elapsed_ms ?? 0

  return (
    <div className="flex flex-col gap-0.5">
      {GREEDY_PHASES.map((phase, idx) => {
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
  )
}

export function ScheduleProgress({ runState }: ScheduleProgressProps) {
  const elapsedMs = runState.elapsed_ms ?? 0
  const isGa = runState.step_key === 'ga_gen'
  const gaStats = isGa ? parseGaStats(runState.step_label ?? '') : null

  return (
    <div className="bg-card border border-border p-3 max-w-md mx-auto">
      {isGa && gaStats ? (
        <GaProgress stats={gaStats} elapsedMs={elapsedMs} />
      ) : (
        <>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold">Calcul en cours...</h3>
            {elapsedMs > 0 && (
              <span className="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5">{formatElapsed(elapsedMs)}</span>
            )}
          </div>
          <GreedyProgress runState={runState} />
        </>
      )}
    </div>
  )
}
