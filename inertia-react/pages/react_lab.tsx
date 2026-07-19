import { useState } from 'react'
import { usePage } from '@inertiajs/react'
import { toast } from 'sonner'

import AppLayout from '@r/layouts/app'
import { Badge } from '@r/components/ui/badge'
import { Button } from '@r/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@r/components/ui/card'
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
import { Pill } from '@r/components/ui/pill'
import {
  SearchBar,
  type SearchSegment,
} from '@r/components/ui/search-bar'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@r/components/ui/select'
import { Separator } from '@r/components/ui/separator'
import {
  Toolbar,
  ToolbarGroup,
  ToolbarRefresh,
  ToolbarSearch,
  ToolbarSegment,
  ToolbarSegmented,
  ToolbarSeparator,
  ToolbarSpacer,
} from '@r/components/ui/toolbar'
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
  const [theme, setTheme] = useState<'stock' | 'airbnb'>('airbnb')
  const [view, setView] = useState<'registre' | 'composants' | 'couverture'>('registre')
  const [verdict, setVerdict] = useState<'all' | 'ok' | 'late'>('all')
  const [search, setSearch] = useState('')
  const [refreshing, setRefreshing] = useState(false)

  const rows = sortRows(
    ligne ? MOCK_ROWS.filter((r) => r.ligne === ligne) : MOCK_ROWS,
    sorting
  )

  return (
    <AppLayout
      title="React Lab"
      active="dashboard"
      subtitle="LABORATOIRE REACT"
      theme={theme}
      hideFooter={theme === 'stock'}
      mastheadActions={
        <div
          className="inline-flex rounded-full border bg-muted p-0.5"
          role="tablist"
          aria-label="Thème"
        >
          {(['stock', 'airbnb'] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={theme === t}
              onClick={() => setTheme(t)}
              className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wide transition-colors ${
                theme === t
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      }
      meta={
        <>
          Fondations phases 0-1
          <br />
          {page.component} · {page.url}
        </>
      }
      toolbar={
        <Toolbar>
          <ToolbarSegmented>
            {(['registre', 'composants', 'couverture'] as const).map((m) => (
              <ToolbarSegment key={m} active={view === m} onClick={() => setView(m)}>
                {m}
              </ToolbarSegment>
            ))}
          </ToolbarSegmented>
          <ToolbarSeparator />
          <ToolbarGroup>
            {(['all', 'ok', 'late'] as const).map((v) => (
              <Pill key={v} variant={verdict === v ? 'soft' : 'outline'} size="sm" onClick={() => setVerdict(v)}>
                {v === 'all' ? 'Tous' : v === 'ok' ? 'OK' : 'Retard'}
              </Pill>
            ))}
          </ToolbarGroup>
          <ToolbarSeparator />
          <ToolbarSearch value={search} onChange={setSearch} placeholder="OF, article, client…" />
          <ToolbarSpacer />
          <span className="text-[11px] text-muted-foreground">
            {rows.length} lignes
          </span>
          <ToolbarRefresh loading={refreshing} onClick={() => { setRefreshing(true); setTimeout(() => setRefreshing(false), 600) }} />
        </Toolbar>
      }
    >
      <div className="grid h-full grid-cols-1 items-start gap-6 lg:grid-cols-[1fr_360px]">
          {/* DataTable virtualisée (500 lignes mock) */}
          <div className="flex h-[calc(100vh-280px)] min-h-[400px] flex-col gap-3">
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
              <p className="text-xs text-muted-foreground">
                Thème <span className="font-semibold">{theme}</span>{' '}
                {theme === 'airbnb'
                  ? '(Rausch #ff385c, Inter, radius 14px)'
                  : '(base-nova, Geist, neutral oklch)'}
              </p>
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

            {/* Pills — pattern extrait de 8 occurrences Solid. */}
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Pills
              </h3>
              <div className="flex flex-wrap gap-2">
                <Pill>Default</Pill>
                <Pill variant="outline">Outline</Pill>
                <Pill variant="ghost">Ghost</Pill>
                <Pill variant="soft">Soft</Pill>
                <Pill variant="active">Active</Pill>
                <Pill variant="default" dot>
                  Avec dot
                </Pill>
                <Pill variant="default" size="sm">
                  sm
                </Pill>
                <Pill variant="default" size="lg">
                  lg
                </Pill>
              </div>
            </div>

            <Separator />

            {/* Card — tokens unifiés (rounded-lg, hairline, shadow unique). */}
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Card
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <Card elevation="flat" padding="default">
                  <CardHeader>
                    <CardTitle>Flat</CardTitle>
                    <CardDescription>Pas d'ombre, hairline seul.</CardDescription>
                  </CardHeader>
                  <CardContent className="text-xs text-muted-foreground">
                    Variante par défaut, 95% des surfaces.
                  </CardContent>
                </Card>
                <Card elevation="raised" padding="default">
                  <CardHeader>
                    <CardTitle>Raised</CardTitle>
                    <CardDescription>Une seule ombre (Airbnb).</CardDescription>
                  </CardHeader>
                  <CardContent className="text-xs text-muted-foreground">
                    Hover card, search-bar, dropdown.
                  </CardContent>
                </Card>
              </div>
            </div>

            <Separator />

            {/* SearchBar — signature Airbnb (pill 64px + orbe Rausch). */}
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                SearchBar
              </h3>
              <SearchBar
                segments={
                  [
                    { label: 'Où', placeholder: 'Rechercher une destination' },
                    { label: 'Quand', placeholder: 'Dates' },
                    { label: 'Qui', placeholder: 'Convives' },
                  ] as SearchSegment[]
                }
                onSubmit={() =>
                  toast.success('SearchBar soumise', {
                    description: 'Pattern Airbnb (pill 64px + orbe Rausch)',
                  })
                }
              />
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
    </AppLayout>
  )
}
