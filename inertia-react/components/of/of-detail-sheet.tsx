/**
 * THESIS: overlay de verdict compact ; la nomenclature n'apparaît que sur
 * demande. Refuse le drawer-document 72 vh plein largeur.
 * OWN-WORLD: tokens Cursor — encre #141414, danger #be1744, 13 px, radius 8.
 * STORY: le planner voit le produit, le manquant, un CTA honnête, et affermitt
 * ou passe. « Couverture » descend la chaîne (réceptions CA, OF couvrants,
 * CQ) — distinct du BOM 1 niveau, distinct de /approvisionnements.
 * FIRST VIEWPORT: sheet 640 px — titre, méta, tableau des ruptures, pied.
 * Le reste de la BOM : « N autres » sous le tableau, pas un bouton de pied.
 * FORM: mix B+C (verdict overlay → desk sheet). FINISH: unreviewed and
 * undocumented is unfinished; this build ends with the finish review, the
 * verdict, and DESIGN.md
 *
 * Orchestre : fetch du détail + diagnostic (lazy), état (vue, affermissement,
 * confirmation rupture). Vues déléguées : <OfDiagnosticTree>, <OfFirmAction>.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { router } from '@inertiajs/react'

import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@r/components/ui/sheet'
import { LoadingState } from '@r/components/ui/loading-state'
import { Badge } from '@r/components/ui/badge'
import { Button } from '@r/components/ui/button'
import { DataTable, type ColumnDef, type SortingState } from '@r/components/ui/data-table'
import {
  CellNumber,
  CellVerdict,
  TableCell,
  TableHead,
  TableHeadRow,
  TableRow,
  TONE_TEXT,
  rowToneClass,
  type RowTone,
} from '@r/components/ui/table-row'
import { cn } from '@r/lib/utils'
import {
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  CircleCheck,
  CircleX,
  FlaskConical,
  TriangleAlert,
} from 'lucide-react'
import type { OfDetail, BomRow } from '@r/lib/of/types'
import { type DiagResult } from '@r/lib/of/diagnostic-types'
import { route } from '@r/lib/routes'
import { X3Link } from '@r/components/x3-link'
import { OfDiagnosticTree } from './of-diagnostic-tree'
import { OfFirmAction } from './of-firm-action'
import { OfPrintVerdict, OfReprintButton, type PrintReport } from './of-print-verdict'

type SheetView = 'verdict' | 'bom' | 'diagnostic'

/** ISO YYYY-MM-DD → jj/mm/aaaa. */
function fmtLivraison(iso: string | null): string {
  if (!iso) return ''
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso
}

/** Champs X3 vides concaténés (« - - - - », « -PRE ») — on les retire. */
function cleanTitle(raw: string): string {
  return raw
    .split(/\s+/)
    .filter((t) => t.length > 0 && !/^[-–—]+$/.test(t))
    .map((t) => t.replace(/^[-–—]+/, ''))
    .filter(Boolean)
    .join(' ')
    .trim()
}

function shortageQty(value: string | null | undefined): string {
  return (value ?? '').replace(/^[−\-–—]+/, '')
}

/** Rupture = danger ; CQ seul = warn. OK sans CQ = neutre. */
function bomRowTone(row: BomRow): RowTone {
  if (!row.ok) return 'critical'
  if (row.qc) return 'warning'
  return null
}

function fmtCycle(start: string, end: string): string {
  if (!start || start === '—') return '—'
  if (!end || end === start) return start
  return `${start} → ${end}`
}

function qtyScan(value: string | undefined): string | null {
  if (!value || value === '—') return null
  const m = /^(\d+(?:[.,]\d+)?)\s*\/\s*(\d+(?:[.,]\d+)?)$/.exec(value.trim())
  const qty = m ? (Number(m[1].replace(',', '.')) > 0 ? `${m[1]}/${m[2]}` : m[2]) : value
  return `${qty} pces`
}

function timeScan(value: string | undefined): string | null {
  if (!value || value === '—') return null
  return value
}

