import { For, Show, createMemo, createSignal, type JSX } from 'solid-js'
import { cx } from '@/libs/cva'
import type { BoardStore } from '@/lib/board/store'
import type { Card, LineRow } from '@/lib/board/types'
import { TYPO_META } from '@/lib/board/types'
import { usePrintFit } from '@/lib/board/use-print-fit'
import type { VirtualOrderVm } from '@/lib/scenarios/types'
import { onActivation } from '@/lib/a11y/activation'
import { fmtDay } from '@/lib/vision/date-utils'
import { BoardCard, type CardStatus } from './board-card'
import { ChargeHistogram, type ChargeWeek } from './charge-histogram'

/**
 * Grille du board « Papier » (B1 · Quotidien) — ordonnancement des OF.
 *
 * Temps à l'horizontale (jours en colonnes), un poste par ligne. En-tête
 * collant (bande semaines + jours), colonne « Poste » collante à gauche,
 * cellules quadrillées style papier. Cartes OF via <BoardCard variant="of">.
 *
 * Réactif au store injecté : visibilité/opacité (recherche multi-scope),
 * charge live par jour (heures absolues), histogramme hebdo par ligne,
 * drag&drop optimiste + rollback. La navigation vers le détail OF se fait
 * via onSelectOf (drawer).
 */

const LABEL_W = 208 // colonne « Poste » (gelée à gauche)
const GRAPH_PAPER =
  'linear-gradient(to right, rgba(31,26,19,.045) 1px, transparent 1px),' +
  'linear-gradient(to bottom, rgba(31,26,19,.045) 1px, transparent 1px)'

/** Status backend (string) → ton BoardCard. */
const STATUS_MAP: Record<string, CardStatus> = {
  ferme: 'ferme',
  planifie: 'planifie',
  planifié: 'planifie',
  suggere: 'suggere',
  suggéré: 'suggere',
  cours: 'cours',
  termine: 'termine',
  terminé: 'termine',
  bloque: 'bloque',
  bloqué: 'bloque',
}
const toStatus = (s: string): CardStatus => STATUS_MAP[s] ?? 'planifie'

/** "120/150" → {done,total}. */
function parseProgress(metric: string | null): { done: number; total: number } | undefined {
  if (!metric) return undefined
  const m = metric.match(/^\s*(\d+)\s*\/\s*(\d+)\s*$/)
  if (!m) return undefined
  const done = Number(m[1])
  const total = Number(m[2])
  return total > 0 ? { done, total } : undefined
}

const fmt = (h: number) => (Math.round(h * 100) / 100).toFixed(2).replace('.', ',')
const r1 = (n: number) => Math.round(n * 100) / 100

