import { Fragment, useMemo } from 'react'
import type { CandidateOF } from '@/types/scheduler'

interface HeatmapCell {
  load: number
  capacity: number
  pct: number
  ofs: number
  blocked: number
}

interface CapacityHeatmapProps {
  candidates: Record<string, CandidateOF[]>
  lineLabels: Record<string, string>
  focusLine: string | null
  focusDay: string | null
  onCell: (line: string | null, day: string | null) => void
}

function cellBg(pct: number): string {
  if (pct === 0) return 'var(--color-muted)'
  if (pct < 0.5) return `color-mix(in oklab, var(--color-green) ${Math.round(pct * 70)}%, var(--color-card))`
  if (pct < 0.85) return `color-mix(in oklab, var(--color-primary) ${Math.round(pct * 65)}%, var(--color-card))`
  if (pct <= 1) return `color-mix(in oklab, var(--color-orange) ${Math.round(pct * 70)}%, var(--color-card))`
  return `color-mix(in oklab, var(--color-destructive) ${Math.min(95, Math.round(pct * 75))}%, var(--color-card))`
}

function cellFg(pct: number): string {
  return pct > 0.75 ? '#fff' : 'var(--color-foreground)'
}

function LegendDot({ label, color }: { label: string; color: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-[10.5px] text-muted-foreground">
      <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: color }} />
      {label}
    </span>
  )
}

export function CapacityHeatmap({ candidates, lineLabels, focusLine, focusDay, onCell }: CapacityHeatmapProps) {
  const { lines, days, heatmap } = useMemo(() => {
    // Only keep lines that have at least one OF
    const lines = Object.keys(candidates)
      .filter((line) => candidates[line].length > 0)
      .sort()

    // Derive days from scheduled_day values
    const daySet = new Set<string>()
    const allOfs = Object.values(candidates).flat()
    for (const o of allOfs) {
      if (o.scheduled_day) daySet.add(o.scheduled_day)
    }
    const days = [...daySet].sort()

    // Default capacity per line
    const CAPACITY: Record<string, number> = {}
    for (const line of lines) CAPACITY[line] = 14

    // Build heatmap
    const heatmap: Record<string, Record<string, HeatmapCell>> = {}
    for (const line of lines) {
      heatmap[line] = {}
      const lineOfs = candidates[line]
      for (const day of days) {
        const dayOfs = lineOfs.filter((o) => o.scheduled_day === day)
        const load = dayOfs.reduce((s, o) => s + o.charge_hours, 0)
        const capacity = CAPACITY[line]
        const blocked = dayOfs.filter((o) => o.blocking_components).length
        heatmap[line][day] = {
          load: +load.toFixed(1),
          capacity,
          pct: capacity > 0 ? +(load / capacity).toFixed(2) : 0,
          ofs: dayOfs.length,
          blocked,
        }
      }
    }

    return { lines, days, heatmap }
  }, [candidates])

  function formatDay(d: string) {
    try {
      return new Date(d).toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit' })
    } catch { return d }
  }

  function lineDisplay(lineId: string) {
    const label = lineLabels[lineId]
    return label ? `${lineId} - ${label}` : lineId
  }

  return (
    <section className="bg-card border border-border rounded-sm p-3.5">
      <div className="flex items-center justify-between mb-2.5">
        <div>
          <div className="text-[13px] font-semibold">Charge par ligne × jour</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            Cliquez une cellule pour filtrer · teintes chaudes = surcharge
          </div>
        </div>
        <div className="flex items-center gap-2.5 text-[10.5px] text-muted-foreground">
          <LegendDot label="< 50%" color="var(--color-green)" />
          <LegendDot label="50–85%" color="var(--color-primary)" />
          <LegendDot label="85–100%" color="var(--color-orange)" />
          <LegendDot label="> 100%" color="var(--color-destructive)" />
        </div>
      </div>

      <div
        className="grid gap-[3px] text-[11px]"
        style={{ gridTemplateColumns: `minmax(140px, 1.4fr) repeat(${days.length}, 1fr)` }}
      >
        {/* Header row */}
        <div />
        {days.map((d) => (
          <button
            key={d}
            onClick={() => onCell(null, d)}
            className={`px-1.5 py-1 text-[10.5px] font-semibold font-mono text-center cursor-pointer rounded-sm transition-colors ${
              focusDay === d
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            {formatDay(d)}
          </button>
        ))}

        {/* Data rows */}
        {lines.map((line) => (
          <Fragment key={line}>
            <button
              onClick={() => onCell(line, null)}
              className={`flex items-center px-2 py-1.5 rounded-sm cursor-pointer transition-colors text-left ${
                focusLine === line
                  ? 'bg-primary/10 text-primary'
                  : 'text-foreground hover:bg-muted'
              }`}
              title={lineDisplay(line)}
            >
              <span className="truncate text-[11px] font-mono">{lineDisplay(line)}</span>
            </button>
            {days.map((d) => {
              const cell = heatmap[line]?.[d]
              if (!cell) return <div key={`${line}-${d}`} />
              const highlighted = focusLine === line && focusDay === d
              const dim = (focusLine && focusLine !== line) || (focusDay && focusDay !== d)
              return (
                <button
                  key={`${line}-${d}`}
                  onClick={() => onCell(line, d)}
                  className={`flex flex-col items-center gap-0.5 py-1.5 px-1 rounded-sm cursor-pointer transition-opacity ${
                    highlighted ? 'border-2 border-primary' : 'border border-transparent'
                  } ${dim ? 'opacity-40' : 'opacity-100'}`}
                  style={{ background: cellBg(cell.pct), color: cellFg(cell.pct) }}
                >
                  <span className="text-xs font-bold tabular-nums">{Math.round(cell.pct * 100)}%</span>
                  <span className="text-[9px] opacity-80 font-mono">
                    {cell.ofs} OF{cell.blocked > 0 ? ` · ${cell.blocked}⚠` : ''}
                  </span>
                </button>
              )
            })}
          </Fragment>
        ))}
      </div>
    </section>
  )
}
