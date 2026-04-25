import { memo, useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import type { OrderRow } from '@/types/suivi-commandes'
import { statusClass, typeBadgeClass } from '@/types/suivi-commandes'
import { formatDate, formatDateLabel, isOverdue } from '@/lib/format'

interface GroupedRow {
  id: string
  'No commande': string
  Article: string
  'Date expedition': string | null
  'Nom client commande': string
  'Désignation 1': string | null
  'Type commande': string
  Statut: string
  'Poste de charge': string | null
  'Quantité restante': number
  'Quantité livrée': number
  'Quantité commandée': number
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
      'Désignation 1': first['Désignation 1'],
      'Type commande': first['Type commande'],
      Statut: first.Statut,
      'Poste de charge': first['Poste de charge'],
      'Quantité restante': subRows.reduce((s, r) => s + (r['Quantité restante'] ?? 0), 0),
      'Quantité livrée': subRows.reduce((s, r) => s + (r['Quantité livrée'] ?? 0), 0),
      'Quantité commandée': subRows.reduce((s, r) => s + (r['Quantité commandée'] ?? 0), 0),
      Commentaire: first.Commentaire,
      subRows,
    }
  })
}

const GRID_COLS = 'grid-cols-[minmax(60px,0.5fr)_minmax(44px,0.35fr)_minmax(90px,0.9fr)_minmax(100px,0.9fr)_minmax(100px,0.9fr)_minmax(140px,2fr)_minmax(100px,0.7fr)_minmax(100px,0.9fr)]'



function QtyCell({ restant, commande }: { restant: number; commande: number }) {
  const pct = commande > 0 ? restant / commande : 0
  const color =
    pct <= 0.1 ? 'text-emerald-600' :
    pct <= 0.3 ? 'text-sky-600' :
    pct <= 0.6 ? 'text-amber-600' :
    'text-red-600'

  return (
    <div className="inline-flex items-baseline gap-[2px] bg-muted/50 rounded px-1.5 py-[2px]">
      <span className={cn('tabular-nums font-mono text-[12px] font-bold', color)}>{restant.toLocaleString('fr-FR')}</span>
      <span className="tabular-nums font-mono text-[9px] text-muted-foreground">/{commande.toLocaleString('fr-FR')}</span>
    </div>
  )
}

function TypeBadge({ type }: { type: string }) {
  return (
    <span className={cn('inline-flex items-center justify-center px-1.5 py-0.5 rounded-sm text-[9px] font-medium border', typeBadgeClass(type))}>
      {type}
    </span>
  )
}

/* ─── Date section header ─── */
function DateHeader({ dateKey, count }: {
  dateKey: string
  count: number
}) {
  return (
    <div className={cn(
      'flex items-center gap-2 px-2.5 py-1 border-b border-border',
      isOverdue(dateKey) ? 'bg-destructive/5' : 'bg-muted/40'
    )}>
      <span className="text-[11px] font-semibold">{formatDateLabel(dateKey)}</span>
      <span className="text-[10px] text-muted-foreground font-mono">{count}</span>
    </div>
  )
}

