/**
 * Vue proactive du Suivi — port React de
 * inertia/components/tracking/proactive-view.tsx (issue #52) :
 * réalisabilité projetée des commandes (moteur de consommation séquentielle).
 */
import { useState } from 'react'

import { cn } from '@r/lib/utils'
import { TriangleAlert, Loader2, CircleX, FilterX } from 'lucide-react'
import { DynamicIcon } from '../ui/dynamic-icon'
import DataTable, { type SortingState } from '@r/components/ui/data-table'
import type { ProactiveRowsResponse, ProactiveDisplayRow } from '@/lib/suivi/types'
import { sortRows, LATE_TONE } from '@/lib/suivi/tracking-shared'
import { createProactiveColumns, createProactiveIndexCol } from '@r/lib/suivi/proactive-columns'

export interface ProactiveViewProps {
  view: ProactiveRowsResponse
  filteredRows: ProactiveDisplayRow[]
  loading: boolean
  error: boolean
  onResetFilters?: () => void
  onRowClick?: (row: ProactiveDisplayRow) => void
  selectedRowKey?: string | null
  /** Clic sur un n° d'OF (colonne Couverture) → détail OF (faisabilité), comme /programme. */
  onSelectOf?: (numOf: string) => void
}

export function ProactiveView(props: ProactiveViewProps) {
  const [sorting, setSorting] = useState<SortingState[]>([{ id: 'joursRetard', desc: true }])

  const rows = sortRows(props.filteredRows, sorting)

  const columns = createProactiveColumns({
    referenceDate: props.view.referenceDate,
    onSelectOf: props.onSelectOf,
  })
  const indexCol = createProactiveIndexCol()

  return (
    <>
      {/* ═══ Proactif : X3 injoignable ═══ */}
      {props.view.x3Error && (
        <div className="flex flex-none items-center gap-2 border-b border-destructive/30 bg-destructive/10 px-7 py-2 text-[12px] text-foreground">
          <TriangleAlert size={16} strokeWidth={1.75} className="text-destructive" />
          <span className="font-bold">Erreur chargement réalisabilité :</span>
          <span className="font-mono">{props.view.x3Error}</span>
        </div>
      )}

      {/* ═══ Proactif : table ═══ */}
      {props.loading ? (
        <div className="flex flex-1 items-center justify-center gap-2 text-muted-foreground">
          <Loader2 size={20} strokeWidth={1.75} className="animate-spin" />
          <span className="text-[13px] font-medium">Calcul de la réalisabilité…</span>
        </div>
      ) : props.error ? (
        <div className="flex flex-1 items-center justify-center gap-2 text-[13px] text-destructive">
          <CircleX size={20} strokeWidth={1.75} />
          Échec du calcul de réalisabilité.
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-hidden p-5">
          <DataTable
            columns={columns}
            rows={rows}
            sorting={sorting}
            onSortingChange={setSorting}
            indexColumn={indexCol}
            getRowClass={(row: ProactiveDisplayRow) => {
              const k = row.verdictKey
              const s = k === 'blocked' || k === 'uncov' ? ('critical' as const) : row.lateSeverity
              return cn(
                'border-t border-rule-soft transition-colors even:bg-foreground/[0.015]',
                LATE_TONE.bg(s)
              )
            }}
            tableClass="min-w-[1252px] table-fixed"
            scrollContainerClass="h-full border border-rule rounded-lg shadow-float bg-card"
            theadRowClass="sticky top-0 z-10 bg-secondary"
            onRowClick={props.onRowClick}
            selectedRowKey={props.selectedRowKey}
            getRowKey={(row: ProactiveDisplayRow) => `${row.numCommande}::${row.article}::${row.dateExpIso ?? row.dateExp}`}
            emptyState={
              <div className="flex flex-1 items-center justify-center p-12 text-center">
                <div className="flex flex-col items-center">
                  <div className="mb-4 inline-flex size-14 items-center justify-center rounded-full bg-secondary text-muted-foreground/60">
                    <DynamicIcon name={props.view.x3Error ? 'cloud_off' : 'search_off'} size={28} strokeWidth={1.75} />
                  </div>
                  <h3 className="mb-1 font-sans text-[14px] font-bold text-foreground">
                    {props.view.x3Error ? 'Erreur de connexion Sage X3' : 'Aucun résultat trouvé'}
                  </h3>
                  <p className="mb-5 max-w-sm font-sans text-[12px] leading-normal text-muted-foreground">
                    {props.view.x3Error
                      ? 'Impossible de récupérer les dernières données de réalisabilité depuis le serveur ERP Sage X3.'
                      : 'Aucune ligne de commande ne correspond aux filtres ou à la recherche actuels.'}
                  </p>
                  {!props.view.x3Error && props.onResetFilters && (
                    <button
                      type="button"
                      onClick={() => props.onResetFilters?.()}
                      className="inline-flex items-center gap-1.5 rounded-full border border-rule bg-card px-4 py-1.5 font-sans text-[11px] font-bold text-foreground transition-colors hover:border-brand hover:bg-brand-soft hover:text-brand"
                    >
                      <FilterX size={13} strokeWidth={1.75} className="leading-none" />
                      Réinitialiser les filtres
                    </button>
                  )}
                </div>
              </div>
            }
          />
        </div>
      )}
    </>
  )
}
