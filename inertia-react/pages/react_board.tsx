/**
 * POC drag board React (phase 3, plan react-shadcn §8) — page JETABLE.
 *
 * Mesure les 3 critères du verdict sur le payload RÉEL de /programme :
 *   1. fluidité du drag (règle d'or : drag JAMAIS dans le state React —
 *      surlignage par classe DOM, progression throttlée rAF hors setState) ;
 *   2. re-renders pendant le drag (compteurs par composant, attendu ≈ 0) ;
 *   3. latence au drop (moveCard zustand → commit React → paint).
 *
 * Le drop est LOCAL-ONLY : aucun PATCH réseau (contrairement au board Solid).
 */
import { useEffect, useRef, useState } from 'react'
import { Head } from '@inertiajs/react'
import {
  draggable,
  dropTargetForElements,
  monitorForElements,
} from '@atlaskit/pragmatic-drag-and-drop/element/adapter'
import { autoScrollForElements } from '@atlaskit/pragmatic-drag-and-drop-auto-scroll/element'

import type { BoardData, Card, DayCell, LineRow } from '@/lib/board/types'
import Masthead from '@r/components/masthead'
import { useBoardStore } from '@r/lib/board/store'
import { cn } from '@r/lib/utils'

// ─────────────────────────────────────────────────────────────
// Instrumentation (module-level, hors cycle React)
// ─────────────────────────────────────────────────────────────
const counters = {
  lineRenders: 0,
  cellRenders: 0,
  cardRenders: 0,
  impactCalls: 0,
  rafImpactRuns: 0,
}
let dragSnapshot: typeof counters | null = null

function snapshotCounters() {
  return { ...counters }
}

// Classes de surlignage de cellule — appliquées en DOM direct (jamais setState).
const DROP_CLASSES = ['ring-2', 'ring-primary/70', 'ring-inset', 'bg-muted']

// Teinte de bord de carte par statut (dérivé du TONE_* du board Solid, simplifié POC).
const STATUS_BORDER: Record<string, string> = {
  ferme: '#16a34a',
  planifie: '#2563eb',
  suggere: '#d97706',
}

interface ReactBoardProps {
  board: BoardData | null
  dateRange: string
  totalOf: number
  lineCount: number
  x3Error: string | null
}