export default function BoardGrid(props: {
  store: BoardStore
  onSelectOf?: (num: string) => void
  /** Contenu additionnel rendu DANS chaque cellule, après les cartes OF
   *  (ex. marqueurs commande de la vue Vision). Optionnel → board inchangé. */
  cellExtra?: (lineCode: string, col: number) => JSX.Element
  /** Réf. du conteneur scrollé interne (pour un calque mesuré au DOM). */
  contentRef?: (el: HTMLDivElement) => void
  /** Calque superposé (ex. liens SVG Vision), rendu au-dessus de la grille. */
  overlay?: JSX.Element
  /** Survol d'une carte OF (numOf au survol, null à la sortie). Optionnel. */
  onCardHover?: (numOf: string | null) => void
  /** Drop d'un élément externe (non-OF) dans une cellule — ex. marqueur commande
   *  Vision déplacé à une autre date. L'élément se lit dans `e.dataTransfer`. */
  onCellDrop?: (lineCode: string, col: number, iso: string, e: DragEvent) => void
  /** Bouton « Engagement » dans le header de chaque poste (issue #46).
   *  Optionnel → board /ordonnancement inchangé. */
  onLineEngagement?: (lineCode: string) => void
  /** Issue #23 : résout l'écart (jours) au besoin pour une carte OF — badge retard
   *  « +N j ». undefined → badge absent (board /ordonnancement inchangé). */
  cardRetard?: (ofId: string) => number | null | undefined
  /** #23 : drag OF en cours survol d'une cellule → recalcul d'impact live.
   *  (ofId, lineCode cible, col cible, iso cible). Optionnel → board inchangé. */
  onOfDragProgress?: (ofId: string, toLineCode: string, toCol: number, toIso: string) => void
  /** #23 : drop réussi → fige l'override optimiste (dateFin traduite si connue). */
  onOfDropped?: (ofId: string, toIso: string, dateFinIso?: string) => void
  /** #23 : drag OF annulé (relâché hors grille) → clear le shift/tooltip live sans
   *  toucher l'override de date déjà figé par un drop précédent. */
  onOfDragCancelled?: () => void
  /** #23 : résout la date de fin translatée d'un OF droppé vers une cellule (toIso).
   *  Retournée à moveCard → PATCH dateFin → verdict serveur cohérent. Optionnel. */
  translateOfDateFin?: (ofId: string, toIso: string) => string | null | undefined
  /** #58 : commandes virtuelles (mutations `inject_demand` du scénario courant) à
   *  afficher sur une rangée dédiée, groupées par colonne. Optionnel → board inchangé. */
  virtualOrdersByCol?: Map<number, VirtualOrderVm[]>
  /** #58 : drop d'un marqueur virtuel dans une cellule → nouvelle date de besoin. */
  onVirtualDrop?: (id: string, col: number, iso: string) => void
  /** #58 : suppression d'une commande virtuelle du scénario. */
  onVirtualRemove?: (id: string) => void
}) {
  const { store } = props
  let rootEl: HTMLDivElement | undefined
  usePrintFit(() => rootEl)
  const [draggedNumOf, setDraggedNumOf] = createSignal<string | null>(null)
  const [dropCol, setDropCol] = createSignal<string | null>(null)

  const cols = () => store.board.cols
  /** Template de grille commun (toutes les rangées l'utilisent pour l'alignement). */
  const gridTpl = () => `${LABEL_W}px repeat(${cols()}, minmax(108px, 1fr))`
  const minWidth = () => `calc(${LABEL_W}px + ${cols() * 118}px)`

  // Colonnes par semaine (pour total hebdo + Libellés).
  const weekRanges = createMemo(() => {
    let off = 0
    return store.board.weekSpans.map((ws) => {
      const range = { week: ws.week, from: off, to: off + ws.span }
      off += ws.span
      return range
    })
  })

  /** Charge totale (heures absolues) par semaine, toutes lignes confondues. */
  const weekTotals = createMemo(() => {
    const dl = store.dayLoad()
    return weekRanges().map((wr) => {
      let s = 0
      for (let c = wr.from; c < wr.to; c++) s += dl[c] ?? 0
      return { week: wr.week, hours: r1(s) }
    })
  })

  /** Histogramme hebdo d'une ligne (absolu, ventilé Ferme/Planifié/Suggéré). */
  function lineCharge(line: LineRow): ChargeWeek[] {
    const byWeek: Record<number, { ferme: number; planifie: number; suggere: number }> = {}
    line.dayCells.forEach((dc, col) => {
      const wk = store.board.colWeek[col]
      if (wk === undefined) return
      if (!byWeek[wk]) byWeek[wk] = { ferme: 0, planifie: 0, suggere: 0 }
      const b = byWeek[wk]
      for (const c of dc.cards) {
        const s = toStatus(c.status)
        if (s === 'ferme') b.ferme += c.hours
        else if (s === 'suggere') b.suggere += c.hours
        else b.planifie += c.hours
      }
    })
    return line.weekLoads.map((wl) => {
      const b = byWeek[wl.week] ?? { ferme: 0, planifie: 0, suggere: 0 }
      return {
        week: wl.week,
        ferme: r1(b.ferme),
        planifie: r1(b.planifie),
        suggere: r1(b.suggere),
        induit: 0,
      }
    })
  }

  /** Échelle commune des histogrammes (total hebdo max, toutes lignes). */
  const maxLineHours = createMemo(() => {
    let m = 0
    for (const line of store.board.lines) {
      for (const cw of lineCharge(line)) {
        const t = cw.ferme + cw.planifie + cw.suggere
        if (t > m) m = t
      }
    }
    return m || 1
  })

  /** N° du jour dérivé de l'ISO de la colonne (DayCol ne porte pas le n°). */
  function dayNum(col: number): string {
    const iso = store.board.lines[0]?.dayCells[col]?.iso
    return iso ? String(Number(iso.slice(8, 10))) : ''
  }

  return (
    <div ref={rootEl} data-board-root class="h-full overflow-auto bg-background">
      <div ref={props.contentRef} class="relative" style={{ 'min-width': minWidth() }}>
        {/* ═══ En-tête collant (semaines + jours) ═══ */}
        <div class="sticky top-0 z-30 bg-background shadow-[0_2px_10px_-4px_rgba(31,26,19,.18)]">
          {/* Bande semaines */}
          <div class="grid" style={{ 'grid-template-columns': gridTpl() }}>
            <div class="sticky left-0 z-40 border-b border-rule bg-secondary" />
            <For each={weekRanges()}>
              {(wr, i) => (
                <div
                  class="flex items-baseline gap-2.5 border-b border-r border-rule bg-secondary px-3.5 py-1.5"
                  style={{ 'grid-column': `span ${wr.to - wr.from}` }}
                >
                  <span class="font-sans text-xs font-bold text-brand">
                    Semaine {wr.week}
                  </span>
                  <Show when={weekTotals()[i()]}>
                    {(wt) => {
                      const cap = store.board.weekCaps[String(wr.week)] ?? 0
                      const overloaded = cap > 0 && wt().hours > cap
                      return (
                        <span
                          class={cx(
                            'ml-auto font-sans text-xs font-extrabold tabular-nums',
                            overloaded ? 'text-error font-black' : 'text-foreground'
                          )}
                        >
                          {fmt(wt().hours)} h
                        </span>
                      )
                    }}
                  </Show>
                </div>
              )}
            </For>
          </div>

          {/* En-tête jours */}
          <div class="grid" style={{ 'grid-template-columns': gridTpl() }}>
            <div class="sticky left-0 z-40 border-b border-r border-rule bg-card px-3.5 py-2 font-mono text-2xs font-bold tracking-[0.12em] text-muted-foreground">
              Poste de production
            </div>
            <For each={store.board.days}>
              {(day, di) => (
                <div
                  class={cx(
                    'border-b border-r border-rule-soft bg-card px-2.5 py-1.5 text-center',
                    day.today && 'bg-brand-soft'
                  )}
                >
                  <div
                    class={cx(
                      'font-mono text-2xs font-bold tracking-[0.1em]',
                      day.today ? 'text-brand' : 'text-muted-foreground'
                    )}
                  >
                    {day.short.replace(/\s*\d+\s*$/, '')}
                  </div>
                  <div
                    class={cx(
                      'font-sans text-base font-extrabold leading-none tracking-tight',
                      day.today ? 'text-brand italic' : 'text-foreground'
                    )}
                  >
                    {dayNum(di())}
                  </div>
                  <div
                    class={cx(
                      'mt-0.5 font-mono text-xs font-bold tabular-nums',
                      (() => {
                        const load = store.dayLoad()[di()] ?? 0
                        const wk = store.board.colWeek[di()]
                        const cap = store.board.weekCaps[String(wk)] ?? 0
                        const span = store.board.weekSpans.find((s) => s.week === wk)?.span ?? 5
                        const dailyCap = cap / span
                        return dailyCap > 0 && load > dailyCap ? 'text-error font-extrabold' : 'text-brand'
                      })()
                    )}
                  >
                    {fmt(store.dayLoad()[di()] ?? 0)}
                    <span class="text-3xs font-medium opacity-60"> h</span>
                  </div>
                </div>
              )}
            </For>
          </div>
        </div>

        {/* ═══ Rangée « Commandes virtuelles » (issue #58, mode scénario) ═══ */}
        <Show when={props.virtualOrdersByCol}>
          {(byCol) => (
            <div
              class="grid border-b-2 border-dashed border-brand/50 bg-brand-soft/40"
              style={{ 'grid-template-columns': gridTpl() }}
            >
              <div class="sticky left-0 z-20 flex items-center gap-1.5 border-r border-rule bg-brand-soft/60 px-3.5 py-3">
                <span class="material-symbols-outlined text-[15px] text-brand">science</span>
                <span class="font-mono text-2xs font-bold uppercase tracking-wider text-brand">
                  Virtuelles
                </span>
              </div>
              <For each={store.board.days}>
                {(_day, ci) => (
                  <VirtualCell
                    col={ci()}
                    orders={byCol().get(ci()) ?? []}
                    iso={store.board.lines[0]?.dayCells[ci()]?.iso ?? ''}
                    onDrop={props.onVirtualDrop}
                    onRemove={props.onVirtualRemove}
                  />
                )}
              </For>
            </div>
          )}
        </Show>

        {/* ═══ Rangées de postes ═══ */}
        <For each={store.board.lines}>
          {(line) => (
            <div
              class="grid border-b border-rule-soft"
              style={{
                'grid-template-columns': gridTpl(),
                'display': store.lineVisible(line.code) ? 'grid' : 'none',
              }}
            >
              {/* En-tête de poste (collant à gauche). L'identité (dot+code+nom) est
                  cliquable → panneau « Engagement » par poste (#46). Pas de bouton
                  dédié : le header est déjà dense (histogramme + PP_830). */}
              <div class="sticky left-0 z-20 flex flex-col gap-1.5 overflow-hidden border-r border-rule bg-card px-3.5 py-3">
                <div
                  class="flex items-center gap-2"
                  classList={{
                    'cursor-pointer transition-colors': !!props.onLineEngagement,
                    'hover:[&_.line-code]:text-brand': !!props.onLineEngagement,
                  }}
                  onClick={() => props.onLineEngagement?.(line.code)}
                  title={props.onLineEngagement ? 'Engagement — OF fermes du poste' : undefined}
                >
                  <span
                    class="size-2.5 rounded-[2px]"
                    style={{ background: line.dot ? undefined : 'var(--color-planifie)' }}
                    classList={{ [line.dot]: !!line.dot }}
                  />
                  <span class="line-code font-mono text-sm font-bold tracking-tight text-foreground transition-colors">
                    {line.code}
                  </span>
                </div>
                <span class="text-xs leading-tight text-muted-foreground">{line.name}</span>
                <ChargeHistogram
                  weeks={lineCharge(line)}
                  maxHours={maxLineHours()}
                  variant="line"
                />
                {/* PP_830 — équilibrage (issue #42, header M1) : barre empilée typo
                    (plein = sans bouche, clair = consomme bouche) + stock bouches hygro. */}
                <Show when={line.pp830}>
                  {(pp) => {
                    const total = () =>
                      pp().chargeByTypo.reduce((s, t) => s + t.sans + t.bouche, 0) || 1
                    const seg = (h: number) => `${(h / total()) * 100}%`
                    return (
                      <div class="mt-1.5">
                        <div class="flex h-[6px] overflow-hidden rounded-full bg-rule-soft">
                          <For each={pp().chargeByTypo}>
                            {(t) => (
                              <>
                                <span
                                  class="block h-full"
                                  style={{
                                    width: seg(t.sans),
                                    background: TYPO_META[t.typo]?.color ?? '#94a3b8',
                                  }}
                                />
                                <Show when={t.bouche > 0}>
                                  <span
                                    class="block h-full"
                                    style={{
                                      width: seg(t.bouche),
                                      background: TYPO_META[t.typo]?.light ?? '#cbd5e1',
                                    }}
                                  />
                                </Show>
                              </>
                            )}
                          </For>
                        </div>
                        <div class="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 font-mono text-2xs font-bold uppercase tracking-wider">
                          <For each={pp().chargeByTypo}>
                            {(t) => (
                              <span class="inline-flex items-center gap-1">
                                <span class="inline-flex items-center gap-0.5">
                                  <span
                                    class="size-[7px] rounded-[1px]"
                                    style={{ background: TYPO_META[t.typo]?.color ?? '#94a3b8' }}
                                  />
                                  {t.bouche > 0 && (
                                    <span
                                      class="size-[7px] rounded-[1px]"
                                      style={{ background: TYPO_META[t.typo]?.light ?? '#cbd5e1' }}
                                    />
                                  )}
                                </span>
                                <span class="text-muted-foreground">
                                  {TYPO_META[t.typo]?.label ?? t.typo}
                                </span>
                                <span class="tabular-nums text-foreground">
                                  {t.sans + t.bouche}h
                                </span>
                              </span>
                            )}
                          </For>
                        </div>
                        <Show when={pp().stockBouchesHygro !== null}>
                          <div class="mt-1 flex items-baseline gap-1 text-2xs text-muted-foreground">
                            <span>Bouches hygro</span>
                            <span
                              class="font-sans text-xs font-extrabold tabular-nums"
                              style={{ color: 'var(--color-brand)' }}
                            >
                              {pp().stockBouchesHygro}
                            </span>
                            <span>pcs</span>
                          </div>
                        </Show>
                      </div>
                    )
                  }}
                </Show>
              </div>

              {/* Cellules */}
              <For each={line.dayCells}>
                {(dc, ci) => {
                  const cellKey = `${line.code}:${ci()}`
                  const isToday = store.board.days[ci()]?.today
                  return (
                    <div
                      class={cx(
                        'relative flex min-h-[96px] flex-col gap-2 border-r border-rule-soft bg-card px-2 pt-2 pb-5',
                        isToday && 'bg-brand-soft'
                      )}
                      style={{
                        'background-image': isToday ? undefined : GRAPH_PAPER,
                        'background-size': '22px 22px',
                      }}
                      classList={{ 'ring-2 ring-brand/70 ring-inset': dropCol() === cellKey }}
                      onDragOver={(e) => {
                        // Drag interne (carte OF) OU externe (ex. commande Vision via onCellDrop).
                        if (!draggedNumOf() && !props.onCellDrop) return
                        e.preventDefault()
                        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
                        setDropCol(cellKey)
                        // #23 : notification de progression du drag OF → recalcul d'impact live.
                        if (draggedNumOf())
                          props.onOfDragProgress?.(draggedNumOf()!, line.code, ci(), dc.iso)
                      }}
                      onDrop={(e) => {
                        const num = draggedNumOf()
                        setDropCol(null)
                        e.preventDefault()
                        if (num) {
                          const dateFin = props.translateOfDateFin?.(num, dc.iso)
                          store.moveCard(num, line.code, ci(), dc.iso, dateFin ?? undefined)
                          props.onOfDropped?.(num, dc.iso, dateFin ?? undefined)
                        } else {
                          props.onCellDrop?.(line.code, ci(), dc.iso, e)
                        }
                      }}
                    >
                      <For each={dc.cards}>
                        {(card) => (
                          <CardView
                            store={store}
                            card={card}
                            line={line}
                            onSelectOf={props.onSelectOf}
                            onCardHover={props.onCardHover}
                            draggedNumOf={draggedNumOf}
                            setDraggedNumOf={setDraggedNumOf}
                            setDropCol={setDropCol}
                            onDragCancelled={props.onOfDragCancelled}
                            retardJours={props.cardRetard?.(card.id)}
                          />
                        )}
                      </For>
                      {props.cellExtra?.(line.code, ci())}
                      {(() => {
                        const load = dc.cards.reduce((sum, c) => sum + (store.cardMatches(c, line.code) ? c.hours : 0), 0)
                        if (load === 0) return null
                        const wk = store.board.colWeek[ci()]
                        const cap = store.board.weekCaps[String(wk)] ?? 0
                        const span = store.board.weekSpans.find((s) => s.week === wk)?.span ?? 5
                        const dailyCap = cap / span
                        const overloaded = dailyCap > 0 && load > dailyCap
                        const fmtShort = (h: number) => (Math.round(h * 10) / 10).toString().replace('.', ',')
                        return (
                          <div
                            class={cx(
                              'absolute bottom-1 right-2 font-mono text-[9px] font-bold tabular-nums pointer-events-none select-none z-10',
                              overloaded ? 'text-error font-extrabold' : 'text-muted-foreground/90'
                            )}
                          >
                            {fmtShort(load)}h
                            <Show when={dailyCap > 0}>
                              <span class="font-normal text-muted-foreground/50">/{fmtShort(dailyCap)}h</span>
                            </Show>
                          </div>
                        )
                      })()}
                    </div>
                  )
                }}
              </For>
            </div>
          )}
        </For>
        {props.overlay}
      </div>
    </div>
  )
}

