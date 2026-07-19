import { useEffect, useMemo, useRef, useState, type JSX } from 'react'
import {
  draggable,
  dropTargetForElements,
  monitorForElements,
} from '@atlaskit/pragmatic-drag-and-drop/element/adapter'
import { autoScrollForElements } from '@atlaskit/pragmatic-drag-and-drop-auto-scroll/element'

import { cn } from '@r/lib/utils'
import { useBoardStore, cardMatches, lineVisible, feasOf, type BoardState } from '@r/lib/board/store'
import type { Card, DayCol, LineRow } from '@/lib/board/types'
import { TYPO_META } from '@/lib/board/types'
import type { VirtualOrderVm } from '@/lib/scenarios/types'
import { promiseReasonText, type PromiseNode } from '@/lib/promesse/types'
import { route } from '@/lib/routes'
import { fmtDay } from '@/lib/vision/date-utils'
import { BoardCard, type CardStatus } from './board-card'
import { ChargeHistogram, type ChargeWeek } from './charge-histogram'
import { usePrintFit } from './use-print-fit'

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

// Classes de surlignage de cellule — appliquées en DOM direct (jamais setState).
const DROP_CLASSES = ['ring-2', 'ring-brand/70', 'ring-inset']

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

interface BoardGridProps {
  store: BoardState
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
}

