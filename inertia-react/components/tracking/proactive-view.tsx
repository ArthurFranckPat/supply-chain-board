/**
 * Vue proactive du Suivi — réalisabilité projetée des commandes (moteur de
 * consommation séquentielle, issue #52), recomposée en cinq blocs de lecture :
 * cadre d'en-tête, bandeau de verdicts (filtre), barre de filtres, liste des
 * commandes, puis feuille de détail (montée par la page).
 *
 * La colonne défile d'un bloc à l'autre ; le tableau garde son propre défilement
 * (en-tête collant, virtualisation) dans une hauteur bornée.
 */
import { useEffect, useRef, useState } from 'react'

import { cn } from '@r/lib/utils'
import type { RowFlash } from '@r/lib/diff-flash'
import { TriangleAlert, CircleX, FilterX, RefreshCw, Table2 } from 'lucide-react'
import { SkeletonRow } from '@r/components/ui/skeleton'
import { DynamicIcon } from '../ui/dynamic-icon'
import DataTable, { type SortingState } from '@r/components/ui/data-table'
import type {
  ProactiveRowsResponse,
  ProactiveDisplayRow,
  ProactiveVerdictKey,
} from '@r/lib/suivi/types'
import { sortRows, LATE_TONE, suiviRowKey, suiviDiffKey } from '@r/lib/suivi/tracking-shared'
import { createProactiveColumns, createProactiveIndexCol } from '@r/lib/suivi/proactive-columns'
import { installReferenceReveals } from '@r/lib/use-reference-reveals'
import { useIsCompact } from '@r/lib/use-is-compact'
import { ProactiveHeader } from './proactive-header'
import { VerdictBand } from './verdict-band'
import { ProactiveFilters } from './proactive-filters'
import { ProactiveRowCards } from './proactive-row-cards'

export interface ProactiveViewProps {
  view: ProactiveRowsResponse
  filteredRows: ProactiveDisplayRow[]
  loading: boolean
  error: boolean
  /** Relance le chargement (même chemin que le ⟳ de la barre data-status : arme le diff #186). */
  onReload: () => void
  query: string
  onQueryChange: (q: string) => void
  /** Verdicts retenus (vide = tous). */
  verdictFilter: ReadonlySet<ProactiveVerdictKey>
  onToggleVerdictGroup: (keys: readonly ProactiveVerdictKey[]) => void
  onToggleSubAssemblies: () => void
  cqOnly: boolean
  onToggleCq: () => void
  cqCount: number
  isFiltered: boolean
  onResetFilters?: () => void
  onRowClick?: (row: ProactiveDisplayRow) => void
  selectedRowKey?: string | null
  /** Clic sur un n° d'OF (colonne Couverture) → détail OF (faisabilité), comme /programme. */
  onSelectOf?: (numOf: string) => void
  /** Clic sur un code poste → panneau d'engagement du poste (sans quitter le suivi). */
  onSelectPoste?: (code: string) => void
  /** Inclure les sous-ensembles (semi-finis) en rupture dans la colonne « Composants en rupture ». */
  showSubAssemblies?: boolean
  /** Diff du dernier rechargement (issue #186) — relayé tel quel au DataTable. */
  flash?: RowFlash | null
}

