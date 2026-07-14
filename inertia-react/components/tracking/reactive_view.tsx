import React, { useMemo, useState } from 'react'
import type { SuiviRowsResponse, SuiviDisplayRow } from '@/lib/suivi/types'
import { createReactiveColumns, createReactiveIndexCol } from '../../lib/suivi/reactive_columns'
import { SuiviTableView } from './suivi_table_view'

/**
 * Vue réactive (suivi as-is) — wrapper mince autour de `SuiviTableView`.
 * La logique de rendu (overlay Carbon, empty state, table) est mutualisée
 * avec la vue proactive (refactor issue #77 §4).
 *
 * Spécificité réactive : tri par défaut sur dateExp (chrono ascendant),
 * colonne "Emplacements" repliable (expandedEmps), largeur table 1342px.
 */
export interface ReactiveViewProps {
  view: SuiviRowsResponse
  filteredRows: SuiviDisplayRow[]
  loading: boolean
  error: boolean
  onResetFilters?: () => void
  onRowClick?: (row: SuiviDisplayRow) => void
  selectedRowKey?: string | null
}

export function ReactiveView({
  view,
  filteredRows,
  loading,
  error,
  onResetFilters,
  onRowClick,
  selectedRowKey,
}: ReactiveViewProps) {
  const [expandedEmps, setExpandedEmps] = useState<Set<string>>(new Set())

  const toggleEmp = (key: string) => {
    setExpandedEmps((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const columns = useMemo(
    () => createReactiveColumns({ expandedEmps, toggleEmp, referenceDate: view.referenceDate }),
    [expandedEmps, view.referenceDate]
  )
  const indexCol = useMemo(() => createReactiveIndexCol(), [])

  return (
    <SuiviTableView<SuiviDisplayRow, SuiviRowsResponse>
      view={view}
      filteredRows={filteredRows}
      loading={loading}
      error={error}
      defaultSorting={[{ id: 'dateExp', desc: false }]}
      tableMinWidth="min-w-[1342px]"
      columns={columns}
      indexColumn={indexCol}
      domainLabel="suivi"
      x3ErrorMessage="Impossible de récupérer les dernières données de suivi depuis le serveur ERP Sage X3."
      getRowTone={(row) => row.lateSeverity}
      onResetFilters={onResetFilters}
      onRowClick={onRowClick}
      selectedRowKey={selectedRowKey}
      getRowKey={(row) => `${row.numCommande}::${row.article}`}
    />
  )
}
