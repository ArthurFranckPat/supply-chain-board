/**
 * Vue proactive du Suivi (issue #52 — extraite de scheduler/tracking.tsx) :
 * réalisabilité projetée des commandes (moteur de consommation séquentielle).
 *
 * Le filtrage (verdict/type/atelier/recherche) est décidé par le shell
 * (toolbar) ; cette vue reçoit les lignes déjà filtrées et gère son propre
 * tri de table + rendu (bannière X3 + DataTable).
 */
import { createMemo, createSignal, Show, type Accessor } from 'solid-js'
import { cx } from '@/libs/cva'
import { DataTable, type SortingState } from '@/components/ui/data-table'
import type { ProactiveRowsResponse, ProactiveDisplayRow } from '@/lib/suivi/types'
import { sortRows, LATE_TONE } from '@/lib/suivi/tracking-shared'
import { createProactiveColumns, createProactiveIndexCol } from '@/lib/suivi/proactive-columns'

export interface ProactiveViewProps {
  view: Accessor<ProactiveRowsResponse>
  filteredRows: Accessor<ProactiveDisplayRow[]>
  loading: Accessor<boolean>
  error: Accessor<boolean>
}

export function ProactiveView(props: ProactiveViewProps) {
  const [sorting, setSorting] = createSignal<SortingState[]>([{ id: 'dateExp', desc: false }])

  const rows = createMemo(() => sortRows(props.filteredRows(), sorting()))

  const columns = createProactiveColumns()
  const indexCol = createProactiveIndexCol()

  return (
    <>
      {/* ═══ Proactif : X3 injoignable ═══ */}
      <Show when={props.view().x3Error}>
        <div class="flex flex-none items-center gap-2 border-b border-destructive/30 bg-destructive/10 px-7 py-2 text-[12px] text-foreground">
          <span class="material-symbols-outlined text-[16px] text-destructive">warning</span>
          <span class="font-bold">Erreur chargement réalisabilité :</span>
          <span class="font-mono">{props.view().x3Error}</span>
        </div>
      </Show>

      {/* ═══ Proactif : table ═══ */}
      <Show
        when={!props.loading()}
        fallback={
          <div class="flex flex-1 items-center justify-center gap-2 text-muted-foreground">
            <span class="material-symbols-outlined animate-spin text-[20px]">
              progress_activity
            </span>
            <span class="text-[13px] font-medium">Calcul de la réalisabilité…</span>
          </div>
        }
      >
        <Show
          when={!props.error()}
          fallback={
            <div class="flex flex-1 items-center justify-center gap-2 text-[13px] text-destructive">
              <span class="material-symbols-outlined text-[20px]">error</span>
              Échec du calcul de réalisabilité.
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
              getRowClass={(row: ProactiveDisplayRow) => {
                const k = row.verdictKey
                const s =
                  k === 'blocked' || k === 'uncov' ? ('critical' as const) : row.lateSeverity
                return cx('border-t border-rule-soft transition-colors even:bg-foreground/[0.015]', LATE_TONE.bg(s))
              }}
              tableClass="min-w-[1320px] table-fixed"
              scrollContainerClass="h-full border border-rule rounded-xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] bg-card"
              theadRowClass="sticky top-0 z-10 bg-secondary"
              emptyState={
                <div class="flex flex-1 items-center justify-center p-10 text-center font-fraunces text-[14px] italic text-muted-foreground">
                  <div class="flex flex-col items-center gap-2">
                    <span class="material-symbols-outlined text-[32px] text-muted-foreground/50">
                      {props.view().x3Error ? 'cloud_off' : 'task_alt'}
                    </span>
                    {props.view().x3Error
                      ? 'Données indisponibles (X3 injoignable).'
                      : 'Toutes les commandes ouvertes sont couvertes.'}
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