function CardView(props: {
  store: BoardStore
  card: Card
  line: LineRow
  onSelectOf?: (num: string) => void
  onCardHover?: (numOf: string | null) => void
  draggedNumOf: () => string | null
  setDraggedNumOf: (v: string | null) => void
  setDropCol: (v: string | null) => void
  /** #23 : drag OF annulé (relâché hors grille, dropEffect==='none') → clear le
   *  shift/tooltip live. Optionnel → board /ordonnancement inchangé. */
  onDragCancelled?: () => void
  /** #23 : écart (jours) au besoin — badge retard sur la carte. */
  retardJours?: number | null
}) {
  const { store, card } = props
  const matches = () => store.cardMatches(card, props.line.code)
  const feas = () => {
    const f = store.feasOf(card.id)
    if (!f) return undefined
    return f.st === 'blocked' ? ('bad' as const) : ('ok' as const)
  }
  const alert = () => {
    const f = store.feasOf(card.id)
    return f && f.st === 'blocked' && f.missing.length
      ? `Rupture ${f.missing.join(', ')}`
      : undefined
  }
  // Sélection multi-OF + batch firming (#34).
  const selecting = () => store.selectMode()
  const picked = () => store.isSelected(card.id)
  const batchItem = () => store.batchItemOf(card.id)
  return (
    <div
      role="button"
      tabindex={matches() ? 0 : -1}
      draggable={matches() && !selecting()}
      data-num-of={card.id}
      class={cx(
        'relative cursor-pointer transition-opacity',
        !matches() && 'pointer-events-none opacity-15',
        selecting() && picked() && 'rounded-md ring-2 ring-brand ring-offset-1'
      )}
      onMouseEnter={() => props.onCardHover?.(card.id)}
      onMouseLeave={() => props.onCardHover?.(null)}
      onClick={() => {
        if (!matches()) return
        // En mode sélection, le clic (dé)sélectionne au lieu d'ouvrir le détail.
        if (selecting()) store.toggleSelect(card.id)
        else props.onSelectOf?.(card.id)
      }}
      onKeyDown={
        // #62 (lot 1) : activation clavier (Enter/Espace) — parité avec un <button>.
        matches()
          ? onActivation(() => {
              if (selecting()) store.toggleSelect(card.id)
              else props.onSelectOf?.(card.id)
            })
          : undefined
      }
      onDragStart={(e: DragEvent) => {
        props.setDraggedNumOf(card.id)
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = 'move'
          e.dataTransfer.setData('text/plain', card.id)
        }
      }}
      onDragEnd={(e: DragEvent) => {
        props.setDraggedNumOf(null)
        props.setDropCol(null)
        // #23 : dropEffect==='none' → aucun `drop` n'a capté ce drag (relâché hors
        // grille) ; onDrop n'a donc pas appelé onOfDropped → clear nous-mêmes le
        // shift/tooltip live pour éviter un état fantôme (badge/tooltip figés).
        if (e.dataTransfer?.dropEffect === 'none') props.onDragCancelled?.()
      }}
    >
      {/* Case à cocher (mode sélection) */}
      <Show when={selecting()}>
        <span
          class={cx(
            'absolute left-1 top-1 z-10 flex size-4 items-center justify-center rounded border bg-card',
            picked() ? 'border-brand bg-brand text-card' : 'border-rule text-transparent'
          )}
        >
          <span class="material-symbols-outlined text-sm font-bold">check</span>
        </span>
      </Show>
      {/* Badge d'état batch (spinner / ✓ / ✗) par OF */}
      <Show when={batchItem()}>
        {(b) => (
          <span
            class={cx(
              'absolute right-1 top-1 z-10 flex size-4 items-center justify-center rounded-full text-card',
              b().st === 'ok' ? 'bg-ferme' : b().st === 'error' ? 'bg-destructive' : 'bg-brand'
            )}
            title={b().msg}
          >
            <span
              class={cx(
                'material-symbols-outlined text-xs font-bold',
                b().st === 'running' && 'animate-spin'
              )}
            >
              {b().st === 'ok'
                ? 'check'
                : b().st === 'error'
                  ? 'priority_high'
                  : 'progress_activity'}
            </span>
          </span>
        )}
      </Show>
      <BoardCard
        variant="of"
        status={toStatus(card.status)}
        article={card.id}
        articleRef={card.article ?? undefined}
        title={card.title}
        hours={fmt(card.hours)}
        progress={parseProgress(card.metric)}
        feas={feas()}
        alert={alert()}
        consommeBouche={card.consommeBouche}
        typologie={card.typologie}
        kitGpe={card.kitGpe}
        retardJours={props.retardJours}
      />
    </div>
  )
}

