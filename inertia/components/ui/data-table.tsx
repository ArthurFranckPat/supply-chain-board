import { For, Show, type Accessor, type JSX, splitProps } from 'solid-js'
import { createVirtualizer } from '@tanstack/solid-virtual'
import { cx } from '@/libs/cva'

/**
 * Tableau de données avec virtualisation TanStack, SANS TanStack Table.
 *
 * Le tri et le filtre sont entièrement gérés par le parent : ce composant
 * reçoit les lignes déjà triées/filtrées et affiche simplement. Les en-têtes
 * cliquables appellent `onSortingChange` pour que le parent mette à jour le tri.
 *
 * Pourquoi pas TanStack Table ? `createSolidTable` v8 ne tracke pas les
 * signaux extérieurs (mergeProps paresseux) : le tri/filtre ne se mettait
 * jamais à jour. Cette version est moins magique mais 100% réactive.
 */

/** Définition simplifiée d'une colonne (compatible avec les définitions TanStack). */
export interface ColumnDef<TRow> {
  /** Optionnel : les colonnes `accessor` du columnHelper TanStack n'ont pas d'`id`
   *  (il est dérivé de `accessorKey`). On résout l'un ou l'autre via `colId()`. */
  id?: string
  // `header`/`cell` : `any` volontaire. Ce sont des shims structurels acceptant les
  // `ColumnDefTemplate` TanStack (string | fn(HeaderContext/CellContext)) dont la
  // variance générique est inconciliable avec une signature précise. Rendu géré par
  // `renderHeader` / le rendu de cellule (qui ne gèrent que string | fn).
  header?: any
  accessorKey?: keyof TRow | (string & {})
  accessorFn?: (row: TRow) => unknown
  cell?: any
  enableSorting?: boolean
  meta?: {
    thClass?: string
    tdClass?: string
  }
}

export interface DataTableIndexColumn<TRow> {
  headerLabel: string
  thClass: string
  tdClass: (row: TRow, virtualIndex: number) => string
}

export interface SortingState {
  id: string
  desc: boolean
}

export interface DataTableProps<TRow> {
  columns: ColumnDef<TRow>[]
  rows: Accessor<TRow[]>
  sorting: Accessor<SortingState[]>
  onSortingChange: (sorting: SortingState[]) => void
  indexColumn?: DataTableIndexColumn<TRow>
  tableClass?: string
  scrollContainerClass?: string
  theadRowClass?: string
  getRowClass?: (row: TRow, virtualIndex: number) => string | undefined
  emptyState?: JSX.Element
}

const DEFAULT_SCROLL_CLASS =
  'h-full overflow-auto rounded-xl border border-rule bg-card shadow-[0_1px_2px_rgba(31,26,19,.05)]'

