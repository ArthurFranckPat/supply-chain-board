import { For, Show, createEffect, createMemo, createSignal, on, onCleanup, onMount, type Component } from 'solid-js'
import { Link } from '@/lib/inertia-solid'
import type { VisionBoardData, VisionCardStatus, VisionCommande, VisionOfCard } from '@/lib/vision/types'
import { cx } from '@/libs/cva'
import BoardCard from '@/components/board/board-card'
import { Masthead } from '@/components/masthead'

/**
 * Issue #21 — Vue unifiée OF ↔ commandes.
 *
 * Même charpente que les autres boards Papier (masthead, en-tête semaines+jours
 * collant, 1 rangée par poste, colonne poste collante, cartes via <BoardCard>).
 * Deux additions :
 *  • une bande « Expéditions » porte les commandes à leur date d'expédition ;
 *  • un calque SVG relie chaque OF à sa commande (courbe filet terra, pointillé
 *    si l'OF est suggéré). Les coordonnées des liens sont mesurées au DOM (les
 *    cellules ont une hauteur variable) puis recomputées au resize / changement
 *    de board / filtres.
 *
 * Pas de rang CBN ni de seuil « trop tôt » (hors scope) — le cœur est la
 * visualisation du lien OF → commande, chacun positionné à sa date.
 */

type VisionProps = {
  board: VisionBoardData
  windowFrom: string
  windowTo: string
  horizon: number
  dateRange: string
  weekLabel: string
  prevHref: string
  nextHref: string
  todayHref: string
  totalOf: number
  lineCount: number
  x3Error: string | null
  cached: string | null
}

const LABEL_W = 208
const DAY_W = 150

const STATUS = [
  { k: 'ferme' as const, label: 'Ferme' },
  { k: 'planifie' as const, label: 'Planifié' },
  { k: 'suggere' as const, label: 'Suggéré' },
]

const GRAPH_PAPER =
  'linear-gradient(to right, rgba(31,26,19,.045) 1px, transparent 1px),' +
  'linear-gradient(to bottom, rgba(31,26,19,.045) 1px, transparent 1px)'

/** Heures → « 14 » ou « 14,5 » (Fraunces tabular ajoute le « h »). */
const fmtHours = (h: number) => {
  const r = Math.round(h * 100) / 100
  return Number.isInteger(r) ? String(r) : r.toFixed(2).replace('.', ',')
}

