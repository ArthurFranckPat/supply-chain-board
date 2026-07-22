/**
 * Sheet détaillée d'un OF — port React de
 * inertia/components/of/of-detail-sheet.tsx (issue #52, shell d'orchestration).
 *
 * Orchestre : fetch du détail + diagnostic (lazy), état (onglet,
 * affermissement, confirmation rupture), rendu shell (barre d'identité,
 * méta+avancement, onglets). Vues lourdes déléguées :
 *   • arbre diagnostic récursif → <OfDiagnosticTree>
 *   • action affermir + popover rupture → <OfFirmAction>
 */
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { router } from '@inertiajs/react'

import { Sheet, SheetContent, SheetTitle } from '@r/components/ui/sheet'
import { Badge } from '@r/components/ui/badge'
import { cn } from '@r/lib/utils'
import {
  CircleX,
  Loader2,
  ArrowRight,
  Package,
  Network,
  TriangleAlert,
  CircleCheck,
  FlaskConical,
} from 'lucide-react'
import type { OfDetail } from '@/lib/of/types'
import { type DiagResult } from '@/lib/of/diagnostic-types'
import { route } from '@/lib/routes'
import { OfDiagnosticTree } from './of-diagnostic-tree'
import { OfFirmAction } from './of-firm-action'
import {
  OfPrintVerdict,
  OfReprintButton,
  type PrintReport,
} from './of-print-verdict'

