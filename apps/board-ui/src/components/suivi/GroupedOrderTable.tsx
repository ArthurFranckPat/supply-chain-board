import { memo, useMemo } from 'react'
import { cn } from '@/lib/utils'
import type { OrderRow } from '@/types/suivi-commandes'
import { statusClass, typeBadgeClass } from '@/types/suivi-commandes'
import { formatDate, formatDateLabel, isOverdue } from '@/lib/format'

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
function DateHeader({ dateKey, count }: { dateKey: string; count: number }) {
  return (
    <div className={cn('grid', GRID_COLS)}>
      <div className={cn(
        'col-span-full flex items-center gap-2 px-2.5 py-1 border-b border-border',
        isOverdue(dateKey) ? 'bg-destructive/5' : 'bg-muted/40'
      )}>
        <span className="text-[11px] font-semibold">{formatDateLabel(dateKey)}</span>
        <span className="text-[10px] text-muted-foreground font-mono">{count}</span>
      </div>
    </div>
  )
}

/* ─── Single row = single backend order line ─── */
function OrderTableRow({
  row,
  onDetailClick,
}: {
  row: OrderRow
  onDetailClick?: (row: OrderRow) => void
}) {
  const overdue = isOverdue(row['Date expedition'])
  const detail = [row.Emplacement, row.HUM].filter(Boolean).join(' · ')
  const hasCqAlert = row['_alerte_cq_statut'] === true || row['_allocation_virtuelle_avec_cq'] === true || row['Marqueur CQ'] === '*'
  const displayedStatus = row.Statut === 'RAS' && hasCqAlert ? 'Action CQ' : row.Statut

  return (
    <div
      className={cn(
        'group grid gap-0 divide-x divide-border/60 text-[11px] border-b border-border transition-colors',
        'hover:bg-muted/15',
        GRID_COLS
      )}
      style={{ borderLeft: overdue ? '2px solid var(--color-destructive)' : '2px solid transparent' }}
    >
      <div className="flex items-center h-full px-2 py-[3px] font-mono text-[11px] text-muted-foreground">
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
      <div className="flex flex-col justify-center h-full px-2 py-[3px] min-w-0">
        <span className="text-[11px] text-muted-foreground truncate">{row['Désignation 1'] ?? ''}</span>
        {detail && <span className="text-[9px] text-muted-foreground/70 font-mono truncate">{detail}</span>}
      </div>
      <div className="flex items-center justify-end h-full px-2 py-[3px]">
        <QtyCell restant={row['Quantité restante']} commande={row['Quantité commandée']} />
      </div>
      {/* Bouton détail inline dans la cellule statut */}
      <div className={cn('flex items-center justify-between h-full px-2 py-[3px] text-[10px]', statusClass(displayedStatus))}>
        <span className="inline-flex items-start gap-1 flex-1 min-w-0">
          <span>{displayedStatus}</span>
          {hasCqAlert && (
            <span
              className="text-[9px] leading-none text-amber-600/90 -translate-y-[1px] cursor-help shrink-0"
              title="Cette ligne dépend du stock sous contrôle qualité (allocation ou expédition) — accélération CQ requise."
            >
              CQ
            </span>
          )}
        </span>
        <button
          onClick={(e) => { e.stopPropagation(); onDetailClick?.(row) }}
          className={cn(
            'ml-1 w-5 h-5 flex items-center justify-center rounded text-muted-foreground/50',
            'hover:text-muted-foreground hover:bg-border/40 transition-all shrink-0',
            'group-hover:opacity-100 opacity-0'
          )}
          title="Voir le détail"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="12" cy="5" r="1.5"/>
            <circle cx="12" cy="12" r="1.5"/>
            <circle cx="12" cy="19" r="1.5"/>
          </svg>
        </button>
      </div>
    </div>
  )
}

/* ─── Main component ─── */
export const GroupedOrderTable = memo(function GroupedOrderTable({
  rows,
  onDetailClick,
}: {
  rows: OrderRow[]
  onDetailClick?: (row: OrderRow) => void
}) {
  const byDate = useMemo(() => {
    const map = new Map<string, OrderRow[]>()
    for (const row of rows) {
      const key = row['Date expedition'] ?? '__none__'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(row)
    }
    return map
  }, [rows])

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
              {dateRows.map((row, idx) => (
                <OrderTableRow
                  key={`${row['No commande']}-${row.Article}-${row.Emplacement ?? ''}-${idx}`}
                  row={row}
                  onDetailClick={onDetailClick}
                />
              ))}
            </div>
          )
        })}

        {rows.length === 0 && (
          <div className="py-8 text-center text-xs text-muted-foreground">Aucune commande trouvée</div>
        )}
      </div>
    </div>
  )
})
