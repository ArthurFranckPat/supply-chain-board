/**
 * Vue proactive du Suivi — réalisabilité projetée des commandes (moteur de
 * consommation séquentielle). Le cadre (erreur, chargement, Card, table, état
 * vide) vit dans TrackingTableShell ; ici ne restent que les colonnes et le tri.
 */
import { useMemo, useState, type ReactNode } from 'react'

import type { ProactiveRowsResponse, ProactiveDisplayRow } from '@r/lib/suivi/types'
import { sortRows, suiviRowKey } from '@r/lib/suivi/tracking-shared'
import { createProactiveColumns, createProactiveIndexCol } from '@r/lib/suivi/proactive-columns'
import { TrackingTableShell } from './tracking-table-shell'
import { columnId, type SortingState } from '@r/components/ui/data-table'

export interface ProactiveViewProps {
  view: ProactiveRowsResponse
  filteredRows: ProactiveDisplayRow[]
  loading: boolean
  error: boolean
  onRetry?: () => void
  isFiltered: boolean
  horsFenetre?: boolean
  onResetFilters?: () => void
  onRowClick?: (row: ProactiveDisplayRow) => void
  selectedRowKey?: string | null
  /** Clic sur un n° d'OF (colonne Couverture) → détail OF (faisabilité), comme /programme. */
  onSelectOf?: (numOf: string) => void
  /** Inclure les sous-ensembles (semi-finis) en rupture dans la colonne « Composants en rupture ». */
  showSubAssemblies?: boolean
  printContext?: ReactNode
  /** Ids des colonnes à afficher (menu « Colonnes ») — undefined = toutes. */
  visibleColumnIds?: string[]
}

export function ProactiveView(props: ProactiveViewProps) {
  // Tri par défaut : expédition la plus ancienne d'abord = « le plus en retard
  // en premier » (joursRetard desc ≈ dateExp asc). L'id `dateExp` matche une
  // colonne : l'indicateur de tri et l'aria-sort s'affichent dès le 1er rendu.
  const [sorting, setSorting] = useState<SortingState[]>([{ id: 'dateExp', desc: false }])

  // Tri et colonnes étaient recalculés à CHAQUE rendu — or `useTimedFetch`
  // pousse son chrono toutes les 200 ms tant que l'autre vue charge : la table
  // était re-triée 5 fois par seconde pendant un chargement.
  const rows = useMemo(() => sortRows(props.filteredRows, sorting), [props.filteredRows, sorting])
  const columns = useMemo(
    () =>
      createProactiveColumns({
        referenceDate: props.view.referenceDate,
        onSelectOf: props.onSelectOf,
        showSubAssemblies: props.showSubAssemblies,
        onOpenRow: props.onRowClick,
      }).filter((c) => !props.visibleColumnIds || props.visibleColumnIds.includes(columnId(c))),
    [
      props.view.referenceDate,
      props.onSelectOf,
      props.showSubAssemblies,
      props.onRowClick,
      props.visibleColumnIds,
    ]
  )
  const indexCol = useMemo(() => createProactiveIndexCol(), [])

  return (
    <TrackingTableShell
      x3Error={props.view.x3Error}
      sujet="de la réalisabilité"
      rows={rows}
      columns={columns}
      indexColumn={indexCol}
      sorting={sorting}
      onSortingChange={setSorting}
      loading={props.loading}
      error={props.error}
      onRetry={props.onRetry}
      tableClass="min-w-[1252px] table-fixed"
      // Une ligne proactive porte jusqu'à 4 composants avec descente BOM : la
      // fourchette réelle va de 56 px à plus de 200. 96 est le compromis qui
      // limite les sauts de barre de défilement avant mesure.
      estimateRowSize={96}
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
