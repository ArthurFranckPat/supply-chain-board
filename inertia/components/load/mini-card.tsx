import { For, Show, createMemo, type Component } from 'solid-js'
import { cx } from '@/libs/cva'
import type { LoadLine } from '@/lib/load/types'
import { DANGER, FG, TERRA, rtop, satColor, satRate, segsOf, total } from '@/lib/load/chart-math'

/**
 * Mini-graphe (carte poste) de la vue « Projection de charge » (issue #52 —
 * extrait de scheduler/load.tsx).
 */
export const MiniCard: Component<{
  line: LoadLine
  months: string[]
  selected: boolean
  showCapacity: () => boolean
  onSelect: () => void
}> = (p) => {
  const totals = createMemo(() => p.line.monthly.map(total))
  const sum = createMemo(() => totals().reduce((a, b) => a + b, 0))
  const peakIdx = createMemo(() => {
    const t = totals()
    return t.length ? t.indexOf(Math.max(...t)) : 0
  })

  const caps = createMemo(() => p.line.capacity.monthly)
  // Saturation au mois de pic (charge / capacité) — pilote la couleur de l'étiquette « pic ».
  const peakSat = createMemo(() => {
    const i = peakIdx()
    return satRate(totals()[i] ?? 0, caps()[i] ?? 0)
  })

  const W = 160
  const H = 44
  const pad = 2
  const bars = createMemo(() => {
    const t = totals()
    const c = caps()
    const n = t.length || 1
    const slot = (W - 2 * pad) / n
    const bw = slot * 0.55
    // L'échelle inclut la capacité → la ligne de capacité reste visible même sans surcharge.
    const max = (Math.max(...t, ...c, 0) * 1.1) || 1
    const yy = (v: number) => H - pad - (v / max) * (H - 2 * pad)
    const out: { kind: 'rect' | 'path'; x: number; y: number; w: number; h: number; fill: string }[] = []
    const peakDots: { cx: number; cy: number }[] = []
    const overRects: { x: number; y: number; w: number; h: number }[] = []
    const capPts: { x: number; y: number }[] = []
    p.line.monthly.forEach((d, i) => {
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
      // Surcharge : part au-dessus du plafond, en rouge translucide.
      if (c[i] > 0 && t[i] > c[i]) overRects.push({ x, y: yy(t[i]), w: bw, h: yy(c[i]) - yy(t[i]) })
      if (c[i] > 0) capPts.push({ x: cx, y: yy(c[i]) })
      if (i === peakIdx()) peakDots.push({ cx, cy: yy(t[i]) })
    })
    const capPath = capPts.map((pt, i) => `${i ? 'L' : 'M'}${pt.x} ${pt.y}`).join(' ')
    return { out, peakDots, overRects, capPath }
  })

  return (
    <button
      type="button"
      onClick={p.onSelect}
      class={cx(
        'flex w-[190px] shrink-0 flex-col rounded-xl border bg-card p-3 text-left transition-all hover:-translate-y-px',
        p.selected
          ? 'border-terra shadow-[0_0_0_2px_var(--color-terra-soft),0_4px_12px_-4px_rgba(168,67,31,.25)]'
          : 'border-rule hover:border-[#b3a47e]',
      )}
    >
      <div class="mb-1.5 flex items-center gap-2">
        <span class="size-[9px] flex-none rounded-[2px]" style={{ background: p.line.color }} />
        <div class="min-w-0">
          <div class="font-fraunces text-[14px] font-extrabold leading-none tracking-tight">{p.line.code}</div>
          <div class="truncate font-sans text-[10px] text-muted-foreground">{p.line.name}</div>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} class="block h-[44px] w-full">
        <For each={bars().out}>
          {(b) =>
            b.kind === 'path' ? (
              <path d={rtop(b.x, b.y, b.w, b.h, Math.min(b.w / 3, 5))} fill={b.fill} />
            ) : (
              <rect x={b.x} y={b.y} width={b.w} height={b.h} fill={b.fill} />
            )
          }
        </For>
        {/* Plafond de capacité — courbe continue + surcharge rouge. */}
        <Show when={p.showCapacity()}>
          <For each={bars().overRects}>
            {(r) => <rect x={r.x} y={r.y} width={r.w} height={r.h} fill={DANGER} opacity="0.22" />}
          </For>
          <path d={bars().capPath} fill="none" stroke={FG} stroke-opacity="0.6" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" />
        </Show>
        <For each={bars().peakDots}>{(pk) => <circle cx={pk.cx} cy={pk.cy} r="2.5" fill={TERRA} />}</For>
      </svg>
      <div class="mt-1.5 flex items-baseline justify-between">
        <span class="font-fraunces text-[16px] font-extrabold tracking-tight">{sum()}h</span>
        <span
          class="font-mono text-[9px] font-bold"
          style={{ color: peakSat() >= 85 ? satColor(totals()[peakIdx()] ?? 0, caps()[peakIdx()] ?? 0) : undefined }}
          classList={{ 'text-terra': p.selected && peakSat() < 85, 'text-suggere': !p.selected && peakSat() < 85 }}
        >
          pic {p.months[peakIdx()]} {totals()[peakIdx()] ?? 0}h
          <Show when={caps()[peakIdx()] > 0}> · {Math.round(peakSat())}%</Show>
        </span>
      </div>
    </button>
  )
}
