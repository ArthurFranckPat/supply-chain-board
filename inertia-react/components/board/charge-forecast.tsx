import { useMemo, useState, useCallback } from 'react'
import { cn } from '@r/lib/utils'

/**
 * ChargeForecast « Barres » — projection de charge long-terme.
 *
 * Histogramme empilé Ferme (bas) / Planifié (milieu) / Suggéré (haut), un
 * groupe par mois (ou par semaine). SEUL le sommet RÉEL de la pile est arrondi
 * — pas le segment Suggéré quand il se retrouve en base (correctif visuel de
 * la maquette design/mockups/forecast/1-bars.html, où l'arrondi tombait sur le
 * 1er segment non vide en partant du bas).
 *
 * Contrôles : sélecteur de ligne (dont l'agrégat « Toutes ») + granularité
 * mois/semaine. KPIs : charge totale, part ferme, pic de charge, tendance.
 * Ligne pointillée terra = moyenne mobile ; pastille = pic.
 *
 * Heures absolues. Inspiré de design/mockups/forecast/1-bars.html.
 */

export type ForecastSeg = [ferme: number, planifie: number, suggere: number]
export type ForecastLine = {
  id: string
  code: string
  name: string
  color: string
  months: ForecastSeg[]
}
export type ChargeForecastProps = {
  lines: ForecastLine[]
  monthLabels: string[]
  class?: string
}

/** ViewBox du SVG (repère fixe, mis à l'échelle via w-full). */
const W = 1000,
  H = 400,
  PAD_L = 46,
  PAD_R = 16,
  PAD_T = 16,
  PAD_B = 40
const CW = W - PAD_L - PAD_R,
  CH = H - PAD_T - PAD_B

/** Rectangle à coins HAUTS seuls arrondis (chemin, pour le sommet de pile). */
function rtop(x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2)
  const f = (n: number) => n.toFixed(1)
  return [
    `M ${f(x)} ${f(y + rr)}`,
    `Q ${f(x)} ${f(y)} ${f(x + rr)} ${f(y)}`,
    `L ${f(x + w - rr)} ${f(y)}`,
    `Q ${f(x + w)} ${f(y)} ${f(x + w)} ${f(y + rr)}`,
    `V ${f(y + h)}`,
    `H ${f(x)}`,
    'Z',
  ].join(' ')
}

/** Moyenne mobile centrée-tronquée sur `win` points. */
function mobileAvg(totals: number[], win: number) {
  const r: number[] = []
  for (let i = 0; i < totals.length; i++) {
    let s = 0,
      c = 0
    for (let k = i - win + 1; k <= i; k++)
      if (k >= 0) {
        s += totals[k]
        c++
      }
    r.push(s / c)
  }
  return r
}

interface SegGeo {
  rounded: boolean
  path: string
  rect: { x: number; y: number; w: number; h: number }
  fill: string
  label: number | null
  labelX: number
  labelY: number
  labelFill: string
}

interface BarGeo {
  segGeo: SegGeo[]
  total: number
  totalX: number
  totalY: number
  xLabel: string
  xLabelX: number
  xLabelFont: string
  xLabelSize: string
  xLabelWeight: number
}

interface StatProps {
  icon: string
  lab: string
  v: string
  unit?: string
  tone?: string
  sub: string
}

function Stat({ icon, lab, v, unit, tone, sub }: StatProps) {
  return (
    <div className="rounded-[10px] border border-border bg-card px-4 py-3">
      <div className="flex items-center gap-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
        <span className="material-symbols-outlined text-[14px]">{icon}</span>
        {lab}
      </div>
      <div className="mt-1 flex items-baseline gap-1">
        <span
          className={cn(
            'font-fraunces text-[28px] font-black leading-[0.95] tracking-tight',
            tone ?? 'text-foreground'
          )}
        >
          {v}
        </span>
        {unit && <span className="text-[14px] text-muted-foreground">{unit}</span>}
      </div>
      <div className="mt-0.5 text-[11px] font-medium text-muted-foreground">{sub}</div>
    </div>
  )
}

