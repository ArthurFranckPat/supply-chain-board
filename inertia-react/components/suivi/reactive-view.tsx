/**
 * Vue réactive du Suivi — axe allocation/expédition as-is (statuts + causes
 * de retard). Le cadre (erreur, chargement, Card, table, état vide) vit dans
 * SuiviTableShell ; ici ne restent que les colonnes, le tri et le
 * dépliage des emplacements.
 */
import { useMemo, useState, type ReactNode } from 'react'

import type { SuiviRowsResponse, SuiviDisplayRow } from '@r/lib/suivi/types'
import { sortRows, suiviRowKey } from '@r/lib/suivi/shared'
import { createReactiveColumns, createReactiveIndexCol } from '@r/lib/suivi/reactive-columns'
import { SuiviTableShell } from './table-shell'
import { columnId, type SortingState } from '@r/components/ui/data-table'

export interface ReactiveViewProps {
  view: SuiviRowsResponse
  filteredRows: SuiviDisplayRow[]
  loading: boolean
  error: boolean
  onRetry?: () => void
  isFiltered: boolean
  horsFenetre?: boolean
  onResetFilters?: () => void
  onRowClick?: (row: SuiviDisplayRow) => void
  selectedRowKey?: string | null
  printContext?: ReactNode
  /** Ids des colonnes à afficher (menu « Colonnes ») — undefined = toutes. */
  visibleColumnIds?: string[]
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

  // Tri et colonnes étaient recalculés à CHAQUE rendu — or `useTimedFetch`
  // pousse son chrono toutes les 200 ms tant que l'autre vue charge : la table
  // était re-triée 5 fois par seconde pendant un chargement.
  const rows = useMemo(() => sortRows(props.filteredRows, sorting), [props.filteredRows, sorting])
  const columns = useMemo(
    () =>
      createReactiveColumns({
        expandedEmps,
        toggleEmp,
        referenceDate: props.view.referenceDate,
        onOpenRow: props.onRowClick,
      }).filter((c) => !props.visibleColumnIds || props.visibleColumnIds.includes(columnId(c))),
    [expandedEmps, props.view.referenceDate, props.onRowClick, props.visibleColumnIds]
  )
  const indexCol = useMemo(() => createReactiveIndexCol(), [])

  return (
    <SuiviTableShell
      x3Error={props.view.x3Error}
      sujet="du suivi"
      rows={rows}
      columns={columns}
      indexColumn={indexCol}
      sorting={sorting}
      onSortingChange={setSorting}
      loading={props.loading}
      error={props.error}
      onRetry={props.onRetry}
      tableClass="min-w-[1342px] table-fixed"
      estimateRowSize={64}
      stickyCols={2}
      onRowClick={props.onRowClick}
      selectedRowKey={props.selectedRowKey}
      getRowKey={suiviRowKey}
      isFiltered={props.isFiltered}
      horsFenetre={props.horsFenetre}
      onResetFilters={props.onResetFilters}
      printContext={props.printContext}
    />
  )
}
