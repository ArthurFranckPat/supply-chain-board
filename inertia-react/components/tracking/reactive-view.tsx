/**
 * Vue réactive du Suivi — port React de
 * inertia/components/tracking/reactive-view.tsx (issue #52) :
 * axe allocation/expédition as-is (statuts + causes de retard).
 */
import { useState } from 'react'

import { cn } from '@r/lib/utils'
import { TriangleAlert, Loader2, CircleX, FilterX } from 'lucide-react'
import { DynamicIcon } from '../ui/dynamic-icon'
import DataTable, { type SortingState } from '@r/components/ui/data-table'
import type { SuiviRowsResponse, SuiviDisplayRow } from '@/lib/suivi/types'
import { sortRows, LATE_TONE } from '@/lib/suivi/tracking-shared'
import { createReactiveColumns, createReactiveIndexCol } from '@r/lib/suivi/reactive-columns'

export interface ReactiveViewProps {
  view: SuiviRowsResponse
  filteredRows: SuiviDisplayRow[]
  loading: boolean
  error: boolean
  onResetFilters?: () => void
  onRowClick?: (row: SuiviDisplayRow) => void
  selectedRowKey?: string | null
}

export function ReactiveView(props: ReactiveViewProps) {
  const [sorting, setSorting] = useState<SortingState[]>([{ id: 'dateExp', desc: false }])
  const [expandedEmps, setExpandedEmps] = useState<Set<string>>(new Set())

  const toggleEmp = (key: string) =>
    setExpandedEmps((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })

  const rows = sortRows(props.filteredRows, sorting)

  const columns = createReactiveColumns({
    expandedEmps,
    toggleEmp,
    referenceDate: props.view.referenceDate,
  })
  const indexCol = createReactiveIndexCol()

  return (
    <>
      {/* ═══ X3 injoignable ═══ */}
      {props.view.x3Error && (
        <div className="flex flex-none items-center gap-2 border-b border-destructive/30 bg-destructive/10 px-7 py-2 text-[12px] text-foreground">
          <TriangleAlert size={16} strokeWidth={1.75} className="text-destructive" />
          <span className="font-bold">Erreur chargement suivi :</span>
          <span className="font-mono">{props.view.x3Error}</span>
        </div>
      )}

      {/* ═══ Table ═══ */}
      {props.loading ? (
        <div className="flex flex-1 items-center justify-center gap-2 text-muted-foreground">
          <Loader2 size={20} strokeWidth={1.75} className="animate-spin" />
          <span className="text-[13px] font-medium">Calcul du suivi…</span>
        </div>
      ) : props.error ? (
        <div className="flex flex-1 items-center justify-center gap-2 text-[13px] text-destructive">
          <CircleX size={20} strokeWidth={1.75} />
          Échec du calcul du suivi.
        </div>
      ) : (
        <div className="flex-1 overflow-hidden p-5">
          <DataTable
            columns={columns}
            rows={rows}
            sorting={sorting}
            onSortingChange={setSorting}
            indexColumn={indexCol}
            getRowClass={(row: SuiviDisplayRow) =>
              cn(
                'border-t border-rule-soft transition-colors even:bg-foreground/[0.015]',
                LATE_TONE.bg(row.lateSeverity)
              )
            }
            tableClass="min-w-[1342px] table-fixed"
            scrollContainerClass="h-full border border-rule rounded-xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] bg-card"
            theadRowClass="sticky top-0 z-10 bg-secondary"
            onRowClick={props.onRowClick}
            selectedRowKey={props.selectedRowKey}
            getRowKey={(row: SuiviDisplayRow) => `${row.numCommande}::${row.article}::${row.dateExpIso ?? row.dateExp}`}
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
                      ? 'Impossible de récupérer les dernières données de suivi depuis le serveur ERP Sage X3.'
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
