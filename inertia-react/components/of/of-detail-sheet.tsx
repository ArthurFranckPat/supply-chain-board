/**
 * Sheet détaillée d'un OF — port React de
 * inertia/components/of/of-detail-sheet.tsx (issue #52, shell d'orchestration).
 *
 * Orchestre : fetch du détail + diagnostic (lazy), état (onglet,
 * affermissement, confirmation rupture), rendu shell (barre d'identité,
 * méta+avancement, onglets). Vues lourdes déléguées :
 *   • arbre diagnostic récursif → <OfDiagnosticTree>
 *   • action affermir + popover rupture → <OfAffermirAction>
 *
 * Layout Scan-first : identité ≠ actions, méta en grille 4 cols, table
 * silencieuse sur les lignes OK, commandes matching dans le chrome.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { router } from '@inertiajs/react'

import { Sheet, SheetContent, SheetTitle } from '@r/components/ui/sheet'
import { LoadingState } from '@r/components/ui/loading-state'
import { Badge } from '@r/components/ui/badge'
import { DataTable, type ColumnDef, type SortingState } from '@r/components/ui/data-table'
import { rowToneClass } from '@r/components/ui/table-row'
import { cn } from '@r/lib/utils'
import {
  CircleX,
  ArrowRight,
  Package,
  Network,
  TriangleAlert,
  CircleCheck,
  FlaskConical,
} from 'lucide-react'
import type { OfCommandeLink, OfDetail, BomRow } from '@r/lib/of/types'
import { type DiagResult } from '@r/lib/of/diagnostic-types'
import { route } from '@r/lib/routes'
import { X3Link } from '@r/components/x3-link'
import { OfDiagnosticTree } from './of-diagnostic-tree'
import { OfAffermirAction } from './of-affermir-action'
import { OfPrintVerdict, OfReprintButton, type PrintReport } from './of-print-verdict'

/** ISO YYYY-MM-DD → « 17 août » (jour civil, pas d'heure). */
function fmtLivraison(iso: string | null): string {
  if (!iso) return ''
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return iso
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

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
   * confirmer explicitement. Sans rupture, on affermit directement. */
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
        ? route('planning.suggestion_affermir', { sugNum: d.num })
        : route('planning.order_affermir', { orderNum: d.num })
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
    label === 'Ferme' ? 'success' : label === 'Suggéré' ? 'warning' : 'default'

  const d = detail
  const commandes = d?.commandes ?? []

  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent
        side="bottom"
        className="flex h-[72vh] w-full max-w-none flex-col gap-0 rounded-t-[14px] p-0 data-[side=bottom]:h-[72vh] data-[side=bottom]:max-w-none data-[side=bottom]:mx-0"
      >
        {!d ? (
          detailError ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-10 text-center text-destructive">
              <CircleX size={28} strokeWidth={1.75} />
              <span className="text-sm font-medium">Échec du chargement du détail.</span>
            </div>
          ) : (
            <LoadingState
              variant="orb"
              title="Chargement de l'ordre de fabrication..."
              description="Récupération des détails, composants et opérations"
            />
          )
        ) : (
          <>
            {/* Ligne 1 — identité + actions */}
            <div className="flex items-center gap-4 px-5 py-3 pr-14">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2.5">
                  {/* Pas de lien sur un OF suggéré : pas de MFGNUM à ouvrir (#118). */}
                  {isSuggestion ? (
                    <span className="font-mono text-[15px] font-bold tracking-tight text-foreground">
                      {d.num}
                    </span>
                  ) : (
                    <X3Link
                      fonction="GESMFG"
                      cle={d.num}
                      title={`Ouvrir l'OF ${d.num} dans Sage X3`}
                      className="font-mono text-[15px] font-bold tracking-tight text-foreground"
                    >
                      {d.num}
                    </X3Link>
                  )}
                  {d.article && (
                    <span className="font-mono text-[11px] font-semibold text-brand">
                      {d.article}
                    </span>
                  )}
                  {/* Ni hauteur ni taille de police forcées : sous `.theme-cursor`
                      la règle `[data-slot='badge']` les impose (20 px / 11 px) et
                      bat toute classe utilitaire, donc `h-[18px] text-[10px]` ne
                      s'appliquait que sur les pages Airbnb — un réglage à moitié
                      mort, qui donnait l'illusion d'en être un. */}
                  <Badge
                    variant={statusVariant(d.statusLabel)}
                    className="font-mono font-semibold uppercase tracking-wide"
                  >
                    {d.statusLabel}
                  </Badge>
                  {d.bomBlocked > 0 && (
                    <Badge variant="destructive" className="font-mono font-semibold">
                      {d.bomBlocked} rupture{d.bomBlocked > 1 ? 's' : ''}
                    </Badge>
                  )}
                </div>
                <SheetTitle className="mt-0.5 truncate text-[12px] font-normal text-muted-foreground">
                  {d.title}
                </SheetTitle>
              </div>

              {/* Verdicts + actions */}
              <div className="flex shrink-0 items-center gap-3">
                {(firmMsg || printMsg) && (
                  <div className="flex flex-col items-end gap-0.5">
                    {firmMsg && (
                      <span
                        className={`font-mono text-[11px] font-semibold ${firmMsg.ok ? 'text-ferme' : 'text-destructive'}`}
                      >
                        {firmMsg.ok ? '✓ ' : '⚠ '}
                        {firmMsg.text}
                      </span>
                    )}
                    {printMsg && <OfPrintVerdict report={printMsg} />}
                  </div>
                )}
                {!canFirm && d.statusLabel === 'Ferme' && <OfReprintButton ofNum={d.num} />}
                {canFirm && (
                  <OfAffermirAction
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
            </div>

            {/* Ligne 2 — faits clés en 4 colonnes */}
            <div className="grid grid-cols-2 border-t border-rule-soft px-5 py-2.5 sm:grid-cols-4">
              <Fact label="Cycle">
                <span className="inline-flex items-center gap-1.5 font-mono text-[13px] font-bold text-foreground">
                  {d.cycle.start}
                  <ArrowRight size={12} strokeWidth={2} className="text-muted-foreground" />
                  {d.cycle.end}
                </span>
              </Fact>
              <Fact label="Poste">
                <span className="truncate text-[13px] font-medium text-foreground">
                  {d.context || '—'}
                </span>
              </Fact>
              <Fact label="Production">
                <span className="font-mono text-[13px] font-bold text-foreground">
                  {d.stats.find((s) => s.label === 'Qté')?.value ?? '—'}
                </span>
                <span className="ml-1 font-mono text-[11px] text-muted-foreground">
                  {d.stats.find((s) => s.label === 'Temps')?.value ?? ''}
                </span>
              </Fact>
              <Fact label="Avancement">
                {/* Pas de barre à 0% — juste le % */}
                <span
                  className={cn(
                    'font-mono text-[13px] font-bold',
                    d.progressPct === 0
                      ? 'text-muted-foreground'
                      : d.progressPct >= 95
                        ? 'text-ferme'
                        : 'text-foreground'
                  )}
                >
                  {d.progressPct}%
                </span>
              </Fact>
            </div>

            {/* Ligne 3 — métadonnées (création, commandes) */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-rule-soft px-5 py-1.5 font-mono text-[10px] text-muted-foreground">
              <span>
                Créé {d.createdAt}
                {d.operator.name !== 'Non assigné' ? ` · ${d.operator.name}` : ''}
              </span>
              {commandes.length > 0 && <CommandesRow commandes={commandes} />}
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

                  <BomTable bom={d.bom} />
                </>
              )}

              {tab === 'diagnostic' &&
                (diagLoading ? (
                  <LoadingState
                    variant="orb"
                    orbState="solving"
                    compact
                    title="Diagnostic en cours..."
                    description="Analyse des besoins composants et chaînes de dépendance"
                  />
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

/**
 * Table BOM — DataTable du design system.
 *
 * Trois réglages non négociables, faute de quoi le composant se comporte mal
 * DANS un sheet (il est écrit pour occuper une page) :
 *  • `enableSorting: false` partout — l'ordre est métier (ruptures → CQ → OK) et
 *    imposé ici. Sans ce drapeau, le DataTable rend quatre en-têtes cliquables,
 *    chevron au survol compris, dont le clic n'aurait rien fait ;
 *  • `virtualize={false}` — une nomenclature fait quelques dizaines de lignes,
 *    et la virtualisation exige un conteneur défilant à hauteur définie ;
 *  • un `scrollContainerClass` qui ANNULE `h-full overflow-auto` du défaut. Le
 *    parent de ce bloc défile déjà : laisser la valeur par défaut donnait une
 *    boîte forcée à la hauteur de l'onglet, avec son propre ascenseur imbriqué
 *    dans celui de l'onglet.
 */
function BomTable({ bom }: { bom: BomRow[] }) {
  const columns: ColumnDef<BomRow>[] = [
    {
      accessorKey: 'id',
      header: () => 'Article',
      enableSorting: false,
      cell: ({ row: { original: row } }) => (
        <X3Link
          fonction="GESITM"
          cle={row.id}
          title={`Ouvrir l'article ${row.id} dans Sage X3`}
          className={cn(
            'truncate font-mono text-[12px] font-bold',
            !row.ok ? 'text-destructive' : 'text-foreground'
          )}
        >
          {row.id}
        </X3Link>
      ),
      meta: { thClass: 'w-[110px]', tdClass: 'px-3 py-2' },
    },
    {
      accessorKey: 'name',
      header: () => 'Désignation',
      enableSorting: false,
      cell: ({ row: { original: row } }) => (
        <span className="truncate text-[12px] text-foreground/80" title={row.name}>
          {row.name}
        </span>
      ),
      // Pas de largeur : c'est la colonne élastique. (`flex-1` sur un `<th>` ne
      // veut rien dire — il n'y a pas de conteneur flex dans une `<table>`.)
      meta: { tdClass: 'px-3 py-2' },
    },
    {
      id: 'besoin',
      header: () => <span className="block text-right">Besoin</span>,
      enableSorting: false,
      cell: ({ row: { original: row } }) => (
        <div className="text-right font-mono text-[12px]">
          <span className="font-bold text-foreground">
            {row.need}
            <span className="ml-0.5 text-[10px] font-normal text-muted-foreground">{row.unit}</span>
          </span>
          {row.consumed != null && row.required != null && (
            <div
              className="mt-0.5 font-mono text-[10px] text-muted-foreground"
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
        <div
          className={cn(
            'text-right font-mono text-[12px]',
            !row.ok ? 'text-destructive' : 'text-foreground'
          )}
        >
          <span className="font-bold">{row.stock}</span>
          {!row.ok ? (
            <div className="mt-0.5 inline-flex w-full items-center justify-end gap-1 font-mono text-[11px] font-bold text-destructive">
              <TriangleAlert size={11} strokeWidth={2.5} />
              manque {row.shortage?.replace('−', '')}
            </div>
          ) : row.qc ? (
            // L'action portée par ce `title` vivait sur la rangée avant la
            // migration vers DataTable, qui n'expose pas d'attribut de ligne :
            // elle se raccroche à l'endroit qui l'annonce.
            <div
              className="mt-0.5 inline-flex w-full items-center justify-end gap-1 font-mono text-[11px] font-semibold text-warning"
              title={`${row.qc} sous contrôle qualité : contacter le contrôle réception`}
            >
              <FlaskConical size={11} strokeWidth={2.5} />
              dont {row.qc} en CQ
            </div>
          ) : null}
        </div>
      ),
      meta: { thClass: 'w-[140px]', tdClass: 'px-3 py-2' },
    },
  ]

  // Tri : ruptures → CQ → OK
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
    <DataTable
      columns={columns}
      rows={sortedBom}
      sorting={EMPTY_SORTING}
      onSortingChange={noopSorting}
      virtualize={false}
      tableClass="w-full text-xs"
      // `h-auto overflow-visible` annule le défaut `h-full overflow-auto`.
      scrollContainerClass="h-auto overflow-visible rounded-md border border-rule-soft shadow-none"
      theadRowClass="bg-secondary/50"
      emptyState={
        <div className="px-3 py-4 text-center text-[12px] text-muted-foreground">
          Nomenclature vide pour cet OF.
        </div>
      }
      // Composant manquant / sous contrôle qualité : barre de gravité à gauche.
      // Les deux fonds teintés d'origine (5 %) se distinguaient à peine l'un de
      // l'autre, et pas du tout du survol.
      getRowClass={(row) => rowToneClass(!row.ok ? 'critical' : row.qc ? 'warning' : null)}
      getRowKey={(row) => row.id}
    />
  )
}

/** Tri figé : références stables, pour ne pas re-rendre la table à chaque frame. */
const EMPTY_SORTING: SortingState[] = []
const noopSorting = () => {}

/** Chips de commandes clientes. */
function CommandesRow({ commandes }: { commandes: OfCommandeLink[] }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1.5 font-semibold text-foreground">
        Cmd{commandes.length > 1 ? 's' : ''}
      </span>
      {commandes.map((c) => {
        const liv = fmtLivraison(c.livraisonIso)
        const title = [
          c.numCommande,
          c.ligne ? `L${c.ligne}` : null,
          c.client,
          liv ? `exp. ${liv}` : null,
          c.method === 'peg' ? 'contremarque' : 'matching',
        ]
          .filter(Boolean)
          .join(' · ')
        return (
          <Badge
            key={`${c.numCommande}#${c.ligne ?? ''}`}
            variant="secondary"
            className="gap-1 font-mono font-semibold"
            title={title}
          >
            <X3Link
              fonction="GESSOH"
              cle={c.numCommande}
              title={`Ouvrir la commande ${c.numCommande} dans Sage X3`}
              className="font-semibold text-foreground"
            >
              {c.numCommande}
            </X3Link>
            {c.ligne && <span className="text-muted-foreground">L{c.ligne}</span>}
            {c.client && (
              <span className="max-w-[120px] truncate text-muted-foreground">{c.client}</span>
            )}
            {liv && <span className="text-muted-foreground">{liv}</span>}
          </Badge>
        )
      })}
    </div>
  )
}

/** Label + valeur (faits clés). */
function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="font-mono text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 min-h-[20px]">{children}</div>
    </div>
  )
}

/** Bouton d'onglet. */
function TabBtn(p: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
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