function consumedPositive(row: BomRow): boolean {
  if (row.consumed == null || row.required == null) return false
  const n = Number(String(row.consumed).replace(',', '.'))
  return Number.isFinite(n) && n > 0
}

function compactEdge(i: number, last: number): string {
  return cn('px-2! py-1!', i === 0 && 'pl-0!', i === last && 'pr-0!')
}

const SHEET_EASE = 'cubic-bezier(0.2, 0.7, 0.2, 1)'
const SHEET_HEIGHT_MS = 320

function reducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** `h-auto` → `56vh` : CSS ne peut pas. Mesure, lock px, WAAPI, unlock. */
function animateHeight(el: HTMLElement, from: number, to: number): Promise<boolean> {
  el.getAnimations().forEach((a) => a.cancel())
  if (reducedMotion() || Math.abs(from - to) < 1) {
    el.style.height = ''
    return Promise.resolve(false)
  }
  const anim = el.animate([{ height: `${from}px` }, { height: `${to}px` }], {
    duration: SHEET_HEIGHT_MS,
    easing: SHEET_EASE,
    fill: 'forwards',
  })
  return anim.finished
    .then(() => {
      el.style.height = `${to}px`
      anim.cancel()
      return true
    })
    .catch(() => false)
}

function commandeTitle(commandes: OfDetail['commandes']): string {
  return (commandes ?? [])
    .map((c) => {
      const liv = fmtLivraison(c.livraisonIso)
      return [c.numCommande, c.ligne ? `L${c.ligne}` : null, liv ? `exp. ${liv}` : null]
        .filter(Boolean)
        .join(' · ')
    })
    .join(' · ')
}

