import { useState, useMemo } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { UnscheduledRow } from '@/types/scheduler'

interface UnscheduledTableProps {
  rows: UnscheduledRow[]
}

function formatDate(v?: string) {
  if (!v) return '-'
  try { return new Date(v).toLocaleDateString('fr-FR') } catch { return v }
}

export function UnscheduledTable({ rows }: UnscheduledTableProps) {
  const [globalFilter, setGlobalFilter] = useState('')
  const [sorting, setSorting] = useState<SortingState>([])
  const [lineFilter, setLineFilter] = useState('')

  const data = useMemo(() => {
    if (!lineFilter) return rows
    return rows.filter((r) => r.ligne === lineFilter)
  }, [rows, lineFilter])

  const lines = useMemo(() => [...new Set(rows.map((r) => r.ligne))].sort(), [rows])

  const columns = useMemo<ColumnDef<UnscheduledRow>[]>(
    () => [
      { accessorKey: 'ligne', header: 'Ligne' },
      { accessorKey: 'of', header: 'OF', cell: ({ getValue }) => <span className="font-mono text-xs">{getValue() as string}</span> },
      { accessorKey: 'article', header: 'Article' },
      { accessorFn: (r) => formatDate(r.date_echeance), header: 'Echeance', id: 'date_echeance' },
      { accessorKey: 'charge_h', header: 'Charge', cell: ({ getValue }) => `${(getValue() as number).toFixed(1)}h` },
      { accessorKey: 'source', header: 'Source' },
      { accessorKey: 'composants_bloquants', header: 'Composants bloquants' },
      { accessorKey: 'cause', header: 'Cause' },
    ],
    [],
  )

  const table = useReactTable({
    data,
    columns,
    state: { globalFilter, sorting },
    onGlobalFilterChange: setGlobalFilter,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    globalFilterFn: (row, _colId, filter) => {
      const s = String(filter).toLowerCase()
      const o = row.original
      return o.of.toLowerCase().includes(s) || o.article.toLowerCase().includes(s)
    },
    initialState: { pagination: { pageSize: 50 } },
  })

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Non planifies ({data.length})</CardTitle>
        <div className="flex gap-2 items-center">
          <select
            className="text-xs border border-input rounded-md px-2 py-1 bg-background"
            value={lineFilter}
            onChange={(e) => setLineFilter(e.target.value)}
          >
            <option value="">Toutes les lignes</option>
            {lines.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
          <Input
            placeholder="Rechercher OF, article..."
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="max-w-xs h-8 text-xs"
          />
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((h) => (
                  <TableHead key={h.id} className="cursor-pointer text-xs" onClick={h.column.getToggleSortingHandler()}>
                    {flexRender(h.column.columnDef.header, h.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id} className="text-xs py-1.5">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="flex items-center gap-2 pt-3">
          <Button variant="outline" size="sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
            Precedent
          </Button>
          <span className="text-xs text-muted-foreground">
            Page {table.getState().pagination.pageIndex + 1} / {table.getPageCount()}
          </span>
          <Button variant="outline" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
            Suivant
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
