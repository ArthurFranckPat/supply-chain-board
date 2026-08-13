import { useEffect, useMemo, useRef, useState, type JSX } from 'react'
import { Check, FlaskConical, RefreshCw, TriangleAlert, X } from 'lucide-react'
import {
  draggable,
  dropTargetForElements,
  monitorForElements,
} from '@atlaskit/pragmatic-drag-and-drop/element/adapter'
import { autoScrollForElements } from '@atlaskit/pragmatic-drag-and-drop-auto-scroll/element'

import { cn } from '@r/lib/utils'
import {
  useBoardStore,
  cardMatches,
  lineVisible,
  feasOf,
  type BoardState,
} from '@r/lib/board/store'
import type { Card, DayCol, LineRow } from '@r/lib/board/types'
import { TYPO_META } from '@r/lib/board/types'
import type { VirtualOrderVm } from '@r/lib/scenarios/types'
import { fmtDay } from '@r/lib/vision/date-utils'
import { BoardCard, type CardStatus } from './board-card'
import { ChargeHistogram, type ChargeWeek } from './charge-histogram'
import { usePrintFit } from './use-print-fit'

/**
 * Grille du board (B1 · Quotidien) — ordonnancement des OF.
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
  'linear-gradient(to right, rgba(0,0,0,.045) 1px, transparent 1px),' +
  'linear-gradient(to bottom, rgba(0,0,0,.045) 1px, transparent 1px)'

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
  // Destructuré hors des hooks : lister `props.x` ne prouve pas à la règle
  // exhaustive-deps que les accès sont exhaustifs, elle réclame alors l'objet
  // `props` entier — qui change à CHAQUE rendu du parent et rejouerait donc
  // l'abonnement drag&drop en boucle. Les valeurs sont les mêmes, les
  // identités aussi : aucun changement de comportement.
  const {
    store,
    contentRef: onContentRef,
    onOfDragProgress,
    onOfDropped,
    onOfDragCancelled,
    translateOfDateFin,
  } = props
  const rootRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  usePrintFit(() => rootRef.current ?? undefined)

  // Expose contentRef au parent.
  useEffect(() => {
    if (onContentRef && contentRef.current) {
      onContentRef(contentRef.current)
    }
  }, [onContentRef])

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
  const lastDragProgressRef = useRef<{
    ofId: string
    lineCode: string
    col: number
    iso: string
  } | null>(null)

  // ── pragmatic-dnd monitor ──
  useEffect(() => {
    const cleanupMonitor = monitorForElements({
      canMonitor: ({ source }) => source.data.type === 'of-card',
      onDragStart: ({ source }) => {
        setDraggedNumOf(source.data.numOf as string)
      },
      onDropTargetChange: ({ source, location }) => {
        const target = location.current.dropTargets[0]
        if (!target || !onOfDragProgress) return

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
            if (h && onOfDragProgress) {
              onOfDragProgress(h.ofId, h.lineCode, h.col, h.iso)
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

          const dateFin = translateOfDateFin?.(num, iso)
          store.moveCard(num, lineCode, col, iso, dateFin ?? undefined)
          onOfDropped?.(num, iso, dateFin ?? undefined)
        } else {
          // Drop hors grille (dropEffect === 'none')
          onOfDragCancelled?.()
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
  }, [store, onOfDragProgress, onOfDropped, onOfDragCancelled, translateOfDateFin])

  const dayLoad = useMemo(() => computeDayLoad(store), [store])

  return (
    <div ref={rootRef} data-board-root className="h-full overflow-auto bg-background">
      <div ref={contentRef} className="relative" style={{ minWidth }}>
        {/* ═══ En-tête collant (semaines + jours) ═══ */}
        <div className="sticky top-0 z-30 bg-background shadow-float">
          {/* Bande semaines */}
          <div className="grid" style={{ gridTemplateColumns: gridTpl }}>
            <div className="sticky left-0 z-40 border-b border-rule bg-secondary" />
            {weekRanges.map((wr, i) => (
              <div
                key={wr.week}
                className="flex items-baseline gap-2.5 border-b border-r border-rule bg-secondary px-3.5 py-1.5"
                style={{ gridColumn: `span ${wr.to - wr.from}` }}
              >
                {/* Repère de structure, pas un marqueur : la marque est
                    « d'usage rare » et peignait ici un libellé qui se répète à
                    chaque semaine de l'horizon. Mono capitales, comme les
                    autres en-têtes du board. */}
                <span className="font-mono text-2xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
                  Semaine {wr.week}
                </span>
                {weekTotals[i] && (
                  <span className="ml-auto font-mono text-xs font-bold tabular-nums text-foreground">
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
            {/* Aujourd'hui : un CHANGEMENT DE SURFACE plus un repère vertical,
                jamais un fond de marque. « L'orange est un accent de marque, il
                ne peint jamais un fond de bloc » (design system, §01) — et un
                lavis orange sur toute la hauteur du board, c'est le plus grand
                bloc de la page. Le filet gauche en `--brand` est le seul usage
                de la marque ici : un repère, comme la règle verticale d'un
                graphique. */}
            {days.map((day, di) => (
              <div
                key={di}
                className={cn(
                  'border-b border-r border-rule-soft bg-card px-2.5 py-1.5 text-center',
                  day.today && 'border-l-2 border-l-brand bg-muted'
                )}
              >
                <div
                  className={cn(
                    'font-mono text-2xs font-bold tracking-[0.1em]',
                    day.today ? 'text-foreground' : 'text-muted-foreground'
                  )}
                >
                  {day.short.replace(/\s*\d+\s*$/, '')}
                </div>
                {/* Ni serif display ni italique : le quantième est un nombre,
                    il se lit dans la chasse fixe comme tous les autres. */}
                <div
                  className={cn(
                    'font-mono text-sm leading-none tracking-tight tabular-nums text-foreground',
                    day.today ? 'font-bold' : 'font-semibold'
                  )}
                >
                  {dayNum(di)}
                </div>
                {/* La charge du jour est une MESURE : encre neutre. En marque,
                    elle occupait toutes les colonnes — l'accent le plus rare du
                    thème répété trente fois — et noyait le repère du jour. */}
                <div
                  className={cn(
                    'mt-0.5 font-mono text-xs font-bold tabular-nums',
                    (dayLoad[di] ?? 0) > 0 ? 'text-foreground' : 'text-muted-foreground/60'
                  )}
                >
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
              <FlaskConical size={15} strokeWidth={1.75} className="text-brand" />
              <span className="font-mono text-2xs font-semibold text-brand">Virtuelles</span>
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
      {/* Trois blocs, séparés par un filet plutôt que par du vide : identité,
          charge, équilibrage PP_830. Empilés à `gap-1.5` uniforme, ils se
          lisaient comme une seule coulée de six mesures sans hiérarchie. */}
      <div className="sticky left-0 z-20 flex flex-col overflow-hidden border-r border-rule bg-card px-3.5 py-3">
        <div
          className={cn(
            'flex items-baseline gap-2',
            onLineEngagement && 'cursor-pointer transition-colors hover:[&_.line-code]:text-brand'
          )}
          onClick={() => onLineEngagement?.(line.code)}
          title={onLineEngagement ? 'Engagement — OF fermes du poste' : undefined}
        >
          {/* Pas de pastille. `line.dot` vaut `'bg-emerald-500'` — une CLASSE
              Tailwind, servie ici à `style.background` : valeur CSS invalide,
              donc rien de peint depuis le portage. Il restait un carré de 8 px
              parfaitement transparent qui décalait le code du poste de 16 px
              vers la droite, seul bloc de l'en-tête à ne pas commencer sur
              l'axe `px-3.5`. Et il ne distinguait rien : le loader pose la
              même valeur sur toutes les lignes. */}
          <span className="line-code truncate font-mono text-cell-lg font-bold tracking-tight text-foreground transition-colors">
            {line.code}
          </span>
          {/* Le nom sur la même ligne que le code : c'est la même identité, et
              deux lignes lui donnaient le poids d'une seconde information. */}
          <span
            className="min-w-0 flex-1 truncate text-1.5xs leading-none text-muted-foreground"
            title={line.name}
          >
            {line.name}
          </span>
        </div>

        <ChargeHistogram weeks={charges} maxHours={maxLineHours} variant="line" class="mt-2.5" />

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
        // Colonne du jour : surface creusée + filet de marque à gauche, en
        // écho exact de son en-tête. Le lavis orange peignait ici la totalité
        // de la hauteur du board.
        props.isToday && 'border-l-2 border-l-brand bg-muted'
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
    if (f.st === 'blocked') return 'bad' as const
    return f.st === 'qc' ? ('qc' as const) : ('ok' as const)
  })
  const feasQcComponents = useBoardStore((s) => feasOf(s, card.id)?.qcComponents)
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
          <Check size={14} strokeWidth={1.75} />
        </span>
      )}
      {/* Badge d'état batch (spinner / ✓ / ✗) par OF */}
      {batchItem && (
        <span
          className={cn(
            'absolute right-1 top-1 z-10 flex size-4 items-center justify-center rounded-full text-card',
            batchItem.st === 'ok'
              ? 'bg-ferme'
              : batchItem.st === 'error'
                ? 'bg-destructive'
                : 'bg-brand'
          )}
          title={batchItem.msg}
        >
          {batchItem.st === 'ok' ? (
            <Check size={12} strokeWidth={1.75} />
          ) : batchItem.st === 'error' ? (
            <TriangleAlert size={12} strokeWidth={1.75} />
          ) : (
            <RefreshCw size={12} strokeWidth={1.75} className="animate-spin" />
          )}
        </span>
      )}
      <BoardCard
        variant="of"
        status={toStatus(card.status)}
        article={card.id}
        articleRef={card.article ?? undefined}
        poste={props.lineCode}
        title={card.title}
        hours={fmt(card.hours)}
        progress={parseProgress(card.metric)}
        feas={feas}
        feasQcComponents={feasQcComponents}
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
    /* Filet de séparation : l'équilibrage typologique est un second sujet, pas
       la suite de l'histogramme de charge. Sans lui, six mesures s'empilaient
       à intervalle constant et rien ne disait où l'une finissait. */
    <div className="mt-2.5 border-t border-rule-soft pt-2">
      <div className="flex h-[5px] overflow-hidden rounded-full bg-rule-soft">
        {pp830.chargeByTypo.map((t) => (
          <div key={t.typo} className="flex">
            <span
              className="block h-full"
              style={{
                width: seg(t.sans),
                background: TYPO_META[t.typo]?.color ?? 'var(--border)',
              }}
            />
            {t.bouche > 0 && (
              <span
                className="block h-full"
                style={{
                  width: seg(t.bouche),
                  background: TYPO_META[t.typo]?.light ?? 'var(--rule-soft)',
                }}
              />
            )}
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-2 gap-y-0.5 font-mono text-3xs font-bold uppercase tracking-wider">
        {pp830.chargeByTypo.map((t) => (
          <span key={t.typo} className="inline-flex items-center gap-1">
            <span className="inline-flex items-center gap-0.5">
              <span
                className="size-[6px] rounded-[1px]"
                style={{ background: TYPO_META[t.typo]?.color ?? 'var(--border)' }}
              />
              {t.bouche > 0 && (
                <span
                  className="size-[6px] rounded-[1px]"
                  style={{ background: TYPO_META[t.typo]?.light ?? 'var(--rule-soft)' }}
                />
              )}
            </span>
            <span className="text-muted-foreground">{TYPO_META[t.typo]?.label ?? t.typo}</span>
            {/* « 59 h » et non « 59H » : l'uppercase du libellé mordait sur
                l'unité, qui n'est pas un mot mais un symbole. */}
            <span className="normal-case tabular-nums text-foreground">{t.sans + t.bouche} h</span>
          </span>
        ))}
      </div>
      {pp830.stockBouchesHygro !== null && (
        /* Encre neutre, pas la marque : un stock est une donnée observée, la
           couleur d'action de la page ne lui appartient pas. */
        <div className="mt-1 flex items-baseline gap-1 font-mono text-3xs uppercase tracking-wider text-muted-foreground">
          <span>Bouches hygro</span>
          <span className="text-1.5xs font-bold normal-case tabular-nums text-foreground">
            {pp830.stockBouchesHygro}
          </span>
          <span className="normal-case">pcs</span>
        </div>
      )}
    </div>
  )
}

// ── Verdict de servabilité → ton visuel (issue #58, réutilise la palette #23). ──
const VERDICT_TONE: Record<string, { border: string; text: string; label: string }> = {
  on_time: { border: 'border-l-brand', text: 'text-brand', label: 'à temps' },
  stock: { border: 'border-l-brand', text: 'text-brand', label: 'à temps' },
  retard: { border: 'border-l-destructive', text: 'text-destructive', label: 'retard' },
  bloquee: { border: 'border-l-destructive', text: 'text-destructive', label: 'bloquée' },
  sans_couverture: {
    border: 'border-l-suggere',
    text: 'text-suggere',
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

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer?.setData('application/x-virtual-cmd', props.order.id)
        if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
      }}
      className={cn(
        'group relative rounded-[6px] border border-dashed border-brand/60 bg-card/80 px-1.5 py-1 leading-tight shadow-sm',
        'cursor-grab active:cursor-grabbing',
        tone?.border ?? ''
      )}
      title="Commande virtuelle — n'existe que dans le scénario"
    >
      <button
        type="button"
        className="absolute right-0.5 top-0.5 flex size-3.5 items-center justify-center rounded-full text-muted-foreground opacity-50 hover:text-destructive hover:opacity-100"
        onClick={(e) => {
          e.stopPropagation()
          props.onRemove?.(props.order.id)
        }}
        title="Retirer du scénario"
      >
        <X size={12} strokeWidth={1.75} />
      </button>
      <div className="flex items-baseline gap-1 whitespace-nowrap pr-3 font-mono text-2xs font-bold text-brand">
        <FlaskConical size={12} strokeWidth={1.75} className="flex-none self-center" />
        <span>
          {props.order.article} × {props.order.quantity}
        </span>
      </div>
      <div className="mt-0.5 flex items-center gap-1">
        <span className="flex-none font-fraunces text-2xs font-bold tabular-nums text-secondary-foreground">
          {fmtDay(props.order.date)}
        </span>
        {props.order.earliest && (
          <span className="flex-none rounded-full bg-brand-soft px-1 py-px font-mono text-3xs font-semibold text-brand">
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
              'ml-auto rounded-full bg-card px-1 py-px font-mono text-3xs font-semibold',
              tone.text
            )}
          >
            {tone.label}
            {props.order.joursRetard && ` +${props.order.joursRetard}j`}
          </span>
        )}
      </div>
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
