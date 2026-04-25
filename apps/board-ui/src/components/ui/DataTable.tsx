import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface DataTableColumn<T> {
  key: string
  header: React.ReactNode
  cell: (row: T) => React.ReactNode
  align?: 'left' | 'right' | 'center'
  width?: string
  sortable?: boolean
  sortDir?: 'asc' | 'desc' | null
  onSort?: () => void
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[]
  data: T[]
  keyExtractor: (row: T) => string
  maxHeight?: string
  emptyMessage?: string
  footer?: React.ReactNode
  className?: string
  rowClassName?: (row: T) => string
  onRowClick?: (row: T) => void
}

function SortIcon({ dir }: { dir: 'asc' | 'desc' | null }) {
  if (!dir) return <ChevronsUpDown className="h-3 w-3 text-muted-foreground/40" />
  return dir === 'asc'
    ? <ChevronUp className="h-3 w-3 text-primary" />
    : <ChevronDown className="h-3 w-3 text-primary" />
}

export function DataTable<T>({
  columns,
  data,
  keyExtractor,
  maxHeight = '520px',
  emptyMessage = 'Aucune donnée',
  footer,
  className,
  rowClassName,
  onRowClick,
}: DataTableProps<T>) {
  const alignClass = (align?: string) => {
    switch (align) {
      case 'right': return 'text-right'
      case 'center': return 'text-center'
      default: return 'text-left'
    }
  }

  return (
    <div className={cn('bg-card border border-border rounded-xl overflow-hidden flex flex-col', className)}>
      <div className="overflow-auto" style={{ maxHeight }}>
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10">
            <tr className="bg-muted/90 backdrop-blur-sm border-b border-border">
              {columns.map((col) => (
                <th
                  key={col.key}
                  onClick={col.sortable && col.onSort ? col.onSort : undefined}
                  className={cn(
                    'py-3 px-4 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap select-none',
                    col.sortable && col.onSort && 'cursor-pointer hover:text-foreground transition-colors',
                    alignClass(col.align)
                  )}
                  style={col.width ? { width: col.width, minWidth: col.width } : undefined}
                >
                  <span className={cn(
                    'inline-flex items-center gap-1.5',
                    col.align === 'right' && 'flex-row-reverse',
                    col.align === 'center' && 'justify-center'
                  )}>
                    {col.header}
                    {col.sortable && <SortIcon dir={col.sortDir ?? null} />}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, idx) => (
              <tr
                key={keyExtractor(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn(
                  'border-b border-border/50 transition-colors',
                  idx % 2 === 0 ? 'bg-card' : 'bg-accent/[0.03]',
                  onRowClick && 'cursor-pointer hover:bg-accent/30',
                  rowClassName?.(row)
                )}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={cn(
                      'py-3.5 px-4 align-middle',
                      alignClass(col.align)
                    )}
                    style={col.width ? { width: col.width, minWidth: col.width } : undefined}
                  >
                    {col.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {data.length === 0 && (
          <div className="py-16 text-center">
            <p className="text-sm text-muted-foreground">{emptyMessage}</p>
          </div>
        )}
      </div>
      {footer && (
        <div className="px-4 py-3 border-t border-border bg-muted/20">
          {footer}
        </div>
      )}
    </div>
  )
}
