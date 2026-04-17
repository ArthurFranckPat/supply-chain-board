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
import { Badge } from '@/components/ui/badge'
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
import type { CandidateOF } from '@/types/scheduler'

interface PlanningTableProps {
  candidates: Record<string, CandidateOF[]>
}

function formatDate(v?: string | null) {
  if (!v) return '-'
  try { return new Date(v).toLocaleDateString('fr-FR') } catch { return v }
}

function formatHour(h: number | null) {
  if (h == null) return '-'
  const hours = Math.floor(7 + h)
  const mins = Math.round((h % 1) * 60)
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`
}

const sourceLabels: Record<string, string> = {
  matching_client: 'Client',
  encours_of: 'En cours',
  buffer_bdh: 'Buffer',
}

export function PlanningTable({ candidates }: PlanningTableProps) {
  const [globalFilter, setGlobalFilter] = useState('')
  const [sorting, setSorting] = useState<SortingState>([])
  const [lineFilter, setLineFilter] = useState<string>('')

  const data = useMemo(() => {
    const flat = Object.entries(candidates).flatMap(([line, ofs]) =>
      ofs.map((of) => ({ ...of, line })),
    )
    if (!lineFilter) return flat
    return flat.filter((o) => o.line === lineFilter)
  }, [candidates, lineFilter])

  const lines = useMemo(
    () => [...new Set(Object.values(candidates).flatMap((ofs) => ofs.map((o) => o.line)))].sort(),
    [candidates],
  )

  const columns = useMemo<ColumnDef<CandidateOF & { line: string }>[]>(
    () => [
      { accessorKey: 'num_of', header: 'OF', cell: ({ getValue }) => <span className="font-mono text-xs">{getValue() as string}</span> },
      { accessorKey: 'article', header: 'Article' },
      { accessorKey: 'line', header: 'Ligne' },
      { accessorKey: 'quantity', header: 'Qte' },
      { accessorKey: 'charge_hours', header: 'Charge', cell: ({ getValue }) => `${(getValue() as number).toFixed(1)}h` },
      { accessorFn: (r) => formatDate(r.due_date), header: 'Echeance', id: 'due_date' },
      { accessorFn: (r) => formatDate(r.scheduled_day), header: 'Planifie', id: 'scheduled_day' },
      { accessorFn: (r) => formatHour(r.start_hour), header: 'Debut', id: 'start_hour' },
      { accessorFn: (r) => formatHour(r.end_hour), header: 'Fin', id: 'end_hour' },
      {
        accessorKey: 'source',
        header: 'Source',
        cell: ({ getValue }) => <Badge variant="outline">{sourceLabels[getValue() as string] ?? (getValue() as string)}</Badge>,
      },
      {
        id: 'realisable',
        header: 'Realisable',
        cell: ({ row }) => (
          <Badge variant={row.original.scheduled_day ? 'default' : 'destructive'}>
            {row.original.scheduled_day ? 'Oui' : 'Non'}
          </Badge>
        ),
      },
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
      return (
        o.num_of.toLowerCase().includes(s) ||
        o.article.toLowerCase().includes(s) ||
        (o.description ?? '').toLowerCase().includes(s)
      )
    },
    initialState: { pagination: { pageSize: 50 } },
  })

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Planning ({data.length} OF)</CardTitle>
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