export function ProactiveView(props: ProactiveViewProps) {
  // Tri par défaut : expédition croissante (date ISO via sortRows, lignes sans date en dernier).
  const [sorting, setSorting] = useState<SortingState[]>([{ id: 'dateExp', desc: false }])
  const rootRef = useRef<HTMLDivElement>(null)
  const compact = useIsCompact()

  const rows = sortRows(props.filteredRows, sorting)

  // Révélations à l'entrée dans le viewport (barre de filtres) — une seule fois.
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    return installReferenceReveals(root, '[data-reveal]:not(tr)')
  }, [])

  // Lignes du tableau : seules celles déjà montées et encore hors écran au premier affichage
  // des données s'animent (le tableau est virtualisé : une ligne montée plus tard par le
  // défilement apparaît directement, sans rejeu ni masquage).
  const rowsRevealed = useRef(false)
  useEffect(() => {
    if (props.loading || props.error || rows.length === 0 || rowsRevealed.current) return
    let stop: (() => void) | undefined
    let raf2 = 0
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        const root = rootRef.current
        if (!root || rowsRevealed.current) return
        rowsRevealed.current = true
        root.querySelectorAll<HTMLElement>('tbody tr[data-index]').forEach((tr, i) => {
          tr.dataset.reveal = 'rise'
          tr.dataset.revealDelay = String(Math.min((i % 6) * 60, 240))
        })
        stop = installReferenceReveals(root, 'tr[data-reveal]')
      })
    })
    return () => {
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2)
      stop?.()
    }
  }, [props.loading, props.error, rows.length])

  const columns = createProactiveColumns({
    referenceDate: props.view.referenceDate,
    onSelectOf: props.onSelectOf,
    showSubAssemblies: props.showSubAssemblies,
    onSelectPoste: props.onSelectPoste,
  })
  const indexCol = createProactiveIndexCol()

  const emptyState = (
    <div className="flex flex-1 items-center justify-center p-12 text-center">
      <div className="flex flex-col items-center">
        <div className="mb-4 inline-flex size-14 items-center justify-center rounded-full bg-secondary text-muted-foreground">
          <DynamicIcon
            name={props.view.x3Error ? 'cloud_off' : 'search_off'}
            size={28}
            strokeWidth={1.75}
          />
        </div>
        <h3 className="mb-1 text-[16px] font-bold text-foreground">
          {props.view.x3Error ? 'Erreur de connexion Sage X3' : 'Aucune ligne à afficher'}
        </h3>
        <p className="mb-5 max-w-sm text-[14px] leading-normal text-muted-foreground">
          {props.view.x3Error
            ? 'Impossible de récupérer les dernières données de réalisabilité depuis le serveur ERP Sage X3.'
            : 'Aucune ligne ne correspond aux filtres. Réinitialiser les filtres pour tout afficher.'}
        </p>
        {!props.view.x3Error && props.onResetFilters && (
          <button
            type="button"
            onClick={() => props.onResetFilters?.()}
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[var(--control-border)] bg-card px-5 text-[14px] font-semibold text-foreground transition-[background-color,transform] duration-150 ease-out hover:bg-secondary active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
          >
            <FilterX size={16} strokeWidth={1.75} aria-hidden="true" />
            Réinitialiser les filtres
          </button>
        )}
      </div>
    </div>
  )

  return (
    <div ref={rootRef} className="min-h-0 flex-1 overflow-y-auto print:overflow-visible">
      {/* ═══ Proactif : X3 injoignable ═══ */}
      {props.view.x3Error && (
        <div
          role="alert"
          className="flex flex-none items-center gap-2 border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-[13px] text-foreground sm:px-7"
        >
          <TriangleAlert size={16} strokeWidth={1.75} className="shrink-0 text-destructive" />
          <span className="font-bold">Erreur chargement réalisabilité :</span>
          <span className="font-mono">{props.view.x3Error}</span>
        </div>
      )}

      <ProactiveHeader
        referenceDate={props.view.referenceDate}
        total={props.view.total}
        loading={props.loading}
        error={props.error}
        onReload={props.onReload}
      />

      <VerdictBand
        counts={props.view.verdictCounts}
        loading={props.loading}
        selected={props.verdictFilter}
        onToggleGroup={props.onToggleVerdictGroup}
      />

      <ProactiveFilters
        query={props.query}
        onQueryChange={props.onQueryChange}
        showSubAssemblies={!!props.showSubAssemblies}
        onToggleSubAssemblies={props.onToggleSubAssemblies}
        cqOnly={props.cqOnly}
        onToggleCq={props.onToggleCq}
        cqCount={props.cqCount}
        isFiltered={props.isFiltered}
        onReset={() => props.onResetFilters?.()}
      />

      {/* ═══ Commandes ═══ */}
      <section
        id="commandes"
        aria-labelledby="commandes_title"
        className="scroll-mt-2 px-4 pb-6 pt-7 sm:px-7 print:p-0"
      >
        <div className="mb-4 flex flex-col items-center text-center print:hidden">
          <p className="inline-flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            <Table2 size={16} strokeWidth={1.75} aria-hidden="true" />
            Commandes
          </p>
          <h2
            id="commandes_title"
            data-section-title
            tabIndex={-1}
            className="mt-1.5 text-[24px] font-bold leading-tight tracking-[-0.01em] text-foreground outline-none sm:text-[28px]"
          >
            Commandes classées par date d'expédition
          </h2>
          <p className="mt-1 text-[14px] text-muted-foreground">
            Ouvrir une ligne pour lire la cause, la couverture par OF et le poste.
          </p>
        </div>

        <div className="flex h-[calc(100dvh-14rem)] min-h-[440px] flex-col print:h-auto">
          {props.loading ? (
            <div
              className="flex-1 overflow-hidden rounded-[14px] border border-rule p-5"
              role="status"
              aria-live="polite"
            >
              <p className="mb-3 text-[14px] text-muted-foreground">
                Chargement de la réalisabilité en cours.
              </p>
              <SkeletonRow count={6} />
            </div>
          ) : props.error ? (
            <div
              role="alert"
              className="flex flex-1 flex-col items-center justify-center gap-4 rounded-[14px] border border-destructive/30 bg-destructive/10 p-8 text-center"
            >
              <p className="flex items-center gap-2 text-[15px] font-semibold text-foreground">
                <CircleX size={20} strokeWidth={1.75} className="shrink-0 text-destructive" />
                Erreur de chargement de la réalisabilité : X3 est injoignable.
              </p>
              <button
                type="button"
                onClick={props.onReload}
                className="inline-flex min-h-11 items-center gap-2 rounded-full bg-brand px-5 text-[14px] font-semibold text-[var(--on-accent)] transition-[background-color,transform] duration-150 ease-out hover:bg-[var(--brand-hover)] active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
              >
                <RefreshCw size={16} strokeWidth={1.75} aria-hidden="true" />
                Recharger les données
              </button>
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-1 overflow-hidden rounded-[14px] border border-rule">
              {emptyState}
            </div>
          ) : compact ? (
            <ProactiveRowCards
              rows={rows}
              selectedRowKey={props.selectedRowKey}
              onRowClick={props.onRowClick}
              onSelectOf={props.onSelectOf}
              onSelectPoste={props.onSelectPoste}
              showSubAssemblies={props.showSubAssemblies}
            />
          ) : (
            <DataTable
              columns={columns}
              rows={rows}
              sorting={sorting}
              onSortingChange={setSorting}
              indexColumn={indexCol}
              getRowClass={(row: ProactiveDisplayRow) => {
                const k = row.verdictKey
                const s =
                  k === 'blocked' || k === 'uncov' ? ('critical' as const) : row.lateSeverity
                return cn('border-t border-rule-soft transition-colors', LATE_TONE.bg(s))
              }}
              rowSelectedClass="bg-brand-soft [&>td:first-child]:shadow-[inset_3px_0_var(--foreground)]"
              tableClass="min-w-[1328px] table-fixed"
              scrollContainerClass="h-full border border-rule rounded-[14px] shadow-none bg-card"
              theadRowClass="sticky top-0 z-10 bg-secondary"
              onRowClick={props.onRowClick}
              selectedRowKey={props.selectedRowKey}
              getRowKey={suiviRowKey}
              getFlashKey={suiviDiffKey}
              flash={props.flash}
              emptyState={emptyState}
            />
          )}
        </div>
      </section>
    </div>
  )
}
