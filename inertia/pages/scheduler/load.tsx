import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount, type Component } from 'solid-js'
import { cx } from '@/libs/cva'
import { Masthead } from '@/components/masthead'
import { TextField, TextFieldInput } from '@/components/ui/text-field'
import type { LoadPageProps, LoadLine, LoadPeriod, LoadView } from '@/lib/load/types'

/**
 * Page « Projection de charge » — vision long terme, variante 3 « Charge par ligne »
 * (design/mockups/forecast/3-overview.html).
 *
 * Grille de mini-graphes (un par poste de charge) pour comparer d'un coup d'œil, +
 * panneau de détail (histogramme empilé Ferme/Planifié/Suggéré, moyenne mobile, pic)
 * sur le poste sélectionné, avec bascule de maille Mois ↔ Semaine. Données calculées
 * serveur (LoadController) ; ici, pure présentation SVG réactive.
 */

type Gran = 'month' | 'week'

const FERME = 'var(--color-ferme)'
const PLANIFIE = 'var(--color-planifie)'
const SUGGERE = 'var(--color-suggere)'
const TERRA = 'var(--color-terra)'
const MUTED = 'var(--color-muted-foreground)'
const FG = 'var(--color-foreground)'
const RULE_SOFT = 'var(--color-rule-soft)'
const CARD = 'var(--color-card)'
const DANGER = 'var(--color-danger)'
const WARN = 'var(--color-warn)'
/** Hachures SVG (motifs définis dans <HatchDefs>) : induit dans la couleur du parent. */
const HATCH_FERME = 'url(#load-hatch-ferme)'
const HATCH_SUGGERE = 'url(#load-hatch-suggere)'

const total = (p: LoadPeriod) => p.f + p.p + p.s + p.fi + p.si

/** Taux de saturation charge/capacité, en % (0 si capacité nulle). */
const satRate = (charge: number, cap: number): number => (cap > 0 ? (charge / cap) * 100 : 0)

/** Couleur de saturation : ≥100 % rouge, ≥85 % orange, sinon neutre. */
const satColor = (charge: number, cap: number): string => {
  if (cap <= 0) return MUTED
  if (charge > cap) return DANGER
  if (charge >= cap * 0.85) return WARN
  return MUTED
}

/** Libellé d'un segment selon la vue
 * (OF : Ferme/Planifié/Suggéré ; Commande : Commande/Prévision + induits). */
const segLabel = (view: LoadView, key: keyof LoadPeriod): string => {
  if (key === 'fi') return 'Induit (ferme)'
  if (key === 'si') return 'Induit (prévision)'
  return view === 'commande'
    ? key === 's'
      ? 'Prévision'
      : 'Commande'
    : key === 'f'
      ? 'Ferme'
      : key === 'p'
        ? 'Planifié'
        : 'Suggéré'
}

/** Chemin d'un rectangle à coins supérieurs arrondis (sommet de barre empilée). */
function rtop(x: number, y: number, w: number, h: number, r: number): string {
  r = Math.min(r, w / 2, h / 2)
  return (
    `M ${x.toFixed(1)} ${(y + r).toFixed(1)} Q ${x.toFixed(1)} ${y.toFixed(1)} ${(x + r).toFixed(1)} ${y.toFixed(1)} ` +
    `L ${(x + w - r).toFixed(1)} ${y.toFixed(1)} Q ${(x + w).toFixed(1)} ${y.toFixed(1)} ${(x + w).toFixed(1)} ${(y + r).toFixed(1)} ` +
    `V ${(y + h).toFixed(1)} H ${x.toFixed(1)} Z`
  )
}

/** Moyenne mobile (fenêtre `win`) d'une série de totaux. */
function mobileAvg(totals: number[], win: number): number[] {
  const r: number[] = []
  for (let i = 0; i < totals.length; i++) {
    let s = 0
    let c = 0
    for (let k = i - win + 1; k <= i; k++) {
      if (k >= 0) {
        s += totals[k]
        c++
      }
    }
    r.push(c ? s / c : 0)
  }
  return r
}

/** Segments empilés bas→haut d'une période.
 *  OF (si/fi=0) : Suggéré, Planifié, Ferme.
 *  Commande (p=0) : Prévision + induit prévision (hachuré), Commande + induit ferme (hachuré). */
