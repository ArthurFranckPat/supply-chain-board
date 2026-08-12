import {
  Fragment,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react'

import { cn } from '@r/lib/utils'
import { tableCellClass, tableHeadClass, tableHeadRowClass, tableRowClass } from './table-row'

/**
 * Wrapper DataTable maison (plan §6) : table HTML + tri contrôlé +
 * virtualisation @tanstack/react-virtual. API alignée sur le port
 * react-carbon (structure conservée, rendu Carbon remplacé par du
 * markup shadcn stock).
 *
 * La grammaire de rangée et de cellule vient de `ui/table-row` — c'est la même
 * pour une table pilotée par colonnes et pour une `<table>` écrite à la main.
 * Elle n'a donc pas à être redite par les appelants : `getRowClass` ne sert
 * plus qu'à ce qui dépend VRAIMENT de la donnée (une gravité, un fond d'alerte),
 * et `meta.thClass` / `meta.tdClass` qu'à la largeur et l'alignement.
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

/** Identifiant stable d'une colonne : `id` explicite sinon `accessorKey`. */
export const columnId = <TRow,>(col: ColumnDef<TRow>): string =>
  col.id ?? (col.accessorKey as string)

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
  getRowClass?: (row: TRow, virtualIndex: number) => string | undefined
  onRowClick?: (row: TRow) => void
  selectedRowKey?: string | null
  getRowKey?: (row: TRow) => string
  emptyState?: ReactNode
  /**
   * false désactive la fenêtre @tanstack/react-virtual : toutes les lignes
   * restent dans le DOM. Nécessaire pour l'impression (les lignes hors
   * viewport doivent exister pour `print:overflow-visible`) et pour
   * `renderDetailRow`. Défaut true.
   */
  virtualize?: boolean
  /**
   * Hauteur de ligne supposée avant mesure réelle (défaut 56). Trop basse sur
   * des lignes hautes, le virtualiseur sous-estime la taille totale et la barre
   * de défilement saute à chaque mesure.
   */
  estimateRowSize?: number
  /**
   * Nombre de colonnes de tête figées au scroll horizontal, colonne d'index
   * comprise (0 = aucune). Nécessite des largeurs stables (table-fixed).
   * Bascule la table en `border-collapse: separate` (classe `has-sticky`) :
   * en `collapse`, les cellules sticky perdent bordures/fonds (CSSWG #3136).
   */
  stickyCols?: number
  /** Ligne de détail insérée après une ligne (colSpan complet) — uniquement pris en compte si virtualize=false. */
  renderDetailRow?: (row: TRow, rowKey: string) => ReactNode
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
  getRowClass,
  onRowClick,
  selectedRowKey,
  getRowKey,
  emptyState,
  virtualize = true,
  estimateRowSize = 56,
  stickyCols = 0,
  renderDetailRow,
}: DataTableProps<TRow>) {
  const scrollRef = useRef<HTMLDivElement>(null)

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => estimateRowSize,
    overscan: 12,
  })

  const virtualItems = rowVirtualizer.getVirtualItems()
  const rowIndices = virtualize ? virtualItems.map((v) => v.index) : rows.map((_, i) => i)

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
  const topPad = virtualize && virtualItems.length > 0 ? virtualItems[0].start : 0
  const bottomPad =
    virtualize && virtualItems.length > 0
      ? totalSize - virtualItems[virtualItems.length - 1].end
      : 0

  const colCount = columns.length + (indexColumn ? 1 : 0)

  const colId = columnId

  // ── Colonnes figées : largeurs mesurées une fois par jeu de colonnes, puis
  //    `left` en cascade (la 2e se cale sur la largeur de la 1re…). L'ombre de
  //    bord n'apparaît que quand le conteneur est réellement défilé.
  const [pinnedLeft, setPinnedLeft] = useState<number[]>([])
  const [pinnedScrolled, setPinnedScrolled] = useState(false)

  useLayoutEffect(() => {
    const scroller = scrollRef.current
    if (!scroller || stickyCols <= 0) {
      setPinnedLeft([])
      return
    }
    const ths = Array.from(scroller.querySelectorAll('thead th')) as HTMLElement[]
    const offsets: number[] = []
    let acc = 0
    for (let i = 0; i < Math.min(stickyCols, ths.length); i++) {
      offsets.push(acc)
      acc += ths[i].offsetWidth
    }
    setPinnedLeft(offsets)
  }, [stickyCols, columns, indexColumn])

  const pinnedStyle = (i: number): CSSProperties | undefined => {
    if (i >= pinnedLeft.length) return undefined
    const style: CSSProperties = { left: pinnedLeft[i] }
    if (pinnedScrolled && i === stickyCols - 1) {
      style.boxShadow = '6px 0 8px -6px rgba(20,20,20,0.28)'
    }
    return style
  }
  const pinnedClass = (i: number) => (i < pinnedLeft.length ? 'sticky z-[3] bg-card' : '')

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
      // Chevron discret au survol uniquement (Material) — un chevron permanent
      // sur toutes les colonnes triables est du bruit sur 11 colonnes.
      return (
        <ChevronsUpDown
          size={12}
          strokeWidth={1.75}
          aria-hidden="true"
          className="leading-none text-muted-foreground/50 opacity-0 transition-opacity duration-100 group-hover/th:opacity-100"
        />
      )
    }
    return sorted.desc ? (
      <ArrowDown
        size={12}
        strokeWidth={1.75}
        aria-hidden="true"
        className="leading-none text-primary"
      />
    ) : (
      <ArrowUp
        size={12}
        strokeWidth={1.75}
        aria-hidden="true"
        className="leading-none text-primary"
      />
    )
  }

  return (
    <div
      className={cn(DEFAULT_SCROLL_CLASS, scrollContainerClass)}
      ref={scrollRef}
      onScroll={(e) => setPinnedScrolled(e.currentTarget.scrollLeft > 0)}
    >
      {rows.length > 0 ? (
        <table
          className={cn(
            'w-full border-collapse text-left text-sm',
            stickyCols > 0 && 'has-sticky',
            tableClass
          )}
          aria-rowcount={rows.length}
          aria-colcount={colCount}
        >
          <thead className="sticky top-0 z-10 bg-card">
            <tr className={cn(tableHeadRowClass, theadRowClass)}>
              {indexColumn && (
                <th
                  className={cn(tableHeadClass(), indexColumn.thClass, pinnedClass(0))}
                  style={pinnedStyle(0)}
                >
                  {indexColumn.headerLabel}
                </th>
              )}
              {columns.map((col, ci) => {
                const columnId = colId(col)
                const cellIndex = (indexColumn ? 1 : 0) + ci
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
                      'group/th select-none rounded focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                      tableHeadClass(),
                      col.meta?.thClass,
                      canSort && 'cursor-pointer transition-colors hover:text-foreground',
                      isSorted && 'font-bold text-foreground',
                      pinnedClass(cellIndex)
                    )}
                    style={pinnedStyle(cellIndex)}
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

            {rowIndices.map((index) => {
              const row = rows[index]
              if (!row) return null

              const isSelected = selectedRowKey && getRowKey && getRowKey(row) === selectedRowKey
              const rowKey = uniqueKeys[index] ?? index
              const detail =
                !virtualize && renderDetailRow ? renderDetailRow(row, String(rowKey)) : null

              return (
                <Fragment key={rowKey}>
                  <tr
                    ref={virtualize ? rowVirtualizer.measureElement : undefined}
                    data-index={virtualize ? index : undefined}
                    aria-rowindex={index + 1}
                    className={cn(
                      tableRowClass({
                        selected: Boolean(isSelected),
                        clickable: Boolean(onRowClick),
                      }),
                      getRowClass?.(row, index)
                    )}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                  >
                    {indexColumn && (
                      <td
                        className={cn(
                          tableCellClass(),
                          indexColumn.tdClass(row, index),
                          pinnedClass(0)
                        )}
                        style={pinnedStyle(0)}
                      >
                        {String(index + 1).padStart(2, '0')}
                      </td>
                    )}
                    {columns.map((col, ci) => {
                      const columnId = colId(col)
                      const cellIndex = (indexColumn ? 1 : 0) + ci
                      const val = getValue(row, col)

                      return (
                        <td
                          key={columnId}
                          className={cn(
                            tableCellClass(),
                            col.meta?.tdClass,
                            pinnedClass(cellIndex)
                          )}
                          style={pinnedStyle(cellIndex)}
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
                  {detail && (
                    <tr>
                      <td colSpan={colCount} className="p-0">
                        {detail}
                      </td>
                    </tr>
                  )}
                </Fragment>
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
