import React, { useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  FlatTable,
  FlatTableHead,
  FlatTableHeader,
  FlatTableBody,
  FlatTableRow,
  FlatTableCell,
} from 'carbon-react/esm/components/flat-table'
import { cn } from '@/libs/cn'

// Cast to any to bypass overly restrictive TypeScript definitions on Carbon React components
// which do not declare standard HTML props like 'className', 'style', 'colspan', or 'onClick'.
const Table = FlatTable as any
const TableHead = FlatTableHead as any
const TableHeader = FlatTableHeader as any
const TableBody = FlatTableBody as any
const TableRow = FlatTableRow as any
const TableCell = FlatTableCell as any

export interface ColumnDef<TRow> {
  id?: string
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
  rows: TRow[]
  sorting: SortingState[]
  onSortingChange: (sorting: SortingState[]) => void
  indexColumn?: DataTableIndexColumn<TRow>
  tableClass?: string
  scrollContainerClass?: string
  theadRowClass?: string
  getRowClass?: (row: TRow, virtualIndex: number) => string | undefined
  onRowClick?: (row: TRow) => void
  selectedRowKey?: string | null
  getRowKey?: (row: TRow) => string
  emptyState?: React.ReactNode
}

const DEFAULT_SCROLL_CLASS =
  'h-full overflow-auto rounded-xl border border-rule bg-card shadow-[0_1px_2px_rgba(31,26,19,.05)]'

export function DataTable<TRow>({
  columns,
  rows,
  sorting,
  onSortingChange,
  indexColumn,
  tableClass,
  scrollContainerClass,
  theadRowClass,
  getRowClass,
  onRowClick,
  selectedRowKey,
  getRowKey,
  emptyState,
}: DataTableProps<TRow>) {
  const scrollRef = useRef<HTMLDivElement>(null)

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 56,
    overscan: 12,
  })

  const virtualItems = rowVirtualizer.getVirtualItems()
  const totalSize = rowVirtualizer.getTotalSize()
  const topPad = virtualItems.length > 0 ? virtualItems[0].start : 0
  const bottomPad =
    virtualItems.length > 0 ? totalSize - virtualItems[virtualItems.length - 1].end : 0

  const colId = (col: ColumnDef<TRow>): string =>
    col.id ?? (col.accessorKey as string)

  const toggleSorting = (columnId: string) => {
    const existing = sorting.find((s) => s.id === columnId)
    if (!existing) {
      onSortingChange([{ id: columnId, desc: false }])
    } else if (!existing.desc) {
      onSortingChange([{ id: columnId, desc: true }])
    } else {
      onSortingChange([])
    }
  }

  const getValue = (row: TRow, col: ColumnDef<TRow>) => {
    if (col.accessorFn) return col.accessorFn(row)
    if (col.accessorKey) return row[col.accessorKey as keyof TRow]
    return undefined
  }

  const renderHeader = (col: ColumnDef<TRow>) => {
    if (typeof col.header === 'function') {
      return col.header({ column: { columnDef: col } })
    }
    if (typeof col.header === 'string') return col.header
    return colId(col)
  }

  const sortIndicator = (col: ColumnDef<TRow>) => {
    if (col.enableSorting === false) return null
    const sorted = sorting.find((s) => s.id === colId(col))
    if (!sorted) {
      return (
        <span className="material-symbols-outlined text-[12px] leading-none text-muted-foreground/50">
          unfold_more
        </span>
      )
    }
    return (
      <span className="material-symbols-outlined text-[12px] leading-none text-brand">
        {sorted.desc ? 'arrow_downward' : 'arrow_upward'}
      </span>
    )
  }

  return (
    <div
      className={cn(DEFAULT_SCROLL_CLASS, scrollContainerClass)}
      ref={scrollRef}
    >
      {rows.length > 0 ? (
        <Table
          className={cn('w-full border-collapse text-left', tableClass)}
          hasStickyHead
          colorTheme="light"
        >
          <TableHead>
            <TableRow className={theadRowClass}>
              {indexColumn && (
                <TableHeader className={indexColumn.thClass}>
                  {indexColumn.headerLabel}
                </TableHeader>
              )}
              {columns.map((col) => {
                const columnId = colId(col)
                const isSorted = sorting.some((s) => s.id === columnId)
                const canSort = col.enableSorting !== false

                return (
                  <TableHeader
                    key={columnId}
                    className={cn(
                      col.meta?.thClass,
                      canSort && 'hover:text-foreground transition-colors cursor-pointer',
                      isSorted && 'text-foreground font-bold'
                    )}
                    onClick={() => canSort && toggleSorting(columnId)}
                  >
                    <span className="inline-flex items-center gap-1">
                      <span>{renderHeader(col)}</span>
                      {sortIndicator(col)}
                    </span>
                  </TableHeader>
                )
              })}
            </TableRow>
          </TableHead>
          <TableBody>
            {topPad > 0 && (
              <TableRow>
                <TableCell style={{ height: `${topPad}px` }} colspan={columns.length + (indexColumn ? 1 : 0)} />
              </TableRow>
            )}
            
            {virtualItems.map((virtualRow) => {
              const row = rows[virtualRow.index]
              if (!row) return null

              const isSelected = selectedRowKey && getRowKey && getRowKey(row) === selectedRowKey
              const rowKey = getRowKey ? getRowKey(row) : virtualRow.index

              return (
                <TableRow
                  key={rowKey}
                  ref={rowVirtualizer.measureElement}
                  className={cn(
                    getRowClass?.(row, virtualRow.index),
                    isSelected && 'ring-2 ring-inset ring-brand/40 bg-brand/[0.04]'
                  )}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  style={onRowClick ? { cursor: 'pointer' } : undefined}
                >
                  {indexColumn && (
                    <TableCell className={indexColumn.tdClass(row, virtualRow.index)}>
                      {String(virtualRow.index + 1).padStart(2, '0')}
                    </TableCell>
                  )}
                  {columns.map((col) => {
                    const columnId = colId(col)
                    const val = getValue(row, col)

                    return (
                      <TableCell key={columnId} className={col.meta?.tdClass}>
                        {col.cell
                          ? col.cell({
                              row: { original: row },
                              getValue: () => val,
                              column: { columnDef: col },
                            })
                          : (val as React.ReactNode)}
                      </TableCell>
                    )
                  })}
                </TableRow>
              )
            })}

            {bottomPad > 0 && (
              <TableRow>
                <TableCell style={{ height: `${bottomPad}px` }} colspan={columns.length + (indexColumn ? 1 : 0)} />
              </TableRow>
            )}
          </TableBody>
        </Table>
      ) : (
        emptyState
      )}
    </div>
  )
}

export default DataTable
