import React, { useState, useMemo } from 'react'
import { Message, LoaderSpinner } from 'carbon-react'
// Button (carbon-react root) est déprécié — ButtonNext est le remplaçant officiel.
import Button from 'carbon-react/esm/components/button/__next__'
import { cn } from '@/libs/cn'
import { DataTable, type SortingState, type ColumnDef, type DataTableIndexColumn } from '../ui/data-table'
import { sortRows, LATE_TONE } from '@/lib/suivi/tracking-shared'

/**
 * Vue tableau commune aux modes réactif et proactif du Suivi.
 *
 * Refactor (issue #77 §4) : `reactive_view` et `proactive_view` étaient 95 %
 * dupliqués (overlay de chargement, banner X3, empty state, structure de table
 * identiques ; seuls le tri par défaut, les libellés, le calcul de `getRowClass`
 * et la largeur min changeaient). Ce composant factorise tout en acceptant les
 * delta via props, et migre les overlays/bannières sur les composants Carbon
 * (Message, LoaderSpinner, Button) au lieu du div-soup Tailwind.
 */
export interface SuiviTableViewProps<TRow, TResponse> {
  /** Payload Inertia (pour x3Error + referenceDate). */
  view: TResponse & { x3Error?: string | null }
  /** Lignes déjà filtrées par le parent. */
  filteredRows: TRow[]
  loading: boolean
  error: boolean
  /** Colonne + index de tri par défaut. */
  defaultSorting: SortingState[]
  /** Largeur min de la table (diffère réactif/proactif). */
  tableMinWidth: string
  /** Colonnes construites par le parent. */
  columns: ColumnDef<TRow>[]
  /** Colonne d'index (render séquentiel — type distinct de ColumnDef). */
  indexColumn: DataTableIndexColumn<TRow>
  /** Nom du domaine affiché dans les libellés ("suivi" | "réalisabilité"). */
  domainLabel: string
  /** Message X3 plus précis pour le banner d'erreur. */
  x3ErrorMessage: string
  /** Calcul de la classe de ligne (escalade verdict→critical côté proactif). */
  getRowTone: (row: TRow) => 'tolerance' | 'critical' | null
  /** Callbacks. */
  onResetFilters?: () => void
  onRowClick?: (row: TRow) => void
  selectedRowKey?: string | null
  getRowKey: (row: TRow) => string
}

export function SuiviTableView<
  TRow extends { numCommande: string; dateExpIso: string | null },
  TResponse,
>({
  view,
  filteredRows,
  loading,
  error,
  defaultSorting,
  tableMinWidth,
  columns,
  indexColumn,
  domainLabel,
  x3ErrorMessage,
  getRowTone,
  onResetFilters,
  onRowClick,
  selectedRowKey,
  getRowKey,
}: SuiviTableViewProps<TRow, TResponse>) {
  const [sorting, setSorting] = useState<SortingState[]>(defaultSorting)

  // Tri manuel (le DataTable garde TanStack react-virtual mais pas react-table ;
  // sortRows est la fonction partagée qui applique le sortingState).
  const rows = useMemo(
    () => sortRows(filteredRows, sorting),
    [filteredRows, sorting]
  )

  return (
    <div className="flex-1 flex flex-col overflow-hidden relative">
      {/* ═══ X3 injoignable — Carbon Message ═══ */}
      {view.x3Error && (
        <div className="flex-none px-7 pt-2">
          <Message variant="error" title={`Erreur chargement ${domainLabel} :`}>
            <span className="font-mono">{view.x3Error}</span>
          </Message>
        </div>
      )}

      {/* ═══ Table ═══ */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        {/* Overlay de chargement — Carbon LoaderSpinner (remplace le div-soup + Material icon animate-spin). */}
        {loading && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-background/20 backdrop-blur-[0.5px]">
            <div className="flex items-center gap-3 rounded-full border border-rule bg-card px-5 py-2.5 shadow-lg">
              <LoaderSpinner size="small" showSpinnerLabel={false} />
              <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-muted-foreground">
                Calcul en cours…
              </span>
            </div>
          </div>
        )}

        {!error ? (
          <div
            className={cn(
              "flex-1 overflow-hidden p-5 transition-opacity duration-200",
              loading && "opacity-50 pointer-events-none"
            )}
          >
            <DataTable
              columns={columns}
              rows={rows}
              sorting={sorting}
              onSortingChange={setSorting}
              indexColumn={indexColumn}
              getRowClass={(row: TRow) =>
                cn('border-t border-rule-soft transition-colors even:bg-foreground/[0.015]', LATE_TONE.bg(getRowTone(row)))
              }
              tableClass={`${tableMinWidth} table-fixed`}
              scrollContainerClass="h-full border border-rule rounded-xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] bg-card"
              theadRowClass="sticky top-0 z-10 bg-secondary"
              onRowClick={onRowClick}
              selectedRowKey={selectedRowKey}
              getRowKey={getRowKey}
              emptyState={
                <div className="flex flex-1 items-center justify-center p-12 text-center">
                  <div className="flex flex-col items-center max-w-sm">
                    {view.x3Error ? (
                      <Message variant="error-subtle" title="Erreur de connexion Sage X3">
                        {x3ErrorMessage}
                      </Message>
                    ) : (
                      <>
                        <div className="inline-flex size-14 items-center justify-center rounded-full bg-secondary text-muted-foreground/60 mb-4">
                          <span className="material-symbols-outlined text-[28px]">search_off</span>
                        </div>
                        <h3 className="font-sans text-[14px] font-bold text-foreground mb-1">
                          Aucun résultat trouvé
                        </h3>
                        <p className="font-sans text-[12px] text-muted-foreground mb-5 leading-normal">
                          Aucune ligne de commande ne correspond aux filtres ou à la recherche actuels.
                        </p>
                        {onResetFilters && (
                          <Button
                            variantType="tertiary"
                            iconType="filter"
                            size="small"
                            onClick={onResetFilters}
                          >
                            Réinitialiser les filtres
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              }
            />
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center p-6">
            <Message variant="error" title={`Échec du calcul du ${domainLabel}.`} />
          </div>
        )}
      </div>
    </div>
  )
}