export function ChargeForecast(props: ChargeForecastProps) {
  const [lineId, setLineId] = useState('all')
  const [gran, setGran] = useState<'month' | 'week'>('month')

  const active = useMemo(() => props.lines.find((l) => l.id === lineId) ?? props.lines[0], [props.lines, lineId])
  const activeCode = lineId === 'all' ? 'Toutes' : active.code

  /** Série affichée (mois ou semaines), agrégée si « Toutes ». */
  const series = useMemo(() => {
    const monthly =
      lineId === 'all'
        ? props.monthLabels.map((_, i) => {
            const acc: ForecastSeg = [0, 0, 0]
            for (const l of props.lines) {
              acc[0] += l.months[i][0]
              acc[1] += l.months[i][1]
              acc[2] += l.months[i][2]
            }
            return acc
          })
        : active.months

    if (gran === 'month') {
      return {
        month: true,
        items: monthly.map((m, i) => ({
          label: props.monthLabels[i],
          f: m[0],
          p: m[1],
          s: m[2],
        })),
      }
    }
    // éclatement hebdo (4 semaines par mois, légère gigue pour le réalisme)
    const jit = [1, 0.9, 1.1, 1]
    const items: { label: string; f: number; p: number; s: number }[] = []
    monthly.forEach((m, mi) => {
      for (let k = 0; k < 4; k++) {
        items.push({
          label: 'S' + (27 + mi * 4 + k),
          f: Math.round((m[0] / 4) * jit[k]),
          p: Math.round((m[1] / 4) * jit[k]),
          s: Math.round((m[2] / 4) * jit[k]),
        })
      }
    })
    return { month: false, items }
  }, [lineId, gran, props.monthLabels, props.lines, active.months])

  /** Toute la géométrie du SVG, dérivée de la série courante. */
  const chart = useMemo(() => {
    const { items, month } = series
    const totals = items.map((d) => d.f + d.p + d.s)
    const maxV = Math.max(...totals, 1) * 1.18
    const n = items.length
    const slot = CW / n
    const bw = Math.min(slot * 0.62, month ? 60 : 16)
    const y = (v: number) => PAD_T + CH - (v / maxV) * CH

    const grids = Array.from({ length: 5 }, (_, g) => {
      const val = (maxV * g) / 4
      return { val, y: y(val) }
    })

    const bars: BarGeo[] = items.map((d, i) => {
      const cx = PAD_L + slot * i + slot / 2
      // empilage bas→haut : suggéré, planifié, ferme
      const segs: ['s' | 'p' | 'f', number, string][] = [
        ['s', d.s, 'var(--color-suggere)'],
        ['p', d.p, 'var(--color-planifie)'],
        ['f', d.f, 'var(--color-ferme)'],
      ]
      // SEUL le segment non vide le plus HAUT porte l'arrondi (correctif).
      let topIdx = segs.length - 1
      while (topIdx >= 0 && segs[topIdx][1] <= 0) topIdx--

      const segGeo: SegGeo[] = []
      let acc = 0
      segs.forEach((sg, idx) => {
        const [k, v, fill] = sg
        if (v <= 0) return
        const yTop = y(acc + v)
        const h = y(acc) - yTop
        segGeo.push({
          rounded: idx === topIdx,
          path: rtop(cx - bw / 2, yTop, bw, h, Math.min(bw / 3, 7)),
          rect: { x: cx - bw / 2, y: yTop, w: bw, h },
          fill,
          label: h > 16 ? v : null,
          labelX: cx,
          labelY: yTop + h / 2 + 3,
          labelFill: k === 's' ? '#3a2a0e' : 'var(--color-card)',
        })
        acc += v
      })

      const total = d.f + d.p + d.s
      return {
        segGeo,
        total,
        totalX: cx,
        totalY: y(total) - 6,
        xLabel: d.label,
        xLabelX: cx,
        xLabelFont: month ? 'var(--font-fraunces)' : 'var(--font-mono)',
        xLabelSize: month ? '12' : '8',
        xLabelWeight: month ? 700 : 500,
      }
    })

    const win = month ? 2 : 8
    const ma = mobileAvg(totals, win)
    const avgPath = ma
      .map((v, i) => {
        const cx = PAD_L + slot * i + slot / 2
        return `${i === 0 ? 'M' : 'L'}${cx.toFixed(1)} ${y(v).toFixed(1)}`
      })
      .join(' ')

    let peakIdx = 0
    for (let i = 1; i < totals.length; i++) if (totals[i] > totals[peakIdx]) peakIdx = i
    const peak = { cx: PAD_L + slot * peakIdx + slot / 2, y: y(totals[peakIdx]) }

    return { grids, bars, avgPath, peak, peakIdx, totals, items, month }
  }, [series])

  const summary = useMemo(() => {
    const tot = chart.totals.reduce((a, b) => a + b, 0)
    const fe = chart.items.reduce((a, d) => a + d.f, 0)
    const pct = tot ? Math.round((fe / tot) * 100) : 0
    const peak = { label: chart.items[chart.peakIdx].label, v: chart.totals[chart.peakIdx] }
    const first = chart.totals[0] ?? 0
    const last = chart.totals[chart.totals.length - 1] ?? 0
    const span = chart.month
      ? `${props.monthLabels.length} mois`
      : `~${props.monthLabels.length * 4} semaines`
    return {
      tot,
      fe,
      pct,
      peak,
      up: last > first,
      diff: Math.abs(last - first),
      span,
      month: chart.month,
    }
  }, [chart, props.monthLabels.length])

  return (
    <div className={cn('flex flex-col gap-4', props.class)}>
      {/* ══ Controls ══ */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-mono text-[11px] font-bold transition-colors',
              lineId === 'all'
                ? 'border-foreground bg-foreground text-card'
                : 'border-border bg-card text-muted-foreground hover:border-foreground/40 hover:text-foreground'
            )}
            onClick={() => setLineId('all')}
          >
            <span className="material-symbols-outlined text-[13px]">layers</span>Toutes
          </button>
          {props.lines.map((l) => (
            <button
              key={l.id}
              type="button"
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-mono text-[11px] font-bold transition-colors',
                lineId === l.id
                  ? 'border-foreground bg-foreground text-card'
                  : 'border-border bg-card text-muted-foreground hover:border-foreground/40 hover:text-foreground'
              )}
              onClick={() => setLineId(l.id)}
            >
              <span className="h-2 w-2 rounded-[2px]" style={{ background: l.color }} />
              {l.code}
            </button>
          ))}
        </div>

        <div className="inline-flex rounded-full border border-border bg-secondary p-0.5">
          {(
            [
              ['month', 'Mois'],
              ['week', 'Semaine'],
            ] as const
          ).map(([g, lbl]) => (
            <button
              key={g}
              type="button"
              className={cn(
                'rounded-full px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-wide transition-colors',
                gran === g
                  ? 'bg-card text-brand shadow-[0_1px_2px_rgba(0,0,0,.08)]'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              onClick={() => setGran(g)}
            >
              {lbl}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-3.5 text-[12px] font-semibold text-secondary-foreground">
          <span className="flex items-center gap-1.5">
            <i className="h-2.5 w-3.5 rounded-[2px] bg-ferme" />
            Ferme
          </span>
          <span className="flex items-center gap-1.5">
            <i className="h-2.5 w-3.5 rounded-[2px] bg-planifie" />
            Planifié
          </span>
          <span className="flex items-center gap-1.5">
            <i className="h-2.5 w-3.5 rounded-[2px] bg-suggere" />
            Suggéré
          </span>
          <span className="mx-0.5 h-3.5 w-px bg-rule-soft" />
          <span className="flex items-center gap-1.5">
            <i className="w-4 border-t-[1.5px] border-dashed border-brand" />
            Moyenne mobile
          </span>
        </div>
      </div>

      {/* ══ KPIs ══ */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat
          icon="schedule"
          lab="Charge totale"
          v={String(summary.tot)}
          unit="h"
          sub={`${activeCode} · ${summary.span}`}
        />
        <Stat
          icon="verified"
          lab="Part ferme"
          v={String(summary.pct)}
          unit="%"
          tone="text-ferme"
          sub={`${summary.fe} h acquises`}
        />
        <Stat
          icon="stacked_bar_chart"
          lab="Pic de charge"
          v={String(summary.peak.v)}
          unit="h"
          tone="text-suggere"
          sub={`${summary.peak.label} · point à anticiper`}
        />
        <Stat
          icon="trending_up"
          lab="Tendance"
          v={`${summary.up ? '▲' : '▼'} ${summary.diff}`}
          unit="h"
          tone="text-brand"
          sub={`du 1er au dernier ${summary.month ? 'mois' : 'trimestre'}`}
        />
      </div>

      {/* ══ Chart ══ */}
      <div className="rounded-xl border border-border bg-card p-[18px_16px_10px] shadow-[0_1px_2px_rgba(31,26,19,.05)]">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="xMidYMid meet"
          className="block h-auto w-full"
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {/* gridlines */}
          {chart.grids.map((g, i) => (
            <g key={i}>
              <line
                x1={PAD_L}
                x2={W - PAD_R}
                y1={g.y}
                y2={g.y}
                stroke="var(--color-rule-soft)"
                strokeWidth={1}
              />
              <text
                x={PAD_L - 8}
                y={g.y + 4}
                textAnchor="end"
                fontSize="11"
                fontFamily="var(--font-mono)"
                fill="var(--color-muted-foreground)"
              >
                {Math.round(g.val)}
              </text>
            </g>
          ))}

          {/* barres empilées (sommet seul arrondi) + totaux + axe X */}
          {chart.bars.map((b, bi) => (
            <g key={bi}>
              {b.segGeo.map((s, si) => (
                <g key={si}>
                  {s.rounded ? (
                    <path d={s.path} fill={s.fill} />
                  ) : (
                    <rect
                      x={s.rect.x}
                      y={s.rect.y}
                      width={s.rect.w}
                      height={s.rect.h}
                      fill={s.fill}
                    />
                  )}
                  {s.label != null && (
                    <text
                      x={s.labelX}
                      y={s.labelY}
                      textAnchor="middle"
                      fontSize="10"
                      fontFamily="var(--font-mono)"
                      fontWeight={700}
                      fill={s.labelFill}
                    >
                      {s.label}
                    </text>
                  )}
                </g>
              ))}
              <text
                x={b.totalX}
                y={b.totalY}
                textAnchor="middle"
                fontSize="11"
                fontFamily="var(--font-mono)"
                fontWeight={700}
                fill="var(--color-foreground)"
              >
                {b.total}
              </text>
              <text
                x={b.xLabelX}
                y={H - PAD_B + 18}
                textAnchor="middle"
                fontSize={b.xLabelSize}
                fontFamily={b.xLabelFont}
                fontWeight={b.xLabelWeight}
                fill="var(--color-muted-foreground)"
              >
                {b.xLabel}
              </text>
            </g>
          ))}

          {/* moyenne mobile */}
          <path
            d={chart.avgPath}
            fill="none"
            stroke="var(--color-brand)"
            strokeWidth={2}
            strokeDasharray="5 4"
            strokeLinecap="round"
          />
          {/* pic */}
          <circle cx={chart.peak.cx} cy={chart.peak.y} r={4} fill="var(--color-brand)" />
        </svg>
      </div>

      {/* ══ Foot ══ */}
      <div className="flex flex-wrap justify-between gap-2 font-fraunces text-[11px] italic text-muted-foreground">
        <span>
          Charge en <b className="not-italic text-secondary-foreground">heures</b> (absolues). Suggéré =
          charge non confirmée (prévision).
        </span>
        <span>Horizon glissant · {summary.span}</span>
      </div>
    </div>
  )
}

export default ChargeForecast
