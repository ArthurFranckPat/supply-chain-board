/**
 * Vue réactive du Suivi — port React de
 * inertia/components/tracking/reactive-view.tsx (issue #52) :
 * axe allocation/expédition as-is (statuts + causes de retard).
 */
import { useState } from 'react'

import { TriangleAlert, CircleX, FilterX } from 'lucide-react'
import { SkeletonRow } from '@r/components/ui/skeleton'
import { Card } from '@r/components/ui/card'
import { Button } from '@r/components/ui/button'
import { DynamicIcon } from '../ui/dynamic-icon'
import DataTable, { type SortingState } from '@r/components/ui/data-table'
import type { SuiviRowsResponse, SuiviDisplayRow } from '@r/lib/suivi/types'
import { sortRows, suiviRowKey } from '@r/lib/suivi/tracking-shared'
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

      {props.loading ? (
        <div className="flex-1 overflow-hidden p-5">
          <SkeletonRow count={6} />
        </div>
      ) : props.error ? (
        <div className="flex flex-1 items-center justify-center gap-2 text-[13px] text-destructive">
          <CircleX size={20} strokeWidth={1.75} />
          Échec du calcul du suivi.
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-hidden p-5">
          <Card padding="none" className="h-full overflow-hidden">
            <DataTable
              columns={columns}
              rows={rows}
              sorting={sorting}
              onSortingChange={setSorting}
              indexColumn={indexCol}
              getRowClass={() => 'group/row'}
              tableClass="min-w-[1342px] table-fixed"
              scrollContainerClass="h-full overflow-auto rounded-none border-0 bg-transparent shadow-none"
              theadRowClass="sticky top-0 z-10 bg-transparent"
              onRowClick={props.onRowClick}
              selectedRowKey={props.selectedRowKey}
              getRowKey={suiviRowKey}
              emptyState={
                <div className="flex flex-1 items-center justify-center p-12 text-center">
                  <div className="flex flex-col items-center">
                    <div className="mb-4 inline-flex size-14 items-center justify-center rounded-full bg-secondary text-muted-foreground/60">
                      <DynamicIcon
                        name={props.view.x3Error ? 'cloud_off' : 'search_off'}
                        size={28}
                        strokeWidth={1.75}
                      />
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
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => props.onResetFilters?.()}
                      >
                        <FilterX size={13} strokeWidth={1.75} />
                        Réinitialiser les filtres
                      </Button>
                    )}
                  </div>
                </div>
              }
            />
          </Card>
        </div>
      )}
    </>
  )
}
