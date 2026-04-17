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
import type { OrderRow } from '@/types/scheduler'

interface OrderStatusTableProps {
  rows: OrderRow[]
}

function formatDate(v?: string) {
  if (!v) return '-'
  try { return new Date(v).toLocaleDateString('fr-FR') } catch { return v }
}

function statusBadge(statut: string) {
  const s = statut.toLowerCase()
  if (s.includes('servie sur stock') || s.includes('planifie a temps'))
    return <Badge className="bg-green text-green-foreground">{statut}</Badge>
  if (s.includes('retard'))
    return <Badge className="bg-orange text-orange-foreground">{statut}</Badge>
  if (s.includes('non couverte') || s.includes('non planifie'))
    return <Badge variant="destructive">{statut}</Badge>
  return <Badge variant="outline">{statut}</Badge>
}

export function OrderStatusTable({ rows }: OrderStatusTableProps) {
  const [globalFilter, setGlobalFilter] = useState('')
  const [sorting, setSorting] = useState<SortingState>([])
  const [statutFilter, setStatutFilter] = useState('')

  const data = useMemo(() => {
    if (!statutFilter) return rows
    return rows.filter((r) => r.statut === statutFilter)
  }, [rows, statutFilter])

  const statuts = useMemo(() => [...new Set(rows.map((r) => r.statut))].sort(), [rows])

  const columns = useMemo<ColumnDef<OrderRow>[]>(
    () => [
      { accessorKey: 'commande', header: 'Commande' },
      { accessorKey: 'article_commande', header: 'Article' },
      { accessorFn: (r) => formatDate(r.date_demande), header: 'Demande', id: 'date_demande' },
      { accessorKey: 'qte', header: 'Qte' },
      { accessorKey: 'of', header: 'OF' },
      { accessorFn: (r) => formatDate(r.jour_planifie), header: 'Planifie', id: 'jour_planifie' },
      {
        accessorKey: 'statut',
        header: 'Statut',
        cell: ({ getValue }) => statusBadge(getValue() as string),
      },
      { accessorKey: 'matching', header: 'Matching' },
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
      return o.commande.toLowerCase().includes(s) || o.article_commande.toLowerCase().includes(s)
    },
    initialState: { pagination: { pageSize: 50 } },
  })

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Commandes ({data.length})</CardTitle>
        <div className="flex gap-2 items-center">
          <select
            className="text-xs border border-input rounded-md px-2 py-1 bg-background"
            value={statutFilter}
            onChange={(e) => setStatutFilter(e.target.value)}
          >
            <option value="">Tous les statuts</option>
            {statuts.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <Input
            placeholder="Rechercher commande, article..."
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
