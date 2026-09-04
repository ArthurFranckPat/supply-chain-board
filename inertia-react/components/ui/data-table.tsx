import { useMemo, useRef, type CSSProperties, type ReactNode } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react'

import { cn } from '@r/lib/utils'
import type { RowFlash } from '@r/lib/diff-flash'

/**
 * Wrapper DataTable maison (plan §6) : table HTML + tri contrôlé +
 * virtualisation @tanstack/react-virtual. API alignée sur le port
 * react-carbon (structure conservée, rendu Carbon remplacé par du
 * markup shadcn stock).
 */

export interface ColumnDef<TRow> {
  id?: string
  header?: ReactNode | ((ctx: { column: { columnDef: ColumnDef<TRow> } }) => ReactNode)
  accessorKey?: keyof TRow | (string & {})
  accessorFn?: (row: TRow) => unknown
  cell?: (ctx: {
    row: { original: TRow }
    getValue: () => unknown
    column: { columnDef: ColumnDef<TRow> }
  }) => ReactNode
  enableSorting?: boolean
  meta?: {
    thClass?: string
    tdClass?: string
  }
}

export interface DataTableIndexColumn<TRow> {
  headerLabel: string
  thClass: string
  tdClass: (row: TRow, virtualIndex: number) => string
}

export interface SortingState {
  id: string
  desc: boolean
}

export interface DataTableProps<TRow> {
  columns: ColumnDef<TRow>[]
  rows: TRow[]
  sorting: SortingState[]
  onSortingChange: (sorting: SortingState[]) => void
  indexColumn?: DataTableIndexColumn<TRow>
  tableClass?: string
  scrollContainerClass?: string
  theadRowClass?: string
  /**
   * Filets verticaux discrets entre colonnes (hairline-soft, même gramme que
   * les séparateurs de lignes). Opt-in : les tables denses à colonnes étroites
   * s'en passent. Appliqué sur les `tr` → Tailwind cible les td/th enfants,
   * sans trait avant la 1ʳᵉ colonne ni sur les lignes de padding virtuel.
   */
  columnDividers?: boolean
  getRowClass?: (row: TRow, virtualIndex: number) => string | undefined
  onRowClick?: (row: TRow) => void
  selectedRowKey?: string | null
  /**
   * Habillage de la ligne sélectionnée. Défaut = la grammaire shadcn du board
   * (anneau `primary`). Surchargeable pour les pages qui rendent dans un autre
   * système de tokens — /approvisionnement passe en tokens BoardUI. Posé APRÈS
   * `getRowClass` dans le `cn()`, donc il gagne toujours sur l'habillage de
   * ligne ordinaire.
   */
  rowSelectedClass?: string
  getRowKey?: (row: TRow) => string
  emptyState?: ReactNode
  /**
   * Diff du dernier rechargement (issue #186) : pose `data-flash` sur les
   * cellules modifiées (`chg`) et sur les lignes entrées/sorties (`in`/`out`),
   * les keyframes vivant dans app.css. Le tableau ne décide de rien : il
   * applique la carte que le hook `useDiffFlash` lui donne.
   */
  flash?: RowFlash | null
  /**
   * Identité utilisée pour retrouver une ligne dans `flash` — par défaut
   * `getRowKey`. À surcharger quand la clé de rendu inclut un champ qu'on veut
   * voir CHANGER plutôt que disparaître : sur le Suivi, la date d'expédition
   * fait partie de `getRowKey`, donc un décalage de date se lirait comme une
   * sortie suivie d'une entrée au lieu d'un flash sur la cellule Expé.
   * DOIT être la même fonction que le `key` du DiffConfig de la page.
   */
  getFlashKey?: (row: TRow) => string
}

const DEFAULT_SCROLL_CLASS = 'h-full overflow-auto rounded-lg border bg-card shadow-xs'

