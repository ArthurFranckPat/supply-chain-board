import { For, Show, createMemo, createSignal } from 'solid-js'
import { cx } from '@/libs/cva'
import { TYPO_META } from '@/lib/board/types'
import { usePrintFit } from '@/lib/board/use-print-fit'
import type { OrderBoardStore } from '@/lib/orders/store'
import type { OrderCard, OrderLineRow } from '@/lib/orders/types'
import { BoardCard, type CardStatus } from './board-card'
import { ChargeHistogram, type ChargeWeek } from './charge-histogram'

/**
 * Grille du board « Papier » — Planification (issue #10).
 *
 * Même charpente que <BoardGrid> (ordonnancement) : temps à l'horizontale,
 * un poste par ligne, en-tête collant (semaines + jours), colonne « Poste »
 * collante à gauche, cellules quadrillées. Cartes via <BoardCard variant="commande">.
 *
 * Spécificités planification : drag **en temps seul** (poste figé par la gamme),
 * override de date (liseré terra + bouton réinitialiser), filtres type/nature.
 * Ton de carte dérivé de la nature : COMMANDE → ferme, PRÉVISION → suggéré.
 */

const LABEL_W = 208
const GRAPH_PAPER =
  'linear-gradient(to right, rgba(31,26,19,.045) 1px, transparent 1px),' +
  'linear-gradient(to bottom, rgba(31,26,19,.045) 1px, transparent 1px)'

const fmt = (h: number) => (Math.round(h * 100) / 100).toFixed(2).replace('.', ',')
const r1 = (n: number) => Math.round(n * 100) / 100

/** Nature du besoin → ton BoardCard. */
const natureStatus = (card: OrderCard): CardStatus =>
  card.induit
    ? 'planifie' // ghost induit : ton neutre (pas 'ferme' — ce n'est pas une commande ferme)
    : card.nature === 'PREVISION'
      ? 'suggere'
      : 'ferme'

/** `numCommande#ligne` → `numCommande·ligne`. */
/** "AR2602608#1000" → "AR2602608·L1" (VCRLIN_0 est en milliers : 1000=ligne 1). */
const fmtRef = (id: string) => {
  const [cmd, ligne] = id.split('#')
  if (ligne === undefined) return cmd
  const n = parseInt(ligne, 10)
  const ligneNb = !isNaN(n) && n >= 1000 && n % 1000 === 0 ? n / 1000 : ligne
  return `${cmd}·L${ligneNb}`
}