export function DataTable<TRow>(props: DataTableProps<TRow>) {
  const [local] = splitProps(props, [
    'columns',
    'rows',
    'sorting',
    'onSortingChange',
    'indexColumn',
    'tableClass',
    'scrollContainerClass',
    'theadRowClass',
    'getRowClass',
    'emptyState',
  ])

  let scrollRef: HTMLDivElement | undefined
  const rowVirtualizer = createVirtualizer({
    get count() {
      return local.rows().length
    },
    getScrollElement: () => scrollRef ?? null,
    estimateSize: () => 56,
    overscan: 12,
  })

  const virtualItems = () => rowVirtualizer.getVirtualItems()
  const totalSize = () => rowVirtualizer.getTotalSize()
  const topPad = () => (virtualItems().length > 0 ? virtualItems()[0]!.start : 0)
  const bottomPad = () =>
    virtualItems().length > 0 ? totalSize() - virtualItems()[virtualItems().length - 1]!.end : 0

  /**
   * Lignes visibles = (item virtuel × ligne). On dépend explicitement de `rows()`
   * ET de `virtualItems()` : le virtualizer mémoïse son tableau tant que le scroll
   * et le `count` ne bougent pas, donc un tri (ou un filtre à count constant) ne
   * re-déclencherait pas le `<For>`. Ce memo force le re-rendu sur changement d'ordre.
   */
  const visibleRows = () => {
    const rows = local.rows()
    return virtualItems()
      .map((vi) => ({ vi, row: rows[vi.index] }))
      .filter((x): x is { vi: (typeof x)['vi']; row: TRow } => x.row != null)
  }

  /** id effectif d'une colonne : `id` explicite (display) ou `accessorKey` (accessor). */
  const colId = (col: ColumnDef<TRow>): string => col.id ?? (col.accessorKey as string)

  const toggleSorting = (columnId: string) => {
    const current = local.sorting()
    const existing = current.find((s) => s.id === columnId)
    if (!existing) {
      local.onSortingChange([{ id: columnId, desc: false }])
    } else if (!existing.desc) {
      local.onSortingChange([{ id: columnId, desc: true }])
    } else {
      local.onSortingChange([])
    }
  }

  const getValue = (row: TRow, col: ColumnDef<TRow>) => {
    if (col.accessorFn) return col.accessorFn(row)
    if (col.accessorKey) return row[col.accessorKey as keyof TRow]
    return undefined
  }

  const renderHeader = (col: ColumnDef<TRow>) => {
    if (typeof col.header === 'function') {
      return (col.header as (ctx?: unknown) => JSX.Element)({ column: { columnDef: col } })
    }
    if (typeof col.header === 'string') return col.header
    return colId(col)
  }

  const sortIndicator = (col: ColumnDef<TRow>) => {
    if (col.enableSorting === false) return null
    const sorted = local.sorting().find((s) => s.id === colId(col))
    if (!sorted) {
      return (
        <span class="material-symbols-outlined text-[12px] leading-none text-muted-foreground/50">
          unfold_more
        </span>
      )
    }
    return (
      <span class="material-symbols-outlined text-[12px] leading-none text-terra">
        {sorted.desc ? 'arrow_downward' : 'arrow_upward'}
      </span>
    )
  }

  return (
    <div class={cx(DEFAULT_SCROLL_CLASS, local.scrollContainerClass)} ref={(el) => (scrollRef = el)}>
      <Show when={local.rows().length > 0} fallback={local.emptyState}>
        <table class={cx('w-full border-collapse text-left', local.tableClass)}>
          <thead>
            <tr class={local.theadRowClass}>
              <Show when={local.indexColumn}>
                <th class={local.indexColumn!.thClass}>{local.indexColumn!.headerLabel}</th>
              </Show>
              <For each={local.columns}>
                {(col) => (
                  <th
                    class={col.meta?.thClass}
                    style={{ cursor: col.enableSorting !== false ? 'pointer' : 'default' }}
                    onClick={() => col.enableSorting !== false && toggleSorting(colId(col))}
                  >
                    <span class="inline-flex items-center gap-1">
                      <span>{renderHeader(col)}</span>
                      {sortIndicator(col)}
                    </span>
                  </th>
                )}
              </For>
            </tr>
          </thead>
          <tbody>
            <Show when={topPad() > 0}>
              <tr>
                <td style={{ height: `${topPad()}px` }} />
              </tr>
            </Show>
            <For each={visibleRows()}>
              {({ vi: virtualRow, row }) => (
                <tr
                  data-index={virtualRow.index}
                  ref={(el) => rowVirtualizer.measureElement(el)}
                  class={local.getRowClass?.(row, virtualRow.index)}
                >
                  <Show when={local.indexColumn}>
                    <td class={local.indexColumn!.tdClass(row, virtualRow.index)}>
                      {String(virtualRow.index + 1).padStart(2, '0')}
                    </td>
                  </Show>
                  <For each={local.columns}>
                    {(col) => {
                      const value = () => getValue(row, col)
                      return (
                        <td class={col.meta?.tdClass}>
                          {col.cell
                            ? col.cell({ row: { original: row } as any, getValue: value, column: { columnDef: col } as any } as any)
                            : (value() as any)}
                        </td>
                      )
                    }}
                  </For>
                </tr>
              )}
            </For>
            <Show when={bottomPad() > 0}>
              <tr>
                <td style={{ height: `${bottomPad()}px` }} />
              </tr>
            </Show>
          </tbody>
        </table>
      </Show>
    </div>
  )
}
