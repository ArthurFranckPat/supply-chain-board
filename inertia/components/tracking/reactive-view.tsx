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

  const columns = createReactiveColumns({ expandedEmps, toggleEmp })
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
                <div class="flex flex-1 items-center justify-center p-10 text-center font-fraunces text-[14px] italic text-muted-foreground">
                  <div class="flex flex-col items-center gap-2">
                    <span class="material-symbols-outlined text-[32px] text-muted-foreground/50">
                      {props.view().x3Error ? 'cloud_off' : 'inbox'}
                    </span>
                    {props.view().x3Error
                      ? 'Données de suivi indisponibles (X3 injoignable).'
                      : 'Aucune ligne de commande à suivre à cette date.'}
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
