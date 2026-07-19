import { useMemo } from 'react'
import { cn } from '@r/lib/utils'
import type { LoadLine } from '@/lib/load/types'
import { DANGER, FG, BRAND, rtop, satColor, satRate, segsOf, total } from '@/lib/load/chart-math'

/**
 * Mini-graphe (carte poste) de la vue « Projection de charge » (issue #52 —
 * extrait de scheduler/load.tsx).
 */
interface MiniCardProps {
  line: LoadLine
  months: string[]
  selected: boolean
  showCapacity: boolean
  onSelect: () => void
}

export function MiniCard({ line, months, selected, showCapacity, onSelect }: MiniCardProps) {
  const totals = useMemo(() => line.monthly.map(total), [line.monthly])
  const sum = useMemo(() => totals.reduce((a, b) => a + b, 0), [totals])

  const peakIdx = useMemo(() => {
    return totals.length ? totals.indexOf(Math.max(...totals)) : 0
  }, [totals])

  const caps = useMemo(() => line.capacity.monthly, [line.capacity.monthly])

  const peakSat = useMemo(() => {
    return satRate(totals[peakIdx] ?? 0, caps[peakIdx] ?? 0)
  }, [totals, caps, peakIdx])

  const bars = useMemo(() => {
    const W = 160
    const H = 44
    const pad = 2
    const t = totals
    const c = caps
    const n = t.length || 1
    const slot = (W - 2 * pad) / n
    const bw = slot * 0.55
    const max = Math.max(...t, ...c, 0) * 1.1 || 1
    const yy = (v: number) => H - pad - (v / max) * (H - 2 * pad)
    const out: {
      kind: 'rect' | 'path'
      x: number
      y: number
      w: number
      h: number
      fill: string
    }[] = []
    const peakDots: { cx: number; cy: number }[] = []
    const overRects: { x: number; y: number; w: number; h: number }[] = []
    const capPts: { x: number; y: number }[] = []

    line.monthly.forEach((d, i) => {
      const cx = pad + slot * i + slot / 2
      const x = cx - bw / 2
      const segs = segsOf(d).filter(([, v]) => v > 0)
      const topIdx = segs.length - 1
      let acc = 0
      segs.forEach(([, v, col], idx) => {
        const yTop = yy(acc + v)
        const h = yy(acc) - yTop
        out.push({ kind: idx === topIdx ? 'path' : 'rect', x, y: yTop, w: bw, h, fill: col })
        acc += v
      })
      if (c[i] > 0 && t[i] > c[i]) overRects.push({ x, y: yy(t[i]), w: bw, h: yy(c[i]) - yy(t[i]) })
      if (c[i] > 0) capPts.push({ x: cx, y: yy(c[i]) })
      if (i === peakIdx) peakDots.push({ cx, cy: yy(t[i]) })
    })
    const capPath = capPts.map((pt, i) => `${i ? 'L' : 'M'}${pt.x} ${pt.y}`).join(' ')
    return { out, peakDots, overRects, capPath }
  }, [line.monthly, totals, caps])

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex w-[190px] shrink-0 flex-col rounded-xl border bg-card p-3 text-left transition-all hover:-translate-y-px',
        selected
          ? 'border-brand shadow-[0_0_0_2px_var(--color-brand-soft),0_4px_12px_-4px_rgba(168,67,31,.25)]'
          : 'border-rule hover:border-[#b3a47e]'
      )}
    >
      <div className="mb-1.5 flex items-center gap-2">
        <span className="size-[9px] flex-none rounded-[2px]" style={{ background: line.color }} />
        <div className="min-w-0">
          <div className="font-fraunces text-[14px] font-extrabold leading-none tracking-tight">
            {line.code}
          </div>
          <div className="truncate font-sans text-[10px] text-muted-foreground">{line.name}</div>
        </div>
      </div>
      <svg viewBox={`0 0 160 44`} className="block h-[44px] w-full">
        {bars.out.map((b, i) =>
          b.kind === 'path' ? (
            <path key={i} d={rtop(b.x, b.y, b.w, b.h, Math.min(b.w / 3, 5))} fill={b.fill} />
          ) : (
            <rect key={i} x={b.x} y={b.y} width={b.w} height={b.h} fill={b.fill} />
          )
        )}
        {showCapacity && (
          <>
            {bars.overRects.map((r, i) => (
              <rect key={`over-${i}`} x={r.x} y={r.y} width={r.w} height={r.h} fill={DANGER} opacity="0.22" />
            ))}
            <path
              d={bars.capPath}
              fill="none"
              stroke={FG}
              strokeOpacity="0.6"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </>
        )}
        {bars.peakDots.map((pk, i) => (
          <circle key={`peak-${i}`} cx={pk.cx} cy={pk.cy} r="2.5" fill={BRAND} />
        ))}
      </svg>
      <div className="mt-1.5 flex items-baseline justify-between">
        <span className="font-fraunces text-[16px] font-extrabold tracking-tight">{sum}h</span>
        <span
          className={cn(
            'font-mono text-[9px] font-bold',
            selected && peakSat < 85 && 'text-brand',
            !selected && peakSat < 85 && 'text-suggere'
          )}
          style={{
            color: peakSat >= 85 ? satColor(totals[peakIdx] ?? 0, caps[peakIdx] ?? 0) : undefined,
          }}
        >
          pic {months[peakIdx]} {totals[peakIdx] ?? 0}h
          {caps[peakIdx] > 0 && ` · ${Math.round(peakSat)}%`}
        </span>
      </div>
    </button>
  )
}
