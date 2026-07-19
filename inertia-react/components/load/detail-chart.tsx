import { useEffect, useMemo, useRef, useState } from 'react'
import type { LoadPeriod, LoadView } from '@/lib/load/types'
import {
  CARD,
  DANGER,
  FG,
  MUTED,
  RULE_SOFT,
  BRAND,
  type Gran,
  mobileAvg,
  rtop,
  satColor,
  satRate,
  segLabel,
  segsOf,
  total,
} from '@/lib/load/chart-math'

/**
 * Histogramme de détail (poste sélectionné) de la vue « Projection de charge »
 * (issue #52 — extrait de scheduler/load.tsx).
 */
interface DetailChartProps {
  items: { label: string; d: LoadPeriod; cap: number }[]
  gran: Gran
  view: LoadView
  showCapacity: boolean
  showAvg: boolean
}

type SegInfo = {
  period: string
  label: string
  value: number
  total: number
  cap: number
  color: string
}

export function DetailChart({ items, gran, view, showCapacity, showAvg }: DetailChartProps) {
  const padL = 46
  const padR = 16
  const padT = 14
  const padB = 38

  const wrapRef = useRef<HTMLDivElement>(null)
  const [dim, setDim] = useState({ w: 1000, h: 380 })

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect()
      if (r.width > 0 && r.height > 0) setDim({ w: Math.round(r.width), h: Math.round(r.height) })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const geom = useMemo(() => {
    const W = dim.w
    const H = dim.h
    const cw = W - padL - padR
    const ch = H - padT - padB
    const n = items.length || 1
    const T = items.map((it) => total(it.d))
    const C = items.map((it) => it.cap)
    const maxV = Math.max(...T, ...C, 0) * 1.18 || 1
    const slot = cw / n
    const bw = Math.min(slot * 0.62, gran === 'week' ? 44 : 64)
    const x = (i: number) => padL + slot * i + slot / 2
    const y = (v: number) => padT + ch - (v / maxV) * ch

    const grid = [0, 1, 2, 3, 4].map((g) => {
      const val = (maxV * g) / 4
      return { y: y(val), label: Math.round(val) }
    })

    type Seg = {
      kind: 'rect' | 'path'
      x: number
      y: number
      w: number
      h: number
      fill: string
      info: SegInfo
    }
    type Lbl = { x: number; y: number; text: number; fill: string }
    const segments: Seg[] = []
    const inLabels: Lbl[] = []
    const totals: { x: number; y: number; text: number; fill: string }[] = []
    const xLabels: { x: number; y: number; text: string }[] = []
    const capPts: { x: number; y: number; v: number; over: boolean }[] = []
    const overRects: { x: number; y: number; w: number; h: number }[] = []

    items.forEach((it, i) => {
      const cx = x(i)
      const xx = cx - bw / 2
      const segs = segsOf(it.d).filter(([, v]) => v > 0)
      const topIdx = segs.length - 1
      let acc = 0
      segs.forEach(([k, v, col], idx) => {
        const yTop = y(acc + v)
        const h = y(acc) - yTop
        const label = segLabel(view, k)
        segments.push({
          kind: idx === topIdx ? 'path' : 'rect',
          x: xx,
          y: yTop,
          w: bw,
          h,
          fill: col,
          info: { period: it.label, label, value: v, total: T[i], cap: C[i], color: col },
        })
        if (h > 16)
          inLabels.push({
            x: cx,
            y: (yTop + y(acc)) / 2 + 3,
            text: v,
            fill: k === 's' || k === 'si' ? '#3a2a0e' : CARD,
          })
        acc += v
      })
      const over = C[i] > 0 && T[i] > C[i]
      totals.push({ x: cx, y: y(T[i]) - 6, text: T[i], fill: over ? DANGER : FG })
      if (C[i] > 0) {
        capPts.push({ x: cx, y: y(C[i]), v: C[i], over })
        if (over) overRects.push({ x: xx, y: y(T[i]), w: bw, h: y(C[i]) - y(T[i]) })
      }
      xLabels.push({ x: cx, y: H - padB + 18, text: it.label })
    })

    const capPath = capPts.map((p2, i) => `${i ? 'L' : 'M'}${p2.x} ${p2.y}`).join(' ')

    const win = gran === 'week' ? 8 : 2
    const ma = mobileAvg(T, win)
    const avgPath = ma.map((v, i) => `${i ? 'L' : 'M'}${x(i)} ${y(v)}`).join(' ')

    const pi = T.length ? T.indexOf(Math.max(...T)) : 0
    const peak = T.length ? { cx: x(pi), cy: y(T[pi]) } : null

    const capLabel = capPts.length
      ? { x: capPts[capPts.length - 1].x, y: capPts[capPts.length - 1].y }
      : null

    return {
      grid,
      segments,
      inLabels,
      totals,
      xLabels,
      capPath,
      capPts,
      overRects,
      capLabel,
      avgPath,
      peak,
      week: gran === 'week',
    }
  }, [items, dim, gran, view])

  const [hover, setHover] = useState<SegInfo | null>(null)
  const [pos, setPos] = useState({ x: 0, y: 0 })

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = wrapRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setPos({ x: e.clientX - r.left, y: e.clientY - r.top })
  }

  return (
    <div ref={wrapRef} className="relative min-h-0 flex-1" onMouseMove={onMove}>
      <svg
        viewBox={`0 0 ${dim.w} ${dim.h}`}
        preserveAspectRatio="none"
        className="block h-full w-full"
      >
        {/* Gridlines + axe Y */}
        {geom.grid.map((g, i) => (
          <g key={`grid-${i}`}>
            <line
              x1={padL}
              x2={dim.w - padR}
              y1={g.y}
              y2={g.y}
              stroke={RULE_SOFT}
              strokeWidth="1"
            />
            <text
              x={padL - 8}
              y={g.y + 4}
              textAnchor="end"
              fontSize="11"
              fill={MUTED}
              className="font-mono"
            >
              {g.label}
            </text>
          </g>
        ))}
        {/* Barres empilées (survol → tooltip) */}
        {geom.segments.map((s, i) => {
          const isOn = hover && hover.period === s.info.period && hover.label === s.info.label
          const common = {
            fill: s.fill,
            style: {
              cursor: 'pointer',
              opacity: hover && !isOn ? 0.55 : 1,
              transition: 'opacity .12s',
            } as React.CSSProperties,
            onMouseEnter: () => setHover(s.info),
            onMouseLeave: () => setHover(null),
          }
          return s.kind === 'path' ? (
            <path key={`seg-${i}`} d={rtop(s.x, s.y, s.w, s.h, Math.min(s.w / 3, 7))} {...common} />
          ) : (
            <rect key={`seg-${i}`} x={s.x} y={s.y} width={s.w} height={s.h} {...common} />
          )
        })}
        {/* Valeurs in-barre */}
        {geom.inLabels.map((l, i) => (
          <text
            key={`inlbl-${i}`}
            x={l.x}
            y={l.y}
            textAnchor="middle"
            fontSize="10"
            fontWeight="700"
            fill={l.fill}
            className="font-mono"
          >
            {l.text}
          </text>
        ))}
        {/* Plafond de capacité (issue #35) — courbe continue + points (rouge si dépassé). */}
        {showCapacity && (
          <>
            {/* Surcharge : part de charge au-dessus du plafond, rouge translucide. */}
            {geom.overRects.map((r, i) => (
              <rect key={`over-${i}`} x={r.x} y={r.y} width={r.w} height={r.h} fill={DANGER} opacity="0.2" />
            ))}
            {/* Liseré clair sous la courbe pour la détacher des barres. */}
            <path
              d={geom.capPath}
              fill="none"
              stroke={CARD}
              strokeOpacity="0.85"
              strokeWidth="6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d={geom.capPath}
              fill="none"
              stroke={FG}
              strokeOpacity="0.75"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {geom.capPts.map((c, i) => (
              <circle
                key={`cappt-${i}`}
                cx={c.x}
                cy={c.y}
                r={c.over ? 5 : 3.5}
                fill={c.over ? DANGER : FG}
                stroke={CARD}
                strokeWidth="1.5"
                className="cursor-pointer"
                onMouseEnter={() =>
                  setHover({
                    period: '',
                    label: 'Capacité',
                    value: c.v,
                    total: 0,
                    cap: c.v,
                    color: c.over ? DANGER : FG,
                  })
                }
                onMouseLeave={() => setHover(null)}
              />
            ))}
            {geom.capLabel && (
              <text
                x={geom.capLabel.x - 8}
                y={geom.capLabel.y - 9}
                textAnchor="end"
                fontSize="10"
                fontWeight="800"
                fill={FG}
                opacity="0.65"
                className="font-mono uppercase tracking-wider"
              >
                capacité
              </text>
            )}
          </>
        )}
        {/* Totaux au sommet (rouge si > capacité) */}
        {geom.totals.map((t, i) => (
          <text
            key={`tot-${i}`}
            x={t.x}
            y={t.y}
            textAnchor="middle"
            fontSize="11"
            fontWeight="700"
            fill={t.fill}
            className="font-mono"
          >
            {t.text}
          </text>
        ))}
        {/* Libellés X — mode semaine : 2 lignes (date du lundi + n° de semaine). */}
        {geom.xLabels.map((l, i) => (
          <text
            key={`xlbl-${i}`}
            x={l.x}
            y={l.y}
            textAnchor="middle"
            fontSize={geom.week ? '8' : '12'}
            fontWeight={geom.week ? '500' : '700'}
            fill={MUTED}
            className={geom.week ? 'font-mono' : 'font-fraunces'}
          >
            {l.text.split('\n').map((ln, j) => (
              <tspan
                key={j}
                x={l.x}
                dy={j === 0 ? 0 : '1.15em'}
                fontWeight={j === 0 ? '700' : '500'}
              >
                {ln}
              </tspan>
            ))}
          </text>
        ))}
        {/* Moyenne mobile */}
        {showAvg && (
          <path
            d={geom.avgPath}
            fill="none"
            stroke={BRAND}
            strokeWidth="2"
            strokeDasharray="5 4"
            strokeLinecap="round"
          />
        )}
        {/* Pic */}
        {geom.peak && <circle cx={geom.peak.cx} cy={geom.peak.cy} r="4" fill={BRAND} />}
      </svg>

      {/* Tooltip détail de section */}
      {hover && (
        <div
          className="pointer-events-none absolute z-10 whitespace-nowrap rounded-lg border border-rule bg-card px-3 py-2 shadow-[0_4px_14px_-4px_rgba(31,26,19,.35)]"
          style={{
            left: `${pos.x}px`,
            top: `${pos.y}px`,
            transform: 'translate(-50%, calc(-100% - 12px))',
          }}
        >
          {hover.period && (
            <div className="font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              {hover.period}
            </div>
          )}
          <div className="mt-1 flex items-center gap-2">
            <span className="size-2.5 flex-none rounded-[2px]" style={{ background: hover.color }} />
            <span className="font-sans text-[12px] font-semibold">{hover.label}</span>
            <span className="ml-3 font-fraunces text-[15px] font-extrabold tabular-nums">
              {hover.value} h
            </span>
          </div>
          {/* Survol d'un segment de charge : part du total + plafond + saturation. */}
          {hover.total > 0 && (
            <>
              <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                {Math.round((hover.value / hover.total) * 100)}% du total · {hover.total} h
              </div>
              {hover.cap > 0 && (
                <div
                  className="mt-0.5 font-mono text-[10px]"
                  style={{ color: satColor(hover.total, hover.cap) }}
                >
                  capacité {hover.cap} h · saturation {Math.round(satRate(hover.total, hover.cap))}%
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