/* ─── Single expandable row + its detail lines ─── */
function OrderTableRow({
  row, isOpen, onToggle,
}: {
  row: GroupedRow
  isOpen: boolean
  onToggle: (id: string) => void
}) {
  const hasSubRows = row.subRows.length > 1
  const overdue = isOverdue(row['Date expedition'])

  return (
    <div>
      {/* Main row */}
      <div
        className={cn(
          'grid gap-0 divide-x divide-border/60 text-[11px] border-b border-border cursor-pointer hover:bg-muted/20 transition-colors',
          GRID_COLS
        )}
        style={{ borderLeft: overdue ? '2px solid var(--color-destructive)' : '2px solid transparent' }}
        onClick={() => hasSubRows && onToggle(row.id)}
      >
        <div className="flex items-center h-full px-2 py-[3px] font-mono text-[11px] text-muted-foreground">
          {hasSubRows ? (isOpen ? '▼ ' : '▶ ') : null}
          {formatDate(row['Date expedition'])}
        </div>
        <div className="flex items-center h-full px-2 py-[3px]">
          <TypeBadge type={row['Type commande']} />
        </div>
        <div className="flex items-center h-full px-2 py-[3px] text-[11px] text-muted-foreground truncate">
          {row['Nom client commande']}
        </div>
        <div className="flex items-center h-full px-2 py-[3px] font-mono text-[11px] font-medium truncate">
          {row['No commande']}
        </div>
        <div className="flex items-center h-full px-2 py-[3px] font-semibold text-[11px] font-mono truncate">
          {row.Article}
        </div>
        <div className="flex items-center h-full px-2 py-[3px] text-[11px] text-muted-foreground truncate">
          {row['Désignation 1'] ?? ''}
        </div>
        <div className="flex items-center justify-end h-full px-2 py-[3px]">
          <QtyCell restant={row['Quantité restante']} commande={row['Quantité commandée']} />
        </div>
        <div className={cn('flex items-center h-full px-2 py-[3px] text-[10px]', statusClass(row.Statut))}>
          {row.Statut}
        </div>
      </div>

      {/* Sub-rows (skip first because it's already shown above) */}
      {isOpen && row.subRows.slice(1).map((sub, i) => (
        <div
          key={`${row.id}::${i}`}
          className={cn(
            'grid gap-0 divide-x divide-border/60 text-[10px] border-b border-border/30 text-muted-foreground',
            GRID_COLS
          )}
          style={{ paddingLeft: 24 }}
        >
          <div className="h-full px-2 py-0.5" />
          <div className="h-full px-2 py-0.5" />
          <div className="h-full px-2 py-0.5" />
          <div className="h-full px-2 py-0.5" />
          <div className="h-full px-2 py-0.5" />
          <div className="h-full px-2 py-0.5" />
          <div className="flex items-center h-full px-2 py-0.5 font-mono text-[10px]">
            {sub.Emplacement ?? '-'} {sub.HUM ? `· ${sub.HUM}` : ''}
          </div>
          <div className="h-full px-2 py-0.5" />
          <div className="flex items-center h-full px-2 py-0.5 text-[10px]">
            {sub['Date mise en stock'] ? `MAD ${formatDate(sub['Date mise en stock'])}` : ''}
          </div>
        </div>
      ))}

      {/* Comment */}
      {row.Commentaire && (
        <div className="px-2.5 py-0.5 border-b border-border/20 text-[10px] text-muted-foreground italic truncate">
          {row.Commentaire}
        </div>
      )}
    </div>
  )
}

/* ─── Main component ─── */
export const GroupedOrderTable = memo(function GroupedOrderTable({ rows }: { rows: OrderRow[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const groupedData = useMemo(() => groupRows(rows), [rows])

  const toggle = (key: string) => {
    setExpanded((prev) => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n })
  }

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
    <div className="bg-card border border-border overflow-hidden">
      {/* Header */}
      <div className={cn('grid gap-0 divide-x divide-border/60 border-b border-border text-[10px] font-semibold text-muted-foreground uppercase tracking-wide bg-muted', GRID_COLS)}>
        <div className="flex items-center px-2 py-1.5">Date</div>
        <div className="flex items-center px-2 py-1.5">Type</div>
        <div className="flex items-center px-2 py-1.5">Client</div>
        <div className="flex items-center px-2 py-1.5">Commande</div>
        <div className="flex items-center px-2 py-1.5">Article</div>
        <div className="flex items-center px-2 py-1.5">Description</div>
        <div className="flex items-center justify-end px-2 py-1.5">Reste à livrer</div>
        <div className="flex items-center px-2 py-1.5">Statut</div>
      </div>

      {/* Body */}
      <div className="max-h-[60vh] overflow-y-auto">
        {sortedDates.map((dateKey) => {
          const dateRows = byDate.get(dateKey) ?? []
          if (dateRows.length === 0) return null

          return (
            <div key={dateKey}>
              <DateHeader dateKey={dateKey} count={dateRows.length} />
              {dateRows.map((row) => (
                <OrderTableRow
                  key={row.id}
                  row={row}
                  isOpen={expanded.has(row.id)}
                  onToggle={toggle}
                />
              ))}
            </div>
          )
        })}

        {groupedData.length === 0 && (
          <div className="py-8 text-center text-xs text-muted-foreground">Aucune commande trouvée</div>
        )}
      </div>
    </div>
  )
})
