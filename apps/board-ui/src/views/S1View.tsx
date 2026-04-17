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
import type { DetailItem } from '@/types/api'

interface OfRow {
  num_of: string
  article: string
  date_debut: string | null
  date_fin: string
  qte_restante: number
  commande: string
  commande_article: string
  commande_date_expedition: string
  matching_method: string
  feasible: boolean
  missing_components: Record<string, number>
  alerts: string[]
}

interface S1ViewProps {
  runState: 'idle' | 'running' | 'success' | 'error'
  data: Record<string, unknown> | null
  onInspect: (item: DetailItem) => void
}

function formatDate(v?: string | null) {
  if (!v) return 'N/A'
  try { return new Date(v).toLocaleDateString('fr-FR') } catch { return v }
}

export function S1View({ runState, data, onInspect }: S1ViewProps) {
  const [globalFilter, setGlobalFilter] = useState('')
  const [sorting, setSorting] = useState<SortingState>([])

  const ofResults = (data?.result as Record<string, unknown>)?.of_results as OfRow[] | undefined

  const columns = useMemo<ColumnDef<OfRow, string>[]>(
    () => [
      { accessorKey: 'num_of', header: 'OF' },
      { accessorKey: 'article', header: 'Article' },
      { accessorKey: 'commande', header: 'Commande' },
      { accessorFn: (r) => formatDate(r.date_debut), header: 'Debut' },
      { accessorFn: (r) => formatDate(r.date_fin), header: 'Fin' },
      { accessorKey: 'qte_restante', header: 'Qte' },
      {
        accessorKey: 'feasible',
        header: 'Statut',
        cell: ({ row }) => (
          <Badge variant={row.original.feasible ? 'default' : 'destructive'}>
            {row.original.feasible ? 'Faisable' : 'Bloque'}
          </Badge>
        ),
      },
      {
        id: 'manquants',
        header: 'Manquants',
        cell: ({ row }) => {
          const mc = row.original.missing_components
          const keys = Object.keys(mc)
          if (!keys.length) return '-'
          return keys.slice(0, 3).map((k) => `${k}:${mc[k]}`).join(', ')
        },
      },
    ],
    [],
  )

  const table = useReactTable({
    data: ofResults ?? [],
    columns,
    state: { globalFilter, sorting },
    onGlobalFilterChange: setGlobalFilter,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    globalFilterFn: (row, _columnId, filterValue) => {
      const search = String(filterValue).toLowerCase()
      const o = row.original
      return (
        o.num_of.toLowerCase().includes(search) ||
        o.article.toLowerCase().includes(search) ||
        o.commande.toLowerCase().includes(search)
      )
    },
  })

  if (runState === 'running') {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <p className="font-semibold">Run S+1 en cours...</p>
          <p className="text-sm">Les resultats apparaitront ici.</p>
        </CardContent>
      </Card>
    )
  }

  if (!ofResults?.length) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <p className="font-semibold">Aucun run S+1 disponible</p>
          <p className="text-sm">Lancez un run depuis Home.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-base">Faisabilite OF ({ofResults.length})</CardTitle>
        <Input
          placeholder="Rechercher OF, article, commande..."
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          className="max-w-xs"
        />
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((h) => (
                  <TableHead key={h.id} className="cursor-pointer" onClick={h.column.getToggleSortingHandler()}>
                    {flexRender(h.column.columnDef.header, h.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                className="cursor-pointer hover:bg-accent"
                onClick={() =>
                  onInspect({
                    title: row.original.num_of,
                    description: `${row.original.article} · ${row.original.commande}`,
                    payload: row.original,
                  })
                }
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="flex items-center gap-2 pt-4">
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