export function OfDetailSheet(props: {
  num: string | null
  open: boolean
  onOpenChange: (v: boolean) => void
  /** Appelé après affermissement réussi (n° origine + n° OF créé) pour une mise
   *  à jour optimiste du board (transformation de la carte en place). */
  onFirmed?: (oldNum: string, newMfgNum: string) => void
}) {
  const [view, setView] = useState<SheetView>('verdict')
  const [diagRequested, setDiagRequested] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const compactHeightRef = useRef(0)
  const pendingExpand = useRef(false)
  const animGen = useRef(0)

  const [detail, setDetail] = useState<OfDetail | null>(null)
  const [detailError, setDetailError] = useState(false)

  const [diag, setDiag] = useState<DiagResult | null>(null)
  const [diagLoading, setDiagLoading] = useState(false)
  const [diagError, setDiagError] = useState<string | null>(null)

  const [firming, setFirming] = useState(false)
  const [firmMsg, setFirmMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [printMsg, setPrintMsg] = useState<PrintReport | null>(null)
  const [confirmRupture, setConfirmRupture] = useState(false)

  const fetchDetail = useCallback(async (num: string) => {
    setDetailError(false)
    try {
      const res = await fetch(route('scheduler.of_detail', { of: num }))
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setDetail((await res.json()) as OfDetail)
    } catch {
      setDetailError(true)
    }
  }, [])

  useEffect(() => {
    animGen.current += 1
    pendingExpand.current = false
    setView('verdict')
    setDiagRequested(false)
    setDiag(null)
    setFirmMsg(null)
    setPrintMsg(null)
    setConfirmRupture(false)
    setDetail(null)
    const panel = panelRef.current
    if (panel) {
      panel.getAnimations().forEach((a) => a.cancel())
      panel.style.height = ''
    }
    if (props.open && props.num) void fetchDetail(props.num)
  }, [props.num, props.open, fetchDetail])

  useEffect(() => {
    if (!diagRequested || !props.open || !props.num || diag) return
    let cancelled = false
    setDiagLoading(true)
    setDiagError(null)
    fetch(route('planning_board.of_materials_diagnostic', { of: props.num }))
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json() as Promise<DiagResult>
      })
      .then((r) => {
        if (!cancelled) setDiag(r)
      })
      .catch(() => {
        if (!cancelled) setDiagError('La requête a échoué.')
      })
      .finally(() => {
        if (!cancelled) setDiagLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [diagRequested, props.open, props.num, diag])

  const isSuggestion = (detail?.statusLabel ?? '').toLowerCase().includes('sugg')
  const rupturedComponents = (detail?.bom ?? []).filter((r) => !r.ok)
  const hasRuptures = rupturedComponents.length > 0
  const qcRows = (detail?.bom ?? []).filter((r) => r.qc)
  const restCount = (detail?.bom ?? []).length - rupturedComponents.length
  const canFirm = (() => {
    if (firmMsg?.ok) return false
    const s = (detail?.statusLabel ?? '').toLowerCase()
    return s.includes('sugg') || s.includes('plan')
  })()

  const firm = () => {
    if (hasRuptures && !confirmRupture) {
      setConfirmRupture(true)
      return
    }
    void doFirm()
  }

  const doFirm = async () => {
    const d = detail
    if (!d) return
    setConfirmRupture(false)
    setFirming(true)
    setFirmMsg(null)
    try {
      const url = isSuggestion
        ? route('planning.suggestion_firm', { sugNum: d.num })
        : route('planning.order_firm', { orderNum: d.num })
      const res = await fetch(url, { method: 'POST' })
      const data = (await res.json()) as {
        ok: boolean
        mfgNum?: string
        error?: string
        print?: PrintReport
      }
      if (data.ok && data.mfgNum) {
        setFirmMsg({ ok: true, text: `OF ${data.mfgNum} affermi` })
        if (data.print) setPrintMsg({ ...data.print, documents: data.print.documents ?? [] })
        props.onFirmed?.(d.num, data.mfgNum)
        await fetchDetail(data.mfgNum)
        setTimeout(() => router.reload(), 2000)
      } else {
        setFirmMsg({ ok: false, text: data.error ?? 'Affermissement refusé par X3.' })
      }
    } catch (e) {
      setFirmMsg({ ok: false, text: (e as Error).message })
    } finally {
      setFirming(false)
    }
  }

  const goTo = (next: SheetView) => {
    if (next === view) return
    animGen.current += 1
    const el = panelRef.current
    if (!el || reducedMotion()) {
      pendingExpand.current = false
      setView(next)
      if (el) el.style.height = ''
      return
    }

    if (view === 'verdict' && next !== 'verdict') {
      compactHeightRef.current = el.getBoundingClientRect().height
      pendingExpand.current = true
      setView(next)
      return
    }

    if (view !== 'verdict' && next === 'verdict') {
      const from = el.getBoundingClientRect().height
      const to = compactHeightRef.current
      if (to < 1) {
        setView('verdict')
        el.style.height = ''
        return
      }
      const gen = animGen.current
      void animateHeight(el, from, to).then(() => {
        if (gen !== animGen.current) return
        setView('verdict')
      })
      return
    }

    setView(next)
  }

  useLayoutEffect(() => {
    const el = panelRef.current
    if (!el) return
    if (!pendingExpand.current) {
      if (view === 'verdict') el.style.height = ''
      return
    }
    pendingExpand.current = false
    const gen = animGen.current
    const from = compactHeightRef.current
    const to = Math.round(window.innerHeight * 0.56)
    void animateHeight(el, from, to).then(() => {
      if (gen !== animGen.current) return
      el.style.height = ''
    })
  }, [view])

  const openDiagnostic = () => {
    setDiagRequested(true)
    goTo('diagnostic')
  }

  const statusVariant = (label: string) =>
    label === 'Ferme' ? 'success' : label === 'Suggéré' ? 'warning' : 'secondary'

  const d = detail
  const commandes = d?.commandes ?? []
  const clientLabel = [
    ...new Set(commandes.map((c) => c.client).filter((c): c is string => Boolean(c))),
  ].join(' · ')
  const qtyLabel = d ? qtyScan(d.stats.find((s) => s.label === 'Qté')?.value) : null
  const hoursLabel = d ? timeScan(d.stats.find((s) => s.label === 'Temps')?.value) : null
  const expanded = view !== 'verdict'
  const showPrintBar = !canFirm && d?.statusLabel === 'Ferme'
  const showNav =
    !!d && (view === 'bom' || view === 'diagnostic' || (view === 'verdict' && hasRuptures))
  const showFirmChrome =
    Boolean(firmMsg) || Boolean(printMsg && (canFirm || d?.statusLabel !== 'Ferme')) || canFirm

  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent
        side="bottom"
        className="flex w-full max-w-none flex-col gap-0 p-0 data-[side=bottom]:mx-auto data-[side=bottom]:h-auto data-[side=bottom]:max-w-[640px]"
      >
        <div
          ref={panelRef}
          className={cn(
            'flex min-h-0 w-full flex-col overflow-hidden',
            expanded ? 'h-[56vh]' : 'h-auto'
          )}
        >
          {!d ? (
            detailError ? (
              <div className="flex flex-col items-center justify-center gap-3 p-10 text-center">
                <CircleX size={28} strokeWidth={1.75} className="text-destructive" />
                <span className="text-sm font-medium text-destructive">
                  Échec du chargement du détail.
                </span>
                {props.num && (
                  <Button size="sm" variant="outline" onClick={() => void fetchDetail(props.num!)}>
                    Réessayer
                  </Button>
                )}
              </div>
            ) : (
              <LoadingState
                variant="orb"
                compact
                title="Chargement de l'ordre de fabrication…"
                description="Récupération des détails et des composants"
              />
            )
          ) : (
            <>
              <header className="flex flex-col gap-3 px-5 pb-3 pt-4 pr-14">
                <div className="flex flex-col gap-1">
                  <SheetTitle className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-[15px] font-normal leading-snug text-foreground">
                    {d.article && cleanTitle(d.title) !== d.article ? (
                      <X3Link
                        fonction="GESITM"
                        cle={d.article}
                        title={`Ouvrir l'article ${d.article} dans Sage X3`}
                        className="shrink-0 font-mono text-[15px] font-normal text-foreground"
                      >
                        {d.article}
                      </X3Link>
                    ) : null}
                    <span className="line-clamp-2 min-w-0">{cleanTitle(d.title)}</span>
                  </SheetTitle>
                  <SheetDescription className="sr-only">
                    Détail de l&apos;ordre {d.num}
                  </SheetDescription>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                    {isSuggestion ? (
                      <span className="font-mono">{d.num}</span>
                    ) : (
                      <X3Link
                        fonction="GESMFG"
                        cle={d.num}
                        title={`Ouvrir l'OF ${d.num} dans Sage X3`}
                        className="font-mono text-muted-foreground"
                      >
                        {d.num}
                      </X3Link>
                    )}
                    <Badge
                      variant={statusVariant(d.statusLabel)}
                      className="uppercase tracking-wide"
                    >
                      {d.statusLabel}
                    </Badge>
                    {d.progressPct > 0 && (
                      <span className="font-mono text-1.5xs">{d.progressPct} %</span>
                    )}
                  </div>
                </div>
                <table className="w-full table-fixed">
                  <thead>
                    <TableHeadRow>
                      {['Quantité', 'Ligne', 'Charge', 'Lancement', 'Commande', 'Client'].map(
                        (label, i) => (
                          <TableHead key={label} className={compactEdge(i, 5)}>
                            {label}
                          </TableHead>
                        )
                      )}
                    </TableHeadRow>
                  </thead>
                  <tbody>
                    <TableRow>
                      <TableCell className={compactEdge(0, 5)}>
                        <CellNumber
                          value={qtyLabel ?? '—'}
                          emphasis="plain"
                          className="text-xs font-medium"
                        />
                      </TableCell>
                      <TableCell
                        className={compactEdge(1, 5)}
                        title={
                          d.posteCode && d.context && d.context !== d.posteCode
                            ? d.context
                            : undefined
                        }
                      >
                        <span className="font-mono text-xs font-medium text-foreground">
                          {d.posteCode || d.context || '—'}
                        </span>
                      </TableCell>
                      <TableCell className={compactEdge(2, 5)}>
                        <CellNumber
                          value={hoursLabel ?? '—'}
                          emphasis="plain"
                          className="text-xs font-medium"
                        />
                      </TableCell>
                      <TableCell
                        className={compactEdge(3, 5)}
                        title={
                          d.cycle.start && d.cycle.start !== '—'
                            ? [
                                fmtCycle(d.cycle.start, d.cycle.end),
                                d.operator.name !== 'Non assigné'
                                  ? `Créé ${d.createdAt} · ${d.operator.name}`
                                  : `Créé ${d.createdAt}`,
                              ].join(' · ')
                            : undefined
                        }
                      >
                        <CellNumber
                          value={d.cycle.start && d.cycle.start !== '—' ? d.cycle.start : '—'}
                          emphasis="plain"
                          className="text-xs font-medium"
                        />
                      </TableCell>
                      <TableCell
                        className={compactEdge(4, 5)}
                        title={commandes.length > 0 ? commandeTitle(commandes) : undefined}
                      >
                        {commandes.length > 0 ? (
                          <span className="inline-flex items-center gap-1">
                            <X3Link
                              fonction="GESSOH"
                              cle={commandes[0].numCommande}
                              title={`Ouvrir la commande ${commandes[0].numCommande} dans Sage X3`}
                              className="font-mono text-xs font-medium text-foreground"
                            >
                              {commandes[0].numCommande}
                            </X3Link>
                            {commandes.length > 1 ? (
                              <span className="text-muted-foreground">+{commandes.length - 1}</span>
                            ) : null}
                          </span>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell className={compactEdge(5, 5)}>
                        <span className="truncate text-xs text-foreground">
                          {clientLabel || '—'}
                        </span>
                      </TableCell>
                    </TableRow>
                  </tbody>
                </table>
              </header>

              {(view === 'bom' ||
                view === 'diagnostic' ||
                (view === 'verdict' &&
                  (hasRuptures ||
                    d.bom.length === 0 ||
                    (rupturedComponents.length === 0 && qcRows.length === 0)))) && (
                <div
                  className={cn(
                    'min-h-0 px-5 py-2',
                    view === 'bom' || (view === 'verdict' && hasRuptures)
                      ? 'overflow-hidden'
                      : 'overflow-auto',
                    (view === 'bom' || view === 'diagnostic') && 'flex-1'
                  )}
                >
                  {view === 'verdict' && hasRuptures && (
                    <BomTable
                      bom={rupturedComponents}
                      compact
                      moreCount={restCount}
                      onMore={restCount > 0 ? () => goTo('bom') : undefined}
                    />
                  )}
                  {view === 'verdict' && !hasRuptures && (
                    <VerdictBody
                      bomCount={d.bom.length}
                      onShowBom={d.bom.length > 0 ? () => goTo('bom') : undefined}
                    />
                  )}
                  {view === 'bom' && <BomTable bom={d.bom} />}
                  {view === 'diagnostic' &&
                    (diagLoading ? (
                      <LoadingState
                        variant="orb"
                        orbState="solving"
                        compact
                        title="Couverture…"
                        description="Réceptions prévues, sous-ensembles, stock sous contrôle"
                      />
                    ) : diagError ? (
                      <div className="flex flex-col items-center gap-3 py-8 text-center">
                        <CircleX size={22} strokeWidth={1.75} className="text-destructive" />
                        <span className="text-cell-lg font-medium text-destructive">
                          La couverture n&apos;a pas pu être chargée.
                        </span>
                        <span className="max-w-sm text-xs text-muted-foreground">{diagError}</span>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setDiag(null)
                            setDiagRequested(true)
                          }}
                        >
                          Réessayer
                        </Button>
                      </div>
                    ) : (
                      diag && <OfDiagnosticTree result={diag} />
                    ))}
                </div>
              )}

              {(showNav || showFirmChrome || showPrintBar) && (
                <footer className="flex shrink-0 items-center gap-2 border-t border-rule-soft px-5 py-3">
                  {view === 'bom' && (
                    <Button type="button" size="lg" variant="ghost" onClick={() => goTo('verdict')}>
                      <ChevronUp size={14} strokeWidth={1.75} />
                      Replier
                    </Button>
                  )}
                  {view === 'diagnostic' && (
                    <Button type="button" size="lg" variant="ghost" onClick={() => goTo('verdict')}>
                      <ChevronLeft size={14} strokeWidth={1.75} />
                      Retour
                    </Button>
                  )}
                  {view === 'verdict' && hasRuptures && (
                    <Button type="button" size="lg" variant="outline" onClick={openDiagnostic}>
                      Couverture
                    </Button>
                  )}
                  <div className="ml-auto flex items-center gap-3">
                    {firmMsg && (
                      <span
                        className={cn(
                          'text-xs font-medium',
                          firmMsg.ok ? 'text-ferme' : 'text-destructive'
                        )}
                      >
                        {firmMsg.text}
                      </span>
                    )}
                    {printMsg && (canFirm || d.statusLabel !== 'Ferme') && (
                      <OfPrintVerdict report={printMsg} />
                    )}
                    {showPrintBar && <OfReprintButton ofNum={d.num} seedReport={printMsg} />}
                    {canFirm && (
                      <OfFirmAction
                        firming={firming}
                        confirmRupture={confirmRupture}
                        isSuggestion={isSuggestion}
                        rupturedComponents={rupturedComponents}
                        onFirm={firm}
                        onDoFirm={() => void doFirm()}
                        onCancelConfirm={() => setConfirmRupture(false)}
                      />
                    )}
                  </div>
                </footer>
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function VerdictBody({ bomCount, onShowBom }: { bomCount: number; onShowBom?: () => void }) {
  if (bomCount === 0) {
    return <p className="py-4 text-center text-cell-lg text-muted-foreground">Nomenclature vide.</p>
  }
  return (
    <div className="flex flex-col items-start gap-1 py-1">
      <p className="flex items-center gap-1.5">
        <CellVerdict
          icon={CircleCheck}
          label="Composants disponibles"
          tone={TONE_TEXT.ok}
          className="[&>span:last-child]:font-medium!"
        />
      </p>
      {onShowBom && (
        <button
          type="button"
          onClick={onShowBom}
          className="rounded-sm text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          {bomCount} article{bomCount > 1 ? 's' : ''} · voir tout
        </button>
      )}
    </div>
  )
}

/**
 * Table BOM — DataTable du design system.
 *
 * Trois réglages non négociables, faute de quoi le composant se comporte mal
 * DANS un sheet (il est écrit pour occuper une page) :
 *  • `enableSorting: false` partout — l'ordre est métier (ruptures → CQ → OK) ;
 *  • `virtualize={false}` — une nomenclature fait quelques dizaines de lignes ;
 *  • compact : hauteur naturelle, plafond 20 rem — overlay verdict.
 */
function BomTable({
  bom,
  compact = false,
  moreCount = 0,
  onMore,
}: {
  bom: BomRow[]
  compact?: boolean
  moreCount?: number
  onMore?: () => void
}) {
  const columns: ColumnDef<BomRow>[] = [
    {
      accessorKey: 'id',
      header: () => 'Article',
      enableSorting: false,
      cell: ({ row: { original: row } }) => {
        const tone = bomRowTone(row)
        return (
          <X3Link
            fonction="GESITM"
            cle={row.id}
            title={`Ouvrir l'article ${row.id} dans Sage X3`}
            className={cn(
              'truncate font-mono text-xs font-medium',
              tone === 'critical' && 'text-destructive hover:text-destructive',
              tone === 'warning' && 'text-suggere hover:text-suggere',
              !tone && 'text-foreground'
            )}
          >
            {row.id}
          </X3Link>
        )
      },
      meta: { thClass: 'w-[110px]', tdClass: 'px-3 py-2' },
    },
    {
      accessorKey: 'name',
      header: () => 'Désignation',
      enableSorting: false,
      cell: ({ row: { original: row } }) => (
        <span className="truncate text-xs text-foreground/80" title={row.name}>
          {row.name}
        </span>
      ),
      meta: { tdClass: 'px-3 py-2' },
    },
    {
      id: 'besoin',
      header: () => <span className="block text-right">Besoin</span>,
      enableSorting: false,
      cell: ({ row: { original: row } }) => (
        <div className="text-right">
          <CellNumber value={row.need} emphasis="plain" className="text-xs font-medium" />
          {row.unit ? (
            <span className="ml-0.5 font-mono text-xs text-muted-foreground">{row.unit}</span>
          ) : null}
          {consumedPositive(row) && (
            <div
              className="mt-0.5 font-mono text-xs text-muted-foreground"
              title="Consommé réel (MFGMAT.USEQTY) / besoin théorique total (MFGMAT.RETQTY)"
            >
              consommé {row.consumed}/{row.required}
            </div>
          )}
        </div>
      ),
      meta: { thClass: 'w-[120px]', tdClass: 'px-3 py-2' },
    },
    {
      id: 'dispo',
      header: () => <span className="block text-right">Dispo</span>,
      enableSorting: false,
      cell: ({ row: { original: row } }) => (
        <div className="flex flex-col items-end gap-0.5">
          <CellNumber
            value={row.stock}
            tone={bomRowTone(row)}
            emphasis="plain"
            className="text-xs font-medium"
          />
          {!row.ok ? (
            <CellVerdict
              icon={TriangleAlert}
              label={`manque ${shortageQty(row.shortage)}`}
              tone={TONE_TEXT.critical}
              className="[&>span:last-child]:font-medium!"
            />
          ) : row.qc ? (
            <CellVerdict
              icon={FlaskConical}
              label={`dont ${row.qc} en CQ`}
              tone={TONE_TEXT.warning}
              title={`${row.qc} sous contrôle qualité : contacter le contrôle réception`}
              className="[&>span:last-child]:font-medium!"
            />
          ) : null}
        </div>
      ),
      meta: { thClass: 'w-[140px]', tdClass: 'px-3 py-2' },
    },
  ]

  const sortedBom = useMemo(
    () =>
      [...bom].sort((a, b) => {
        if (!a.ok && b.ok) return -1
        if (a.ok && !b.ok) return 1
        if (!!a.qc && !b.qc) return -1
        if (!a.qc && !!b.qc) return 1
        return 0
      }),
    [bom]
  )

  return (
    <div
      className={cn(
        'flex min-h-0 flex-col overflow-hidden rounded-md border border-rule-soft',
        !compact && 'h-full'
      )}
    >
      <DataTable
        columns={columns}
        rows={sortedBom}
        sorting={EMPTY_SORTING}
        onSortingChange={noopSorting}
        virtualize={false}
        tableClass="of-detail-bom has-sticky w-full text-xs"
        scrollContainerClass={cn(
          'overflow-auto rounded-none border-0 shadow-none',
          compact ? 'max-h-[min(40vh,20rem)]' : 'h-full'
        )}
        theadRowClass="sticky top-0"
        emptyState={
          <div className="px-3 py-4 text-center text-xs text-muted-foreground">
            Nomenclature vide pour cet OF.
          </div>
        }
        getRowClass={(row) => rowToneClass(bomRowTone(row))}
        getRowKey={(row) => row.id}
      />
      {compact && moreCount > 0 && onMore && (
        <button
          type="button"
          onClick={onMore}
          className="flex shrink-0 items-center justify-center gap-1 border-t border-rule-soft py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <ChevronDown size={14} strokeWidth={1.75} />
          {moreCount} autre{moreCount > 1 ? 's' : ''}
        </button>
      )}
    </div>
  )
}

const EMPTY_SORTING: SortingState[] = []
const noopSorting = () => {}

export default OfDetailSheet