export default function OrderGrid(props: {
  store: OrderBoardStore
  onSelectCard: (id: string) => void
}) {
  const { store } = props
  const [draggedId, setDraggedId] = createSignal<string | null>(null)
  const [dropCol, setDropCol] = createSignal<string | null>(null)
  let rootEl: HTMLDivElement | undefined
  usePrintFit(() => rootEl)

  const cols = () => store.board.cols
  // Planification : cartes plus riches (commande + article + désignation) → colonnes plus larges.
  const gridTpl = () => `${LABEL_W}px repeat(${cols()}, minmax(150px, 1fr))`
  const minWidth = () => `calc(${LABEL_W}px + ${cols() * 160}px)`

  // Colonnes par semaine (total hebdo + libellés).
  const weekRanges = createMemo(() => {
    let off = 0
    return store.board.weekSpans.map((ws) => {
      const range = { week: ws.week, from: off, to: off + ws.span }
      off += ws.span
      return range
    })
  })

  /** Charge totale (heures) par semaine, toutes lignes visibles. */
  const weekTotals = createMemo(() => {
    const dl = store.dayLoad()
    return weekRanges().map((wr) => {
      let s = 0
      for (let c = wr.from; c < wr.to; c++) s += dl[c] ?? 0
      return { week: wr.week, hours: r1(s) }
    })
  })

  /** Histogramme hebdo d'une ligne : planifié = commandes directes, induit =
   *  besoin brut depth-1 (pas une carte), segment distinct. */
  function lineCharge(line: OrderLineRow): ChargeWeek[] {
    return store.lineWeekLoads(line.code).map((wl) => ({
      week: wl.week,
      ferme: 0,
      planifie: r1(wl.direct),
      suggere: 0,
      induit: r1(wl.induit),
    }))
  }

  /** Échelle commune des histogrammes (total hebdo max, toutes lignes). */
  const maxLineHours = createMemo(() => {
    let m = 0
    for (const line of store.board.lines) {
      for (const cw of lineCharge(line)) {
        const t = cw.ferme + cw.planifie + cw.suggere + cw.induit
        if (t > m) m = t
      }
    }
    return m || 1
  })

  /** N° du jour dérivé de l'ISO de la colonne. */
  function dayNum(col: number): string {
    const iso = store.board.lines[0]?.dayCells[col]?.iso
    return iso ? String(Number(iso.slice(8, 10))) : ''
  }

  return (
    <div ref={rootEl} data-board-root class="h-full overflow-auto bg-background">
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
                  <span class="font-fraunces text-[13px] font-black italic tracking-tight text-brand">
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
            <div class="sticky left-0 z-40 flex flex-col gap-1 border-b border-r border-rule bg-card px-3.5 py-2">
              <span class="font-mono text-[9px] font-bold tracking-[0.12em] text-muted-foreground">
                Poste de charge
              </span>
              {/* Légende charge/jour : directe (commandes PF) vs amont (induit). */}
              <span class="flex items-center gap-2 font-mono text-[8px] font-semibold uppercase tracking-wider text-muted-foreground">
                <span class="inline-flex items-center gap-0.5">
                  <span class="size-[7px] rounded-[1px] bg-foreground" /> directe
                </span>
                <span class="inline-flex items-center gap-0.5">
                  <span
                    class="size-[7px] rounded-[1px]"
                    style={{
                      'background-color': 'rgba(168,67,31,.18)',
                      'background-image':
                        'repeating-linear-gradient(45deg, rgba(168,67,31,.5) 0 1px, transparent 1px 3px)',
                    }}
                  />
                  amont
                </span>
              </span>
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
                      'font-mono text-[9px] font-bold tracking-[0.1em]',
                      day.today ? 'text-brand' : 'text-muted-foreground'
                    )}
                  >
                    {day.short.replace(/\s*\d+\s*$/, '')}
                  </div>
                  <div
                    class={cx(
                      'font-fraunces text-[19px] font-bold leading-none tracking-tight',
                      day.today ? 'text-brand italic' : 'text-foreground'
                    )}
                  >
                    {dayNum(di())}
                  </div>
                  {/* Charge du jour : total (gras) + détail directe / amont + barre
                      empilée (proportions). amont masqué s'il n'y en a pas. */}
                  {(() => {
                    const directe = store.dayLoadSplit().direct[di()] ?? 0
                    const amont = store.dayLoadSplit().amont[di()] ?? 0
                    const total = directe + amont
                    return (
                      <div class="mt-1">
                        <div class="text-center font-fraunces text-[13px] font-bold leading-none tabular-nums text-foreground">
                          {fmt(total)}
                          <span class="ml-0.5 font-mono text-[8px] font-medium opacity-50">h</span>
                        </div>
                        <div class="flex items-baseline justify-center gap-1 font-mono tabular-nums">
                          <span class="text-[9px] font-semibold text-foreground/70">
                            {fmt(directe)}
                          </span>
                          <Show when={amont > 0}>
                            <span class="text-[9px] font-bold text-brand">+{fmt(amont)}</span>
                          </Show>
                        </div>
                        <Show when={total > 0}>
                          <div class="mt-0.5 flex h-[5px] overflow-hidden rounded-full bg-rule-soft">
                            <span
                              class="block h-full bg-foreground"
                              style={{ width: `${(directe / total) * 100}%` }}
                            />
                            <Show when={amont > 0}>
                              <span
                                class="block h-full"
                                style={{
                                  'width': `${(amont / total) * 100}%`,
                                  'background-color': 'rgba(168,67,31,.45)',
                                  'background-image':
                                    'repeating-linear-gradient(45deg, rgba(168,67,31,.55) 0 1.5px, transparent 1.5px 4px)',
                                }}
                              />
                            </Show>
                          </div>
                        </Show>
                      </div>
                    )
                  })()}
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
              style={{
                'grid-template-columns': gridTpl(),
                'display': store.lineVisible(line.code) ? 'grid' : 'none',
              }}
            >
              {/* En-tête de poste (collant à gauche) */}
              <div class="sticky left-0 z-20 flex flex-col gap-1.5 overflow-hidden border-r border-rule bg-card px-3.5 py-3">
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
                        <div class="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 font-mono text-[9px] font-bold uppercase tracking-wider">
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
                          <div class="mt-1 flex items-baseline gap-1 text-[10px] text-muted-foreground">
                            <span>Bouches hygro</span>
                            <span
                              class="font-fraunces text-[14px] font-bold tabular-nums"
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
                        'relative flex min-h-[96px] flex-col gap-2 border-r border-rule-soft bg-card p-2',
                        isToday && 'bg-brand-soft'
                      )}
                      style={{
                        'background-image': isToday ? undefined : GRAPH_PAPER,
                        'background-size': '22px 22px',
                      }}
                      classList={{ 'ring-2 ring-brand/70 ring-inset': dropCol() === cellKey }}
                      onDragOver={(e) => {
                        if (!draggedId()) return
                        e.preventDefault()
                        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
                        setDropCol(cellKey)
                      }}
                      onDrop={(e) => {
                        const id = draggedId()
                        setDropCol(null)
                        if (!id) return
                        e.preventDefault()
                        store.moveCard(id, line.code, ci(), dc.iso)
                      }}
                    >
                      <For each={dc.cards}>
                        {(card) => (
                          <CardView
                            store={store}
                            card={card}
                            line={line}
                            onSelectCard={props.onSelectCard}
                            setDraggedId={setDraggedId}
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
  store: OrderBoardStore
  card: OrderCard
  line: OrderLineRow
  onSelectCard: (id: string) => void
  setDraggedId: (v: string | null) => void
  setDropCol: (v: string | null) => void
}) {
  const { store, card } = props
  const matches = () => store.cardMatches(card, props.line.code)
  // Carte induite : ghost non-draggable (pilotée par la commande parente) et non
  // cliquable (pas un détail commande).
  const ghost = !!card.induit
  // Faisabilité (issue #21) : badge dérivé des OF rattachés à la ligne (agrégation
  // pessimiste dans le store). Miroir de BoardGrid.CardView — les ghosts ne sont pas
  // badgés (besoin amont, pas de commande client rattachée).
  const feas = () => {
    if (ghost) return undefined
    const f = store.feasOf(card.id)
    if (!f) return undefined
    return f.st === 'blocked' ? ('bad' as const) : ('ok' as const)
  }
  return (
    <div
      role="button"
      tabindex={matches() && !ghost ? 0 : -1}
      draggable={matches() && !card.hasOverride && !ghost}
      data-order-id={card.id}
      class={cx(
        'relative transition-opacity',
        ghost ? 'cursor-default' : 'cursor-pointer',
        !matches() && 'pointer-events-none opacity-15'
      )}
      onClick={() => {
        if (matches() && !ghost) props.onSelectCard(card.id)
      }}
      onDragStart={(e: DragEvent) => {
        if (card.hasOverride || ghost) {
          e.preventDefault()
          return
        }
        props.setDraggedId(card.id)
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = 'move'
          e.dataTransfer.setData('text/plain', card.id)
        }
      }}
      onDragEnd={() => {
        props.setDraggedId(null)
        props.setDropCol(null)
      }}
    >
      <BoardCard
        variant="commande"
        status={natureStatus(card)}
        // Induite : header = code composant (le BDH à produire). Sinon : n° commande.
        article={ghost ? (card.article ?? '') : fmtRef(card.id)}
        // Induite : pas de 2e ligne article (le composant est déjà le header).
        ord={ghost ? undefined : (card.article ?? undefined)}
        title={card.title}
        client={card.customer ?? undefined}
        type={card.orderType ?? undefined}
        hours={fmt(card.hours)}
        mod={card.hasOverride}
        consommeBouche={card.consommeBouche}
        typologie={card.typologie}
        qty={card.qty}
        induit={ghost}
        feas={feas()}
      />
      {/* Override : bouton réinitialiser (date X3 d'origine) */}
      <Show when={card.hasOverride}>
        <button
          type="button"
          class="absolute right-1.5 top-1.5 z-10 flex size-5 items-center justify-center rounded-full bg-card text-suggere shadow-[0_1px_2px_rgba(31,26,19,.15)] transition-colors hover:text-foreground"
          title="Réinitialiser l'override (date X3)"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            store.resetOverride(card.id)
          }}
        >
          <span class="material-symbols-outlined text-[13px]">undo</span>
        </button>
      </Show>
    </div>
  )
}
