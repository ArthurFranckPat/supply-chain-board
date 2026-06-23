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

const total = (p: LoadPeriod) => p.f + p.p + p.s

/** Libellé d'un segment selon la vue (OF : Ferme/Planifié/Suggéré ; Commande : Commande/Prévision). */
const segLabel = (view: LoadView, key: keyof LoadPeriod): string =>
  view === 'commande'
    ? key === 's'
      ? 'Prévision'
      : 'Commande'
    : key === 'f'
      ? 'Ferme'
      : key === 'p'
        ? 'Planifié'
        : 'Suggéré'

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

/** Segments empilés bas→haut d'une période : Suggéré (base), Planifié, Ferme (sommet). */
const segsOf = (d: LoadPeriod): [keyof LoadPeriod, number, string][] => [
  ['s', d.s, SUGGERE],
  ['p', d.p, PLANIFIE],
  ['f', d.f, FERME],
]

/* ─────────────────────────── Mini-graphe (carte poste) ─────────────────────────── */

const MiniCard: Component<{
  line: LoadLine
  months: string[]
  selected: boolean
  onSelect: () => void
}> = (p) => {
  const totals = createMemo(() => p.line.monthly.map(total))
  const sum = createMemo(() => totals().reduce((a, b) => a + b, 0))
  const peakIdx = createMemo(() => {
    const t = totals()
    return t.length ? t.indexOf(Math.max(...t)) : 0
  })

  const W = 160
  const H = 44
  const pad = 2
  const bars = createMemo(() => {
    const t = totals()
    const n = t.length || 1
    const slot = (W - 2 * pad) / n
    const bw = slot * 0.55
    const max = (Math.max(...t, 0) * 1.1) || 1
    const yy = (v: number) => H - pad - (v / max) * (H - 2 * pad)
    const out: { kind: 'rect' | 'path'; x: number; y: number; w: number; h: number; fill: string }[] = []
    const peakDots: { cx: number; cy: number }[] = []
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
      if (i === peakIdx()) peakDots.push({ cx, cy: yy(t[i]) })
    })
    return { out, peakDots }
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
        <For each={bars().peakDots}>{(pk) => <circle cx={pk.cx} cy={pk.cy} r="2.5" fill={TERRA} />}</For>
      </svg>
      <div class="mt-1.5 flex items-baseline justify-between">
        <span class="font-fraunces text-[16px] font-extrabold tracking-tight">{sum()}h</span>
        <span class={cx('font-mono text-[9px] font-bold', p.selected ? 'text-terra' : 'text-suggere')}>
          pic {p.months[peakIdx()]} {totals()[peakIdx()] ?? 0}h
        </span>
      </div>
    </button>
  )
}

/* ─────────────────────────── Histogramme détail ─────────────────────────── */