/** Verdict de servabilité → ton visuel (issue #58, réutilise la palette #23). */
const VERDICT_TONE: Record<string, { border: string; text: string; label: string }> = {
  on_time: { border: 'border-l-brand', text: 'text-brand', label: 'à temps' },
  stock: { border: 'border-l-brand', text: 'text-brand', label: 'à temps' },
  retard: { border: 'border-l-error', text: 'text-error', label: 'retard' },
  bloquee: { border: 'border-l-error', text: 'text-error', label: 'bloquée' },
  sans_couverture: {
    border: 'border-l-amber-500',
    text: 'text-amber-600',
    label: 'sans couverture',
  },
}

/** Cellule de la rangée « Commandes virtuelles » — reçoit le drop d'un chip
 *  déplacé vers une autre colonne (nouvelle date de besoin). */
function VirtualCell(props: {
  col: number
  orders: VirtualOrderVm[]
  iso: string
  onDrop?: (id: string, col: number, iso: string) => void
  onRemove?: (id: string) => void
}) {
  const [over, setOver] = createSignal(false)
  return (
    <div
      class={cx(
        'flex min-h-[52px] flex-col gap-1 border-r border-dashed border-brand/30 p-1.5',
        over() && 'bg-brand-soft'
      )}
      onDragOver={(e) => {
        if (!props.onDrop) return
        e.preventDefault()
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false)
        const id = e.dataTransfer?.getData('application/x-virtual-cmd')
        if (id && props.iso) props.onDrop?.(id, props.col, props.iso)
      }}
    >
      <For each={props.orders}>
        {(o) => <VirtualOrderChip order={o} onRemove={props.onRemove} />}
      </For>
    </div>
  )
}