export default function BoardGrid(props: BoardGridProps) {
  const { store } = props
  const rootRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  usePrintFit(() => rootRef.current ?? undefined)

  // Expose contentRef via callback if provided
  useEffect(() => {
    if (props.contentRef && contentRef.current) {
      props.contentRef(contentRef.current)
    }
  }, [props.contentRef])

  // Pass scrollRef to parent via callback
  useEffect(() => {
    if (props.contentRef && scrollRef.current) {
      // The parent might expect the scroll container
    }
  }, [props.contentRef])

  const board = useBoardStore((s) => s.board)
  const cols = useBoardStore((s) => s.board.cols)
  const days = useBoardStore((s) => s.board.days)
  const lines = useBoardStore((s) => s.board.lines)
  const weekSpans = useBoardStore((s) => s.board.weekSpans)

  /** Template de grille commun (toutes les rangées l'utilisent pour l'alignement). */
  const gridTpl = useMemo(() => `${LABEL_W}px repeat(${cols}, minmax(108px, 1fr))`, [cols])
  const minWidth = useMemo(() => `calc(${LABEL_W}px + ${cols * 118}px)`, [cols])

  // Colonnes par semaine (pour total hebdo + Libellés).
  const weekRanges = useMemo(() => {
    let off = 0
    return weekSpans.map((ws) => {
      const range = { week: ws.week, from: off, to: off + ws.span }
      off += ws.span
      return range
    })
  }, [weekSpans])

  /** Charge totale (heures absolues) par semaine, toutes lignes confondues. */
  const weekTotals = useMemo(() => {
    const dl = computeDayLoad(store)
    return weekRanges.map((wr) => {
      let s = 0
      for (let c = wr.from; c < wr.to; c++) s += dl[c] ?? 0
      return { week: wr.week, hours: r1(s) }
    })
  }, [store, weekRanges])

  /** Histogramme hebdo d'une ligne (absolu, ventilé Ferme/Planifié/Suggéré). */
  const lineCharge = useMemo(() => {
    const cache = new Map<number, ChargeWeek[]>()
    for (const line of lines) {
      const byWeek: Record<number, { ferme: number; planifie: number; suggere: number }> = {}
      line.dayCells.forEach((dc, col) => {
        const wk = board.colWeek[col]
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
      const charges: ChargeWeek[] = line.weekLoads.map((wl) => {
        const b = byWeek[wl.week] ?? { ferme: 0, planifie: 0, suggere: 0 }
        return {
          week: wl.week,
          ferme: r1(b.ferme),
          planifie: r1(b.planifie),
          suggere: r1(b.suggere),
          induit: 0,
        }
      })
      cache.set(lines.indexOf(line), charges)
    }
    return cache
  }, [board, lines])

  /** Échelle commune des histogrammes (total hebdo max, toutes lignes). */
  const maxLineHours = useMemo(() => {
    let m = 0
    for (const charges of lineCharge.values()) {
      for (const cw of charges) {
        const t = cw.ferme + cw.planifie + cw.suggere
        if (t > m) m = t
      }
    }
    return m || 1
  }, [lineCharge])

  /** N° du jour dérivé de l'ISO de la colonne (DayCol ne porte pas le n°). */
  const dayNum = (col: number): string => {
    const iso = lines[0]?.dayCells[col]?.iso
    return iso ? String(Number(iso.slice(8, 10))) : ''
  }

  // ── Drag state ──
  const [draggedNumOf, setDraggedNumOf] = useState<string | null>(null)

  // Throttle drag progress notifications (issue #23)
  const rafPendingRef = useRef(false)
  const lastDragProgressRef = useRef<{ ofId: string; lineCode: string; col: number; iso: string } | null>(null)

  // ── pragmatic-dnd monitor ──
  useEffect(() => {
    const cleanupMonitor = monitorForElements({
      canMonitor: ({ source }) => source.data.type === 'of-card',
      onDragStart: ({ source }) => {
        setDraggedNumOf(source.data.numOf as string)
      },
      onDropTargetChange: ({ source, location }) => {
        const target = location.current.dropTargets[0]
        if (!target || !props.onOfDragProgress) return

        const ofId = source.data.numOf as string
        const lineCode = target.data.lineCode as string
        const col = target.data.col as number
        const iso = target.data.iso as string

        lastDragProgressRef.current = { ofId, lineCode, col, iso }

        if (!rafPendingRef.current) {
          rafPendingRef.current = true
          requestAnimationFrame(() => {
            rafPendingRef.current = false
            const h = lastDragProgressRef.current
            if (h && props.onOfDragProgress) {
              props.onOfDragProgress(h.ofId, h.lineCode, h.col, h.iso)
            }
          })
        }
      },
      onDrop: ({ source, location }) => {
        const target = location.current.dropTargets[0]
        setDraggedNumOf(null)
        lastDragProgressRef.current = null

        if (target) {
          const num = source.data.numOf as string
          const lineCode = target.data.lineCode as string
          const col = target.data.col as number
          const iso = target.data.iso as string

          const dateFin = props.translateOfDateFin?.(num, iso)
          store.moveCard(num, lineCode, col, iso, dateFin ?? undefined)
          props.onOfDropped?.(num, iso, dateFin ?? undefined)
        } else {
          // Drop hors grille (dropEffect === 'none')
          props.onOfDragCancelled?.()
        }
      },
    })

    const cleanupScroll = scrollRef.current
      ? autoScrollForElements({ element: scrollRef.current })
      : undefined

    return () => {
      cleanupMonitor()
      cleanupScroll?.()
    }
  }, [store, props.onOfDragProgress, props.onOfDropped, props.onOfDragCancelled, props.translateOfDateFin])

  const dayLoad = useMemo(() => computeDayLoad(store), [store])

  return (
    <div ref={rootRef} data-board-root className="h-full overflow-auto bg-background">
      <div ref={contentRef} className="relative" style={{ minWidth }}>
        {/* ═══ En-tête collant (semaines + jours) ═══ */}
        <div className="sticky top-0 z-30 bg-background shadow-[0_2px_10px_-4px_rgba(31,26,19,.18)]">
          {/* Bande semaines */}
          <div className="grid" style={{ gridTemplateColumns: gridTpl }}>
            <div className="sticky left-0 z-40 border-b border-rule bg-secondary" />
            {weekRanges.map((wr, i) => (
              <div
                key={wr.week}
                className="flex items-baseline gap-2.5 border-b border-r border-rule bg-secondary px-3.5 py-1.5"
                style={{ gridColumn: `span ${wr.to - wr.from}` }}
              >
                <span className="font-fraunces text-sm font-black italic tracking-tight text-brand">
                  Semaine {wr.week}
                </span>
                {weekTotals[i] && (
                  <span className="ml-auto font-fraunces text-xs font-bold tabular-nums text-foreground">
                    {fmt(weekTotals[i].hours)} h
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* En-tête jours */}
          <div className="grid" style={{ gridTemplateColumns: gridTpl }}>
            <div className="sticky left-0 z-40 border-b border-r border-rule bg-card px-3.5 py-2 font-mono text-2xs font-bold tracking-[0.12em] text-muted-foreground">
              Poste de production
            </div>
            {days.map((day, di) => (
              <div
                key={di}
                className={cn(
                  'border-b border-r border-rule-soft bg-card px-2.5 py-1.5 text-center',
                  day.today && 'bg-brand-soft'
                )}
              >
                <div
                  className={cn(
                    'font-mono text-2xs font-bold tracking-[0.1em]',
                    day.today ? 'text-brand' : 'text-muted-foreground'
                  )}
                >
                  {day.short.replace(/\s*\d+\s*$/, '')}
                </div>
                <div
                  className={cn(
                    'font-fraunces text-lg font-bold leading-none tracking-tight',
                    day.today ? 'text-brand italic' : 'text-foreground'
                  )}
                >
                  {dayNum(di)}
                </div>
                <div className="mt-0.5 font-mono text-xs font-bold tabular-nums text-brand">
                  {fmt(dayLoad[di] ?? 0)}
                  <span className="text-3xs font-medium opacity-60"> h</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ═══ Rangée « Commandes virtuelles » (issue #58, mode scénario) ═══ */}
        {props.virtualOrdersByCol && (
          <div
            className="grid border-b-2 border-dashed border-brand/50 bg-brand-soft/40"
            style={{ gridTemplateColumns: gridTpl }}
          >
            <div className="sticky left-0 z-20 flex items-center gap-1.5 border-r border-rule bg-brand-soft/60 px-3.5 py-3">
              <span className="material-symbols-outlined text-[15px] text-brand">science</span>
              <span className="font-mono text-2xs font-bold uppercase tracking-wider text-brand">
                Virtuelles
              </span>
            </div>
            {days.map((_day, ci) => (
              <VirtualCell
                key={ci}
                col={ci}
                orders={props.virtualOrdersByCol!.get(ci) ?? []}
                iso={lines[0]?.dayCells[ci]?.iso ?? ''}
                onDrop={props.onVirtualDrop}
                onRemove={props.onVirtualRemove}
              />
            ))}
          </div>
        )}

        {/* ═══ Rangées de postes ═══ */}
        {lines.map((line, li) => (
          <BoardLine
            key={line.code}
            line={line}
            li={li}
            lineCharge={lineCharge}
            gridTpl={gridTpl}
            maxLineHours={maxLineHours}
            days={days}
            draggedNumOf={draggedNumOf}
            store={store}
            onSelectOf={props.onSelectOf}
            onCardHover={props.onCardHover}
            cardRetard={props.cardRetard}
            cellExtra={props.cellExtra}
            onCellDrop={props.onCellDrop}
            onLineEngagement={props.onLineEngagement}
          />
        ))}
        {props.overlay}
      </div>
    </div>
  )
}

// ── Rangée de poste (composant dédié : useBoardStore au top-level, PAS dans le .map) ──
interface BoardLineProps {
  line: LineRow
  li: number
  lineCharge: Map<number, ChargeWeek[]>
  gridTpl: string
  maxLineHours: number
  days: DayCol[]
  draggedNumOf: string | null
  store: BoardState
  onSelectOf?: (num: string) => void
  onCardHover?: (numOf: string | null) => void
  cardRetard?: (ofId: string) => number | null | undefined
  cellExtra?: (lineCode: string, col: number) => JSX.Element
  onCellDrop?: (lineCode: string, col: number, iso: string, e: DragEvent) => void
  onLineEngagement?: (lineCode: string) => void
}

function BoardLine({
  line,
  li,
  lineCharge,
  gridTpl,
  maxLineHours,
  days,
  draggedNumOf,
  store,
  onSelectOf,
  onCardHover,
  cardRetard,
  cellExtra,
  onCellDrop,
  onLineEngagement,
}: BoardLineProps) {
  const charges = lineCharge.get(li) ?? []
  // ponytail: ce hook DOIT être au top-level du sous-composant (pas dans un .map du parent),
  // sinon violation Rules of Hooks (rendered more hooks than previous render).
  const visible = useBoardStore((s) => lineVisible(s, line.code))
  if (!visible) return null

  return (
    <div className="grid border-b border-rule-soft" style={{ gridTemplateColumns: gridTpl }}>
      {/* En-tête de poste (collant à gauche). L'identité (dot+code+nom) est
          cliquable → panneau « Engagement » par poste (#46). Pas de bouton
          dédié : le header est déjà dense (histogramme + PP_830). */}
      <div className="sticky left-0 z-20 flex flex-col gap-1.5 overflow-hidden border-r border-rule bg-card px-3.5 py-3">
        <div
          className={cn(
            'flex items-center gap-2',
            onLineEngagement && 'cursor-pointer transition-colors hover:[&_.line-code]:text-brand'
          )}
          onClick={() => onLineEngagement?.(line.code)}
          title={onLineEngagement ? 'Engagement — OF fermes du poste' : undefined}
        >
          <span
            className="size-2.5 rounded-[2px]"
            style={{ background: line.dot ? undefined : 'var(--color-planifie)' }}
          />
          <span className="line-code font-mono text-sm font-bold tracking-tight text-foreground transition-colors">
            {line.code}
          </span>
        </div>
        <span className="text-xs leading-tight text-muted-foreground">{line.name}</span>
        <ChargeHistogram weeks={charges} maxHours={maxLineHours} variant="line" />
        {/* PP_830 — équilibrage (issue #42, header M1) : barre empilée typo
            (plein = sans bouche, clair = consomme bouche) + stock bouches hygro. */}
        {line.pp830 && <PP830Header pp830={line.pp830} />}
      </div>

      {/* Cellules */}
      {line.dayCells.map((dc, ci) => {
        const isToday = days[ci]?.today
        return (
          <BoardCell
            key={`${line.code}:${ci}`}
            lineCode={line.code}
            col={ci}
            iso={dc.iso}
            isToday={isToday ?? false}
            cards={dc.cards}
            draggedNumOf={draggedNumOf}
            store={store}
            onSelectOf={onSelectOf}
            onCardHover={onCardHover}
            cardRetard={cardRetard}
            cellExtra={cellExtra?.(line.code, ci)}
            onCellDrop={onCellDrop}
          />
        )
      })}
    </div>
  )
}

// ── Cellule (drop target pragmatic-dnd) ──
interface BoardCellProps {
  lineCode: string
  col: number
  iso: string
  isToday: boolean
  cards: Card[]
  draggedNumOf: string | null
  store: BoardState
  onSelectOf?: (num: string) => void
  onCardHover?: (numOf: string | null) => void
  cardRetard?: (ofId: string) => number | null | undefined
  cellExtra?: JSX.Element
  onCellDrop?: (lineCode: string, col: number, iso: string, e: DragEvent) => void
}

function BoardCell(props: BoardCellProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    return dropTargetForElements({
      element: el,
      getData: () => ({ lineCode: props.lineCode, col: props.col, iso: props.iso }),
      canDrop: ({ source }) => source.data.type === 'of-card' || !!props.onCellDrop,
      onDragEnter: () => {
        el.classList.add(...DROP_CLASSES)
      },
      onDragLeave: () => {
        el.classList.remove(...DROP_CLASSES)
      },
      onDrop: () => {
        el.classList.remove(...DROP_CLASSES)
      },
    })
  }, [props.lineCode, props.col, props.iso, props.onCellDrop])

  return (
    <div
      ref={ref}
      className={cn(
        'relative flex min-h-[96px] flex-col gap-2 border-r border-rule-soft bg-card p-2',
        props.isToday && 'bg-brand-soft'
      )}
      style={{
        backgroundImage: props.isToday ? undefined : GRAPH_PAPER,
        backgroundSize: '22px 22px',
      }}
    >
      {props.cards.map((card) => (
        <CardView
          key={card.id}
          card={card}
          lineCode={props.lineCode}
          store={props.store}
          onSelectOf={props.onSelectOf}
          onCardHover={props.onCardHover}
          cardRetard={props.cardRetard?.(card.id)}
        />
      ))}
      {props.cellExtra}
    </div>
  )
}

// ── Carte OF (draggable pragmatic-dnd) ──
interface CardViewProps {
  card: Card
  lineCode: string
  store: BoardState
  onSelectOf?: (num: string) => void
  onCardHover?: (numOf: string | null) => void
  cardRetard?: number | null
}

function CardView(props: CardViewProps) {
  const { store, card } = props
  const ref = useRef<HTMLDivElement>(null)

  const matches = useBoardStore((s) => cardMatches(s, card, props.lineCode))
  const feas = useBoardStore((s) => {
    const f = feasOf(s, card.id)
    if (!f) return undefined
    return f.st === 'blocked' ? ('bad' as const) : ('ok' as const)
  })
  const alert = useBoardStore((s) => {
    const f = feasOf(s, card.id)
    return f && f.st === 'blocked' && f.missing.length
      ? `Rupture ${f.missing.join(', ')}`
      : undefined
  })

  const selecting = useBoardStore((s) => s.selectMode)
  const picked = useBoardStore((s) => s.selected.has(card.id))
  const batchItem = useBoardStore((s) => s.batch[card.id])

  useEffect(() => {
    const el = ref.current
    if (!el || !matches) return

    return draggable({
      element: el,
      getInitialData: () => ({ type: 'of-card', numOf: card.id }),
      onDragStart: () => {
        el.style.opacity = '0.4'
      },
      onDrop: () => {
        el.style.opacity = ''
      },
    })
  }, [card.id, matches])

  const onClick = () => {
    if (!matches) return
    if (selecting) store.toggleSelect(card.id)
    else props.onSelectOf?.(card.id)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!matches) return
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
      e.preventDefault()
      if (selecting) store.toggleSelect(card.id)
      else props.onSelectOf?.(card.id)
    }
  }

  return (
    <div
      ref={ref}
      role="button"
      tabIndex={matches ? 0 : -1}
      data-num-of={card.id}
      className={cn(
        'relative cursor-pointer transition-opacity',
        !matches && 'pointer-events-none opacity-15',
        selecting && picked && 'rounded-md ring-2 ring-brand ring-offset-1'
      )}
      onMouseEnter={() => props.onCardHover?.(card.id)}
      onMouseLeave={() => props.onCardHover?.(null)}
      onClick={onClick}
      onKeyDown={onKeyDown}
    >
      {/* Case à cocher (mode sélection) */}
      {selecting && (
        <span
          className={cn(
            'absolute left-1 top-1 z-10 flex size-4 items-center justify-center rounded border bg-card',
            picked ? 'border-brand bg-brand text-card' : 'border-rule text-transparent'
          )}
        >
          <span className="material-symbols-outlined text-sm font-bold">check</span>
        </span>
      )}
      {/* Badge d'état batch (spinner / ✓ / ✗) par OF */}
      {batchItem && (
        <span
          className={cn(
            'absolute right-1 top-1 z-10 flex size-4 items-center justify-center rounded-full text-card',
            batchItem.st === 'ok' ? 'bg-ferme' : batchItem.st === 'error' ? 'bg-destructive' : 'bg-brand'
          )}
          title={batchItem.msg}
        >
          <span
            className={cn(
              'material-symbols-outlined text-xs font-bold',
              batchItem.st === 'running' && 'animate-spin'
            )}
          >
            {batchItem.st === 'ok'
              ? 'check'
              : batchItem.st === 'error'
                ? 'priority_high'
                : 'progress_activity'}
          </span>
        </span>
      )}
      <BoardCard
        variant="of"
        status={toStatus(card.status)}
        article={card.id}
        articleRef={card.article ?? undefined}
        title={card.title}
        hours={fmt(card.hours)}
        progress={parseProgress(card.metric)}
        feas={feas}
        alert={alert}
        consommeBouche={card.consommeBouche}
        typologie={card.typologie}
        kitGpe={card.kitGpe}
        retardJours={props.cardRetard}
      />
    </div>
  )
}

// ── PP_830 Header ──
interface PP830HeaderProps {
  pp830: {
    chargeByTypo: { typo: string; sans: number; bouche: number }[]
    stockBouchesHygro: number | null
  }
}

function PP830Header({ pp830 }: PP830HeaderProps) {
  const total = pp830.chargeByTypo.reduce((s, t) => s + t.sans + t.bouche, 0) || 1
  const seg = (h: number) => `${(h / total) * 100}%`

  return (
    <div className="mt-1.5">
      <div className="flex h-[6px] overflow-hidden rounded-full bg-rule-soft">
        {pp830.chargeByTypo.map((t) => (
          <div key={t.typo} className="flex">
            <span
              className="block h-full"
              style={{
                width: seg(t.sans),
                background: TYPO_META[t.typo]?.color ?? '#94a3b8',
              }}
            />
            {t.bouche > 0 && (
              <span
                className="block h-full"
                style={{
                  width: seg(t.bouche),
                  background: TYPO_META[t.typo]?.light ?? '#cbd5e1',
                }}
              />
            )}
          </div>
        ))}
      </div>
      <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 font-mono text-2xs font-bold uppercase tracking-wider">
        {pp830.chargeByTypo.map((t) => (
          <span key={t.typo} className="inline-flex items-center gap-1">
            <span className="inline-flex items-center gap-0.5">
              <span
                className="size-[7px] rounded-[1px]"
                style={{ background: TYPO_META[t.typo]?.color ?? '#94a3b8' }}
              />
              {t.bouche > 0 && (
                <span
                  className="size-[7px] rounded-[1px]"
                  style={{ background: TYPO_META[t.typo]?.light ?? '#cbd5e1' }}
                />
              )}
            </span>
            <span className="text-muted-foreground">
              {TYPO_META[t.typo]?.label ?? t.typo}
            </span>
            <span className="tabular-nums text-foreground">
              {t.sans + t.bouche}h
            </span>
          </span>
        ))}
      </div>
      {pp830.stockBouchesHygro !== null && (
        <div className="mt-1 flex items-baseline gap-1 text-2xs text-muted-foreground">
          <span>Bouches hygro</span>
          <span
            className="font-fraunces text-sm font-bold tabular-nums"
            style={{ color: 'var(--color-brand)' }}
          >
            {pp830.stockBouchesHygro}
          </span>
          <span>pcs</span>
        </div>
      )}
    </div>
  )
}

// ── Verdict de servabilité → ton visuel (issue #58, réutilise la palette #23). ──
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

// ── Cellule de la rangée « Commandes virtuelles » ──
interface VirtualCellProps {
  col: number
  orders: VirtualOrderVm[]
  iso: string
  onDrop?: (id: string, col: number, iso: string) => void
  onRemove?: (id: string) => void
}

function VirtualCell(props: VirtualCellProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [over, setOver] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el || !props.onDrop) return
    return dropTargetForElements({
      element: el,
      getData: () => ({ type: 'virtual-cmd', col: props.col, iso: props.iso }),
      canDrop: ({ source }) => source.data.type === 'virtual-cmd',
      onDragEnter: () => {
        setOver(true)
      },
      onDragLeave: () => {
        setOver(false)
      },
      onDrop: () => {
        setOver(false)
      },
    })
  }, [props.col, props.iso, props.onDrop])

  return (
    <div
      ref={ref}
      className={cn(
        'flex min-h-[52px] flex-col gap-1 border-r border-dashed border-brand/30 p-1.5',
        over && 'bg-brand-soft'
      )}
    >
      {props.orders.map((o) => (
        <VirtualOrderChip key={o.id} order={o} onRemove={props.onRemove} />
      ))}
    </div>
  )
}

// ── Chip commande virtuelle ──
interface VirtualOrderChipProps {
  order: VirtualOrderVm
  onRemove?: (id: string) => void
}

function VirtualOrderChip(props: VirtualOrderChipProps) {
  const tone = props.order.statut ? VERDICT_TONE[props.order.statut] : undefined
  const [ctpOpen, setCtpOpen] = useState(false)
  const [ctpPath, setCtpPath] = useState<PromiseNode[] | null>(null)
  const [ctpError, setCtpError] = useState(false)

  const toggleCtp = async () => {
    const open = !ctpOpen
    setCtpOpen(open)
    if (!open || ctpPath || ctpError) return
    try {
      const params = new URLSearchParams({
        article: props.order.article,
        quantity: String(props.order.quantity),
      })
      const res = await fetch(`${route('promesse.index')}?${params}`)
      if (!res.ok) throw new Error()
      const data = await res.json()
      setCtpPath((data.engageante?.criticalPath ?? []) as PromiseNode[])
    } catch {
      setCtpError(true)
    }
  }

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer?.setData('application/x-virtual-cmd', props.order.id)
        if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
      }}
      onClick={toggleCtp}
      className={cn(
        'group relative rounded-[6px] border border-dashed border-brand/60 border-l-[3px] bg-card/80 px-1.5 py-1 leading-tight shadow-sm',
        'cursor-grab active:cursor-grabbing',
        tone?.border ?? 'border-l-brand/60'
      )}
      title="Commande virtuelle — n'existe que dans le scénario · clic : chemin critique"
    >
      <button
        type="button"
        className="absolute right-0.5 top-0.5 flex size-3.5 items-center justify-center rounded-full text-muted-foreground opacity-50 hover:text-error hover:opacity-100"
        onClick={(e) => {
          e.stopPropagation()
          props.onRemove?.(props.order.id)
        }}
        title="Retirer du scénario"
      >
        <span className="material-symbols-outlined text-xs">close</span>
      </button>
      <div className="flex items-baseline gap-1 whitespace-nowrap pr-3 font-mono text-2xs font-bold text-brand">
        <span className="material-symbols-outlined flex-none self-center text-xs">science</span>
        <span>
          {props.order.article} × {props.order.quantity}
        </span>
      </div>
      <div className="mt-0.5 flex items-center gap-1">
        <span className="flex-none font-fraunces text-2xs font-bold tabular-nums text-secondary-foreground">
          {fmtDay(props.order.date)}
        </span>
        {props.order.earliest && (
          <span className="flex-none rounded-full bg-brand-soft px-1 py-px font-mono text-3xs font-bold uppercase tracking-wider text-brand">
            au plus tôt
          </span>
        )}
        {props.order.client && (
          <span className="truncate font-fraunces text-2xs italic text-muted-foreground">
            {props.order.client}
          </span>
        )}
        {tone && (
          <span
            className={cn(
              'ml-auto rounded-full bg-card px-1 py-px font-mono text-3xs font-bold uppercase tracking-wider',
              tone.text
            )}
          >
            {tone.label}
            {props.order.joursRetard && ` +${props.order.joursRetard}j`}
          </span>
        )}
      </div>
      {/* Popover chemin critique CTP (§6.1) */}
      {ctpOpen && (
        <div
          className="absolute left-0 top-full z-50 mt-1 w-[260px] cursor-default rounded-lg border border-rule bg-card p-2 shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="mb-1 font-fraunces text-2xs font-bold text-brand">Chemin critique (CTP)</p>
          {ctpError ? (
            <p className="text-2xs italic text-muted-foreground">Calcul indisponible.</p>
          ) : !ctpPath ? (
            <p className="text-2xs italic text-muted-foreground">Calcul…</p>
          ) : (
            <ul className="space-y-0.5">
              {ctpPath.map((n, i) => (
                <li key={i} className="flex items-baseline gap-1 text-2xs" style={{ paddingLeft: `${i * 8}px` }}>
                  <span className="font-mono font-bold text-foreground">{n.article}</span>
                  <span className="text-muted-foreground">{promiseReasonText(n.reason)}</span>
                  <span className="ml-auto font-fraunces tabular-nums text-secondary-foreground">
                    {fmtDay(n.availableDate)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

// ── Helper: charge par colonne (heures absolues des cartes visibles) ──
function computeDayLoad(state: BoardState): number[] {
  const sums = new Array<number>(state.board.cols).fill(0)
  for (const line of state.board.lines) {
    if (!lineVisible(state, line.code)) continue
    line.dayCells.forEach((dc: { cards: Card[] }, col: number) => {
      for (const card of dc.cards) {
        if (cardMatches(state, card, line.code)) sums[col] += card.hours
      }
    })
  }
  return sums
}
