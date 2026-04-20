import { useMemo, useState } from 'react'
import { Pill } from '@/components/ui/pill'
import { SimpleTooltip } from '@/components/ui/tooltip'
import type { OrderRow } from '@/types/suivi-commandes'
import { STATUS_TONE_MAP } from '@/types/suivi-commandes'
import { ChevronRight, ChevronDown, CalendarDays, MessageSquare } from 'lucide-react'

interface GroupedRow {
  id: string
  'No commande': string
  Article: string
  'Date expedition': string | null
  'Nom client commande': string
  'D\u00e9signation 1': string | null
  'Type commande': string
  Statut: string
  'Poste de charge': string | null
  'Quantit\u00e9 restante': number
  'Quantit\u00e9 livr\u00e9e': number
  'Quantit\u00e9 command\u00e9e': number
  Commentaire?: string | null
  subRows: OrderRow[]
}

function groupRows(rows: OrderRow[]): GroupedRow[] {
  const groups = new Map<string, OrderRow[]>()
  for (const row of rows) {
    const key = `${row['No commande']}::${row.Article}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(row)
  }
  return Array.from(groups.entries()).map(([key, subRows]) => {
    const first = subRows[0]
    return {
      id: key,
      'No commande': first['No commande'],
      Article: first.Article,
      'Date expedition': first['Date expedition'],
      'Nom client commande': first['Nom client commande'],
      'D\u00e9signation 1': first['D\u00e9signation 1'],
      'Type commande': first['Type commande'],
      Statut: first.Statut,
      'Poste de charge': first['Poste de charge'],
      'Quantit\u00e9 restante': subRows.reduce((s, r) => s + (r['Quantit\u00e9 restante'] ?? 0), 0),
      'Quantit\u00e9 livr\u00e9e': subRows.reduce((s, r) => s + (r['Quantit\u00e9 livr\u00e9e'] ?? 0), 0),
      'Quantit\u00e9 command\u00e9e': subRows.reduce((s, r) => s + (r['Quantit\u00e9 command\u00e9e'] ?? 0), 0),
      Commentaire: first.Commentaire,
      subRows,
    }
  })
}

function formatDate(v: string | null): string {
  if (!v) return '-'
  try { return new Date(v).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) } catch { return '-' }
}

function formatDateLabel(v: string | null): string {
  if (!v) return '-'
  try { return new Date(v).toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short' }) } catch { return '-' }
}

function isOverdue(d: string | null): boolean {
  if (!d) return false
  return new Date(d) < new Date(new Date().toDateString())
}

function isSoon(d: string | null): boolean {
  if (!d) return false
  const diff = (new Date(d).getTime() - new Date(new Date().toDateString()).getTime()) / 86400000
  return diff >= 0 && diff <= 2
}

const COL = '90px 110px 1fr 90px 70px 70px 80px 130px'

export function GroupedOrderTable({ rows }: { rows: OrderRow[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const groupedData = useMemo(() => groupRows(rows), [rows])

  function toggle(key: string) {
    setExpanded((prev) => {
      const n = new Set(prev)
      if (n.has(key)) n.delete(key); else n.add(key)
      return n
    })
  }

  function expandAll() { setExpanded(new Set(groupedData.map((r) => r.id))) }
  function collapseAll() { setExpanded(new Set()) }

  // Group by date for day sections (like SchedulerView)
  const byDate = useMemo(() => {
    const map = new Map<string, GroupedRow[]>()
    for (const row of groupedData) {
      const key = row['Date expedition'] ?? '__none__'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(row)
    }
    return map
  }, [groupedData])

  const sortedDates = useMemo(() => {
    return [...byDate.keys()].sort((a, b) => {
      if (a === '__none__') return 1
      if (b === '__none__') return -1
      return a.localeCompare(b)
    })
  }, [byDate])

  return (
    <section className="bg-card border border-border rounded-2xl overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3.5 py-2 border-b border-border">
        <button onClick={expandAll} className="text-[11px] text-muted-foreground bg-transparent border border-border px-2.5 py-[5px] rounded-md hover:bg-muted transition-colors">
          D\u00e9plier tout
        </button>
        <button onClick={collapseAll} className="text-[11px] text-muted-foreground bg-transparent border border-border px-2.5 py-[5px] rounded-md hover:bg-muted transition-colors">
          Plier tout
        </button>
        <span className="ml-auto text-[11px] text-muted-foreground font-mono">
          {groupedData.length} ligne{groupedData.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Column headers */}
      <div
        className="grid gap-3 px-3.5 py-2 border-b border-border text-[10px] font-semibold text-muted-foreground font-mono uppercase tracking-wider bg-accent/30"
        style={{ gridTemplateColumns: COL }}
      >
        <span>Date</span>
        <span>Commande</span>
        <span>Article</span>
        <span>Client</span>
        <span className="text-right">Restant</span>
        <span className="text-right">Livré</span>
        <span>Type</span>
        <span>Statut</span>
      </div>

      {/* Body */}
      <div className="max-h-[62vh] overflow-y-auto">
        {sortedDates.map((dateKey) => {
          const dateRows = byDate.get(dateKey) ?? []
          if (dateRows.length === 0) return null
          const totalRestant = dateRows.reduce((s, r) => s + r['Quantit\u00e9 restante'], 0)
          const nbRetard = dateRows.filter((r) => r.Statut === 'Retard Prod').length

          return (
            <div key={dateKey}>
              {/* Day section header */}
              <button
                className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 border-none cursor-pointer font-[inherit] text-left border-b border-border ${
                  isOverdate(dateKey) ? 'bg-destructive/5' : 'bg-accent/30'
                }`}
                style={{ background: isOverdue(dateKey) ? 'rgba(var(--color-destructive), 0.05)' : undefined }}
              >
                <CalendarDays className="h-[13px] w-[13px] text-muted-foreground" />
                <span className="text-[12.5px] font-semibold">{formatDateLabel(dateKey)}</span>
                <Pill mono>{dateRows.length} ligne{dateRows.length !== 1 ? 's' : ''}</Pill>
                <Pill mono>{totalRestant.toLocaleString('fr-FR')} restant</Pill>
                {nbRetard > 0 && (
                  <Pill tone="danger" mono>{nbRetard} retard</Pill>
                )}
              </button>

              {/* Rows */}
              {dateRows.map((row, idx) => {
                const isOpen = expanded.has(row.id)
                const hasSubRows = row.subRows.length > 1
                const rowOverdue = isOverdue(row['Date expedition'])
                const rowSoon = isSoon(row['Date expedition'])

                return (
                  <div key={row.id}>
                    {/* Parent row */}
                    <div
                      className="grid gap-3 items-center text-xs border-b border-border/50 cursor-pointer hover:bg-muted/30 transition-colors"
                      style={{
                        gridTemplateColumns: COL,
                        padding: '6px 14px',
                        background: idx % 2 === 1 ? 'var(--color-accent)' : 'transparent',
                        borderLeft: rowOverdue ? '3px solid var(--color-destructive)'
                          : rowSoon ? '3px solid var(--color-orange)'
                          : '3px solid transparent',
                      }}
                      onClick={() => hasSubRows && toggle(row.id)}
                    >
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {hasSubRows ? (
                          isOpen ? <ChevronDown className="inline h-3 w-3 mr-1" /> : <ChevronRight className="inline h-3 w-3 mr-1" />
                        ) : null}
                        {formatDate(row['Date expedition'])}
                      </span>
                      <span className="font-mono text-[11.5px] font-medium">{row['No commande']}</span>
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <span className="font-semibold text-xs font-mono">{row.Article}</span>
                        {row['D\u00e9signation 1'] && (
                          <span className="text-[10.5px] text-muted-foreground truncate">{row['D\u00e9signation 1']}</span>
                        )}
                      </div>
                      <span className="text-[11px] text-muted-foreground truncate">{row['Nom client commande']}</span>
                      <span className="text-right tabular-nums font-mono text-[11px]">{row['Quantit\u00e9 restante'].toLocaleString('fr-FR')}</span>
                      <span className="text-right tabular-nums font-mono text-[11px] text-muted-foreground">{row['Quantit\u00e9 livr\u00e9e'].toLocaleString('fr-FR')}</span>
                      <span className="text-[11px] text-muted-foreground">{row['Type commande']}</span>
                      <Pill tone={STATUS_TONE_MAP[row.Statut] ?? 'default'}>{row.Statut}</Pill>
                    </div>

                    {/* Sub-rows (detail) */}
                    {isOpen && row.subRows.slice(1).map((sub, si) => (
                      <div
                        key={`${row.id}::${si}`}
                        className="grid gap-3 items-center text-[11px] border-b border-border/30 text-muted-foreground"
                        style={{
                          gridTemplateColumns: '90px 110px 1fr 90px 70px 70px 80px 130px',
                          padding: '4px 14px 4px 28px',
                        }}
                      >
                        <span />
                        <span />
                        <span className="font-mono text-[10.5px]">{sub.Emplacement ?? '-'} {sub.HUM ? `· ${sub.HUM}` : ''}</span>
                        <span />
                        <span />
                        <span />
                        <span />
                        <span className="text-[10px]">{sub['Date mise en stock'] ? `MAD ${formatDate(sub['Date mise en stock'])}` : ''}</span>
                      </div>
                    ))}

                    {/* Comment indicator */}
                    {row.Commentaire && (
                      <SimpleTooltip content={row.Commentaire} side="left">
                        <div className="px-4 py-1 border-b border-border/30 text-[10.5px] text-primary/70 italic truncate">
                          <MessageSquare className="inline h-2.5 w-2.5 mr-1" />
                          {row.Commentaire}
                        </div>
                      </SimpleTooltip>
                    )}
                  </div>
                )
              })}
            </div>
          )
        })}

        {groupedData.length === 0 && (
          <div className="py-12 text-center text-sm text-muted-foreground">
            Aucune commande trouv\u00e9e
          </div>
        )}
      </div>
    </section>
  )
}

function isOverdate(d: string): boolean {
  if (d === '__none__') return false
  return new Date(d) < new Date(new Date().toDateString())
}
