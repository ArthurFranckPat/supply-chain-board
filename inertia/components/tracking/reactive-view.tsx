/**
 * Vue réactive du Suivi (issue #52 — extraite de scheduler/tracking.tsx) :
 * axe allocation/expédition as-is (statuts + causes de retard).
 *
 * Le filtrage (statut/type/atelier/recherche) est décidé par le shell
 * (toolbar) ; cette vue reçoit les lignes déjà filtrées et gère son propre
 * tri de table + rendu (bannière X3 + DataTable).
 */
import { createMemo, createSignal, Show, type Accessor } from 'solid-js'
import { cx } from '@/libs/cva'
import { DataTable, type SortingState } from '@/components/ui/data-table'
import type { SuiviRowsResponse, SuiviDisplayRow } from '@/lib/suivi/types'
import { sortRows, LATE_TONE } from '@/lib/suivi/tracking-shared'
import { createReactiveColumns, createReactiveIndexCol } from '@/lib/suivi/reactive-columns'

export interface ReactiveViewProps {
  view: Accessor<SuiviRowsResponse>
  filteredRows: Accessor<SuiviDisplayRow[]>
  loading: Accessor<boolean>
  error: Accessor<boolean>
  onResetFilters?: () => void
}

export function ReactiveView(props: ReactiveViewProps) {
  const [sorting, setSorting] = createSignal<SortingState[]>([{ id: 'dateExp', desc: false }])
  const [expandedEmps, setExpandedEmps] = createSignal<Set<string>>(new Set())

  const toggleEmp = (key: string) =>
    setExpandedEmps((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })

  const rows = createMemo(() => sortRows(props.filteredRows(), sorting()))

  const columns = createReactiveColumns({
    expandedEmps,
    toggleEmp,
    referenceDate: () => props.view().referenceDate,
  })
  const indexCol = createReactiveIndexCol()

  return (
    <>
      {/* ═══ X3 injoignable ═══ */}
      <Show when={props.view().x3Error}>
        <div class="flex flex-none items-center gap-2 border-b border-destructive/30 bg-destructive/10 px-7 py-2 text-[12px] text-foreground">
          <span class="material-symbols-outlined text-[16px] text-destructive">warning</span>
          <span class="font-bold">Erreur chargement suivi :</span>
          <span class="font-mono">{props.view().x3Error}</span>
        </div>
      </Show>

      {/* ═══ Table ═══ */}
      <Show
        when={!props.loading()}
        fallback={
          <div class="flex flex-1 items-center justify-center gap-2 text-muted-foreground">
            <span class="material-symbols-outlined animate-spin text-[20px]">
              progress_activity
            </span>
            <span class="text-[13px] font-medium">Calcul du suivi…</span>
          </div>
        }
      >
        <Show
          when={!props.error()}
          fallback={
            <div class="flex flex-1 items-center justify-center gap-2 text-[13px] text-destructive">
              <span class="material-symbols-outlined text-[20px]">error</span>
              Échec du calcul du suivi.
            </div>
          }
        >
          <div class="flex-1 overflow-hidden p-5">
            <DataTable
              columns={columns}
              rows={rows}
              sorting={sorting}
              onSortingChange={setSorting}
              indexColumn={indexCol}
              getRowClass={(row: SuiviDisplayRow) =>
                cx('border-t border-rule-soft transition-colors even:bg-foreground/[0.015]', LATE_TONE.bg(row.lateSeverity))
              }
              tableClass="min-w-[1410px] table-fixed"
              scrollContainerClass="h-full border border-rule rounded-xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] bg-card"
              theadRowClass="sticky top-0 z-10 bg-secondary"
              emptyState={
                <div class="flex flex-1 items-center justify-center p-12 text-center">
                  <div class="flex flex-col items-center">
                    <div class="inline-flex size-14 items-center justify-center rounded-full bg-secondary text-muted-foreground/60 mb-4">
                      <span class="material-symbols-outlined text-[28px]">
                        {props.view().x3Error ? 'cloud_off' : 'search_off'}
                      </span>
                    </div>
                    <h3 class="font-sans text-[14px] font-bold text-foreground mb-1">
                      {props.view().x3Error ? 'Erreur de connexion Sage X3' : 'Aucun résultat trouvé'}
                    </h3>
                    <p class="font-sans text-[12px] text-muted-foreground max-w-sm mb-5 leading-normal">
                      {props.view().x3Error
                        ? 'Impossible de récupérer les dernières données de suivi depuis le serveur ERP Sage X3.'
                        : 'Aucune ligne de commande ne correspond aux filtres ou à la recherche actuels.'}
                    </p>
                    <Show when={!props.view().x3Error && props.onResetFilters}>
                      <button
                        type="button"
                        onClick={() => props.onResetFilters?.()}
                        class="inline-flex items-center gap-1.5 rounded-full border border-rule bg-card px-4 py-1.5 font-sans text-[11px] font-bold text-foreground transition-colors hover:border-brand hover:bg-brand-soft hover:text-brand"
                      >
                        <span class="material-symbols-outlined text-[13px] leading-none">filter_alt_off</span>
                        Réinitialiser les filtres
                      </button>
                    </Show>
                  </div>
                </div>
              }
            />
          </div>
        </Show>
      </Show>
    </>
  )
}
