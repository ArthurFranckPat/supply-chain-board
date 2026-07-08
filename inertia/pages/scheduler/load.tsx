import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount, type Component } from 'solid-js'
import { cx } from '@/libs/cva'
import { Masthead } from '@/components/masthead'
import { TextField, TextFieldInput } from '@/components/ui/text-field'
import type { LoadPageProps, LoadLine, LoadView } from '@/lib/load/types'
import { type Gran, satColor, satRate, total } from '@/lib/load/chart-math'
import { HatchDefs } from '@/components/load/hatch-defs'
import { MiniCard } from '@/components/load/mini-card'
import { DetailChart } from '@/components/load/detail-chart'

/**
 * Page « Projection de charge » — vision long terme, variante 3 « Charge par ligne »
 * (design/mockups/forecast/3-overview.html).
 *
 * Grille de mini-graphes (un par poste de charge) pour comparer d'un coup d'œil, +
 * panneau de détail (histogramme empilé Ferme/Planifié/Suggéré, moyenne mobile, pic)
 * sur le poste sélectionné, avec bascule de maille Mois ↔ Semaine. Données calculées
 * serveur (LoadController) ; ici, pure présentation SVG réactive.
 *
 * Shell (état + toolbar + composition) — dérivations et rendu des graphes vivent
 * dans lib/load/chart-math.ts et components/load/*.tsx (issue #52).
 */

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

  // Bascule Brut ↔ Net (vue commande) : substitue les tableaux nets (besoin − stock
  // strict/CQ) aux bruts. Les OF sont déjà nets via le CBN — toggle sans effet en vue OF.
  const [net, setNet] = createSignal(false)
  const viewNet = (l: LoadLine): LoadLine =>
    net() ? { ...l, monthly: l.monthlyNet, weekly: l.weeklyNet } : l

  // Jeu de lignes de la vue active : OF (charge ordres) ou Commande (charge demande).
  const lines = createMemo(() =>
    (view() === 'of' ? props.ofLines : props.cmdLines).map(viewNet),
  )

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
    <div class="theme-navy flex h-screen flex-col overflow-hidden bg-background text-foreground">
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
        {/* Bascule Brut ↔ Net (vue commande) : déduit le stock disponible (physique + CQ). */}
        <Show when={view() === 'commande'}>
          <div
            class="inline-flex items-center gap-0.5 rounded-md border border-rule bg-card p-0.5"
            title="Net = besoin − stock disponible (physique + CQ), consommé FIFO sur l'horizon"
          >
            <For each={['brut', 'net'] as const}>
              {(m) => (
                <button
                  type="button"
                  onClick={() => setNet(m === 'net')}
                  class={cx(
                    'rounded-[5px] px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-wider transition-colors',
                    (net() ? 'net' : 'brut') === m
                      ? 'bg-terra-soft text-terra'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {m === 'brut' ? 'Brut' : 'Net'}
                </button>
              )}
            </For>
          </div>
        </Show>
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
