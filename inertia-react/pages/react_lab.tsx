import { useState } from 'react'
import { Head, usePage } from '@inertiajs/react'
import { toast } from 'sonner'

import Masthead from '@r/components/masthead'
import { Badge } from '@r/components/ui/badge'
import { Button } from '@r/components/ui/button'
import DataTable, { type ColumnDef, type SortingState } from '@r/components/ui/data-table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@r/components/ui/dialog'
import { Field, FieldLabel } from '@r/components/ui/field'
import { Input } from '@r/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@r/components/ui/select'
import { Separator } from '@r/components/ui/separator'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@r/components/ui/sheet'

/**
 * Page témoin des fondations React (phases 0-1) : masthead, primitives
 * shadcn/Base UI (thème stock), DataTable virtualisée sur données mock.
 */

interface MockRow {
  id: string
  article: string
  ligne: string
  quantity: number
  statut: 'Ferme' | 'Planifié' | 'Suggéré'
}

const LIGNES = ['PP_830', 'PP_153', 'PP_128', 'PP_146']
const STATUTS: MockRow['statut'][] = ['Ferme', 'Planifié', 'Suggéré']

const MOCK_ROWS: MockRow[] = Array.from({ length: 500 }, (_, i) => ({
  id: `OF${String(i + 1).padStart(5, '0')}`,
  article: `ART-${String((i * 37) % 900).padStart(3, '0')}`,
  ligne: LIGNES[i % LIGNES.length],
  quantity: ((i * 53) % 240) + 10,
  statut: STATUTS[i % STATUTS.length],
}))

const COLUMNS: ColumnDef<MockRow>[] = [
  { accessorKey: 'id', header: 'OF', enableSorting: true },
  { accessorKey: 'article', header: 'Article', enableSorting: true },
  { accessorKey: 'ligne', header: 'Ligne', enableSorting: true },
  {
    accessorKey: 'quantity',
    header: 'Quantité',
    enableSorting: true,
    meta: { tdClass: 'tabular-nums' },
  },
  {
    accessorKey: 'statut',
    header: 'Statut',
    enableSorting: true,
    cell: ({ row }) => (
      <Badge variant={row.original.statut === 'Ferme' ? 'default' : 'secondary'}>
        {row.original.statut}
      </Badge>
    ),
  },
]

function sortRows(rows: MockRow[], sorting: SortingState[]): MockRow[] {
  if (sorting.length === 0) return rows
  const { id, desc } = sorting[0]
  return [...rows].sort((a, b) => {
    const av = a[id as keyof MockRow]
    const bv = b[id as keyof MockRow]
    const cmp = typeof av === 'number' && typeof bv === 'number'
      ? av - bv
      : String(av).localeCompare(String(bv))
    return desc ? -cmp : cmp
  })
}

export default function ReactLab() {
  const page = usePage()
  const [sorting, setSorting] = useState<SortingState[]>([])
  const [ligne, setLigne] = useState<string | null>(null)

  const rows = sortRows(
    ligne ? MOCK_ROWS.filter((r) => r.ligne === ligne) : MOCK_ROWS,
    sorting
  )

  return (
    <>
      <Head title="React Lab" />
      <div className="flex min-h-screen flex-col bg-background text-foreground">
        <Masthead
          subtitle="LABORATOIRE REACT"
          active="dashboard"
          meta={
            <>
              Fondations phases 0-1
              <br />
              {page.component} · {page.url}
            </>
          }
        />

        <div className="grid flex-1 grid-cols-1 items-start gap-6 p-6 lg:grid-cols-[1fr_360px]">
          {/* DataTable virtualisée (500 lignes mock) */}
          <div className="flex h-[calc(100vh-200px)] min-h-[400px] flex-col gap-3">
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-semibold">DataTable — 500 lignes virtualisées</h2>
              <div className="ml-auto w-44">
                <Select
                  value={ligne}
                  onValueChange={(v) => setLigne(v as string | null)}
                  items={[
                    { value: null, label: 'Toutes les lignes' },
                    ...LIGNES.map((l) => ({ value: l, label: l })),
                  ]}
                >
                  <SelectTrigger size="sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={null}>Toutes les lignes</SelectItem>
                    {LIGNES.map((l) => (
                      <SelectItem key={l} value={l}>
                        {l}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DataTable
              columns={COLUMNS}
              rows={rows}
              sorting={sorting}
              onSortingChange={setSorting}
              getRowKey={(r) => r.id}
              onRowClick={(r) => toast.info(`Ligne cliquée : ${r.id}`)}
              emptyState={
                <div className="p-8 text-center text-sm text-muted-foreground">Aucune ligne</div>
              }
            />
          </div>

          {/* Vitrine primitives */}
          <div className="space-y-5 rounded-xl border bg-card p-5 shadow-xs">
            <div>
              <h2 className="text-sm font-semibold">Primitives shadcn / Base UI</h2>
              <p className="text-xs text-muted-foreground">Thème stock (base-nova, Geist)</p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button>Default</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="destructive">Destructive</Button>
            </div>

            <div className="flex flex-wrap gap-2">
              <Badge>Ferme</Badge>
              <Badge variant="secondary">Planifié</Badge>
              <Badge variant="outline">Suggéré</Badge>
              <Badge variant="destructive">Rupture</Badge>
            </div>

            <Separator />

            <Field>
              <FieldLabel htmlFor="of-search">Recherche OF</FieldLabel>
              <Input id="of-search" placeholder="OF00042…" />
            </Field>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() =>
                  toast.success('Runtime React opérationnel', {
                    description: 'Toaster sonner monté dans app.tsx',
                  })
                }
              >
                Toast
              </Button>

              <Dialog>
                <DialogTrigger render={<Button variant="outline">Dialog</Button>} />
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Dialog Base UI</DialogTitle>
                    <DialogDescription>
                      Primitive @base-ui/react/dialog, styles shadcn stock.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button>Fermer</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <Sheet>
                <SheetTrigger render={<Button variant="outline">Sheet</Button>} />
                <SheetContent>
                  <SheetHeader>
                    <SheetTitle>Sheet latérale</SheetTitle>
                    <SheetDescription>
                      Surface la plus utilisée de l'app (détail OF / commande / suivi).
                    </SheetDescription>
                  </SheetHeader>
                </SheetContent>
              </Sheet>
            </div>

            <Separator />

            <div className="flex flex-wrap items-center gap-3 text-sm">
              <a className="underline underline-offset-4 hover:text-muted-foreground" href="/">
                → Tableau (Solid, a natif)
              </a>
              <a
                className="underline underline-offset-4 hover:text-muted-foreground"
                href="/programme"
              >
                → Programme (Solid, a natif)
              </a>
            </div>

            <div className="flex justify-between pt-1 text-xs text-muted-foreground">
              <span>React 19 · Compiler actif</span>
              <span>Base UI 1.6 · shadcn base-nova</span>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
