import { useState, useMemo, Fragment } from 'react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Search, ChevronRight, ChevronDown, CalendarDays, Filter,
  Package, AlertOctagon, CheckCircle2, XCircle, Shield, FileCheck, FilePenLine,
  Copy, Check,
} from 'lucide-react'
import type { CandidateOF } from '@/types/scheduler'

function Copyable({ text, children, className = '' }: { text: string; children?: React.ReactNode; className?: string }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation()
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    })
  }
  return (
    <span
      className={`inline-flex items-center gap-1 cursor-pointer group ${className}`}
      onClick={handleCopy}
      title={`Copier : ${text}`}
    >
      {children ?? text}
      {copied ? (
        <Check className="h-2.5 w-2.5 text-green shrink-0" />
      ) : (
        <Copy className="h-2.5 w-2.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
      )}
    </span>
  )
}

interface PlanningTableProps {
  candidates: Record<string, CandidateOF[]>
}

function formatDate(v?: string | null) {
  if (!v) return '-'
  try {
    return new Date(v).toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short' })
  } catch { return v }
}

function formatDateShort(v?: string | null) {
  if (!v) return '-'
  try {
    return new Date(v).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
  } catch { return v }
}

const STATUT_CONFIG: Record<number, { label: string; color: string; icon: React.ReactNode }> = {
  1: { label: 'Ferme', color: 'bg-green/15 text-green border-green/25', icon: <Shield className="h-3 w-3" /> },
  2: { label: 'Planifie', color: 'bg-blue/15 text-blue border-blue/25', icon: <FileCheck className="h-3 w-3" /> },
  3: { label: 'Suggere', color: 'bg-muted text-muted-foreground border-border', icon: <FilePenLine className="h-3 w-3" /> },
}

function parseBlockingComponents(val: string): Array<{ code: string; qty: string }> {
  if (!val) return []
  return val.split(',').map((part) => {
    const trimmed = part.trim()
    const match = trimmed.match(/^(.+?)\s*x(\d+)$/i)
    if (match) return { code: match[1].trim(), qty: match[2] }
    return { code: trimmed, qty: '?' }
  })
}

function isRealisable(of: CandidateOF): boolean {
  return !of.blocking_components
}