/** ISO YYYY-MM-DD → JJ/MM. */
const fmtDay = (iso: string | null): string => {
  if (!iso) return '—'
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]}/${m[2]}` : iso
}

const r1 = (n: number) => Math.round(n)

interface PathSpec {
  d: string
  suggere: boolean
}

const Vision: Component<VisionProps> = (props) => {
  const cols = () => props.board.cols
  const gridTpl = () => `${LABEL_W}px repeat(${cols()}, minmax(${DAY_W}px, 1fr))`
  const minWidth = () => `calc(${LABEL_W}px + ${cols() * (DAY_W + 1)}px)`

  // Filtre statut d'OF (cacher les OF d'un statut masque aussi leurs liens :
  // la carte disparaît du DOM → querySelector renvoie null → lien sauté).
  const [hidden, setHidden] = createSignal<Set<VisionCardStatus>>(new Set())
  const toggle = (k: VisionCardStatus) =>
    setHidden((s) => {
      const n = new Set(s)
      n.has(k) ? n.delete(k) : n.add(k)
      return n
    })
  const ofVisible = (of: VisionOfCard) => !hidden().has(of.status)

  /** Commandes groupées par colonne (date d'expédition). */
  const cmdsByCol = createMemo(() => {
    const buckets: VisionCommande[][] = Array.from({ length: cols() }, () => [])
    for (const c of props.board.commandes) if (c.col >= 0 && c.col < cols()) buckets[c.col].push(c)
    return buckets
  })

  // ── Calque de liens : coordonnées mesurées au DOM ──
  const [contentEl, setContentEl] = createSignal<HTMLDivElement | null>(null)
  const [paths, setPaths] = createSignal<PathSpec[]>([])

  const measure = () => {
    const content = contentEl()
    if (!content) return
    const cRect = content.getBoundingClientRect()
    const out: PathSpec[] = []
    for (const link of props.board.links) {
      const ofEl = content.querySelector(`[data-link-of="${link.ofId}"]`)
      const cmdEl = content.querySelector(`[data-link-cmd="${link.commandeId}"]`)
      if (!ofEl || !cmdEl) continue
      const or = (ofEl as HTMLElement).getBoundingClientRect()
      const cr = (cmdEl as HTMLElement).getBoundingClientRect()
      // Origine = haut-centre de la carte OF ; cible = bas-centre du marqueur commande.
      // Coordonnées locales au contenu (scroll-indépendantes : les deux rects bougent ensemble).
      const sx = or.left - cRect.left + or.width / 2
      const sy = or.top - cRect.top
      const tx = cr.left - cRect.left + cr.width / 2
      const ty = cr.bottom - cRect.top
      const my = (sy + ty) / 2
      out.push({
        d: `M${r1(sx)},${r1(sy)} C${r1(sx)},${r1(my)} ${r1(tx)},${r1(my)} ${r1(tx)},${r1(ty)}`,
        suggere: link.suggere,
      })
    }
    setPaths(out)
  }

  let ro: ResizeObserver | null = null
  onMount(() => {
    measure()
    const el = contentEl()
    if (el && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => measure())
      ro.observe(el)
    }
    window.addEventListener('resize', measure)
    if (document.fonts?.ready) document.fonts.ready.then(measure).catch(() => {})
    onCleanup(() => {
      ro?.disconnect()
      window.removeEventListener('resize', measure)
    })
  })

  // Recalcul quand le board ou les filtres changent (après rendu).
  createEffect(
    on(
      () => [props.board, hidden()] as const,
      () => requestAnimationFrame(measure),
      { defer: true },
    ),
  )

  return (
    <div class="theme-papier flex h-screen flex-col overflow-hidden bg-background text-foreground">
      <Masthead
        subtitle="Vision · Flux OF ↔ commandes"
        active="vision"
        meta={
          <>
            <div class="font-fraunces text-[12px] font-bold not-italic text-terra">{props.weekLabel}</div>
            <div>
              Fenêtre <b class="font-bold text-foreground">{props.horizon} j</b> ·{' '}
              <b class="font-bold text-foreground">{props.totalOf}</b> OF ·{' '}
              <b class="font-bold text-foreground">{props.lineCount}</b> postes ·{' '}
              <b class="font-bold text-foreground">{props.board.commandes.length}</b> commandes
            </div>
          </>
        }
      />

      {/* ═══ Toolbar ═══ */}
      <div class="flex flex-none flex-wrap items-center justify-between gap-3 border-b border-rule px-7 py-2">
        {/* Navigation fenêtre */}
        <div class="flex items-center gap-1.5">
          <Link
            href={props.todayHref}
            class="rounded-full border border-rule bg-card px-3 py-1 text-[11px] font-semibold text-foreground transition-colors hover:border-terra"
          >
            Aujourd'hui
          </Link>
          <Link
            href={props.prevHref}
            preserveScroll
            title="Fenêtre précédente"
            class="flex size-7 items-center justify-center rounded-full border border-rule bg-card text-muted-foreground transition-colors hover:border-terra hover:text-terra"
          >
            <span class="material-symbols-outlined text-[18px]">chevron_left</span>
          </Link>
          <div class="font-fraunces text-[13px] font-bold italic text-foreground">{props.dateRange}</div>
          <Link
            href={props.nextHref}
            preserveScroll
            title="Fenêtre suivante"
            class="flex size-7 items-center justify-center rounded-full border border-rule bg-card text-muted-foreground transition-colors hover:border-terra hover:text-terra"
          >
            <span class="material-symbols-outlined text-[18px]">chevron_right</span>
          </Link>
        </div>

        <div class="flex items-center gap-3">
          {/* Filtre statut OF */}
          <div class="inline-flex items-center gap-1 rounded-md border border-rule bg-card p-0.5">
            <span class="px-1.5 font-mono text-[9px] font-bold uppercase tracking-wider text-muted-foreground">OF</span>
            <For each={STATUS}>
              {(s) => (
                <button
                  type="button"
                  class={cx(
                    'rounded-[5px] px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-wider transition-colors',
                    !hidden().has(s.k)
                      ? 'bg-terra-soft text-terra'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                  onClick={() => toggle(s.k)}
                >
                  {s.label}
                </button>
              )}
            </For>
          </div>

          {/* Légende liens */}
          <div class="flex items-center gap-3 border-l border-rule pl-3 font-mono text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
            <span class="flex items-center gap-1.5">
              <span class="inline-block h-0 w-5 border-t-2 border-terra" /> OF → commande
            </span>
            <span class="flex items-center gap-1.5">
              <span class="inline-block h-0 w-5 border-t-2 border-dashed border-terra/50" /> suggéré
            </span>
          </div>
        </div>
      </div>

      <Show when={props.x3Error}>
        <div class="flex flex-none items-center gap-2 border-b border-terra/30 bg-terra-soft px-7 py-2 text-[12px] text-foreground">
          <span class="material-symbols-outlined text-[16px] text-terra">warning</span>
          <span class="font-bold">Erreur chargement :</span>
          <span class="font-mono">{props.x3Error}</span>
        </div>
      </Show>

      {/* ═══ Board ═══ */}
      <Show
        when={props.lineCount > 0}
        fallback={
          <div class="flex flex-1 items-center justify-center p-10 font-fraunces text-[14px] italic text-muted-foreground">
            Aucun OF dans l'horizon.
          </div>
        }
      >
        <div class="flex-1 overflow-hidden">
          <div class="h-full overflow-auto">
            <div ref={setContentEl} class="relative" style={{ 'min-width': minWidth() }}>
              {/* ── En-tête collant (semaines + jours) ── */}
              <div class="sticky top-0 z-30 bg-background shadow-[0_2px_10px_-4px_rgba(31,26,19,.18)]">
                {/* Bande semaines */}
                <div class="grid" style={{ 'grid-template-columns': gridTpl() }}>
                  <div class="sticky left-0 z-40 border-b border-rule bg-secondary" />
                  <For each={props.board.weekSpans}>
                    {(ws) => (
                      <div
                        class="flex items-baseline gap-2.5 border-b border-r border-rule bg-secondary px-3.5 py-1.5"
                        style={{ 'grid-column': `span ${ws.span}` }}
                      >
                        <span class="font-fraunces text-[13px] font-black italic tracking-tight text-terra">
                          Semaine {ws.week}
                        </span>
                      </div>
                    )}
                  </For>
                </div>
                {/* Bande jours */}
                <div class="grid" style={{ 'grid-template-columns': gridTpl() }}>
                  <div class="sticky left-0 z-40 border-b border-rule bg-card" />
                  <For each={props.board.days}>
                    {(d) => (
                      <div
                        class={cx(
                          'border-b border-r border-rule-soft px-3 py-1.5',
                          d.today && 'bg-terra-soft',
                        )}
                      >
                        <span
                          class={cx(
                            'font-mono text-[11px] font-semibold',
                            d.today ? 'text-terra' : 'text-secondary-foreground',
                          )}
                        >
                          {d.short}
                        </span>
                      </div>
                    )}
                  </For>
                </div>
              </div>

              {/* ── Bande Expéditions (marqueurs commandes) ── */}
              <div class="grid border-b border-rule" style={{ 'grid-template-columns': gridTpl() }}>
                <div class="sticky left-0 z-20 flex flex-col justify-center border-b border-r border-rule bg-card px-3.5 py-2">
                  <span class="font-fraunces text-[13px] font-bold text-foreground">Expéditions</span>
                  <span class="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">commandes clients</span>
                </div>
                <For each={cmdsByCol()}>
                  {(cmds) => (
                    <div
                      class="flex min-h-[72px] flex-col gap-1.5 border-r border-rule-soft bg-secondary/40 p-1.5"
                      style={{ 'background-image': GRAPH_PAPER, 'background-size': '22px 22px' }}
                    >
                      <For each={cmds}>
                        {(cmd) => (
                          <div
                            data-link-cmd={cmd.id}
                            class="relative rounded-md border border-rule border-t-[3px] border-t-foreground bg-card px-2 py-1 shadow-[0_1px_2px_rgba(31,26,19,.06)]"
                          >
                            <div class="truncate font-mono text-[11px] font-bold text-foreground">{cmd.numCommande}</div>
                            <Show when={cmd.client}>
                              <div class="truncate font-fraunces text-[10px] italic text-muted-foreground">{cmd.client}</div>
                            </Show>
                            <div class="mt-0.5 font-fraunces text-[11px] font-bold tabular-nums text-secondary-foreground">
                              {fmtDay(cmd.dateExpeditionIso)}
                            </div>
                          </div>
                        )}
                      </For>
                    </div>
                  )}
                </For>
              </div>

              {/* ── Rangées Postes (cartes OF) ── */}
              <For each={props.board.postes}>
                {(poste) => (
                  <div class="grid" style={{ 'grid-template-columns': gridTpl() }}>
                    <div class="sticky left-0 z-20 flex flex-col justify-center border-b border-r border-rule-soft bg-card px-3.5 py-2">
                      <span class="font-mono text-[10px] font-bold text-terra">{poste.code}</span>
                      <span class="font-fraunces text-[14px] font-bold leading-tight text-foreground">{poste.name}</span>
                      <span class="mt-0.5 font-mono text-[10px] text-muted-foreground">
                        {poste.ofCount} OF · {poste.totalHours}h
                      </span>
                    </div>
                    <For each={poste.dayCells}>
                      {(cell, ci) => (
                        <div
                          class={cx(
                            'relative flex min-h-[96px] flex-col gap-2 border-b border-r border-rule-soft bg-card p-2',
                            props.board.days[ci()]?.today && 'bg-terra-soft',
                          )}
                          style={{
                            'background-image': props.board.days[ci()]?.today ? undefined : GRAPH_PAPER,
                            'background-size': '22px 22px',
                          }}
                        >
                          <For each={cell.ofs}>
                            {(of) => (
                              <Show when={ofVisible(of)}>
                                <div data-link-of={of.numOf} class="relative">
                                  <BoardCard
                                    variant="of"
                                    status={of.status}
                                    article={of.numOf}
                                    articleRef={of.article}
                                    title={of.designation ?? of.article}
                                    poste={of.posteLabel}
                                    progress={of.launched > 0 ? { done: of.done, total: of.launched } : undefined}
                                    hours={fmtHours(of.hours)}
                                  />
                                </div>
                              </Show>
                            )}
                          </For>
                        </div>
                      )}
                    </For>
                  </div>
                )}
              </For>

              {/* ── Calque liens OF → commande ── */}
              <svg
                class="pointer-events-none absolute inset-0 z-[5]"
                style={{ width: '100%', height: '100%' }}
                aria-hidden="true"
              >
                <For each={paths()}>
                  {(p) => (
                    <path
                      d={p.d}
                      fill="none"
                      stroke="var(--color-terra)"
                      stroke-width={p.suggere ? 1.4 : 1.6}
                      stroke-dasharray={p.suggere ? '5 4' : undefined}
                      opacity={p.suggere ? 0.45 : 0.7}
                    />
                  )}
                </For>
              </svg>
            </div>
          </div>
        </div>
      </Show>
    </div>
  )
}

export default Vision
