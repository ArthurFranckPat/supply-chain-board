import { useState } from 'react'
import { Head } from '@inertiajs/react'
import {
  Ban,
  Check,
  ClipboardCheck,
  Download,
  RefreshCw,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react'

import { Badge } from '@r/components/ui/badge'
import { Button } from '@r/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@r/components/ui/card'
import {
  DataTable,
  type ColumnDef,
  type SortingState,
} from '@r/components/ui/data-table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@r/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@r/components/ui/alert-dialog'
import { Input } from '@r/components/ui/input'
import { Label } from '@r/components/ui/label'
import { Pill } from '@r/components/ui/pill'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@r/components/ui/select'
import { Separator } from '@r/components/ui/separator'
import { Skeleton } from '@r/components/ui/skeleton'
import { Spinner } from '@r/components/ui/spinner'
import { Switch } from '@r/components/ui/switch'
import { TextField, TextFieldInput, TextFieldLabel } from '@r/components/ui/text-field'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@r/components/ui/tooltip'
import { Calendar } from '@r/components/ui/calendar'
import { useRangeCalendar } from '@r/lib/use-range-calendar'
import { cn } from '@r/lib/utils'

/**
 * Design system Cursor — showcase des ui/* sous `.theme-cursor`.
 * Route : GET /design-system
 */

const NAV = [
  { id: 'couleurs', n: '01', label: 'Couleurs' },
  { id: 'typo', n: '02', label: 'Typographie' },
  { id: 'boutons', n: '03', label: 'Boutons' },
  { id: 'cards', n: '04', label: 'Cards' },
  { id: 'table', n: '05', label: 'DataTable' },
  { id: 'badges', n: '06', label: 'Badges & pills' },
  { id: 'champs', n: '07', label: 'Champs' },
  { id: 'overlays', n: '08', label: 'Overlays' },
  { id: 'etats', n: '09', label: 'États' },
  { id: 'calendrier', n: '10', label: 'Calendrier' },
] as const

const SURFACES = [
  { name: 'Sidebar', hex: '#f3f3f3', tok: '--bg-sidebar / --sidebar', use: 'rail nav' },
  { name: 'Chrome', hex: '#f8f8f8', tok: '--bg-chrome / --background', use: 'page, TopBar' },
  { name: 'Elevated', hex: '#fcfcfc', tok: '--bg-elevated / --card', use: 'cards, panels' },
  { name: 'Base', hex: '#141414', tok: '--base / --primary', use: 'CTA filled, texte' },
]

const INKS = [
  {
    name: 'Primary',
    hex: '#141414',
    tok: '--text-primary',
    use: 'titres, emphase',
    sample: 'bg-[#141414]',
  },
  {
    name: 'Secondary',
    hex: 'mix 74%',
    tok: '--text-secondary',
    use: 'corps secondaire',
    sample: 'bg-[color-mix(in_oklab,#141414_74%,transparent)]',
  },
  {
    name: 'Tertiary',
    hex: 'mix 60%',
    tok: '--text-tertiary',
    use: 'en-têtes table',
    sample: 'bg-[color-mix(in_oklab,#141414_60%,transparent)]',
  },
]

const SEMANTIC = [
  { name: 'Brand', hex: '#f54e00', tok: '--brand', use: 'marque rare' },
  { name: 'Accent', hex: '#2778c1', tok: '--accent / --focus', use: 'focus, liens' },
  { name: 'Success', hex: '#007041', tok: '--success / --ferme', use: 'OK' },
  { name: 'Warn', hex: '#a46700', tok: '--warn / --suggere', use: 'alerte' },
  { name: 'Danger', hex: '#be1744', tok: '--danger / --destructive', use: 'erreur' },
]

type ApiKeyRow = {
  name: string
  token: string
  scope: string
  created: string
  expires: string
}

const API_KEY_ROWS: ApiKeyRow[] = [
  {
    name: 'Cursor',
    token: 'crsr_…d1b7',
    scope: 'Admin',
    created: '11/08/2026',
    expires: '07/02/2027',
  },
  {
    name: 'CI GitHub',
    token: 'crsr_…9a2c',
    scope: 'Read',
    created: '02/06/2026',
    expires: '02/06/2027',
  },
  {
    name: 'Agent MCP',
    token: 'crsr_…44fe',
    scope: 'Write',
    created: '18/07/2026',
    expires: '18/01/2027',
  },
]

const apiKeyColumns: ColumnDef<ApiKeyRow>[] = [
  {
    id: 'name',
    accessorKey: 'name',
    header: 'Name',
    cell: ({ getValue }) => (
      <span className="truncate text-base font-medium text-foreground">{String(getValue())}</span>
    ),
  },
  {
    id: 'token',
    accessorKey: 'token',
    header: 'Token',
    cell: ({ getValue }) => (
      <span className="truncate font-mono text-base text-muted-foreground">
        {String(getValue())}
      </span>
    ),
  },
  {
    id: 'scope',
    accessorKey: 'scope',
    header: 'Scope',
    cell: ({ getValue }) => (
      <span className="truncate text-base text-muted-foreground">{String(getValue())}</span>
    ),
  },
  {
    id: 'created',
    accessorKey: 'created',
    header: 'Created',
    meta: { thClass: 'whitespace-nowrap', tdClass: 'whitespace-nowrap' },
    cell: ({ getValue }) => (
      <span className="text-base text-muted-foreground">{String(getValue())}</span>
    ),
  },
  {
    id: 'expires',
    accessorKey: 'expires',
    header: 'Expires',
    meta: { thClass: 'whitespace-nowrap', tdClass: 'whitespace-nowrap' },
    cell: ({ getValue }) => (
      <span className="text-base text-muted-foreground">{String(getValue())}</span>
    ),
  },
]

export default function DesignSystem() {
  const [scope, setScope] = useState('poste')
  const [name, setName] = useState('')
  const [sorting, setSorting] = useState<SortingState[]>([])
  const [range, setRange] = useState<{ start: Date | null; end: Date | null }>({
    start: new Date(2026, 7, 1),
    end: new Date(2026, 7, 11),
  })
  const rangeCal = useRangeCalendar({
    value: range.start ? { from: range.start, to: range.end ?? undefined } : undefined,
    onCommit: (r) => setRange({ start: r.from ?? null, end: r.to ?? null }),
  })

  return (
    <>
      <Head title="Design System · Cursor" />
      <TooltipProvider>
        <div className="theme-cursor min-h-screen">
          <div className="mx-auto grid max-w-[1200px] grid-cols-1 gap-0 md:grid-cols-[200px_1fr]">
            <aside className="sticky top-0 z-20 h-fit border-b border-[color-mix(in_oklab,#141414_8%,transparent)] bg-[#f3f3f3] px-4 py-6 md:h-screen md:overflow-auto md:border-b-0 md:border-r md:px-5 md:py-8">
              <div className="text-[15px] font-medium tracking-tight text-[#141414]">
                Design System
              </div>
              <div className="mt-0.5 font-mono text-[10px] text-[color-mix(in_oklab,#141414_60%,transparent)]">
                Cursor produit · .theme-cursor
              </div>
              <nav className="mt-5 flex flex-row flex-wrap gap-1 md:flex-col md:gap-0.5">
                {NAV.map((item) => (
                  <a
                    key={item.id}
                    href={`#${item.id}`}
                    className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[12.5px] font-medium text-[color-mix(in_oklab,#141414_74%,transparent)] transition-colors hover:bg-[color-mix(in_oklab,#141414_8%,transparent)] hover:text-[#141414]"
                  >
                    <span className="font-mono text-[9px] text-[color-mix(in_oklab,#141414_60%,transparent)]">
                      {item.n}
                    </span>
                    {item.label}
                  </a>
                ))}
              </nav>
              <p className="mt-6 hidden text-[11px] leading-relaxed text-[color-mix(in_oklab,#141414_60%,transparent)] md:block">
                Composants{' '}
                <code className="font-mono text-[#141414]">ui/*</code> réels. Source de vérité :{' '}
                <code className="font-mono text-[#141414]">DESIGN.md</code> (tokens produit light).
              </p>
            </aside>

            <main className="min-w-0 bg-[#f8f8f8] px-5 pb-24 pt-8 md:px-10 md:pt-10">
              <header className="pb-2">
                <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#f54e00]">
                  Supply Chain Board
                </div>
                <h1 className="mt-2 text-[32px] font-medium leading-none tracking-tight text-[#141414] md:text-[36px]">
                  Design System Cursor
                </h1>
                <p className="mt-3 max-w-[560px] text-[14px] leading-relaxed text-[color-mix(in_oklab,#141414_74%,transparent)]">
                  Catalogue des primitives sous le scope{' '}
                  <code className="rounded bg-[color-mix(in_oklab,#141414_6%,transparent)] px-1.5 py-0.5 font-mono text-[12px] text-[#141414]">
                    .theme-cursor
                  </code>
                  . Même langage que le dashboard.
                </p>
              </header>

              {/* 01 Couleurs */}
              <Section id="couleurs" n="01" title="Couleurs">
                <SwatchGroup label="Surfaces" items={SURFACES} />
                <div className="mb-2 mt-6 font-mono text-[10px] font-medium text-muted-foreground">
                  Encre
                </div>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3">
                  {INKS.map((s) => (
                    <div
                      key={s.name}
                      className="overflow-hidden rounded-[12px] bg-card shadow-[0_0_0_1px_color-mix(in_oklab,#141414_4%,transparent)]"
                    >
                      <div className={cn('h-14', s.sample)} />
                      <div className="px-3 py-2">
                        <div className="font-mono text-[11px] font-medium">{s.name}</div>
                        <div className="font-mono text-[10px] text-muted-foreground">{s.hex}</div>
                        <div className="mt-0.5 text-[10px] text-muted-foreground">{s.use}</div>
                      </div>
                    </div>
                  ))}
                </div>
                <SwatchGroup label="Sémantique" items={SEMANTIC} />
              </Section>

              {/* 02 Typo */}
              <Section id="typo" n="02" title="Typographie">
                <Frame>
                  <TypeRow spec="Display · 32 / medium">
                    <span className="text-[32px] font-medium leading-none tracking-tight">
                      Planification
                    </span>
                  </TypeRow>
                  <TypeRow spec="H2 · 20 / medium">
                    <span className="text-[20px] font-medium tracking-tight">Semaine 32</span>
                  </TypeRow>
                  <TypeRow spec="Body · 13–14 / regular">
                    <span className="text-[14px] text-muted-foreground">
                      Sur la fenêtre du 01 au 11 août, huit lignes sont freinées par des ruptures.
                    </span>
                  </TypeRow>
                  <TypeRow spec="Caption · 12 / tertiary">
                    <span className="text-xs text-[color-mix(in_oklab,#141414_60%,transparent)]">
                      En-tête de colonne · text-tertiary
                    </span>
                  </TypeRow>
                  <TypeRow spec="Mono · tabular" last>
                    <span className="font-mono text-[13px] font-medium tabular-nums">
                      AR24518 · L2 · 6,0 h · 120 u
                    </span>
                  </TypeRow>
                </Frame>
              </Section>

              {/* 03 Boutons */}
              <Section id="boutons" n="03" title="Boutons">
                <Frame>
                  <FieldLabel>
                    Variantes — <code className="font-mono">Button</code>
                  </FieldLabel>
                  <div className="flex flex-wrap items-center gap-3">
                    <Button>
                      <ClipboardCheck />
                      Faisabilité
                    </Button>
                    <Button variant="secondary">
                      <Download />
                      Exporter
                    </Button>
                    <Button variant="outline">Annuler</Button>
                    <Button variant="ghost">
                      <RefreshCw />
                      X3
                    </Button>
                    <Button variant="destructive">
                      <Trash2 />
                      Supprimer
                    </Button>
                    <Button variant="link">Détail</Button>
                  </div>

                  <FieldLabel className="mt-6">Tailles</FieldLabel>
                  <div className="flex flex-wrap items-center gap-3">
                    <Button size="xs">XS</Button>
                    <Button size="sm">SM</Button>
                    <Button>Default</Button>
                    <Button size="lg">LG</Button>
                    <Button size="icon" variant="secondary">
                      <SlidersHorizontal />
                    </Button>
                    <Button size="icon-sm" variant="secondary">
                      <RefreshCw />
                    </Button>
                  </div>

                  <FieldLabel className="mt-6">États</FieldLabel>
                  <div className="flex flex-wrap items-center gap-3">
                    <Button>Actif</Button>
                    <Button disabled>Désactivé</Button>
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Button size="icon-sm" variant="outline" aria-label="Supprimer">
                            <Trash2 className="text-destructive" />
                          </Button>
                        }
                      />
                      <TooltipContent>Delete this User API Key</TooltipContent>
                    </Tooltip>
                  </div>
                </Frame>
              </Section>

              {/* 04 Cards */}
              <Section id="cards" n="04" title="Cards">
                <p className="mb-4 text-[13px] text-muted-foreground">
                  Recipe KPI :{' '}
                  <code className="font-mono text-[12px] text-foreground">
                    rounded-[12px] bg-elevated shadow ring quaternary · p-4
                  </code>
                </p>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <Card padding="sm" className="border-0">
                    <CardHeader>
                      <CardTitle>OTIF</CardTitle>
                      <CardDescription>Livraisons dans les délais</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="mt-2 text-[28px] font-medium tracking-tight tabular-nums">
                        94,2 %
                      </div>
                    </CardContent>
                  </Card>
                  <Card padding="sm" className="border-0">
                    <CardHeader>
                      <CardTitle>Retard</CardTitle>
                      <CardDescription>Lignes hors fenêtre</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="mt-2 text-[28px] font-medium tracking-tight tabular-nums text-destructive">
                        18
                      </div>
                    </CardContent>
                  </Card>
                  <Card padding="sm" elevation="raised" className="border-0">
                    <CardHeader>
                      <CardTitle>Raised</CardTitle>
                      <CardDescription>elevation=&quot;raised&quot;</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="mt-2 text-[28px] font-medium tracking-tight tabular-nums">
                        1,2 M€
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </Section>

              {/* 05 DataTable */}
              <Section id="table" n="05" title="DataTable">
                <p className="mb-4 text-[13px] text-muted-foreground">
                  Markup TanStack inchangé — skin CSS sous{' '}
                  <code className="font-mono text-[12px] text-foreground">.theme-cursor table</code>.
                </p>
                <Card padding="none" className="border-0 overflow-hidden">
                  <DataTable
                    columns={apiKeyColumns}
                    rows={API_KEY_ROWS}
                    sorting={sorting}
                    onSortingChange={setSorting}
                    virtualize={false}
                    tableClass="w-full border-collapse text-left min-w-[640px]"
                    scrollContainerClass="overflow-auto rounded-none border-0 shadow-none bg-transparent"
                    theadRowClass="bg-transparent"
                    getRowClass={() => 'group/row'}
                    getRowKey={(r) => r.token}
                  />
                </Card>
              </Section>

              {/* 06 Badges */}
              <Section id="badges" n="06" title="Badges & pills">
                <Frame>
                  <FieldLabel>Badge</FieldLabel>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="default">Default</Badge>
                    <Badge variant="secondary">Secondary</Badge>
                    <Badge variant="outline">Outline</Badge>
                    <Badge variant="success">
                      <Check />
                      Ferme
                    </Badge>
                    <Badge variant="warning">Suggéré</Badge>
                    <Badge variant="destructive">
                      <Ban />
                      Sans couverture
                    </Badge>
                  </div>

                  <FieldLabel className="mt-6">Pill</FieldLabel>
                  <div className="flex flex-wrap items-center gap-2">
                    <Pill>Default</Pill>
                    <Pill variant="active">Active</Pill>
                    <Pill variant="outline">Outline</Pill>
                    <Pill variant="ghost">Ghost</Pill>
                    <Pill variant="soft" dot>
                      Soft
                    </Pill>
                  </div>
                </Frame>
              </Section>

              {/* 07 Champs */}
              <Section id="champs" n="07" title="Champs">
                <Frame>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <div>
                      <FieldLabel>TextField</FieldLabel>
                      <TextField value={name} onChange={setName}>
                        <TextFieldLabel>Désignation</TextFieldLabel>
                        <TextFieldInput placeholder="Caisse VMC D250" />
                      </TextField>
                    </div>
                    <div>
                      <FieldLabel>Input nu</FieldLabel>
                      <Label htmlFor="ds-input" className="mb-2 block text-xs">
                        Recherche
                      </Label>
                      <Input id="ds-input" placeholder="Article, OF…" className="h-10 text-sm" />
                    </div>
                    <div>
                      <FieldLabel>Select</FieldLabel>
                      <Select value={scope} onValueChange={(v) => v && setScope(v)}>
                        <SelectTrigger className="w-full" aria-label="Portée">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {['poste', 'commande', 'article', 'client'].map((opt) => (
                            <SelectItem key={opt} value={opt}>
                              {opt}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <FieldLabel>Switch</FieldLabel>
                      <div className="flex items-center gap-2 py-2">
                        <Switch id="ds-switch" defaultChecked />
                        <Label htmlFor="ds-switch" className="cursor-pointer text-sm">
                          Masque actif
                        </Label>
                      </div>
                    </div>
                  </div>
                  <div className="mt-5">
                    <FieldLabel>Separator</FieldLabel>
                    <Separator className="my-2" />
                    <span className="text-xs text-muted-foreground">filet largeur</span>
                  </div>
                </Frame>
              </Section>

              {/* 08 Overlays */}
              <Section id="overlays" n="08" title="Overlays">
                <Frame>
                  <div className="flex flex-wrap items-center gap-3">
                    <Dialog>
                      <DialogTrigger render={<Button variant="secondary">Dialog</Button>} />
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Confirmer la fenêtre</DialogTitle>
                          <DialogDescription>
                            Appliquer la plage sélectionnée aux KPI du dashboard.
                          </DialogDescription>
                        </DialogHeader>
                        <DialogFooter>
                          <Button variant="outline">Annuler</Button>
                          <Button>Appliquer</Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>

                    <AlertDialog>
                      <AlertDialogTrigger
                        render={<Button variant="destructive">AlertDialog</Button>}
                      />
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Supprimer la clé API ?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Action irréversible. Les intégrations qui utilisent cette clé
                            cesseront de fonctionner.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Annuler</AlertDialogCancel>
                          <AlertDialogAction>Supprimer</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>

                    <Tooltip>
                      <TooltipTrigger render={<Button variant="outline">Tooltip</Button>} />
                      <TooltipContent>Info contextuelle</TooltipContent>
                    </Tooltip>
                  </div>
                </Frame>
              </Section>

              {/* 09 États */}
              <Section id="etats" n="09" title="États">
                <Frame>
                  <FieldLabel>Spinner</FieldLabel>
                  <div className="flex items-center gap-4">
                    <Spinner variant="brand" size="sm" />
                    <Spinner variant="brand" size="md" />
                    <Spinner variant="brand" size="lg" />
                  </div>
                  <FieldLabel className="mt-6">Skeleton</FieldLabel>
                  <div className="flex flex-col gap-2">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-4 w-72" />
                    <Skeleton className="h-20 w-full rounded-[12px]" />
                  </div>
                </Frame>
              </Section>

              {/* 10 Calendrier */}
              <Section id="calendrier" n="10" title="Calendrier" last>
                <div className="flex flex-col items-start gap-6 sm:flex-row">
                  <Card padding="sm" className="border-0 w-fit">
                    <Calendar
                      mode="range"
                      selected={rangeCal.selected}
                      onSelect={rangeCal.onSelect}
                      numberOfMonths={1}
                    />
                  </Card>
                  <div className="pt-1">
                    <div className="font-mono text-[10px] font-medium text-muted-foreground">
                      Plage
                    </div>
                    <div className="mt-1 text-[20px] font-medium tracking-tight">
                      {range.start?.toLocaleDateString('fr-FR') ?? '—'} →{' '}
                      {range.end?.toLocaleDateString('fr-FR') ?? '…'}
                    </div>
                    <p className="mt-3 max-w-[240px] text-[13px] leading-relaxed text-muted-foreground">
                      Dates affichées en jj/mm/aaaa. Mode plage via{' '}
                      <code className="font-mono text-[12px] text-foreground">useRangeCalendar</code>
                      .
                    </p>
                  </div>
                </div>
              </Section>

              <footer className="mt-10 flex justify-between border-t border-[color-mix(in_oklab,#141414_4%,transparent)] pt-5 text-[12px] text-muted-foreground">
                <span>
                  <code className="font-mono text-foreground">inertia-react/components/ui/*</code>
                </span>
                <span className="font-mono">/design-system</span>
              </footer>
            </main>
          </div>
        </div>
      </TooltipProvider>
    </>
  )
}

function Section({
  id,
  n,
  title,
  last,
  children,
}: {
  id: string
  n: string
  title: string
  last?: boolean
  children: React.ReactNode
}) {
  return (
    <section
      id={id}
      className={cn(
        'scroll-mt-6 py-9',
        !last && 'border-b border-[color-mix(in_oklab,#141414_4%,transparent)]'
      )}
    >
      <div className="mb-5 flex items-baseline gap-3">
        <span className="rounded-md bg-[color-mix(in_oklab,#f54e00_12%,transparent)] px-2 py-0.5 font-mono text-[11px] font-medium text-[#f54e00]">
          {n}
        </span>
        <h2 className="text-[20px] font-medium tracking-tight text-[#141414]">{title}</h2>
      </div>
      {children}
    </section>
  )
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[12px] bg-card p-5 shadow-[0_0_0_1px_color-mix(in_oklab,#141414_4%,transparent)]">
      {children}
    </div>
  )
}

function FieldLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'mb-2 block font-mono text-[10px] font-medium text-muted-foreground',
        className
      )}
    >
      {children}
    </span>
  )
}

function TypeRow({
  spec,
  last,
  children,
}: {
  spec: string
  last?: boolean
  children: React.ReactNode
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-2 py-3 sm:flex-row sm:items-baseline sm:gap-5',
        !last && 'border-b border-[color-mix(in_oklab,#141414_4%,transparent)]'
      )}
    >
      <div className="w-full shrink-0 font-mono text-[10px] uppercase tracking-wide text-muted-foreground sm:w-52">
        {spec}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

function SwatchGroup({
  label,
  items,
}: {
  label: string
  items: { name: string; hex: string; tok: string; use: string }[]
}) {
  return (
    <>
      <div className="mb-2 mt-6 font-mono text-[10px] font-medium text-muted-foreground first:mt-0">
        {label}
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3">
        {items.map((s) => (
          <div
            key={s.name}
            className="overflow-hidden rounded-[12px] bg-card shadow-[0_0_0_1px_color-mix(in_oklab,#141414_4%,transparent)]"
          >
            <div className="h-14" style={{ background: s.hex.startsWith('#') ? s.hex : '#141414' }} />
            <div className="px-3 py-2">
              <div className="font-mono text-[11px] font-medium">{s.name}</div>
              <div className="font-mono text-[10px] text-muted-foreground">{s.hex}</div>
              <div className="mt-0.5 truncate font-mono text-[9px] text-muted-foreground">
                {s.tok}
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