function StatutBadge({ statut }: { statut: number }) {
  const cfg = STATUT_CONFIG[statut] ?? STATUT_CONFIG[3]
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border ${cfg.color}`}>
      {cfg.icon}
      {cfg.label}
    </span>
  )
}

type FlatRow =
  | { kind: 'header'; day: string; ofs: (CandidateOF & { line: string })[] }
  | (CandidateOF & { line: string; kind: 'row' })

export function PlanningTable({ candidates }: PlanningTableProps) {
  const [globalFilter, setGlobalFilter] = useState('')
  const [sorting, setSorting] = useState<SortingState>([])
  const [lineFilter, setLineFilter] = useState<string>('__all__')
  const [statutFilter, setStatutFilter] = useState<string>('__all__')
  const [collapsedDays, setCollapsedDays] = useState<Set<string>>(new Set())
  const [groupByDay, setGroupByDay] = useState(true)
  const [expandedRuptures, setExpandedRuptures] = useState<Set<string>>(new Set())

  const flatData = useMemo(() => {
    const all = Object.entries(candidates).flatMap(([line, ofs]) =>
      ofs.map((of) => ({ ...of, line })),
    )

    let filtered = all
    if (lineFilter && lineFilter !== '__all__') filtered = filtered.filter((o) => o.line === lineFilter)
    if (statutFilter && statutFilter !== '__all__') filtered = filtered.filter((o) => String(o.statut_num) === statutFilter)
    if (globalFilter) {
      const s = globalFilter.toLowerCase()
      filtered = filtered.filter(
        (o) =>
          o.num_of.toLowerCase().includes(s) ||
          o.article.toLowerCase().includes(s) ||
          (o.description ?? '').toLowerCase().includes(s) ||
          (o.blocking_components ?? '').toLowerCase().includes(s),
      )
    }

    if (!groupByDay) return filtered.map((o) => ({ ...o, kind: 'row' as const }))

    const groups = new Map<string, (CandidateOF & { line: string })[]>()
    for (const of of filtered) {
      const day = of.scheduled_day ?? '__none__'
      const list = groups.get(day) ?? []
      list.push(of)
      groups.set(day, list)
    }

    const sorted = [...groups.entries()].sort(([a], [b]) => {
      if (a === '__none__') return 1
      if (b === '__none__') return -1
      return a.localeCompare(b)
    })

    const rows: FlatRow[] = []
    for (const [day, ofs] of sorted) {
      rows.push({ kind: 'header', day, ofs })
      if (!collapsedDays.has(day)) {
        for (const of of ofs) rows.push({ ...of, kind: 'row' })
      }
    }
    return rows
  }, [candidates, lineFilter, statutFilter, globalFilter, groupByDay, collapsedDays])

  const lines = useMemo(
    () => [...new Set(Object.values(candidates).flatMap((ofs) => ofs.map((o) => o.line)))].sort(),
    [candidates],
  )

  const statuts = useMemo(
    () => [...new Set(Object.values(candidates).flatMap((ofs) => ofs.map((o) => o.statut_num)))].sort(),
    [candidates],
  )

  const totalCount = useMemo(() => Object.values(candidates).flat().length, [candidates])

  const realisableCount = useMemo(
    () => Object.values(candidates).flat().filter(isRealisable).length,
    [candidates],
  )

  function toggleDay(day: string) {
    setCollapsedDays((prev) => {
      const next = new Set(prev)
      if (next.has(day)) next.delete(day)
      else next.add(day)
      return next
    })
  }

  function toggleRupture(ofNum: string) {
    setExpandedRuptures((prev) => {
      const next = new Set(prev)
      if (next.has(ofNum)) next.delete(ofNum)
      else next.add(ofNum)
      return next
    })
  }

  function expandAll() { setCollapsedDays(new Set()) }

  function collapseAll() {
    const all = Object.entries(candidates).flatMap(([, ofs]) => ofs)
    setCollapsedDays(new Set(all.map((o) => o.scheduled_day ?? '__none__')))
  }

  const columns = useMemo<ColumnDef<CandidateOF & { line: string }>[]>(
    () => [
      {
        accessorKey: 'num_of',
        header: 'OF',
        cell: ({ getValue }) => <span className="font-mono text-[11px]">{getValue() as string}</span>,
      },
      {
        accessorKey: 'article',
        header: 'Article',
        cell: ({ row }) => (
          <div>
            <span className="font-medium text-[11px]">{row.original.article}</span>
            {row.original.description && (
              <p className="text-[10px] text-muted-foreground leading-tight truncate max-w-[140px]">
                {row.original.description}
              </p>
            )}
          </div>
        ),
      },
      {
        accessorKey: 'statut_num',
        header: 'Statut',
        cell: ({ getValue }) => <StatutBadge statut={getValue() as number} />,
      },
      {
        accessorKey: 'line',
        header: 'Ligne',
        cell: ({ getValue }) => <Badge variant="outline" className="text-[10px] font-mono">{getValue() as string}</Badge>,
      },
      { accessorKey: 'quantity', header: 'Qte', cell: ({ getValue }) => <span className="tabular-nums">{getValue() as number}</span> },
      {
        accessorKey: 'charge_hours',
        header: 'Charge',
        cell: ({ getValue }) => <span className="tabular-nums">{(getValue() as number).toFixed(1)}h</span>,
      },
      {
        accessorFn: (r) => formatDateShort(r.due_date),
        header: 'Echeance',
        id: 'due_date',
      },
      {
        accessorKey: 'blocking_components',
        header: 'Rupture',
        cell: ({ row }) => <BlockingCell value={row.original.blocking_components} />,
      },
    ],
    [],
  )

  const table = useReactTable({
    data: flatData.filter((r): r is CandidateOF & { line: string; kind: 'row' } => r.kind === 'row'),
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: groupByDay ? undefined : getPaginationRowModel(),
    initialState: { pagination: { pageSize: 50 } },
  })

  const colCount = 8

  return (
    <Card>
      <CardHeader className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">Planning</CardTitle>
            <Badge variant="outline" className="text-[10px] font-mono">
              {totalCount} OF &middot; {realisableCount}/{totalCount} realisables
            </Badge>
          </div>
          {groupByDay && (
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={expandAll}>
                Deplier tout
              </Button>
              <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={collapseAll}>
                Plier tout
              </Button>
            </div>
          )}
        </div>

        {/* Filters bar */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="OF, article, composant..."
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              className="h-8 text-xs pl-8"
            />
          </div>

          <Select value={lineFilter} onValueChange={setLineFilter}>
            <SelectTrigger className="h-8 w-[160px] text-xs">
              <Filter className="h-3 w-3 mr-1 text-muted-foreground" />
              <SelectValue placeholder="Ligne" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Toutes les lignes</SelectItem>
              {lines.map((l) => (
                <SelectItem key={l} value={l}>{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={statutFilter} onValueChange={setStatutFilter}>
            <SelectTrigger className="h-8 w-[150px] text-xs">
              <Filter className="h-3 w-3 mr-1 text-muted-foreground" />
              <SelectValue placeholder="Statut" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Tous les statuts</SelectItem>
              {statuts.map((s) => (
                <SelectItem key={s} value={String(s)}>{STATUT_CONFIG[s]?.label ?? `Statut ${s}`}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex items-center border rounded-md h-8">
            <button
              onClick={() => setGroupByDay(true)}
              className={`px-2.5 h-full text-[11px] font-medium rounded-l-md transition-colors ${
                groupByDay ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'
              }`}
            >
              Par jour
            </button>
            <button
              onClick={() => setGroupByDay(false)}
              className={`px-2.5 h-full text-[11px] font-medium rounded-r-md transition-colors ${
                !groupByDay ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'
              }`}
            >
              Liste
            </button>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {groupByDay ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[11px] w-[200px]">Jour / OF</TableHead>
                <TableHead className="text-[11px]">Article</TableHead>
                <TableHead className="text-[11px] w-[80px]">Statut</TableHead>
                <TableHead className="text-[11px] w-[80px]">Ligne</TableHead>
                <TableHead className="text-[11px] w-[50px] text-right">Qte</TableHead>
                <TableHead className="text-[11px] w-[60px] text-right">Charge</TableHead>
                <TableHead className="text-[11px] w-[70px]">Echeance</TableHead>
                <TableHead className="text-[11px]">Rupture</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {flatData.map((row, idx) => {
                if (row.kind === 'header') {
                  const { day, ofs } = row
                  const isCollapsed = collapsedDays.has(day)
                  const realisableOfs = ofs.filter(isRealisable)
                  const blockedOfs = ofs.filter((o) => !isRealisable(o))
                  const engagedCharge = realisableOfs.reduce((s, o) => s + o.charge_hours, 0)
                  const blockedCharge = blockedOfs.reduce((s, o) => s + o.charge_hours, 0)
                  const totalQty = ofs.reduce((s, o) => s + o.quantity, 0)
                  const realisable = realisableOfs.length
                  const blocked = blockedOfs.length
                  const pct = ofs.length > 0 ? Math.round((realisable / ofs.length) * 100) : 0
                  const dayLabel = day === '__none__' ? 'Non planifies' : formatDate(day)
                  const pctColor = pct === 100 ? 'text-green' : pct >= 50 ? 'text-orange' : 'text-destructive'
                  const nbFerme = ofs.filter((o) => o.statut_num === 1).length
                  const nbPlanifie = ofs.filter((o) => o.statut_num === 2).length
                  const nbSuggere = ofs.filter((o) => o.statut_num === 3).length

                  return (
                    <TableRow
                      key={`day-${day}-${idx}`}
                      className="bg-muted/50 hover:bg-muted/70 cursor-pointer select-none"
                      onClick={() => toggleDay(day)}
                    >
                      <TableCell colSpan={colCount} className="py-2.5">
                        <div className="flex items-center gap-3">
                          {isCollapsed ? (
                            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          )}
                          <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span className="text-xs font-semibold">{dayLabel}</span>

                          <span className="text-[10px] text-muted-foreground tabular-nums bg-background/60 px-1.5 py-0.5 rounded">
                            {ofs.length} OF
                          </span>

                          {nbFerme > 0 && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-green bg-green/10 px-1.5 py-0.5 rounded">
                              <Shield className="h-3 w-3" />{nbFerme}F
                            </span>
                          )}
                          {nbPlanifie > 0 && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-blue bg-blue/10 px-1.5 py-0.5 rounded">
                              <FileCheck className="h-3 w-3" />{nbPlanifie}P
                            </span>
                          )}
                          {nbSuggere > 0 && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                              <FilePenLine className="h-3 w-3" />{nbSuggere}S
                            </span>
                          )}

                          <span className="text-[10px] text-foreground tabular-nums bg-background/60 px-1.5 py-0.5 rounded font-medium">
                            {engagedCharge.toFixed(1)}h engagees
                          </span>
                          {blockedCharge > 0 && (
                            <span className="text-[10px] text-muted-foreground tabular-nums bg-background/60 px-1.5 py-0.5 rounded line-through">
                              +{blockedCharge.toFixed(1)}h bloq.
                            </span>
                          )}
                          <span className="text-[10px] text-muted-foreground tabular-nums bg-background/60 px-1.5 py-0.5 rounded">
                            {totalQty} pcs
                          </span>

                          <span className={`inline-flex items-center gap-1 text-[10px] font-semibold tabular-nums ${pctColor}`}>
                            {pct === 100 ? <CheckCircle2 className="h-3.5 w-3.5" />
                              : pct === 0 ? <XCircle className="h-3.5 w-3.5" />
                              : <AlertOctagon className="h-3.5 w-3.5" />}
                            {pct}% realisable
                          </span>

                          {blocked > 0 && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-destructive bg-destructive/10 px-1.5 py-0.5 rounded">
                              <AlertOctagon className="h-3 w-3" />
                              {blocked} bloque{blocked > 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                }

                const of = row
                const hasBlocking = !isRealisable(of)
                return (
                  <Fragment key={`${of.num_of}-${idx}`}>
                    <TableRow className={`${hasBlocking ? 'opacity-40' : ''} hover:bg-accent/50`}>
                      <TableCell className="text-xs py-1.5 pl-8">
                        <Copyable text={of.num_of} className="font-mono text-[11px]" />
                      </TableCell>
                      <TableCell className="text-xs py-1.5">
                        <div>
                          <Copyable text={of.article} className="font-medium text-[11px]" />
                          {of.description && (
                            <p className="text-[10px] text-muted-foreground leading-tight truncate max-w-[160px]">
                              {of.description}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs py-1.5">
                        <div className="flex items-center gap-1">
                          <StatutBadge statut={of.statut_num} />
                          {hasBlocking && (
                            <span className="inline-flex items-center gap-0.5 text-[9px] font-medium text-destructive bg-destructive/10 px-1 py-0.5 rounded">
                              <AlertOctagon className="h-2.5 w-2.5" />
                              Bloque
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs py-1.5">
                        <Badge variant="outline" className="text-[10px] font-mono">{of.line}</Badge>
                      </TableCell>
                      <TableCell className="text-xs py-1.5 text-right tabular-nums">{of.quantity}</TableCell>
                      <TableCell className="text-xs py-1.5 text-right tabular-nums">{of.charge_hours.toFixed(1)}h</TableCell>
                      <TableCell className="text-xs py-1.5">{formatDateShort(of.due_date)}</TableCell>
                      <TableCell className="text-xs py-1.5">
                        <BlockingCell
                          value={of.blocking_components}
                          expanded={expandedRuptures.has(of.num_of)}
                          onToggle={() => toggleRupture(of.num_of)}
                        />
                      </TableCell>
                    </TableRow>
                  </Fragment>
                )
              })}
              {flatData.length === 0 && (
                <TableRow>
                  <TableCell colSpan={colCount} className="text-center py-8 text-muted-foreground text-sm">
                    Aucun resultat
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        ) : (
          <>
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((hg) => (
                  <TableRow key={hg.id}>
                    {hg.headers.map((h) => (
                      <TableHead key={h.id} className="cursor-pointer text-[11px]" onClick={h.column.getToggleSortingHandler()}>
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
                {table.getState().pagination.pageIndex + 1} / {table.getPageCount()}
              </span>
              <Button variant="outline" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
                Suivant
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

/* ---------- Blocking components cell ---------- */

function BlockingCell({ value, expanded, onToggle }: {
  value: string
  expanded?: boolean
  onToggle?: () => void
}) {
  if (!value) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-green">
        <CheckCircle2 className="h-3 w-3" />
        OK
      </span>
    )
  }

  const components = parseBlockingComponents(value)

  if (expanded && components.length > 1) {
    return (
      <div className="space-y-0.5">
        {components.map((comp) => (
          <div key={comp.code} className="flex items-center gap-1.5 text-[10px]">
            <Package className="h-3 w-3 text-destructive shrink-0" />
            <Copyable text={comp.code} className="font-mono font-medium text-destructive" />
            <Badge variant="destructive" className="h-4 px-1 text-[9px] tabular-nums">
              x{comp.qty}
            </Badge>
          </div>
        ))}
        <button
          onClick={(e) => { e.stopPropagation(); onToggle?.() }}
          className="text-[9px] text-muted-foreground hover:text-foreground"
        >
          Voir moins
        </button>
      </div>
    )
  }

  const count = components.length
  const preview = components.slice(0, 2).map((c) => `${c.code} x${c.qty}`).join(', ')
  const suffix = count > 2 ? ` +${count - 2}` : ''

  return (
    <div
      className="inline-flex items-center gap-1.5 cursor-pointer group"
      onClick={(e) => { e.stopPropagation(); onToggle?.() }}
      title="Cliquer pour details"
    >
      <AlertOctagon className="h-3.5 w-3.5 text-destructive shrink-0" />
      <span className="text-[10px] font-mono text-destructive font-medium">
        {preview}{suffix}
      </span>
      {count > 1 && (
        <Badge variant="destructive" className="h-4 min-w-4 px-1 text-[9px] tabular-nums">
          {count}
        </Badge>
      )}
    </div>
  )
}
