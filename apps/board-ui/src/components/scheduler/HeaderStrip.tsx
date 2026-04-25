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
  const toneClass = tone === 'danger' ? 'text-destructive' : tone === 'warn' ? 'text-orange' : tone === 'good' ? 'text-green' : ''
  return (
    <div className="min-w-[60px]">
      <span className="block text-[9px] text-muted-foreground uppercase tracking-wide font-semibold">{label}</span>
      <span className={`block text-[13px] font-bold tabular-nums leading-tight ${toneClass}`}>{value}</span>
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

  return (
    <div className="bg-card border border-border">
      <div className="flex items-center gap-3 px-3 py-2">
        <div>
          <span className="block text-[9px] text-muted-foreground uppercase tracking-wide font-semibold">Score</span>
          <span className="block text-[18px] font-bold tabular-nums leading-none">{score.toFixed(3)}</span>
        </div>

        <div className="flex-1" />

        <div className="flex items-center gap-2">
          <Segmented
            value={weekMode}
            onChange={onWeekMode}
            options={[{ value: 'day', label: 'Jour' }, { value: 'week', label: 'Sem.' }]}
          />
          <Segmented
            value={density}
            onChange={onDensity}
            options={[{ value: 'comfort', label: 'Confort' }, { value: 'compact', label: 'Compact' }]}
          />
          <button
            onClick={onToggleWorkqueue}
            className={`h-6 px-2 text-[11px] font-medium border transition-colors ${
              showWorkqueue ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-muted-foreground border-border hover:bg-muted'
            }`}
          >
            Arbitrer
          </button>
          <button onClick={onToggleKpis} className="h-6 px-2 text-[11px] text-muted-foreground border border-border hover:bg-muted transition-colors">
            {showKpis ? 'Moins' : 'KPIs'}
          </button>
          <button onClick={onDark} className="h-6 px-2 text-[11px] text-muted-foreground border border-border hover:bg-muted transition-colors">
            {dark ? 'Clair' : 'Sombre'}
          </button>
        </div>
      </div>

      {showKpis && (
        <div className="flex items-stretch gap-2 px-3 py-2 border-t border-border">
          <div className="flex gap-2 flex-1 min-w-0">
            {[
              { label: 'Service', pct: servicePct },
              { label: 'Ouverture', pct: ouverturePct },
              { label: 'Réalisable', pct: realisablePct },
            ].map((h) => (
              <div key={h.label} className="min-w-[80px] flex-1">
                <div className="flex justify-between items-baseline">
                  <span className="text-[10px] text-muted-foreground">{h.label}</span>
                  <span className="text-[12px] font-bold tabular-nums">{h.pct}%</span>
                </div>
                <div className="h-[3px] bg-border mt-1">
                  <div className="h-full bg-primary transition-all" style={{ width: `${h.pct}%` }} />
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-3 pl-4 border-l border-border shrink-0">
            <MiniStat label="OF" value={totalOf.toLocaleString('fr-FR')} />
            <MiniStat label="Bloqués" value={totalBlocked} tone={totalBlocked > 0 ? 'danger' : undefined} />
            <MiniStat label="Non planif." value={totalUnscheduled} tone="danger" />
            <MiniStat label="Risque" value={totalOrdersRisk} tone="warn" />
            <MiniStat label="JIT/Chg" value={`${nbJit}/${nbChangements}`} />
          </div>
        </div>
      )}
    </div>
  )
}
