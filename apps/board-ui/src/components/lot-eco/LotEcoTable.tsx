import { ArrowUpDown, ArrowUp, ArrowDown, ChevronLeft, ChevronRight } from 'lucide-react'
import type { LotEcoArticle, StatutLot } from '@/types/lot-eco'
import { StatutBadge } from '@/components/ui/StatutBadge'
import { fmtNumber, fmtEuros } from '@/lib/format'
import { useMemo } from 'react'

type SortKey = keyof LotEcoArticle

type SortDir = 'asc' | 'desc'

interface Props {
  data: LotEcoArticle[]
  sortKey: SortKey
  sortDir: SortDir
  onSort: (key: SortKey) => void
  selected: Set<string>
  onToggleOne: (article: string) => void
  onToggleAll: () => void
  onSelectArticle: (article: LotEcoArticle) => void
  page: number
  onPageChange: (page: number) => void
  pageSize?: number
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ArrowUpDown className="h-3 w-3 text-stone-300" />
  return dir === 'asc' ? <ArrowUp className="h-3 w-3 text-primary" /> : <ArrowDown className="h-3 w-3 text-primary" />
}

const COLUMNS: Array<{ key: SortKey; label: string; align?: 'left' | 'right'; format?: 'number' | 'euros' | 'status' }> = [
  { key: 'article', label: 'Article' },
  { key: 'description', label: 'Description' },
  { key: 'lot_eco', label: 'Lot éco', align: 'right', format: 'number' },
  { key: 'lot_optimal', label: 'Lot opt.', align: 'right', format: 'number' },
  { key: 'demande_hebdo', label: 'Dem./sem', align: 'right', format: 'number' },
  { key: 'couverture_lot_semaines', label: 'Couv. (sem)', align: 'right', format: 'number' },
  { key: 'ratio_couverture', label: 'Ratio', align: 'right', format: 'number' },
  { key: 'stock_physique', label: 'Stock', align: 'right', format: 'number' },
  { key: 'stock_jours', label: 'Stock (j)', align: 'right', format: 'number' },
  { key: 'statut', label: 'Statut', format: 'status' },
  { key: 'valeur_stock', label: 'Valeur', align: 'right', format: 'euros' },
  { key: 'economie_immobilisation', label: 'Éco. immob.', align: 'right', format: 'euros' },
]

export function LotEcoTable({
  data,
  sortKey,
  sortDir,
  onSort,
  selected,
  onToggleOne,
  onToggleAll,
  onSelectArticle,
  page,
  onPageChange,
  pageSize = 50,
}: Props) {
  const totalPages = Math.max(1, Math.ceil(data.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const paged = useMemo(() => {
    const start = (safePage - 1) * pageSize
    return data.slice(start, start + pageSize)
  }, [data, safePage, pageSize])

  const allSelected = paged.length > 0 && paged.every((a) => selected.has(a.article))

  function renderCell(a: LotEcoArticle, col: typeof COLUMNS[number]) {
    const val = a[col.key]
    if (col.format === 'status') return <StatutBadge statut={val as StatutLot} />
    if (col.format === 'euros') return <span className="font-mono text-[11px]">{fmtEuros(val as number)}</span>
    if (col.format === 'number') return <span className="font-mono text-[11px]">{fmtNumber(val as number)}</span>
    return <span className="text-[11px]">{String(val)}</span>
  }

  return (
    <div className="space-y-3">
      <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
        <table className="w-full text-left">
          <thead className="bg-stone-50/80 border-b border-border">
            <tr>
              <th className="py-3 px-2 w-8">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={onToggleAll}
                  className="rounded border-stone-300 text-primary focus:ring-primary"
                />
              </th>
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  className={`text-[10.5px] font-semibold text-stone-400 uppercase tracking-wider py-3 px-4 cursor-pointer select-none hover:text-stone-600 transition-colors whitespace-nowrap ${col.align === 'right' ? 'text-right' : 'text-left'}`}
                  onClick={() => onSort(col.key)}
                >
                  <span className="inline-flex items-center gap-1.5">
                    {col.label}
                    <SortIcon active={sortKey === col.key} dir={sortDir} />
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {paged.map((a) => (
              <tr
                key={a.article}
                className="hover:bg-stone-50/60 transition-colors cursor-pointer group"
                onClick={() => onSelectArticle(a)}
              >
                <td className="py-3 px-2" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selected.has(a.article)}
                    onChange={() => onToggleOne(a.article)}
                    className="rounded border-stone-300 text-primary focus:ring-primary"
                  />
                </td>
                {COLUMNS.map((col) => (
                  <td
                    key={col.key}
                    className={`py-3 px-4 ${col.align === 'right' ? 'text-right' : 'text-left'}`}
                  >
                    {renderCell(a, col)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-stone-400">
          {data.length} article{data.length > 1 ? 's' : ''} — Page {safePage} / {totalPages}
        </p>
        <div className="flex items-center gap-1">
          <button
            disabled={safePage <= 1}
            onClick={() => onPageChange(safePage - 1)}
            className="p-1.5 rounded-lg hover:bg-stone-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            disabled={safePage >= totalPages}
            onClick={() => onPageChange(safePage + 1)}
            className="p-1.5 rounded-lg hover:bg-stone-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