// ─────────────────────────────────────────────────────────────
// Carte OF — draggable pragmatic-dnd
// ─────────────────────────────────────────────────────────────
function BoardCard({ card }: { card: Card }) {
  counters.cardRenders++
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    return draggable({
      element: el,
      getInitialData: () => ({ type: 'of-card', numOf: card.id, hours: card.hours }),
      onDragStart: () => {
        el.style.opacity = '0.4'
      },
      onDrop: () => {
        el.style.opacity = ''
      },
    })
  }, [card.id, card.hours])

  const border = STATUS_BORDER[card.status] ?? 'var(--border)'

  return (
    <div
      ref={ref}
      className="cursor-grab rounded-md border bg-card p-1.5 text-[10px] shadow-xs select-none active:cursor-grabbing"
      style={{ borderLeft: `3px solid ${border}` }}
      data-of={card.id}
    >
      <div className="flex items-baseline justify-between gap-1">
        <span className="truncate font-mono font-bold text-foreground">{card.title}</span>
        {card.metric && (
          <span className="shrink-0 font-mono text-[9px] text-muted-foreground">{card.metric}</span>
        )}
      </div>
      {card.article && (
        <div className="truncate font-mono text-[9px] text-muted-foreground">{card.article}</div>
      )}
      <div className="mt-0.5 flex items-center justify-between">
        <span className="rounded bg-muted px-1 py-px font-mono text-[8px] uppercase text-muted-foreground">
          {card.status}
        </span>
        <span className="font-mono text-[9px] font-semibold tabular-nums">{card.hours}h</span>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Cellule jour — drop target, surlignage 100 % DOM
// ─────────────────────────────────────────────────────────────
function BoardCell({
  cell,
  lineCode,
  col,
  today,
}: {
  cell: DayCell
  lineCode: string
  col: number
  today: boolean
}) {
  counters.cellRenders++
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    return dropTargetForElements({
      element: el,
      getData: () => ({ lineCode, col, iso: cell.iso }),
      canDrop: ({ source }) => source.data.type === 'of-card',
      onDragEnter: () => el.classList.add(...DROP_CLASSES),
      onDragLeave: () => el.classList.remove(...DROP_CLASSES),
      onDrop: () => el.classList.remove(...DROP_CLASSES),
    })
  }, [lineCode, col, cell.iso])

  return (
    <div
      ref={ref}
      className={cn(
        'flex min-h-[96px] flex-col gap-1.5 border-r border-b p-1.5',
        today && 'bg-muted/50'
      )}
    >
      {cell.cards.map((card) => (
        <BoardCard key={card.id} card={card} />
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Ligne (poste de charge) — sélecteur zustand par index :
// seules les lignes touchées par un move re-rendent.
// ─────────────────────────────────────────────────────────────
function BoardLine({ index, todayCol }: { index: number; todayCol: number }) {
  counters.lineRenders++
  const line = useBoardStore((s) => s.board.lines[index]) as LineRow | undefined
  if (!line) return null

  const cardCount = line.dayCells.reduce((n, c) => n + c.cards.length, 0)
  const hoursTotal = line.dayCells.reduce(
    (n, c) => n + c.cards.reduce((h, card) => h + card.hours, 0),
    0
  )

  return (
    <>
      {/* Colonne poste */}
      <div className="sticky left-0 z-10 flex flex-col justify-center gap-0.5 border-r border-b bg-background px-2 py-1">
        <div className="flex items-center gap-1.5">
          <span className="size-2 rounded-full" style={{ background: line.dot }} />
          <span className="truncate text-[11px] font-bold">{line.name}</span>
        </div>
        <div className="font-mono text-[9px] text-muted-foreground">
          {line.code} · {cardCount} OF · {Math.round(hoursTotal)}h
        </div>
      </div>
      {line.dayCells.map((cell, ci) => (
        <BoardCell
          key={ci}
          cell={cell}
          lineCode={line.code}
          col={ci}
          today={ci === todayCol}
        />
      ))}
    </>
  )
}

// ─────────────────────────────────────────────────────────────
// Bandeau de mesures
// ─────────────────────────────────────────────────────────────
function StatsBar({
  totalCards,
  dropMs,
  lastDrag,
}: {
  totalCards: number
  dropMs: number | null
  lastDrag: { lines: number; cells: number; cards: number; impact: number; raf: number } | null
}) {
  const moveCount = useBoardStore((s) => s.moveCount)
  return (
    <div className="flex flex-none flex-wrap items-center gap-x-5 gap-y-1 border-b bg-secondary/60 px-7 py-1.5 font-mono text-[10.5px] text-muted-foreground">
      <span>
        <b className="text-foreground">{totalCards}</b> cartes
      </span>
      <span>
        moves : <b className="text-foreground">{moveCount}</b>
      </span>
      <span title="moveCard zustand → commit React → frame suivante (inclut le paint)">
        latence drop :{' '}
        <b className={cn('text-foreground', dropMs !== null && dropMs > 50 && 'text-destructive')}>
          {dropMs === null ? '—' : `${dropMs.toFixed(1)}ms`}
        </b>
      </span>
      <span title="Re-renders composants pendant le DERNIER drag (attendu ≈ 0 : le drag ne touche pas le state React)">
        re-renders pendant drag :{' '}
        <b
          className={cn(
            'text-foreground',
            lastDrag && lastDrag.lines + lastDrag.cells + lastDrag.cards > 0 && 'text-destructive'
          )}
        >
          {lastDrag
            ? `${lastDrag.lines} lignes · ${lastDrag.cells} cellules · ${lastDrag.cards} cartes`
            : '—'}
        </b>
      </span>
      <span title="Événements dragEnter reçus vs exécutions rAF de l'impact live (throttling #23)">
        impact live :{' '}
        <b className="text-foreground">
          {lastDrag ? `${lastDrag.impact} évts → ${lastDrag.raf} rAF` : '—'}
        </b>
      </span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────
export default function ReactBoard(props: ReactBoardProps) {
  const setBoard = useBoardStore((s) => s.setBoard)
  const moveCard = useBoardStore((s) => s.moveCard)
  const days = useBoardStore((s) => s.board.days)
  const lineCount = useBoardStore((s) => s.board.lines.length)
  const weekSpans = useBoardStore((s) => s.board.weekSpans)

  // Règle d'or n°2 : sync props Inertia → store quand la référence change.
  useEffect(() => {
    if (props.board) setBoard(props.board)
  }, [props.board, setBoard])

  const [dropMs, setDropMs] = useState<number | null>(null)
  const [lastDrag, setLastDrag] = useState<{
    lines: number
    cells: number
    cards: number
    impact: number
    raf: number
  } | null>(null)

  // « Impact live » (#23 simulé) : ligne de statut mise à jour en DOM direct,
  // throttlée rAF — représente le callback onOfDragProgress sans toucher React.
  const impactRef = useRef<HTMLSpanElement>(null)
  const rafPending = useRef(false)
  const lastHover = useRef<{ numOf: string; lineCode: string; iso: string } | null>(null)

  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const cleanupMonitor = monitorForElements({
      canMonitor: ({ source }) => source.data.type === 'of-card',
      onDragStart: () => {
        dragSnapshot = snapshotCounters()
        if (impactRef.current) impactRef.current.textContent = 'drag…'
      },
      onDropTargetChange: ({ source, location }) => {
        const target = location.current.dropTargets[0]
        if (!target) return
        counters.impactCalls++
        lastHover.current = {
          numOf: source.data.numOf as string,
          lineCode: target.data.lineCode as string,
          iso: target.data.iso as string,
        }
        // Throttle rAF : une seule exécution par frame, DOM direct.
        if (!rafPending.current) {
          rafPending.current = true
          requestAnimationFrame(() => {
            rafPending.current = false
            counters.rafImpactRuns++
            const h = lastHover.current
            if (h && impactRef.current) {
              impactRef.current.textContent = `${h.numOf} → ${h.lineCode} · ${h.iso}`
            }
          })
        }
      },
      onDrop: ({ source, location }) => {
        const snap = dragSnapshot
        dragSnapshot = null
        const target = location.current.dropTargets[0]
        if (impactRef.current) impactRef.current.textContent = '—'
        // Mesure des re-renders pendant le drag (avant le move, qui re-rend légitimement).
        const dragStats = snap
          ? {
              lines: counters.lineRenders - snap.lineRenders,
              cells: counters.cellRenders - snap.cellRenders,
              cards: counters.cardRenders - snap.cardRenders,
              impact: counters.impactCalls - snap.impactCalls,
              raf: counters.rafImpactRuns - snap.rafImpactRuns,
            }
          : null
        if (target) {
          const t0 = performance.now()
          moveCard(
            source.data.numOf as string,
            target.data.lineCode as string,
            target.data.col as number
          )
          // Latence : commit React + paint = frame suivante.
          requestAnimationFrame(() => setDropMs(performance.now() - t0))
        }
        if (dragStats) setLastDrag(dragStats)
      },
    })
    const cleanupScroll = scrollRef.current
      ? autoScrollForElements({ element: scrollRef.current })
      : undefined
    return () => {
      cleanupMonitor()
      cleanupScroll?.()
    }
  }, [moveCard])

  const totalCards = useBoardStore((s) =>
    s.board.lines.reduce(
      (n, l) => n + l.dayCells.reduce((m, c) => m + c.cards.length, 0),
      0
    )
  )
  const todayCol = days.findIndex((d) => d.today)

  return (
    <>
      <Head title="POC Board React" />
      <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
        <Masthead
          subtitle="POC DRAG BOARD (PHASE 3)"
          active="programme"
          meta={
            <>
              <div>{props.dateRange}</div>
              <div>
                <b className="font-bold text-foreground">{props.totalOf}</b> OF ·{' '}
                {props.lineCount} lignes · drop local-only
              </div>
            </>
          }
        />

        <StatsBar totalCards={totalCards} dropMs={dropMs} lastDrag={lastDrag} />

        <div className="flex flex-none items-center gap-2 border-b px-7 py-1 font-mono text-[10.5px] text-muted-foreground">
          <span className="font-bold">impact live (rAF, DOM direct) :</span>
          <span ref={impactRef}>—</span>
        </div>

        {props.x3Error && (
          <div className="flex flex-none items-center gap-2 border-b border-destructive/30 bg-destructive/10 px-7 py-2 text-[12px]">
            <span className="material-symbols-outlined text-[16px] text-destructive">warning</span>
            <span className="font-mono">{props.x3Error}</span>
          </div>
        )}

        {/* ═══ Grille ═══ */}
        <div ref={scrollRef} className="flex-1 overflow-auto">
          <div
            className="grid min-w-max"
            style={{
              gridTemplateColumns: `180px repeat(${days.length}, minmax(120px, 1fr))`,
            }}
          >
            {/* Rangée semaines */}
            <div className="sticky left-0 top-0 z-30 border-b border-r bg-background" />
            {weekSpans.map((w, i) => (
              <div
                key={i}
                className="sticky top-0 z-20 border-b border-r bg-secondary px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-muted-foreground"
                style={{ gridColumn: `span ${w.span}` }}
              >
                S{w.week}
              </div>
            ))}
            {/* Rangée jours */}
            <div className="sticky left-0 top-[19px] z-30 border-b border-r bg-background px-2 py-1 font-mono text-[9px] font-bold uppercase text-muted-foreground">
              Poste
            </div>
            {days.map((d, i) => (
              <div
                key={i}
                className={cn(
                  'sticky top-[19px] z-20 border-b border-r bg-background px-2 py-1 text-[10px] font-semibold',
                  d.today && 'bg-muted text-foreground'
                )}
              >
                {d.short}
                <span className="ml-1 font-mono text-[9px] font-normal text-muted-foreground">
                  {d.hours}
                </span>
              </div>
            ))}
            {/* Lignes */}
            {Array.from({ length: lineCount }, (_, i) => (
              <BoardLine key={i} index={i} todayCol={todayCol} />
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