export function OfDetailSheet(props: {
  num: string | null
  open: boolean
  onOpenChange: (v: boolean) => void
  /** Appelé après affermissement réussi (n° origine + n° OF créé) pour une mise
   *  à jour optimiste du board (transformation de la carte en place). */
  onFirmed?: (oldNum: string, newMfgNum: string) => void
}) {
  const [tab, setTab] = useState<'composants' | 'diagnostic'>('composants')
  // Devient true au premier clic sur "Diagnostic récursif" — déclenche le fetch une seule fois.
  const [diagRequested, setDiagRequested] = useState(false)

  const [detail, setDetail] = useState<OfDetail | null>(null)
  const [detailError, setDetailError] = useState(false)

  const [diag, setDiag] = useState<DiagResult | null>(null)
  const [diagLoading, setDiagLoading] = useState(false)
  const [diagError, setDiagError] = useState<string | null>(null)

  // Affermissement (write-back X3 FUNMAUTR, #31). ~13s : spinner + message.
  const [firming, setFirming] = useState(false)
  const [firmMsg, setFirmMsg] = useState<{ ok: boolean; text: string } | null>(null)
  /** Verdict d'impression, tenu à part du verdict d'affermissement (#85 lot 3). */
  const [printMsg, setPrintMsg] = useState<PrintReport | null>(null)
  // Confirmation requise pour affermir un OF en rupture (défaut : interdit).
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

  // Réinitialise l'état + fetch quand l'OF change (nouvelle carte cliquée).
  useEffect(() => {
    setTab('composants')
    setDiagRequested(false)
    setDiag(null)
    setFirmMsg(null)
    setPrintMsg(null)
    setConfirmRupture(false)
    setDetail(null)
    if (props.open && props.num) void fetchDetail(props.num)
  }, [props.num, props.open, fetchDetail])

  // Diagnostic : lazy (diagRequested) + memoïsé pour la durée d'ouverture du sheet.
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
      .catch((e: Error) => {
        if (!cancelled) setDiagError(e.message)
      })
      .finally(() => {
        if (!cancelled) setDiagLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [diagRequested, props.open, props.num, diag])

  const isSuggestion = (detail?.statusLabel ?? '').toLowerCase().includes('sugg')
  /** Composants en rupture (table Composants) — pilote le warning d'affermissement. */
  const rupturedComponents = (detail?.bom ?? []).filter((r) => !r.ok)
  const hasRuptures = rupturedComponents.length > 0
  /** Composants dont la couverture ne tient que sur du stock sous contrôle qualité. */
  const qcRows = (detail?.bom ?? []).filter((r) => r.qc)
  const canFirm = (() => {
    if (firmMsg?.ok) return false // déjà affermi ce tour → on masque le bouton
    const s = (detail?.statusLabel ?? '').toLowerCase()
    return s.includes('sugg') || s.includes('plan')
  })()

  /** Gate : par défaut l'affermissement d'un OF en rupture est interdit — il faut
   *  confirmer explicitement. Sans rupture, on affermit directement. */
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
        // L'impression a son propre verdict : un OF affermi dont le dossier
        // n'est pas sorti doit se voir, pas se fondre dans le succès.
        if (data.print) setPrintMsg({ ...data.print, documents: data.print.documents ?? [] })
        // Mise à jour optimiste : la carte se transforme en place (id → nouvel OF).
        props.onFirmed?.(d.num, data.mfgNum)
        if (data.mfgNum !== d.num) {
          // Suggestion→OF : le n° d'origine (SGAE…) n'existe plus → on ferme le sheet.
          props.onOpenChange(false)
        } else {
          // Planifié→ferme : même n°, on rafraîchit le détail (statut → Ferme).
          await fetchDetail(d.num)
        }
        // Reload FULL et retardé : FUNMAUTR consomme la suggestion dans ORDERS avec
        // un léger delta de propagation — cf. version Solid.
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

  const openDiagTab = () => {
    setDiagRequested(true)
    setTab('diagnostic')
  }

  const statusVariant = (label: string) =>
    label === 'Ferme' ? 'success' : label === 'Suggéré' ? 'warning' : 'secondary'

  const d = detail

  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent
        side="bottom"
        className="flex h-[72vh] w-full max-w-none flex-col gap-0 rounded-t-[16px] p-0 data-[side=bottom]:h-[72vh] data-[side=bottom]:max-w-none data-[side=bottom]:mx-0"
      >
        {!d ? (
          detailError ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-10 text-center text-destructive">
              <CircleX size={28} strokeWidth={1.75} />
              <span className="text-sm font-medium">Échec du chargement du détail.</span>
            </div>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-10 text-muted-foreground">
              <Loader2 size={28} strokeWidth={1.75} className="animate-spin" />
              <span className="text-sm">Chargement…</span>
            </div>
          )
        ) : (
          <>
            {/* Barre d'identité */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b bg-secondary px-5 py-3 pr-14">
              <span className="font-mono text-[13px] font-bold text-foreground">{d.num}</span>
              {d.article && (
                <span className="font-mono text-[12px] font-bold text-brand">{d.article}</span>
              )}
              <SheetTitle className="text-[14px] font-medium italic text-muted-foreground">
                {d.title}
              </SheetTitle>
              <Badge variant={statusVariant(d.statusLabel)} className="ml-0.5">
                {d.statusLabel}
              </Badge>
              {d.bomBlocked > 0 && <Badge variant="destructive">{d.bomBlocked} rupture(s)</Badge>}
              <span className="flex-1" />
              {/* Deux verdicts empilés, jamais fusionnés : l'affermissement a
                  réussi ou non, l'impression a abouti ou non (#85, invariant 1). */}
              {(firmMsg || printMsg) && (
                <span className="flex flex-col items-end gap-0.5">
                  {firmMsg && (
                    <span
                      className={`font-mono text-[11px] font-semibold ${firmMsg.ok ? 'text-ferme' : 'text-destructive'}`}
                    >
                      {firmMsg.ok ? '✓ ' : '⚠ '}
                      {firmMsg.text}
                    </span>
                  )}
                  {printMsg && <OfPrintVerdict report={printMsg} />}
                </span>
              )}
              {!canFirm && d.statusLabel === 'Ferme' && <OfReprintButton ofNum={d.num} />}
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

            {/* Méta + avancement */}
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-rule-soft px-5 py-2.5">
              <Meta k="Début" v={d.cycle.start} mono />
              <ArrowRight size={15} strokeWidth={1.75} className="text-muted-foreground" />
              <Meta k="Fin" v={d.cycle.end} mono />
              {d.context && <Meta k="Poste" v={d.context} />}
              <Meta k="Créé le" v={d.createdAt} mono />
              {d.operator.name !== 'Non assigné' && <Meta k="Par" v={d.operator.name} mono />}
              {d.stats.map((s) => (
                <Meta key={s.label} k={s.label} v={s.value} mono />
              ))}
              <div className="ml-auto flex items-center gap-2">
                <span className="font-mono text-[10px] font-semibold text-muted-foreground">
                  Avancement
                </span>
                <span className="h-1.5 w-28 overflow-hidden rounded-full bg-secondary">
                  <span
                    className="block h-full rounded-full bg-brand"
                    style={{ width: `${d.progressPct}%` }}
                  />
                </span>
                <span className="font-mono text-[11px] font-bold text-foreground">
                  {d.progressPct}%
                </span>
              </div>
            </div>

            {/* Onglets */}
            <div className="flex gap-0 border-b">
              <TabBtn active={tab === 'composants'} onClick={() => setTab('composants')}>
                <Package size={14} strokeWidth={1.75} />
                Composants
                {d.bomBlocked > 0 && (
                  <span className="ml-1 rounded-full bg-destructive px-1.5 py-0.5 text-[9px] font-bold text-white">
                    {d.bomBlocked}
                  </span>
                )}
              </TabBtn>
              <TabBtn active={tab === 'diagnostic'} onClick={openDiagTab}>
                <Network size={14} strokeWidth={1.75} />
                Diagnostic récursif
              </TabBtn>
            </div>

            {/* Contenu onglets */}
            <div className="flex-1 overflow-auto px-5 py-3">
              {tab === 'composants' && (
                <>
                  {/* Récap ruptures en haut — visible sans scroll */}
                  {d.bomBlocked > 0 && (
                    <div className="mb-3 rounded-md border border-destructive/30 bg-destructive/8 px-3 py-2.5">
                      <div className="mb-1.5 flex items-center gap-1.5 font-mono text-[10px] font-bold tracking-wider text-destructive">
                        <TriangleAlert size={14} strokeWidth={1.75} />
                        {d.bomBlocked} COMPOSANT{d.bomBlocked > 1 ? 'S' : ''} EN RUPTURE
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {d.bom
                          .filter((r) => !r.ok)
                          .map((r) => (
                            <span
                              key={r.id}
                              className="inline-flex items-baseline gap-1 rounded border border-destructive/30 bg-background px-2 py-0.5 font-mono text-[11px]"
                            >
                              <span className="font-bold text-foreground">{r.id}</span>
                              <span className="font-semibold text-destructive">−{r.shortage}</span>
                            </span>
                          ))}
                      </div>
                    </div>
                  )}

                  {/* Dépendance au contrôle qualité : le stock statut Q compte comme dispo
                      dans le verdict, mais l'OF n'est pas lançable tant qu'il n'est pas
                      libéré → l'action est de relancer le contrôle réception. */}
                  {qcRows.length > 0 && (
                    <div className="mb-3 rounded-md border border-warning/40 bg-warning/10 px-3 py-2.5">
                      <div className="mb-1.5 flex items-center gap-1.5 font-mono text-[10px] font-bold tracking-wider text-warning">
                        <FlaskConical size={14} strokeWidth={1.75} />
                        {qcRows.length} COMPOSANT{qcRows.length > 1 ? 'S' : ''} SOUS CONTRÔLE
                        QUALITÉ
                      </div>
                      <div className="mb-2 flex flex-wrap gap-1.5">
                        {qcRows.map((r) => (
                          <span
                            key={r.id}
                            className="inline-flex items-baseline gap-1 rounded border border-warning/40 bg-background px-2 py-0.5 font-mono text-[11px]"
                          >
                            <span className="font-bold text-foreground">{r.id}</span>
                            <span className="font-semibold text-warning">{r.qc}</span>
                          </span>
                        ))}
                      </div>
                      <p className="text-[11px] leading-snug text-muted-foreground">
                        Ces quantités sont comptées disponibles mais restent bloquées en statut Q.
                        Action : contacter le contrôle réception pour faire lever le contrôle.
                      </p>
                    </div>
                  )}

                  {/* En-tête table */}
                  <div className="mb-1 flex items-center justify-between">
                    {d.bomBlocked === 0 && d.bom.length > 0 && qcRows.length === 0 && (
                      <div className="flex items-center gap-2 rounded-md bg-ferme/10 px-3 py-1.5 text-[12px] font-medium text-ferme">
                        <CircleCheck size={15} strokeWidth={1.75} />
                        Tous les composants sont disponibles
                      </div>
                    )}
                    <span className="ml-auto font-mono text-[11px] text-muted-foreground">
                      {d.bomCount} articles
                    </span>
                  </div>

                  <div className="grid grid-cols-[1fr_1.7fr_72px_84px_96px] gap-3 border-b bg-secondary px-3 py-1.5 font-mono text-[9px] font-bold tracking-wider text-muted-foreground">
                    <span>Article</span>
                    <span>Désignation</span>
                    <span className="text-right">Besoin</span>
                    <span className="text-right">Dispo</span>
                    <span className="text-right">État</span>
                  </div>

                  {d.bom.map((row) => (
                    <div
                      key={row.id}
                      className={cn(
                        'grid grid-cols-[1fr_1.7fr_72px_84px_96px] items-center gap-3 border-b px-3 py-2',
                        !row.ok
                          ? 'border-l-2 border-destructive/20 border-l-destructive bg-destructive/10'
                          : row.qc
                            ? 'border-l-2 border-warning/20 border-l-warning bg-warning/10'
                            : 'border-rule-soft'
                      )}
                      title={
                        row.qc
                          ? `${row.id} — ${row.name}\n${row.qc} sous contrôle qualité : contacter le contrôle réception`
                          : `${row.id} — ${row.name}`
                      }
                    >
                      <span
                        className={cn(
                          'truncate font-mono text-[12px] font-bold',
                          row.ok ? 'text-foreground' : 'text-destructive'
                        )}
                      >
                        {row.id}
                      </span>
                      <span className="truncate text-[12px] text-foreground/80">{row.name}</span>
                      <span className="text-right font-mono text-[12px] text-foreground">
                        {row.need} {row.unit}
                      </span>
                      <span className="text-right font-mono text-[12px] text-muted-foreground">
                        {row.stock}
                        {row.qc && (
                          <span className="ml-1 font-semibold text-warning">·Q{row.qc}</span>
                        )}
                      </span>
                      <span className="text-right">
                        {row.ok ? (
                          row.qc ? (
                            <span className="inline-flex items-center gap-1 font-mono text-[11px] font-bold text-warning">
                              <FlaskConical size={12} strokeWidth={2} />
                              CQ
                            </span>
                          ) : (
                            <span className="font-bold text-ferme">✓</span>
                          )
                        ) : (
                          <span className="font-mono text-[12px] font-bold text-destructive">
                            −{row.shortage}
                          </span>
                        )}
                      </span>
                    </div>
                  ))}
                </>
              )}

              {tab === 'diagnostic' &&
                (diagLoading ? (
                  <div className="flex flex-col items-center justify-center gap-2 py-10 text-muted-foreground">
                    <Loader2 size={24} strokeWidth={1.75} className="animate-spin" />
                    <span className="text-[12px]">Diagnostic en cours…</span>
                  </div>
                ) : diagError ? (
                  <div className="flex flex-col items-center gap-2 py-8 text-destructive">
                    <CircleX size={22} strokeWidth={1.75} />
                    <span className="text-[12px] font-medium">{diagError}</span>
                  </div>
                ) : (
                  diag && <OfDiagnosticTree result={diag} />
                ))}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

function Meta(p: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="font-mono text-[10px] font-semibold text-muted-foreground">{p.k}</span>
      <span className={cn('text-[13px] font-bold text-foreground', p.mono && 'font-mono')}>
        {p.v}
      </span>
    </div>
  )
}

function TabBtn(p: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={p.onClick}
      className={cn(
        'flex items-center gap-1.5 border-b-2 px-5 py-2.5 font-mono text-[11px] font-semibold transition-colors',
        p.active
          ? 'border-brand text-brand'
          : 'border-transparent text-muted-foreground hover:text-foreground'
      )}
    >
      {p.children}
    </button>
  )
}

export default OfDetailSheet
