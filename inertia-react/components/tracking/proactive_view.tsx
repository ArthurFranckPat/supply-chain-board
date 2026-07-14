import React, { useMemo } from 'react'
import type { ProactiveRowsResponse, ProactiveDisplayRow } from '@/lib/suivi/types'
import { createProactiveColumns, createProactiveIndexCol } from '../../lib/suivi/proactive_columns'
import { SuiviTableView } from './suivi_table_view'

/**
 * Vue proactive (réalisabilité projetée) — wrapper mince autour de `SuiviTableView`.
 *
 * Spécificité proactive : tri par défaut sur joursRetard desc (les plus en retard
 * d'abord), escalade du tone (blocked/uncov → critical pour la coloration de ligne),
 * pas de colonne Emplacements repliable, largeur table 1252px.
 */
export interface ProactiveViewProps {
  view: ProactiveRowsResponse
  filteredRows: ProactiveDisplayRow[]
  loading: boolean
  error: boolean
  onResetFilters?: () => void
  onRowClick?: (row: ProactiveDisplayRow) => void
  selectedRowKey?: string | null
}

export function ProactiveView({
  view,
  filteredRows,
  loading,
  error,
  onResetFilters,
  onRowClick,
  selectedRowKey,
}: ProactiveViewProps) {
  const columns = useMemo(
    () => createProactiveColumns({ referenceDate: view.referenceDate }),
    [view.referenceDate]
  )
  const indexCol = useMemo(() => createProactiveIndexCol(), [])

  return (
    <SuiviTableView<ProactiveDisplayRow, ProactiveRowsResponse>
      view={view}
      filteredRows={filteredRows}
      loading={loading}
      error={error}
      defaultSorting={[{ id: 'joursRetard', desc: true }]}
      tableMinWidth="min-w-[1252px]"
      columns={columns}
      indexColumn={indexCol}
      domainLabel="réalisabilité"
      x3ErrorMessage="Impossible de récupérer les dernières données de réalisabilité depuis le serveur ERP Sage X3."
      getRowTone={(row) =>
        row.verdictKey === 'blocked' || row.verdictKey === 'uncov' ? 'critical' : row.lateSeverity
      }
      onResetFilters={onResetFilters}
      onRowClick={onRowClick}
      selectedRowKey={selectedRowKey}
      getRowKey={(row) => `${row.numCommande}::${row.article}`}
    />
  )
}
