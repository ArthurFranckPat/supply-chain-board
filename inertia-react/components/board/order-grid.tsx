import { useMemo, useState, useCallback, useRef, useEffect, type CSSProperties } from 'react'
import { Undo2 } from 'lucide-react'
import { cn } from '@r/lib/utils'
import { usePrintFitPage } from '@r/lib/board/use-print-fit-page'
import { TYPO_META } from '@r/lib/board/types'
import type { OrderCard, OrderLineRow } from '@r/lib/orders/types'
import { BoardCard, type CardStatus } from './board-card'
import { ChargeHistogram, type ChargeWeek } from './charge-histogram'

/**
 * Grille du board — Planification (issue #10).
 *
 * Même charpente que <BoardGrid> (ordonnancement) : temps à l'horizontale,
 * un poste par ligne, en-tête collant (semaines + jours), colonne « Poste »
 * collante à gauche, cellules quadrillées. Cartes via <BoardCard variant="commande">.
 *
 * Spécificités planification : drag **en temps seul** (poste figé par la gamme),
 * override de date (liseré terra + bouton réinitialiser), filtres type/nature.
 * Ton liseré haut = nature : COMMANDE → ferme, PRÉVISION → suggéré.
 * Pastille = statut de l'OF alloué (matcher), distinct du peg contremarque.
 */

interface OrderGridProps {
  board: {
    cols: number
    days: Array<{ short: string; iso: string; today?: boolean }>
    weekSpans: Array<{ week: number; span: number }>
    lines: OrderLineRow[]
  }
  onSelectCard: (id: string) => void
  // Helpers depuis le store
  lineVisible: (lineCode: string) => boolean
  cardMatches: (card: OrderCard, lineCode: string) => boolean
  dayLoadSplit: () => { direct: number[]; amont: number[] }
  lineWeekLoads: (lineCode: string) => Array<{
    week: number
    direct: number
    induit: number
    hours: number
  }>
  feasOf: (id: string) => import('@r/lib/board/types').FeasStatus | undefined
  moveCard: (id: string, fromLineCode: string, toCol: number, toIso: string) => void
  resetOverride: (id: string) => void
}

const LABEL_W = 208
const GRAPH_PAPER =
  'linear-gradient(to right, rgba(0,0,0,.045) 1px, transparent 1px),' +
  'linear-gradient(to bottom, rgba(0,0,0,.045) 1px, transparent 1px)'

const fmt = (h: number) => (Math.round(h * 100) / 100).toFixed(2).replace('.', ',')

/** Hachure « induit » — tokens foreground, jamais rgba hors DESIGN.md. */
const INDUIT_HATCH: CSSProperties = {
  backgroundColor: 'color-mix(in oklab, var(--foreground) 18%, transparent)',
  backgroundImage:
    'repeating-linear-gradient(45deg, color-mix(in oklab, var(--foreground) 55%, transparent) 0 1.5px, transparent 1.5px 4px)',
}

function isoParts(iso: string): { y: string; month: string; day: string } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? { y: m[1], month: m[2], day: m[3] } : null
}

/** ISO → jj/mm/aaaa (écran). */
function isoFr(iso: string): string {
  const p = isoParts(iso)
  return p ? `${p.day}/${p.month}/${p.y}` : iso
}

/** Quantième ; jj/mm au 1er jour d'horizon et à chaque changement de mois. */
function dateHead(iso: string, prevIso: string | undefined): string {
  const p = isoParts(iso)
  if (!p) return ''
  const tick = !prevIso || prevIso.slice(0, 7) !== iso.slice(0, 7)
  return tick ? `${p.day}/${p.month}` : p.day
}

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

/** Histogramme hebdo d'une ligne : planifié = commandes directes, induit =
 *  besoin brut depth-1 (pas une carte), segment distinct. */
function lineCharge(
  line: OrderLineRow,
  lineWeekLoads: OrderGridProps['lineWeekLoads']
): ChargeWeek[] {
  return lineWeekLoads(line.code).map((wl) => ({
    week: wl.week,
    ferme: 0,
    planifie: wl.direct,
    suggere: 0,
    induit: wl.induit,
  }))
}

