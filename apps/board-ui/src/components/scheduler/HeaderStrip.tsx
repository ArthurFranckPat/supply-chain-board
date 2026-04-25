import { Eye, EyeOff, Moon, Sun, TrendingUp, Target } from 'lucide-react'
import { ScoreDial } from '@/components/ui/score-dial'
import { Segmented } from '@/components/ui/segmented'

interface HeaderStripProps {
  score: number
  tauxService: number
  tauxOuverture: number
  totalOf: number
  totalRealisables: number
  totalBlocked: number
  totalUnscheduled: number
  totalOrdersRisk: number
  nbJit: number
  nbChangements: number
  showKpis: boolean
  onToggleKpis: () => void
  weekMode: string
  onWeekMode: (v: string) => void
  density: string
  onDensity: (v: string) => void
  dark: boolean
  onDark: () => void
  showWorkqueue: boolean
  onToggleWorkqueue: () => void
}

function MiniStat({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  const toneClass = tone === 'danger'
    ? 'text-destructive'
    : tone === 'warn'
    ? 'text-orange'
    : tone === 'good'
    ? 'text-green'
    : 'text-foreground'
  return (
    <div className="min-w-[64px]">
      <span className="block text-[9px] font-semibold text-muted-foreground uppercase tracking-wider font-mono">{label}</span>
      <span className={`block text-base font-bold tabular-nums tracking-tight leading-tight ${toneClass}`}>
        {value}
      </span>
    </div>
  )
}

export function HeaderStrip({
  score, tauxService, tauxOuverture,
  totalOf, totalRealisables, totalBlocked, totalUnscheduled, totalOrdersRisk,
  nbJit, nbChangements,
  showKpis, onToggleKpis,
  weekMode, onWeekMode,
  density, onDensity,
  dark, onDark,
  showWorkqueue, onToggleWorkqueue,
}: HeaderStripProps) {
  const servicePct = Math.round(tauxService * 100)
  const ouverturePct = Math.round(tauxOuverture * 100)
  const realisablePct = totalOf > 0 ? Math.round((totalRealisables / totalOf) * 100) : 0

  const health = [
    { label: 'Service', pct: servicePct, color: 'var(--color-primary)' },
    { label: 'Ouverture', pct: ouverturePct, color: 'var(--color-orange)' },
    { label: 'Réalisable', pct: realisablePct, color: 'var(--color-green)' },
  ]

  return (
    <div className="bg-card border border-border rounded-2xl transition-all">
      {/* Row 1: Score + Controls (always visible) */}
      <div className="flex items-center gap-4" style={{ padding: showKpis ? '14px 18px 8px' : '10px 14px' }}>
        {/* Hero score */}
        <div className="flex items-center gap-3 shrink-0">
          <ScoreDial value={score} size={showKpis ? 56 : 44} />
          <div>
            <span className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider font-mono">Score global</span>
            <div className="text-xl font-bold tabular-nums tracking-tight leading-none" style={{ fontSize: showKpis ? 22 : 18 }}>
              {score.toFixed(3)}
            </div>
            <div className="flex items-center gap-1 mt-0.5 text-[10.5px] text-green">
              <TrendingUp className="h-2.5 w-2.5" />
              <span>+0.021 vs run précédent</span>
            </div>
          </div>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Controls */}
        <div className="flex items-center gap-2 shrink-0">
          <Segmented
            value={weekMode}
            onChange={onWeekMode}
            options={[{ value: 'day', label: 'Jour' }, { value: 'week', label: 'Semaine' }]}
          />
          <Segmented
            value={density}
            onChange={onDensity}
            options={[{ value: 'comfort', label: 'Confort' }, { value: 'compact', label: 'Compact' }]}
          />
          <button
            onClick={onToggleWorkqueue}
            title="À arbitrer"
            className={`h-[30px] px-2 rounded-lg flex items-center gap-1.5 transition-colors ${
              showWorkqueue ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'
            }`}
          >
            <Target className="h-3.5 w-3.5" />
            <span className="text-[11px] font-semibold">Arbitrer</span>
          </button>
          <button
            onClick={onToggleKpis}
            title={showKpis ? 'Masquer KPIs' : 'Afficher KPIs'}
            className="w-[30px] h-[30px] rounded-lg bg-muted text-muted-foreground flex items-center justify-center hover:text-foreground transition-colors"
          >
            {showKpis ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </button>
          <button
            onClick={onDark}
            title="Thème"
            className="w-[30px] h-[30px] rounded-lg bg-muted text-muted-foreground flex items-center justify-center hover:text-foreground transition-colors"
          >
            {dark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {/* Row 2: Health bars + Secondary counts (only when KPIs visible) */}
      {showKpis && (
        <div className="flex items-stretch gap-5 px-[18px] pb-[14px] pt-1 border-t border-border/30">
          {/* Health bars */}
          <div className="flex gap-5 flex-1 min-w-0">
            {health.map((h) => (
              <div key={h.label} className="min-w-[100px] flex-1">
                <div className="flex justify-between items-baseline mb-1">
                  <span className="text-[11px] text-muted-foreground font-medium">{h.label}</span>
                  <span className="text-sm font-bold tabular-nums">{h.pct}%</span>
                </div>
                <div className="h-[5px] bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${h.pct}%`, background: h.color }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Secondary counts */}
          <div className="flex gap-3.5 pl-5 border-l border-border/50 shrink-0">
            <MiniStat label="OF planifiés" value={totalOf.toLocaleString('fr-FR')} />
            <MiniStat label="Bloqués" value={totalBlocked} tone={totalBlocked > 0 ? 'danger' : 'good'} />
            <MiniStat label="Non planif." value={totalUnscheduled} tone="danger" />
            <MiniStat label="Cmd à risque" value={totalOrdersRisk} tone="warn" />
            <MiniStat label="JIT / Chgmts" value={`${nbJit}/${nbChangements}`} />
          </div>
        </div>
      )}
    </div>
  )
}