function VirtualOrderChip(props: { order: VirtualOrderVm; onRemove?: (id: string) => void }) {
  const tone = () => (props.order.statut ? VERDICT_TONE[props.order.statut] : undefined)
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer?.setData('application/x-virtual-cmd', props.order.id)
        if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
      }}
      class={cx(
        'group relative overflow-hidden rounded-[6px] border border-dashed border-brand/60 border-l-[3px] bg-card/80 px-1.5 py-1 leading-tight shadow-sm',
        'cursor-grab active:cursor-grabbing',
        tone()?.border ?? 'border-l-brand/60'
      )}
      title="Commande virtuelle — n'existe que dans le scénario"
    >
      <button
        type="button"
        class="absolute right-0.5 top-0.5 flex size-3.5 items-center justify-center rounded-full text-muted-foreground opacity-50 hover:text-error hover:opacity-100"
        onClick={() => props.onRemove?.(props.order.id)}
        title="Retirer du scénario"
      >
        <span class="material-symbols-outlined text-xs">close</span>
      </button>
      <div class="flex items-baseline gap-1 whitespace-nowrap pr-3 font-mono text-2xs font-bold text-brand">
        <span class="material-symbols-outlined flex-none self-center text-xs">science</span>
        <span>
          {props.order.article} × {props.order.quantity}
        </span>
      </div>
      <div class="mt-0.5 flex items-center gap-1">
        <span class="flex-none font-sans text-[10px] font-extrabold tabular-nums text-secondary-foreground">
          {fmtDay(props.order.date)}
        </span>
        <Show when={props.order.client}>
          <span class="truncate font-sans text-[10px] italic text-muted-foreground">
            {props.order.client}
          </span>
        </Show>
        <Show when={tone()}>
          <span
            class={cx(
              'ml-auto rounded-full bg-card px-1 py-px font-mono text-3xs font-bold uppercase tracking-wider',
              tone()!.text
            )}
          >
            {tone()!.label}
            <Show when={props.order.joursRetard}> +{props.order.joursRetard}j</Show>
          </span>
        </Show>
      </div>
    </div>
  )
}