const segsOf = (d: LoadPeriod): [keyof LoadPeriod, number, string][] => [
  ['s', d.s, SUGGERE],
  ['si', d.si, HATCH_SUGGERE],
  ['p', d.p, PLANIFIE],
  ['f', d.f, FERME],
  ['fi', d.fi, HATCH_FERME],
]

/**
 * Motifs de hachure SVG partagés (document-global via url(#id)) : induit dans la
 * couleur du parent (ferme vert / prévision ambre). Définis une fois, référencés
 * par le mini-graphe et le graphe de détail. SVG 0×0 invisible.
 */
const HatchDefs: Component = () => (
  <svg width="0" height="0" class="absolute" aria-hidden="true">
    <defs>
      <pattern id="load-hatch-ferme" patternUnits="userSpaceOnUse" width="5" height="5" patternTransform="rotate(45)">
        <rect width="5" height="5" fill={FERME} fill-opacity="0.22" />
        <line x1="0" y1="0" x2="0" y2="5" stroke={FERME} stroke-width="1.6" />
      </pattern>
      <pattern id="load-hatch-suggere" patternUnits="userSpaceOnUse" width="5" height="5" patternTransform="rotate(45)">
        <rect width="5" height="5" fill={SUGGERE} fill-opacity="0.22" />
        <line x1="0" y1="0" x2="0" y2="5" stroke={SUGGERE} stroke-width="1.6" />
      </pattern>
    </defs>
  </svg>
)

/* ─────────────────────────── Mini-graphe (carte poste) ─────────────────────────── */