export function DataTable<TRow>({
  columns,
  rows,
  sorting,
  onSortingChange,
  indexColumn,
  tableClass,
  scrollContainerClass,
  theadRowClass,
  columnDividers,
  getRowClass,
  onRowClick,
  selectedRowKey,
  rowSelectedClass = 'bg-primary/[0.04] ring-2 ring-inset ring-primary/40',
  getRowKey,
  emptyState,
  flash,
  getFlashKey,
}: DataTableProps<TRow>) {
  const scrollRef = useRef<HTMLDivElement>(null)

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 56,
    overscan: 12,
  })

  const virtualItems = rowVirtualizer.getVirtualItems()

  // Pré-calcul des clés uniques : si getRowKey retourne des doublons (deux
  // rows métier indistinguables par les champs naturels — cas X3 où une
  // même commande/article/date peut donner 2 rows), on suffixe par un
  // compteur pour garantir l'unicité exigée par React. Stable tant que
  // l'ordre des rows ne change pas entre renders (tri/filtrage pilotés
  // en amont).
  const uniqueKeys = useMemo(() => {
    const seen = new Map<string, number>()
    const out: string[] = new Array(rows.length)
    for (let i = 0; i < rows.length; i++) {
      const base = getRowKey ? getRowKey(rows[i]) : String(i)
      const count = seen.get(base) ?? 0
      seen.set(base, count + 1)
      out[i] = count === 0 ? base : `${base}#${count}`
    }
    return out
  }, [rows, getRowKey])

  const totalSize = rowVirtualizer.getTotalSize()
  const topPad = virtualItems.length > 0 ? virtualItems[0].start : 0
  const bottomPad =
    virtualItems.length > 0 ? totalSize - virtualItems[virtualItems.length - 1].end : 0

  const colCount = columns.length + (indexColumn ? 1 : 0)

  const colId = (col: ColumnDef<TRow>): string => col.id ?? (col.accessorKey as string)

  const toggleSorting = (columnId: string) => {
    const existing = sorting.find((s) => s.id === columnId)
    if (!existing) {
      onSortingChange([{ id: columnId, desc: false }])
    } else if (!existing.desc) {
      onSortingChange([{ id: columnId, desc: true }])
    } else {
      onSortingChange([])
    }
  }

  const getValue = (row: TRow, col: ColumnDef<TRow>) => {
    if (col.accessorFn) return col.accessorFn(row)
    if (col.accessorKey) return row[col.accessorKey as keyof TRow]
    return undefined
  }

  const renderHeader = (col: ColumnDef<TRow>): ReactNode => {
    if (typeof col.header === 'function') {
      return col.header({ column: { columnDef: col } })
    }
    if (col.header !== undefined) return col.header
    return colId(col)
  }

  const sortIndicator = (col: ColumnDef<TRow>) => {
    if (col.enableSorting === false) return null
    const sorted = sorting.find((s) => s.id === colId(col))
    if (!sorted) {
      return (
        <ChevronsUpDown
          size={12}
          strokeWidth={1.75}
          className="leading-none text-muted-foreground/50"
        />
      )
    }
    return sorted.desc ? (
      <ArrowDown size={12} strokeWidth={1.75} className="leading-none text-primary" />
    ) : (
      <ArrowUp size={12} strokeWidth={1.75} className="leading-none text-primary" />
    )
  }

  return (
    <div className={cn(DEFAULT_SCROLL_CLASS, scrollContainerClass)} ref={scrollRef}>
      {rows.length > 0 ? (
        <table className={cn('w-full border-collapse text-left text-sm', tableClass)}>
          <thead className="sticky top-0 z-10 bg-card">
            <tr
              className={cn(
                'border-b',
                theadRowClass,
                columnDividers && 'divide-x divide-rule-soft'
              )}
            >
              {indexColumn && (
                <th
                  className={cn(
                    'px-3 py-2 text-xs font-medium text-muted-foreground',
                    indexColumn.thClass
                  )}
                >
                  {indexColumn.headerLabel}
                </th>
              )}
              {columns.map((col) => {
                const columnId = colId(col)
                const isSorted = sorting.some((s) => s.id === columnId)
                const canSort = col.enableSorting !== false

                return (
                  <th
                    key={columnId}
                    tabIndex={canSort ? 0 : undefined}
                    role={canSort ? 'button' : undefined}
                    aria-sort={
                      isSorted
                        ? sorting.find((s) => s.id === columnId)?.desc
                          ? 'descending'
                          : 'ascending'
                        : undefined
                    }
                    className={cn(
                      'px-3 py-2 text-xs font-medium text-muted-foreground select-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-none',
                      col.meta?.thClass,
                      canSort && 'cursor-pointer transition-colors hover:text-foreground',
                      isSorted && 'font-bold text-foreground'
                    )}
                    onClick={() => canSort && toggleSorting(columnId)}
                    onKeyDown={(e) => {
                      if (canSort && (e.key === 'Enter' || e.key === ' ')) {
                        e.preventDefault()
                        toggleSorting(columnId)
                      }
                    }}
                  >
                    <span className="inline-flex items-center gap-1">
                      <span>{renderHeader(col)}</span>
                      {sortIndicator(col)}
                    </span>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {topPad > 0 && (
              <tr>
                <td style={{ height: `${topPad}px` }} colSpan={colCount} />
              </tr>
            )}

            {virtualItems.map((virtualRow) => {
              const row = rows[virtualRow.index]
              if (!row) return null

              const isSelected = selectedRowKey && getRowKey && getRowKey(row) === selectedRowKey
              const rowKey = uniqueKeys[virtualRow.index] ?? virtualRow.index
              const rowStyle: CSSProperties | undefined = onRowClick
                ? { cursor: 'pointer' }
                : undefined

              // Identité MÉTIER (pas la clé React dédoublonnée) : c'est celle
              // que le diff manipule. Une ligne entrée/sortie flashe en entier,
              // sinon le flash descend à la cellule (cf. td plus bas).
              const keyForFlash = getFlashKey ?? getRowKey
              const flashKey = flash && keyForFlash ? keyForFlash(row) : null
              const rowFlash = flashKey
                ? flash!.entered.has(flashKey)
                  ? 'in'
                  : flash!.exited.has(flashKey)
                    ? 'out'
                    : undefined
                : undefined
              const changedCols =
                rowFlash === undefined && flashKey ? flash!.changed.get(flashKey) : undefined

              return (
                <tr
                  key={rowKey}
                  ref={rowVirtualizer.measureElement}
                  data-index={virtualRow.index}
                  data-flash={rowFlash}
                  className={cn(
                    'border-b transition-colors last:border-b-0 hover:bg-muted/50',
                    getRowClass?.(row, virtualRow.index),
                    isSelected && rowSelectedClass,
                    columnDividers && 'divide-x divide-rule-soft'
                  )}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  style={rowStyle}
                >
                  {indexColumn && (
                    <td className={cn('px-3 py-2', indexColumn.tdClass(row, virtualRow.index))}>
                      {String(virtualRow.index + 1).padStart(2, '0')}
                    </td>
                  )}
                  {columns.map((col) => {
                    const columnId = colId(col)
                    const val = getValue(row, col)

                    return (
                      <td
                        key={columnId}
                        data-flash={changedCols?.has(columnId) ? 'chg' : undefined}
                        className={cn('px-3 py-2', col.meta?.tdClass)}
                      >
                        {col.cell
                          ? col.cell({
                              row: { original: row },
                              getValue: () => val,
                              column: { columnDef: col },
                            })
                          : (val as ReactNode)}
                      </td>
                    )
                  })}
                </tr>
              )
            })}

            {bottomPad > 0 && (
              <tr>
                <td style={{ height: `${bottomPad}px` }} colSpan={colCount} />
              </tr>
            )}
          </tbody>
        </table>
      ) : (
        emptyState
      )}
    </div>
  )
}

export default DataTable
