import { For, Show, createMemo, createSignal, onCleanup, onMount, type Component } from 'solid-js'
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
export const DetailChart: Component<{
  items: () => { label: string; d: LoadPeriod; cap: number }[]
  gran: () => Gran
  view: () => LoadView
  showCapacity: () => boolean
  showAvg: () => boolean
}> = (props) => {
  const padL = 46
  const padR = 16
  const padT = 14
  const padB = 38

  // SVG responsive : viewBox = taille réelle du conteneur (mesurée) → remplit tout
  // l'espace dispo sans letterbox ni distorsion. Défaut avant 1re mesure.
  let wrapEl: HTMLDivElement | undefined
  const [dim, setDim] = createSignal({ w: 1000, h: 380 })
  onMount(() => {
    if (!wrapEl) return
    const ro = new ResizeObserver(() => {
      const r = wrapEl!.getBoundingClientRect()
      if (r.width > 0 && r.height > 0) setDim({ w: Math.round(r.width), h: Math.round(r.height) })
    })
    ro.observe(wrapEl)
    onCleanup(() => ro.disconnect())
  })

  const geom = createMemo(() => {
    const items = props.items()
    const W = dim().w
    const H = dim().h
    const cw = W - padL - padR
    const ch = H - padT - padB
    const n = items.length || 1
    const T = items.map((it) => total(it.d))
    const C = items.map((it) => it.cap)
    // L'échelle englobe la capacité → la ligne de capacité reste dans le cadre.
    const maxV = (Math.max(...T, ...C, 0) * 1.18) || 1
    const slot = cw / n
    const bw = Math.min(slot * 0.62, props.gran() === 'week' ? 44 : 64)
    const x = (i: number) => padL + slot * i + slot / 2
    const y = (v: number) => padT + ch - (v / maxV) * ch

    const grid = [0, 1, 2, 3, 4].map((g) => {
      const val = (maxV * g) / 4
      return { y: y(val), label: Math.round(val) }
    })

    type SegInfo = { period: string; label: string; value: number; total: number; cap: number; color: string }
    type Seg = { kind: 'rect' | 'path'; x: number; y: number; w: number; h: number; fill: string; info: SegInfo }
    type Lbl = { x: number; y: number; text: number; fill: string }
    const segments: Seg[] = []
    const inLabels: Lbl[] = []
    const totals: { x: number; y: number; text: number; fill: string }[] = []
    const xLabels: { x: number; y: number; text: string }[] = []
    // Plafond de capacité : courbe continue (un point par bucket) + surépaisseur
    // rouge translucide sur la part de charge au-dessus du plafond.
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
        const label = segLabel(props.view(), k)
        segments.push({
          kind: idx === topIdx ? 'path' : 'rect',
          x: xx,
          y: yTop,
          w: bw,
          h,
          fill: col,
          info: { period: it.label, label, value: v, total: T[i], cap: C[i], color: col },
        })
        if (h > 16) inLabels.push({ x: cx, y: (yTop + y(acc)) / 2 + 3, text: v, fill: k === 's' || k === 'si' ? '#3a2a0e' : CARD })
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

    // Courbe de capacité continue (polyligne par centre de bucket).
    const capPath = capPts.map((p2, i) => `${i ? 'L' : 'M'}${p2.x} ${p2.y}`).join(' ')

    // Moyenne mobile.
    const win = props.gran() === 'week' ? 8 : 2
    const ma = mobileAvg(T, win)
    const avgPath = ma.map((v, i) => `${i ? 'L' : 'M'}${x(i)} ${y(v)}`).join(' ')

    const pi = T.length ? T.indexOf(Math.max(...T)) : 0
    const peak = T.length ? { cx: x(pi), cy: y(T[pi]) } : null

    const capLabel = capPts.length ? { x: capPts[capPts.length - 1].x, y: capPts[capPts.length - 1].y } : null
    return { grid, segments, inLabels, totals, xLabels, capPath, capPts, overRects, capLabel, avgPath, peak, week: props.gran() === 'week' }
  })

  // Tooltip au survol d'une section : suit le curseur dans le conteneur.
  type SegInfo = { period: string; label: string; value: number; total: number; cap: number; color: string }
  const [hover, setHover] = createSignal<SegInfo | null>(null)
  const [pos, setPos] = createSignal({ x: 0, y: 0 })
  const onMove = (e: MouseEvent) => {
    if (!wrapEl) return
    const r = wrapEl.getBoundingClientRect()
    setPos({ x: e.clientX - r.left, y: e.clientY - r.top })
  }

  return (
    <div ref={wrapEl} class="relative min-h-0 flex-1" onMouseMove={onMove}>
    <svg viewBox={`0 0 ${dim().w} ${dim().h}`} preserveAspectRatio="none" class="block h-full w-full">
      {/* Gridlines + axe Y */}
      <For each={geom().grid}>
        {(g) => (
          <>
            <line x1={padL} x2={dim().w - padR} y1={g.y} y2={g.y} stroke={RULE_SOFT} stroke-width="1" />
            <text x={padL - 8} y={g.y + 4} text-anchor="end" font-size="11" fill={MUTED} class="font-mono">
              {g.label}
            </text>
          </>
        )}
      </For>
      {/* Barres empilées (survol → tooltip) */}
      <For each={geom().segments}>
        {(s) => {
          const isOn = () => {
            const h = hover()
            return !!h && h.period === s.info.period && h.label === s.info.label
          }
          const common = {
            fill: s.fill,
            style: { cursor: 'pointer', opacity: hover() && !isOn() ? 0.55 : 1, transition: 'opacity .12s' },
            onMouseEnter: () => setHover(s.info),
            onMouseLeave: () => setHover(null),
          }
          return s.kind === 'path' ? (
            <path d={rtop(s.x, s.y, s.w, s.h, Math.min(s.w / 3, 7))} {...common} />
          ) : (
            <rect x={s.x} y={s.y} width={s.w} height={s.h} {...common} />
          )
        }}
      </For>
      {/* Valeurs in-barre */}
      <For each={geom().inLabels}>
        {(l) => (
          <text x={l.x} y={l.y} text-anchor="middle" font-size="10" font-weight="700" fill={l.fill} class="font-mono">
            {l.text}
          </text>
        )}
      </For>
      {/* Plafond de capacité (issue #35) — courbe continue + points (rouge si dépassé). */}
      <Show when={props.showCapacity()}>
        {/* Surcharge : part de charge au-dessus du plafond, rouge translucide. */}
        <For each={geom().overRects}>
          {(r) => <rect x={r.x} y={r.y} width={r.w} height={r.h} fill={DANGER} opacity="0.2" />}
        </For>
        {/* Liseré clair sous la courbe pour la détacher des barres. */}
        <path d={geom().capPath} fill="none" stroke={CARD} stroke-opacity="0.85" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" />
        <path
          d={geom().capPath}
          fill="none"
          stroke={FG}
          stroke-opacity="0.75"
          stroke-width="3"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        <For each={geom().capPts}>
          {(c) => (
            <circle
              cx={c.x}
              cy={c.y}
              r={c.over ? 5 : 3.5}
              fill={c.over ? DANGER : FG}
              stroke={CARD}
              stroke-width="1.5"
              class="cursor-pointer"
              onMouseEnter={() => setHover({ period: '', label: 'Capacité', value: c.v, total: 0, cap: c.v, color: c.over ? DANGER : FG })}
              onMouseLeave={() => setHover(null)}
            />
          )}
        </For>
        <Show when={geom().capLabel}>
          {(l) => (
            <text x={l().x - 8} y={l().y - 9} text-anchor="end" font-size="10" font-weight="800" fill={FG} opacity="0.65" class="font-mono uppercase tracking-wider">
              capacité
            </text>
          )}
        </Show>
      </Show>
      {/* Totaux au sommet (rouge si > capacité) */}
      <For each={geom().totals}>
        {(t) => (
          <text x={t.x} y={t.y} text-anchor="middle" font-size="11" font-weight="700" fill={t.fill} class="font-mono">
            {t.text}
          </text>
        )}
      </For>
      {/* Libellés X — mode semaine : 2 lignes (date du lundi + n° de semaine). */}
      <For each={geom().xLabels}>
        {(l) => (
          <text
            x={l.x}
            y={l.y}
            text-anchor="middle"
            font-size={geom().week ? '8' : '12'}
            font-weight={geom().week ? '500' : '700'}
            fill={MUTED}
            class={geom().week ? 'font-mono' : 'font-fraunces'}
          >
            <For each={l.text.split('\n')}>
              {(ln, i) => (
                <tspan x={l.x} dy={i() === 0 ? 0 : '1.15em'} font-weight={i() === 0 ? '700' : '500'}>
                  {ln}
                </tspan>
              )}
            </For>
          </text>
        )}
      </For>
      {/* Moyenne mobile */}
      <Show when={props.showAvg()}>
        <path d={geom().avgPath} fill="none" stroke={BRAND} stroke-width="2" stroke-dasharray="5 4" stroke-linecap="round" />
      </Show>
      {/* Pic */}
      <Show when={geom().peak}>{(pk) => <circle cx={pk().cx} cy={pk().cy} r="4" fill={BRAND} />}</Show>
    </svg>

      {/* Tooltip détail de section */}
      <Show when={hover()}>
        {(h) => (
          <div
            class="pointer-events-none absolute z-10 whitespace-nowrap rounded-lg border border-rule bg-card px-3 py-2 shadow-[0_4px_14px_-4px_rgba(31,26,19,.35)]"
            style={{ left: `${pos().x}px`, top: `${pos().y}px`, transform: 'translate(-50%, calc(-100% - 12px))' }}
          >
            <Show when={h().period}>
              <div class="font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {h().period}
              </div>
            </Show>
            <div class="mt-1 flex items-center gap-2">
              <span class="size-2.5 flex-none rounded-[2px]" style={{ background: h().color }} />
              <span class="font-sans text-[12px] font-semibold">{h().label}</span>
              <span class="ml-3 font-fraunces text-[15px] font-extrabold tabular-nums">{h().value} h</span>
            </div>
            {/* Survol d'un segment de charge : part du total + plafond + saturation. */}
            <Show when={h().total > 0}>
              <div class="mt-0.5 font-mono text-[10px] text-muted-foreground">
                {Math.round((h().value / h().total) * 100)}% du total · {h().total} h
              </div>
              <Show when={h().cap > 0}>
                <div class="mt-0.5 font-mono text-[10px]" style={{ color: satColor(h().total, h().cap) }}>
                  capacité {h().cap} h · saturation {Math.round(satRate(h().total, h().cap))}%
                </div>
              </Show>
            </Show>
          </div>
        )}
      </Show>
    </div>
  )
}