const MiniCard: Component<{
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

/* ─────────────────────────── Histogramme détail ─────────────────────────── */

const DetailChart: Component<{
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
        <path d={geom().avgPath} fill="none" stroke={TERRA} stroke-width="2" stroke-dasharray="5 4" stroke-linecap="round" />
      </Show>
      {/* Pic */}
      <Show when={geom().peak}>{(pk) => <circle cx={pk().cx} cy={pk().cy} r="4" fill={TERRA} />}</Show>
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

/* ─────────────────────────── Page ─────────────────────────── */

const Load: Component<LoadPageProps> = (props) => {
  const [view, setView] = createSignal<LoadView>('of')
  const [selected, setSelected] = createSignal(props.ofLines[0]?.code ?? '')
  const [gran, setGran] = createSignal<Gran>('month')
  const [query, setQuery] = createSignal('')
  // Couches optionnelles du graphe.
  const [showCapacity, setShowCapacity] = createSignal(true)
  const [showAvg, setShowAvg] = createSignal(false)
  // Filtre atelier (#36) : ensemble de STOLOC retenus (vide = tous).
  const [atelierFilter, setAtelierFilter] = createSignal<Set<string>>(new Set())

  const toggleAtelier = (code: string) =>
    setAtelierFilter((prev) => {
      const next = new Set(prev)
      next.has(code) ? next.delete(code) : next.add(code)
      return next
    })

  // Jeu de lignes de la vue active : OF (charge ordres) ou Commande (charge demande).
  const lines = createMemo(() => (view() === 'of' ? props.ofLines : props.cmdLines))

  // Filtre client : atelier (STOLOC) + recherche poste (code/libellé) OU article.
  const filteredLines = createMemo(() => {
    const q = query().trim().toLowerCase()
    const ats = atelierFilter()
    return lines().filter((l) => {
      if (ats.size && !ats.has(l.atelier)) return false
      if (q && !`${l.code} ${l.name} ${l.articles.join(' ')}`.toLowerCase().includes(q)) return false
      return true
    })
  })

  // Si la sélection sort du filtre, bascule sur le premier poste visible.
  createEffect(() => {
    const fl = filteredLines()
    if (fl.length && !fl.some((l) => l.code === selected())) setSelected(fl[0].code)
  })

  const selLine = createMemo(
    () => lines().find((l) => l.code === selected()) ?? filteredLines()[0],
  )

  // ── Slider sans barre : molette → défilé horizontal LISSÉ (inertie rAF) ──
  let sliderEl: HTMLDivElement | undefined
  const [atStart, setAtStart] = createSignal(true)
  const [atEnd, setAtEnd] = createSignal(false)

  const updateEdges = () => {
    const el = sliderEl
    if (!el) return
    setAtStart(el.scrollLeft <= 1)
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 1)
  }

  // Molette verticale → défilé horizontal natif (le navigateur lisse via
  // scroll-behavior). Pas de machine à états rAF : elle réintroduisait des
  // retours au début (targetX périmé qui rappelait le scroll vers 0).
  const onSliderWheel = (e: WheelEvent) => {
    const el = sliderEl
    if (!el || el.scrollWidth <= el.clientWidth) return
    // Geste déjà horizontal (trackpad / shift+molette) → laisse le natif faire.
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return
    e.preventDefault()
    el.scrollLeft += e.deltaY
  }

  onMount(() => {
    requestAnimationFrame(updateEdges)
    const onResize = () => updateEdges()
    window.addEventListener('resize', onResize)
    onCleanup(() => window.removeEventListener('resize', onResize))
  })
  // Recalcule les ombres de bord après un changement de liste filtrée.
  createEffect(() => {
    filteredLines()
    requestAnimationFrame(updateEdges)
  })

  const detailItems = () => {
    const line = selLine()
    if (!line) return []
    return gran() === 'month'
      ? line.monthly.map((d, i) => ({ label: props.months[i] ?? '', d, cap: line.capacity.monthly[i] ?? 0 }))
      : line.weekly.map((d, i) => ({ label: props.weeks[i] ?? '', d, cap: line.capacity.weekly[i] ?? 0 }))
  }

  // Saturation globale du poste sélectionné sur la maille courante (charge / capacité).
  const selSaturation = createMemo(() => {
    const line = selLine()
    if (!line) return { charge: 0, cap: 0, rate: 0 }
    const periods = gran() === 'month' ? line.monthly : line.weekly
    const caps = gran() === 'month' ? line.capacity.monthly : line.capacity.weekly
    const charge = periods.reduce((a, p) => a + total(p), 0)
    const cap = caps.reduce((a, c) => a + c, 0)
    return { charge, cap, rate: satRate(charge, cap) }
  })

  return (
    <div class="theme-papier flex h-screen flex-col overflow-hidden bg-background text-foreground">
      <HatchDefs />
      <Masthead
        subtitle="Charge · vision long terme"
        active="load"
        meta={
          <>
            <div class="font-fraunces text-[12px] font-bold italic text-terra">{props.rangeLabel}</div>
            <div>
              <b class="font-bold text-foreground">{lines().length}</b> postes de charge ·{' '}
              {view() === 'of' ? 'charge OF' : 'charge commandes'}
            </div>
          </>
        }
        actions={
          <TextField class="contents">
            <div class="flex h-[30px] items-center gap-1.5 rounded-full border border-rule bg-card px-3 transition-shadow focus-within:border-terra focus-within:ring-2 focus-within:ring-terra/25">
              <span class="material-symbols-outlined text-[17px] text-muted-foreground">search</span>
              <TextFieldInput
                class="w-[190px] border-0 bg-transparent px-0 text-[12px] font-medium shadow-none focus-visible:ring-0"
                placeholder="Poste, article…"
                type="text"
                autocomplete="off"
                value={query()}
                onInput={(e) => setQuery(e.currentTarget.value)}
              />
            </div>
          </TextField>
        }
      />

      <Show when={props.x3Error}>
        <div class="flex flex-none items-center gap-2 border-b border-terra/30 bg-terra-soft px-7 py-2 text-[12px] text-foreground">
          <span class="material-symbols-outlined text-[16px] text-terra">warning</span>
          <span class="font-bold">Erreur chargement :</span>
          <span class="font-mono">{props.x3Error}</span>
        </div>
      </Show>

      {/* Sélecteur de vue + légende */}
      <div class="flex flex-none flex-wrap items-center gap-3.5 border-b border-rule px-7 py-2 text-[12px] font-semibold text-secondary-foreground">
        {/* Bascule OF ↔ Commande (parité visuelle avec le sélecteur de /programme). */}
        <div class="inline-flex items-center gap-0.5 rounded-md border border-rule bg-card p-0.5">
          <For each={(['of', 'commande'] as const)}>
            {(v) => (
              <button
                type="button"
                onClick={() => setView(v)}
                class={cx(
                  'rounded-[5px] px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-wider transition-colors',
                  view() === v ? 'bg-terra-soft text-terra' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {v === 'of' ? 'OF' : 'Commande'}
              </button>
            )}
          </For>
        </div>
        <span class="h-3.5 w-px bg-rule-soft" />
        <Show
          when={view() === 'of'}
          fallback={
            <>
              <span class="flex items-center gap-1.5">
                <i class="inline-block h-2.5 w-3.5 rounded-[2px] bg-ferme" />Commande
              </span>
              <span class="flex items-center gap-1.5">
                <i class="inline-block h-2.5 w-3.5 rounded-[2px] bg-suggere" />Prévision
              </span>
            </>
          }
        >
          <span class="flex items-center gap-1.5">
            <i class="inline-block h-2.5 w-3.5 rounded-[2px] bg-ferme" />Ferme
          </span>
          <span class="flex items-center gap-1.5">
            <i class="inline-block h-2.5 w-3.5 rounded-[2px] bg-planifie" />Planifié
          </span>
          <span class="flex items-center gap-1.5">
            <i class="inline-block h-2.5 w-3.5 rounded-[2px] bg-suggere" />Suggéré
          </span>
        </Show>
        <span class="h-3.5 w-px bg-rule-soft" />
        {/* Couches optionnelles : cliquer = afficher/masquer. */}
        <button
          type="button"
          onClick={() => setShowCapacity((v) => !v)}
          class="flex items-center gap-1.5 transition-opacity"
          classList={{ 'opacity-40': !showCapacity() }}
        >
          <span class="material-symbols-outlined text-[16px] text-terra">
            {showCapacity() ? 'check_box' : 'check_box_outline_blank'}
          </span>
          <i class="inline-block w-[18px] border-t-[3px] border-foreground/70" />Capacité
        </button>
        <button
          type="button"
          onClick={() => setShowAvg((v) => !v)}
          class="flex items-center gap-1.5 transition-opacity"
          classList={{ 'opacity-40': !showAvg() }}
        >
          <span class="material-symbols-outlined text-[16px] text-terra">
            {showAvg() ? 'check_box' : 'check_box_outline_blank'}
          </span>
          <i class="inline-block w-[18px] border-t-[1.5px] border-dashed border-terra" />Moyenne mobile
        </button>
        <span class="flex items-center gap-1.5">
          <i
            class="inline-block h-2.5 w-3.5 rounded-[2px]"
            style={{ background: 'color-mix(in srgb, var(--color-danger) 20%, transparent)', 'box-shadow': 'inset 0 0 0 1px var(--color-danger)' }}
          />
          Surcharge
        </span>
        <span class="ml-auto font-fraunces text-[11px] italic text-muted-foreground">
          Mini-graphes : {props.months.length} mois · clic = détail
        </span>
      </div>

      {/* Filtre atelier (#36) — chips STOLOC, apparaît dès qu'un poste porte un atelier. */}
      <Show when={props.ateliers.length > 0}>
        <div class="flex flex-none flex-wrap items-center gap-1.5 border-b border-rule px-7 py-2 text-[12px]">
          <span class="mr-1 font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Atelier</span>
          <For each={props.ateliers}>
            {(a) => (
              <button
                type="button"
                onClick={() => toggleAtelier(a.code)}
                class={cx(
                  'rounded-full border px-2.5 py-1 font-sans text-[11px] font-semibold transition-colors',
                  atelierFilter().has(a.code)
                    ? 'border-terra bg-terra-soft text-terra'
                    : 'border-rule bg-card text-muted-foreground hover:border-[#b3a47e] hover:text-foreground',
                )}
                title={a.code}
              >
                {a.label}
              </button>
            )}
          </For>
          <Show when={atelierFilter().size > 0}>
            <button
              type="button"
              onClick={() => setAtelierFilter(new Set())}
              class="ml-1 font-mono text-[10px] font-bold uppercase tracking-wider text-terra hover:underline"
            >
              Réinitialiser
            </button>
          </Show>
        </div>
      </Show>

      <Show
        when={lines().length > 0}
        fallback={
          <div class="flex flex-1 items-center justify-center p-10 font-fraunces text-[14px] italic text-muted-foreground">
            {view() === 'of' ? 'Aucune charge OF sur l\'horizon.' : 'Aucune charge commande sur l\'horizon.'}
          </div>
        }
      >
        <div class="flex min-h-0 flex-1 flex-col gap-[18px] px-7 py-5">
          {/* Vue d'ensemble : slider horizontal de mini-cartes par poste */}
          <Show
            when={filteredLines().length > 0}
            fallback={
              <div class="rounded-xl border border-dashed border-rule px-4 py-6 text-center font-fraunces text-[13px] italic text-muted-foreground">
                Aucun poste ne correspond à « {query()} ».
              </div>
            }
          >
            <div class="relative flex-none">
              <div
                ref={sliderEl}
                onWheel={onSliderWheel}
                onScroll={updateEdges}
                class="no-scrollbar flex gap-3 overflow-x-auto pb-2"
              >
                <For each={filteredLines()}>
                  {(line) => (
                    <MiniCard
                      line={line}
                      months={props.months}
                      selected={selected() === line.code}
                      showCapacity={showCapacity}
                      onSelect={() => setSelected(line.code)}
                    />
                  )}
                </For>
              </div>
              {/* Dégradés de bord : affordance « il reste des postes à faire défiler ». */}
              <div
                class="pointer-events-none absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-background to-transparent transition-opacity duration-200"
                classList={{ 'opacity-0': atStart() }}
              />
              <div
                class="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-background to-transparent transition-opacity duration-200"
                classList={{ 'opacity-0': atEnd() }}
              />
            </div>
          </Show>

          {/* Détail du poste sélectionné — occupe la hauteur restante (pas de scroll page) */}
          <Show when={selLine()}>
            {(line) => (
              <div class="flex min-h-0 flex-1 flex-col rounded-xl border border-rule bg-card p-4 shadow-[0_1px_2px_rgba(31,26,19,.05)]">
                <div class="mb-2.5 flex flex-none flex-wrap items-center gap-3">
                  <div class="flex items-center gap-2 font-fraunces text-[20px] font-extrabold tracking-tight">
                    <span class="size-3 rounded-[3px]" style={{ background: line().color }} />
                    {line().code}
                    <span class="font-sans text-[14px] font-medium text-muted-foreground">· {line().name}</span>
                  </div>
                  <Show when={line().atelier}>
                    <span class="rounded-full border border-rule bg-secondary px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-secondary-foreground">
                      {line().atelierLabel}
                    </span>
                  </Show>
                  {/* Badge saturation (#35) : charge cumulée / capacité sur la maille courante. */}
                  <Show when={selSaturation().cap > 0}>
                    <span
                      class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[11px] font-bold"
                      style={{
                        color: satColor(selSaturation().charge, selSaturation().cap),
                        'background-color': 'color-mix(in srgb, currentColor 12%, transparent)',
                      }}
                    >
                      <span class="material-symbols-outlined text-[14px]">
                        {selSaturation().rate > 100 ? 'warning' : 'speed'}
                      </span>
                      Saturation {Math.round(selSaturation().rate)}%
                      <span class="font-sans font-medium opacity-70">
                        ({selSaturation().charge} / {selSaturation().cap} h)
                      </span>
                    </span>
                  </Show>
                  <div class="ml-auto inline-flex rounded-full border border-rule bg-secondary p-[3px]">
                    <button
                      type="button"
                      onClick={() => setGran('month')}
                      class={cx(
                        'rounded-full px-3.5 py-1.5 font-sans text-[11px] font-bold uppercase tracking-wide transition-colors',
                        gran() === 'month' ? 'bg-card text-terra shadow-[0_1px_2px_rgba(0,0,0,.08)]' : 'text-muted-foreground',
                      )}
                    >
                      Mois
                    </button>
                    <button
                      type="button"
                      onClick={() => setGran('week')}
                      class={cx(
                        'rounded-full px-3.5 py-1.5 font-sans text-[11px] font-bold uppercase tracking-wide transition-colors',
                        gran() === 'week' ? 'bg-card text-terra shadow-[0_1px_2px_rgba(0,0,0,.08)]' : 'text-muted-foreground',
                      )}
                    >
                      Semaine
                    </button>
                  </div>
                </div>
                <DetailChart items={detailItems} gran={gran} view={view} showCapacity={showCapacity} showAvg={showAvg} />
              </div>
            )}
          </Show>
        </div>
      </Show>
    </div>
  )
}

export default Load
