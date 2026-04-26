import { cn } from '@/lib/utils'

export interface GridTableColumn<T> {
  key: string
  header: React.ReactNode
  cell?: (row: T) => React.ReactNode
  align?: 'left' | 'right' | 'center'
  width?: string
}

interface GridTableProps<T> {
  columns: GridTableColumn<T>[]
  data: T[]
  keyExtractor: (row: T, index: number) => string
  maxHeight?: string
  emptyMessage?: string
  footer?: React.ReactNode
  className?: string
  rowClassName?: (row: T) => string
  onRowClick?: (row: T) => void
}

function alignClass(align?: string) {
  switch (align) {
    case 'right': return 'justify-end'
    case 'center': return 'justify-center'
    default: return 'justify-start'
  }
}

export function GridTable<T>({
  columns, data, keyExtractor, maxHeight = '520px', emptyMessage = 'Aucune donnée',
  footer, className, rowClassName, onRowClick,
}: GridTableProps<T>) {
  const gridTemplate = columns.map(c => c.width || '1fr').join(' ')

  return (
    <div className={cn('bg-card border border-border overflow-hidden flex flex-col', className)}>
      {/* Header */}
      <div
        className="grid gap-0 divide-x divide-border/60 border-b border-border text-[10px] font-semibold text-muted-foreground uppercase tracking-wide bg-muted shrink-0"
        style={{ gridTemplateColumns: gridTemplate }}
      >
        {columns.map(col => (
          <div key={col.key} className={cn('flex items-center px-2 py-1.5', alignClass(col.align))}>
            {col.header}
          </div>
        ))}
      </div>

      {/* Body */}
      <div className="overflow-y-auto" style={{ maxHeight }}>
        {data.map((row, index) => (
          <div
            key={keyExtractor(row, index)}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
            className={cn(
              'grid gap-0 divide-x divide-border/60 text-[11px] border-b border-border/40 transition-colors',
              onRowClick && 'cursor-pointer hover:bg-muted/20',
              rowClassName?.(row)
            )}
            style={{ gridTemplateColumns: gridTemplate }}
          >
            {columns.map(col => (
              <div key={col.key} className={cn('flex items-center h-full px-2 py-[5px]', alignClass(col.align))}>
                {col.cell ? col.cell(row) : String((row as Record<string, unknown>)[col.key] ?? '')}
              </div>
            ))}
          </div>
        ))}

        {data.length === 0 && (
          <div className="py-10 text-center">
            <p className="text-xs text-muted-foreground">{emptyMessage}</p>
          </div>
        )}
      </div>

      {footer && (
        <div className="px-3 py-1.5 border-t border-border bg-muted/20 text-[11px] shrink-0">{footer}</div>
      )}
    </div>
  )
}