export function OrderGrid(props: OrderGridProps) {
  const { board, dayLoadSplit, lineWeekLoads } = props
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [dropCol, setDropCol] = useState<string | null>(null)
  const rootEl = useRef<HTMLDivElement>(null)

  usePrintFitPage(() => rootEl.current)

  // Colonnes par semaine (total hebdo + libellés).
  const weekRanges = useMemo(() => {
    let off = 0
    return board.weekSpans.map((ws) => {
      const range = { week: ws.week, from: off, to: off + ws.span }
      off += ws.span
      return range
    })
  }, [board.weekSpans])

  /** Une lecture : totaux semaine + cartes jour (évite 2×N appels). */
  const split = dayLoadSplit()
  const hasAmont = split.amont.some((h) => h > 0)
  const weekTotals = weekRanges.map((wr) => {
    let s = 0
    for (let c = wr.from; c < wr.to; c++) s += (split.direct[c] ?? 0) + (split.amont[c] ?? 0)
    return { week: wr.week, hours: Math.round(s * 100) / 100 }
  })

  /** Échelle commune des histogrammes (total hebdo max, toutes lignes). */
  const maxLineHours = useMemo(() => {
    let m = 0
    for (const line of board.lines) {
      for (const cw of lineCharge(line, lineWeekLoads)) {
        const t = cw.ferme + cw.planifie + cw.suggere + cw.induit
        if (t > m) m = t
      }
    }
    return m || 1
  }, [board.lines, lineWeekLoads])

  const gridTpl = `${LABEL_W}px repeat(${board.cols}, minmax(150px, 1fr))`
  const minWidth = `calc(${LABEL_W}px + ${board.cols * 160}px)`

  // Gestion du drop avec drag and drop HTML5 natif
  const handleDragOver = useCallback(
    (e: React.DragEvent, cellKey: string) => {
      if (!draggedId) return
      e.preventDefault()
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
      setDropCol(cellKey)
    },
    [draggedId]
  )

  const handleDrop = useCallback(
    (e: React.DragEvent, cellKey: string, lineCode: string, iso: string) => {
      const id = draggedId
      setDropCol(null)
      if (!id) return
      e.preventDefault()
      props.moveCard(id, lineCode, parseInt(cellKey.split(':')[1]), iso)
    },
    [draggedId, props]
  )

  const handleDragStart = useCallback(
    (e: React.DragEvent, id: string, card: OrderCard, lineCode: string) => {
      if (card.hasOverride || card.induit) {
        e.preventDefault()
        return
      }
      setDraggedId(id)
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', id)
      }
    },
    []
  )

  const handleDragEnd = useCallback(() => {
    setDraggedId(null)
    setDropCol(null)
  }, [])

  const handleResetOverride = useCallback(
    (e: React.MouseEvent, id: string) => {
      e.preventDefault()
      e.stopPropagation()
      props.resetOverride(id)
    },
    [props]
  )

  return (
    <div ref={rootEl} data-board-root className="h-full overflow-auto bg-background">
      <div style={{ minWidth }}>
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
                {/* Cf. board-grid : repère de structure, encre neutre. */}
                <span className="font-mono text-2xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
                  Semaine {wr.week}
                </span>
                {weekTotals[i] && (
                  <span className="ml-auto font-mono text-xs font-bold tabular-nums text-foreground">
                    {fmt(weekTotals[i]!.hours)} h
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* En-tête jours */}
          <div className="grid" style={{ gridTemplateColumns: gridTpl }}>
            <div className="sticky left-0 z-40 flex flex-col gap-1 border-b border-r border-rule bg-card px-3.5 py-2">
              <span className="font-mono text-2xs font-bold tracking-[0.12em] text-muted-foreground">
                Poste de charge
              </span>
              <span className="font-mono text-1.5xs text-muted-foreground">Σ postes visibles</span>
              {hasAmont && (
                <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-1.5xs font-medium text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <span className="size-[7px] rounded-[1px] bg-foreground" />
                    directe
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="size-[7px] rounded-[1px]" style={INDUIT_HATCH} />
                    induit
                  </span>
                </span>
              )}
            </div>
            {board.days.map((day, di) => {
              const directe = split.direct[di] ?? 0
              const amont = split.amont[di] ?? 0
              const total = directe + amont
              const showSplit = amont > 0
              const hoursLabel =
                total <= 0
                  ? 'aucune charge'
                  : showSplit
                    ? `${fmt(total)} h, ${fmt(directe)} directe, ${fmt(amont)} induit`
                    : `${fmt(total)} h`
              return (
                <div
                  key={di}
                  aria-current={day.today ? 'date' : undefined}
                  title={`${isoFr(day.iso)} — ${hoursLabel} (somme des postes visibles)`}
                  className={cn(
                    'border-b border-r border-rule-soft bg-card px-2.5 py-1.5 text-center',
                    // Même repère qu'en vue OF : surface creusée + filet de
                    // marque, jamais un lavis orange sur toute la hauteur.
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
                  <div
                    className={cn(
                      'font-mono text-sm leading-none tracking-tight tabular-nums text-foreground',
                      day.today ? 'font-bold' : 'font-semibold'
                    )}
                  >
                    {dateHead(day.iso, board.days[di - 1]?.iso)}
                  </div>
                  {/* Charge jour : un chiffre si tout-direct (pattern OF).
                      Split + barre seulement s'il y a de l'induit. */}
                  <div className="mt-0.5">
                    {total > 0 ? (
                      <div className="font-mono text-xs font-bold tabular-nums text-foreground">
                        {fmt(total)}
                        <span className="ml-0.5 text-2xs font-medium text-muted-foreground">h</span>
                      </div>
                    ) : (
                      <div className="font-mono text-xs tabular-nums text-muted-foreground/60">
                        —
                      </div>
                    )}
                    {showSplit && (
                      <>
                        <div className="flex items-baseline justify-center gap-1 font-mono text-1.5xs tabular-nums text-muted-foreground">
                          <span>dir. {fmt(directe)}</span>
                          <span>+{fmt(amont)} induit</span>
                        </div>
                        <div
                          className="mt-0.5 flex h-[5px] overflow-hidden rounded-full bg-rule-soft"
                          aria-hidden
                        >
                          <span
                            className="block h-full bg-foreground"
                            style={{ width: `${(directe / total) * 100}%` }}
                          />
                          <span
                            className="block h-full"
                            style={{
                              width: `${(amont / total) * 100}%`,
                              ...INDUIT_HATCH,
                            }}
                          />
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* ═══ Rangées de postes ═══ */}
        {board.lines.map((line) => {
          const visible = props.lineVisible(line.code)
          return (
            <div
              key={line.code}
              className="grid border-b border-rule-soft"
              style={{
                gridTemplateColumns: gridTpl,
                display: visible ? 'grid' : 'none',
              }}
            >
              {/* En-tête de poste (collant à gauche) */}
              <div className="sticky left-0 z-20 flex flex-col gap-1.5 overflow-hidden border-r border-rule bg-card px-3.5 py-3">
                {/* Pastille retirée (cf. board-grid) : `line.dot` est une
                    classe Tailwind passée à `style.background`, jamais peinte,
                    et elle décalait le code du poste hors de l'axe px-3.5. */}
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[13px] font-bold tracking-tight text-foreground">
                    {line.code}
                  </span>
                </div>
                <span className="text-[11px] leading-tight text-muted-foreground">{line.name}</span>
                <ChargeHistogram
                  weeks={lineCharge(line, props.lineWeekLoads)}
                  maxHours={maxLineHours}
                  variant="line"
                />
                {/* PP_830 — équilibrage (issue #42) : barre empilée typo
                    (plein = sans bouche, clair = consomme bouche) + stock bouches hygro. */}
                {line.pp830 && (
                  <div className="mt-1.5">
                    <div className="flex h-[6px] overflow-hidden rounded-full bg-rule-soft">
                      {line.pp830?.chargeByTypo.map((t) => (
                        <div key={t.typo}>
                          <span
                            className="block h-full"
                            style={{
                              width: `${((t.sans + t.bouche) / (line.pp830?.chargeByTypo ?? []).reduce((s, x) => s + x.sans + x.bouche, 0)) * 100}%`,
                              background: TYPO_META[t.typo]?.color ?? 'var(--border)',
                            }}
                          />
                          {t.bouche > 0 && (
                            <span
                              className="block h-full"
                              style={{
                                width: `${(t.bouche / (line.pp830?.chargeByTypo ?? []).reduce((s, x) => s + x.sans + x.bouche, 0)) * 100}%`,
                                background: TYPO_META[t.typo]?.light ?? 'var(--rule-soft)',
                              }}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 font-mono text-[9px] font-bold uppercase tracking-wider">
                      {line.pp830?.chargeByTypo.map((t) => (
                        <span key={t.typo} className="inline-flex items-center gap-1">
                          <span className="inline-flex items-center gap-0.5">
                            <span
                              className="size-[7px] rounded-[1px]"
                              style={{ background: TYPO_META[t.typo]?.color ?? 'var(--border)' }}
                            />
                            {t.bouche > 0 && (
                              <span
                                className="size-[7px] rounded-[1px]"
                                style={{
                                  background: TYPO_META[t.typo]?.light ?? 'var(--rule-soft)',
                                }}
                              />
                            )}
                          </span>
                          <span className="text-muted-foreground">
                            {TYPO_META[t.typo]?.label ?? t.typo}
                          </span>
                          <span className="tabular-nums text-foreground">{t.sans + t.bouche}h</span>
                        </span>
                      ))}
                    </div>
                    {line.pp830.stockBouchesHygro !== null && (
                      <div className="mt-1 flex items-baseline gap-1 text-[10px] text-muted-foreground">
                        <span>Bouches hygro</span>
                        <span
                          className="font-fraunces text-[14px] font-bold tabular-nums"
                          style={{ color: 'var(--color-brand)' }}
                        >
                          {line.pp830.stockBouchesHygro}
                        </span>
                        <span>pcs</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Cellules */}
              {line.dayCells.map((dc, ci) => {
                const cellKey = `${line.code}:${ci}`
                const isToday = board.days[ci]?.today
                return (
                  <div
                    key={ci}
                    className={cn(
                      'relative flex min-h-[96px] flex-col gap-2 border-r border-rule-soft bg-card p-2',
                      isToday && 'border-l-2 border-l-brand bg-muted',
                      dropCol === cellKey && 'ring-2 ring-brand/70 ring-inset'
                    )}
                    style={{
                      backgroundImage: isToday ? undefined : GRAPH_PAPER,
                      backgroundSize: '22px 22px',
                    }}
                    onDragOver={(e) => handleDragOver(e, cellKey)}
                    onDrop={(e) => handleDrop(e, cellKey, line.code, dc.iso)}
                  >
                    {dc.cards.map((card) => (
                      <CardView
                        key={card.id}
                        card={card}
                        line={line}
                        onSelectCard={props.onSelectCard}
                        matches={props.cardMatches(card, line.code)}
                        feas={(() => {
                          const f = props.feasOf(card.id)
                          if (!f) return undefined
                          if (f.st === 'blocked') return 'bad' as const
                          return f.st === 'qc' ? ('qc' as const) : ('ok' as const)
                        })()}
                        feasQcComponents={props.feasOf(card.id)?.qcComponents}
                        alert={(() => {
                          const f = props.feasOf(card.id)
                          return f && f.st === 'blocked' && f.missing.length
                            ? `Rupture ${f.missing.join(', ')}`
                            : undefined
                        })()}
                        onDragStart={(e) => handleDragStart(e, card.id, card, line.code)}
                        onDragEnd={handleDragEnd}
                        onResetOverride={handleResetOverride}
                      />
                    ))}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}

interface CardViewProps {
  card: OrderCard
  line: OrderLineRow
  onSelectCard: (id: string) => void
  matches: boolean
  feas?: 'ok' | 'qc' | 'bad'
  /** Composants sous CQ à faire libérer (infobulle du badge `qc`). */
  feasQcComponents?: Record<string, number>
  alert?: string
  onDragStart: (e: React.DragEvent, id: string, card: OrderCard, lineCode: string) => void
  onDragEnd: () => void
  onResetOverride: (e: React.MouseEvent, id: string) => void
}

function CardView(props: CardViewProps) {
  const { card } = props
  const ghost = !!card.induit
  return (
    <div
      role="button"
      tabIndex={props.matches && !ghost ? 0 : -1}
      draggable={props.matches && !card.hasOverride && !ghost}
      data-order-id={card.id}
      className={cn(
        'relative transition-opacity',
        ghost ? 'cursor-default' : 'cursor-pointer',
        !props.matches && 'pointer-events-none opacity-15'
      )}
      onClick={() => {
        if (props.matches && !ghost) props.onSelectCard(card.id)
      }}
      onDragStart={(e) => props.onDragStart(e, card.id, card, props.line.code)}
      onDragEnd={props.onDragEnd}
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
        nature={card.nature}
        hours={fmt(card.hours)}
        mod={card.hasOverride}
        consommeBouche={card.consommeBouche}
        typologie={card.typologie}
        qty={card.qty}
        induit={ghost}
        ofStatus={ghost ? null : (card.ofStatus ?? null)}
        feas={props.feas}
        feasQcComponents={props.feasQcComponents}
        alert={props.alert}
      />
      {/* Override : bouton réinitialiser (date X3 d'origine) */}
      {card.hasOverride && (
        <button
          type="button"
          className="absolute right-1.5 top-1.5 z-10 flex size-5 items-center justify-center rounded-full bg-card text-suggere transition-colors hover:text-foreground"
          title="Réinitialiser l'override (date X3)"
          onClick={(e) => props.onResetOverride(e, card.id)}
        >
          <Undo2 size={13} strokeWidth={1.75} />
        </button>
      )}
    </div>
  )
}

export default OrderGrid