const DetailChart: Component<{
  items: () => { label: string; d: LoadPeriod }[]
  gran: () => Gran
  view: () => LoadView
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
    const maxV = (Math.max(...T, 0) * 1.18) || 1
    const slot = cw / n
    const bw = Math.min(slot * 0.62, props.gran() === 'week' ? 44 : 64)
    const x = (i: number) => padL + slot * i + slot / 2
    const y = (v: number) => padT + ch - (v / maxV) * ch

    const grid = [0, 1, 2, 3, 4].map((g) => {
      const val = (maxV * g) / 4
      return { y: y(val), label: Math.round(val) }
    })

    type SegInfo = { period: string; label: string; value: number; total: number; color: string }
    type Seg = { kind: 'rect' | 'path'; x: number; y: number; w: number; h: number; fill: string; info: SegInfo }
    type Lbl = { x: number; y: number; text: number; fill: string }
    const segments: Seg[] = []
    const inLabels: Lbl[] = []
    const totals: { x: number; y: number; text: number }[] = []
    const xLabels: { x: number; y: number; text: string }[] = []

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
          info: { period: it.label, label, value: v, total: T[i], color: col },
        })
        if (h > 16) inLabels.push({ x: cx, y: (yTop + y(acc)) / 2 + 3, text: v, fill: k === 's' ? '#3a2a0e' : CARD })
        acc += v
      })
      totals.push({ x: cx, y: y(T[i]) - 6, text: T[i] })
      xLabels.push({ x: cx, y: H - padB + 18, text: it.label })
    })

    // Moyenne mobile.
    const win = props.gran() === 'week' ? 8 : 2
    const ma = mobileAvg(T, win)
    const avgPath = ma.map((v, i) => `${i ? 'L' : 'M'}${x(i)} ${y(v)}`).join(' ')

    const pi = T.length ? T.indexOf(Math.max(...T)) : 0
    const peak = T.length ? { cx: x(pi), cy: y(T[pi]) } : null

    return { grid, segments, inLabels, totals, xLabels, avgPath, peak, week: props.gran() === 'week' }
  })

  // Tooltip au survol d'une section : suit le curseur dans le conteneur.
  type SegInfo = { period: string; label: string; value: number; total: number; color: string }
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
      {/* Totaux au sommet */}
      <For each={geom().totals}>
        {(t) => (
          <text x={t.x} y={t.y} text-anchor="middle" font-size="11" font-weight="700" fill={FG} class="font-mono">
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
      <path d={geom().avgPath} fill="none" stroke={TERRA} stroke-width="2" stroke-dasharray="5 4" stroke-linecap="round" />
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
            <div class="font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              {h().period}
            </div>
            <div class="mt-1 flex items-center gap-2">
              <span class="size-2.5 flex-none rounded-[2px]" style={{ background: h().color }} />
              <span class="font-sans text-[12px] font-semibold">{h().label}</span>
              <span class="ml-3 font-fraunces text-[15px] font-extrabold tabular-nums">{h().value} h</span>
            </div>
            <div class="mt-0.5 font-mono text-[10px] text-muted-foreground">
              {h().total > 0 ? Math.round((h().value / h().total) * 100) : 0}% du total · {h().total} h
            </div>
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

  // Jeu de lignes de la vue active : OF (charge ordres) ou Commande (charge demande).
  const lines = createMemo(() => (view() === 'of' ? props.ofLines : props.cmdLines))

  // Filtre client : poste (code/libellé) OU article (code/désignation).
  const filteredLines = createMemo(() => {
    const q = query().trim().toLowerCase()
    if (!q) return lines()
    return lines().filter((l) =>
      `${l.code} ${l.name} ${l.articles.join(' ')}`.toLowerCase().includes(q),
    )
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

  // Animation : on glisse `scrollLeft` vers `targetX` (lerp) plutôt que de sauter
  // d'un cran à chaque tick de molette → défilé fluide façon carrousel.
  let targetX = 0
  let raf = 0
  const step = () => {
    const el = sliderEl
    if (!el) {
      raf = 0
      return
    }
    const cur = el.scrollLeft
    const diff = targetX - cur
    if (Math.abs(diff) < 0.5) {
      el.scrollLeft = targetX
      raf = 0
      return
    }
    el.scrollLeft = cur + diff * 0.18
    raf = requestAnimationFrame(step)
  }
  const onSliderWheel = (e: WheelEvent) => {
    const el = sliderEl
    // Laisse passer les gestes déjà horizontaux (trackpad / shift+molette).
    if (!el || e.deltaY === 0 || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return
    e.preventDefault()
    const max = el.scrollWidth - el.clientWidth
    const base = raf ? targetX : el.scrollLeft
    targetX = Math.max(0, Math.min(max, base + e.deltaY * 1.1))
    if (!raf) raf = requestAnimationFrame(step)
  }

  onMount(() => {
    requestAnimationFrame(updateEdges)
    const onResize = () => updateEdges()
    window.addEventListener('resize', onResize)
    onCleanup(() => {
      window.removeEventListener('resize', onResize)
      if (raf) cancelAnimationFrame(raf)
    })
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
      ? line.monthly.map((d, i) => ({ label: props.months[i] ?? '', d }))
      : line.weekly.map((d, i) => ({ label: props.weeks[i] ?? '', d }))
  }

  return (
    <div class="theme-papier flex h-screen flex-col overflow-hidden bg-background text-foreground">
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
        <span class="flex items-center gap-1.5">
          <i class="inline-block w-[18px] border-t-[1.5px] border-dashed border-terra" />Moyenne mobile
        </span>
        <span class="ml-auto font-fraunces text-[11px] italic text-muted-foreground">
          Mini-graphes : {props.months.length} mois · clic = détail
        </span>
      </div>

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
                <DetailChart items={detailItems} gran={gran} view={view} />
              </div>
            )}
          </Show>
        </div>
      </Show>
    </div>
  )
}

export default Load
