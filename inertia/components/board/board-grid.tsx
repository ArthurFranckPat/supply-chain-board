import { For, Show, createMemo, createSignal } from 'solid-js'
import { cx } from '@/libs/cva'
import type { BoardStore } from '@/lib/board/store'
import type { Card, LineRow } from '@/lib/board/types'
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
  'planifie': 'planifie',
  'planifié': 'planifie',
  suggere: 'suggere',
  'suggéré': 'suggere',
  cours: 'cours',
  termine: 'termine',
  'terminé': 'termine',
  bloque: 'bloque',
  'bloqué': 'bloque',
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
}) {
  const { store } = props
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
      return { week: wl.week, ferme: r1(b.ferme), planifie: r1(b.planifie), suggere: r1(b.suggere) }
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

  /** Compte d'OF visibles d'une ligne. */
  function lineOfCount(line: LineRow): number {
    let n = 0
    for (const dc of line.dayCells) n += dc.cards.length
    return n
  }

  /** N° du jour dérivé de l'ISO de la colonne (DayCol ne porte pas le n°). */
  function dayNum(col: number): string {
    const iso = store.board.lines[0]?.dayCells[col]?.iso
    return iso ? String(Number(iso.slice(8, 10))) : ''
  }

  return (
    <div class="h-full overflow-auto bg-background">
      <div style={{ 'min-width': minWidth() }}>
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
                  <span class="font-fraunces text-[13px] font-black italic tracking-tight text-terra">
                    Semaine {wr.week}
                  </span>
                  <Show when={weekTotals()[i()]}>
                    {(wt) => (
                      <span class="ml-auto font-fraunces text-[12px] font-bold tabular-nums text-foreground">
                        {fmt(wt().hours)} h
                      </span>
                    )}
                  </Show>
                </div>
              )}
            </For>
          </div>

          {/* En-tête jours */}
          <div class="grid" style={{ 'grid-template-columns': gridTpl() }}>
            <div class="sticky left-0 z-40 border-b border-r border-rule bg-card px-3.5 py-2 font-mono text-[9px] font-bold tracking-[0.12em] text-muted-foreground">
              Poste de production
            </div>
            <For each={store.board.days}>
              {(day, di) => (
                <div
                  class={cx(
                    'border-b border-r border-rule-soft bg-card px-2.5 py-1.5 text-center',
                    day.today && 'bg-terra-soft',
                  )}
                >
                  <div
                    class={cx(
                      'font-mono text-[9px] font-bold tracking-[0.1em]',
                      day.today ? 'text-terra' : 'text-muted-foreground',
                    )}
                  >
                    {day.short}
                  </div>
                  <div
                    class={cx(
                      'font-fraunces text-[19px] font-bold leading-none tracking-tight',
                      day.today ? 'text-terra italic' : 'text-foreground',
                    )}
                  >
                    {dayNum(di())}
                  </div>
                  <div class="mt-0.5 font-mono text-[9px] font-bold tabular-nums text-muted-foreground">
                    {fmt(store.dayLoad()[di()] ?? 0)} h
                  </div>
                </div>
              )}
            </For>
          </div>
        </div>

        {/* ═══ Rangées de postes ═══ */}
        <For each={store.board.lines}>
          {(line) => (
            <div
              class="grid border-b border-rule-soft"
              style={{ 'grid-template-columns': gridTpl(), display: store.lineVisible(line.code) ? 'grid' : 'none' }}
            >
              {/* En-tête de poste (collant à gauche) */}
              <div class="sticky left-0 z-20 flex flex-col gap-1.5 border-r border-rule bg-card px-3.5 py-3">
                <div class="flex items-center gap-2">
                  <span
                    class="size-2.5 rounded-[2px]"
                    style={{ background: line.dot ? undefined : 'var(--color-planifie)' }}
                    classList={{ [line.dot]: !!line.dot }}
                  />
                  <span class="font-mono text-[13px] font-bold tracking-tight text-foreground">
                    {line.code}
                  </span>
                </div>
                <span class="text-[11px] leading-tight text-muted-foreground">{line.name}</span>
                <ChargeHistogram weeks={lineCharge(line)} maxHours={maxLineHours()} variant="line" />
                <div class="font-mono text-[9px] font-semibold tracking-wider text-muted-foreground">
                  {lineOfCount(line)} OF
                </div>
              </div>

              {/* Cellules */}
              <For each={line.dayCells}>
                {(dc, ci) => {
                  const cellKey = `${line.code}:${ci()}`
                  const isToday = store.board.days[ci()]?.today
                  return (
                    <div
                      class={cx(
                        'relative flex min-h-[96px] flex-col gap-2 border-r border-rule-soft bg-card p-2',
                        isToday && 'bg-terra-soft',
                      )}
                      style={{ 'background-image': isToday ? undefined : GRAPH_PAPER, 'background-size': '22px 22px' }}
                      classList={{ 'ring-2 ring-terra/70 ring-inset': dropCol() === cellKey }}
                      onDragOver={(e) => {
                        if (!draggedNumOf()) return
                        e.preventDefault()
                        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
                        setDropCol(cellKey)
                      }}
                      onDrop={(e) => {
                        const num = draggedNumOf()
                        setDropCol(null)
                        if (!num) return
                        e.preventDefault()
                        store.moveCard(num, line.code, ci(), dc.iso)
                      }}
                    >
                      <For each={dc.cards}>
                        {(card) => (
                          <CardView
                            store={store}
                            card={card}
                            line={line}
                            onSelectOf={props.onSelectOf}
                            draggedNumOf={draggedNumOf}
                            setDraggedNumOf={setDraggedNumOf}
                            setDropCol={setDropCol}
                          />
                        )}
                      </For>
                    </div>
                  )
                }}
              </For>
            </div>
          )}
        </For>
      </div>
    </div>
  )
}

function CardView(props: {
  store: BoardStore
  card: Card
  line: LineRow
  onSelectOf?: (num: string) => void
  draggedNumOf: () => string | null
  setDraggedNumOf: (v: string | null) => void
  setDropCol: (v: string | null) => void
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
    return f && f.st === 'blocked' && f.missing.length ? `Rupture ${f.missing.join(', ')}` : undefined
  }
  return (
    <div
      role="button"
      tabindex={matches() ? 0 : -1}
      draggable={matches()}
      data-num-of={card.id}
      class={cx('cursor-pointer transition-opacity', !matches() && 'pointer-events-none opacity-15')}
      onClick={() => {
        if (matches() && props.onSelectOf) props.onSelectOf(card.id)
      }}
      onDragStart={(e: DragEvent) => {
        props.setDraggedNumOf(card.id)
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = 'move'
          e.dataTransfer.setData('text/plain', card.id)
        }
      }}
      onDragEnd={() => {
        props.setDraggedNumOf(null)
        props.setDropCol(null)
      }}
    >
      <BoardCard
        variant="of"
        status={toStatus(card.status)}
        article={card.id}
        title={card.title}
        hours={fmt(card.hours)}
        progress={parseProgress(card.metric)}
        feas={feas()}
        alert={alert()}
      />
    </div>
  )
}
