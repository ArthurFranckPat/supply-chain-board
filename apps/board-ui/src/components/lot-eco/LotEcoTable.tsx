import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { LotEcoArticle, StatutLot } from '@/types/lot-eco'
import { StatutBadge } from '@/components/ui/StatutBadge'
import { useMemo } from 'react'
import { DataTable } from '@/components/ui/DataTable'
import type { DataTableColumn } from '@/components/ui/DataTable'
import { NumberCell, EuroCell, MonoCell, TextCell } from '@/components/ui/DataTableCells'

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

  const columns: DataTableColumn<LotEcoArticle>[] = [
    {
      key: 'select',
      header: (
        <input
          type="checkbox"
          checked={allSelected}
          onChange={onToggleAll}
          className="rounded border-stone-300 text-primary focus:ring-primary"
        />
      ),
      align: 'center',
      width: '40px',
      cell: (a) => (
        <input
          type="checkbox"
          checked={selected.has(a.article)}
          onChange={() => onToggleOne(a.article)}
          className="rounded border-stone-300 text-primary focus:ring-primary"
        />
      ),
    },
    {
      key: 'article',
      header: 'Article',
      cell: (a) => <MonoCell className="font-semibold">{a.article}</MonoCell>,
      width: '120px',
      sortable: true,
      sortDir: sortKey === 'article' ? sortDir : null,
      onSort: () => onSort('article'),
    },
    {
      key: 'description',
      header: 'Description',
      cell: (a) => <TextCell muted truncate>{a.description}</TextCell>,
      sortable: true,
      sortDir: sortKey === 'description' ? sortDir : null,
      onSort: () => onSort('description'),
    },
    {
      key: 'lot_eco',
      header: 'Lot éco',
      align: 'right',
      width: '80px',
      cell: (a) => <NumberCell value={a.lot_eco} />,
      sortable: true,
      sortDir: sortKey === 'lot_eco' ? sortDir : null,
      onSort: () => onSort('lot_eco'),
    },
    {
      key: 'lot_optimal',
      header: 'Lot opt.',
      align: 'right',
      width: '80px',
      cell: (a) => <NumberCell value={a.lot_optimal} />,
      sortable: true,
      sortDir: sortKey === 'lot_optimal' ? sortDir : null,
      onSort: () => onSort('lot_optimal'),
    },
    {
      key: 'demande_hebdo',
      header: 'Dem./sem',
      align: 'right',
      width: '85px',
      cell: (a) => <NumberCell value={a.demande_hebdo} />,
      sortable: true,
      sortDir: sortKey === 'demande_hebdo' ? sortDir : null,
      onSort: () => onSort('demande_hebdo'),
    },
    {
      key: 'couverture',
      header: 'Couv. (sem)',
      align: 'right',
      width: '90px',
      cell: (a) => <NumberCell value={a.couverture_lot_semaines} decimals={1} />,
      sortable: true,
      sortDir: sortKey === 'couverture_lot_semaines' ? sortDir : null,
      onSort: () => onSort('couverture_lot_semaines'),
    },
    {
      key: 'ratio',
      header: 'Ratio',
      align: 'right',
      width: '70px',
      cell: (a) => <NumberCell value={a.ratio_couverture} decimals={2} />,
      sortable: true,
      sortDir: sortKey === 'ratio_couverture' ? sortDir : null,
      onSort: () => onSort('ratio_couverture'),
    },
    {
      key: 'stock',
      header: 'Stock',
      align: 'right',
      width: '80px',
      cell: (a) => <NumberCell value={a.stock_physique} />,
      sortable: true,
      sortDir: sortKey === 'stock_physique' ? sortDir : null,
      onSort: () => onSort('stock_physique'),
    },
    {
      key: 'stock_jours',
      header: 'Stock (j)',
      align: 'right',
      width: '80px',
      cell: (a) => <NumberCell value={a.stock_jours} decimals={0} />,
      sortable: true,
      sortDir: sortKey === 'stock_jours' ? sortDir : null,
      onSort: () => onSort('stock_jours'),
    },
    {
      key: 'statut',
      header: 'Statut',
      align: 'center',
      width: '90px',
      cell: (a) => <StatutBadge statut={a.statut as StatutLot} />,
      sortable: true,
      sortDir: sortKey === 'statut' ? sortDir : null,
      onSort: () => onSort('statut'),
    },
    {
      key: 'valeur_stock',
      header: 'Valeur',
      align: 'right',
      width: '90px',
      cell: (a) => <EuroCell value={a.valeur_stock} />,
      sortable: true,
      sortDir: sortKey === 'valeur_stock' ? sortDir : null,
      onSort: () => onSort('valeur_stock'),
    },
    {
      key: 'economie',
      header: 'Éco. immob.',
      align: 'right',
      width: '95px',
      cell: (a) => <EuroCell value={a.economie_immobilisation} className="text-muted-foreground" />,
      sortable: true,
      sortDir: sortKey === 'economie_immobilisation' ? sortDir : null,
      onSort: () => onSort('economie_immobilisation'),
    },
  ]

  const handleRowClick = (a: LotEcoArticle) => {
    onSelectArticle(a)
  }

  return (
    <div className="space-y-3">
      <DataTable
        columns={columns}
        data={paged}
        keyExtractor={(a) => a.article}
        maxHeight="520px"
        onRowClick={handleRowClick}
        emptyMessage="Aucun article ne correspond aux filtres."
        footer={
          <div className="flex items-center justify-between">
            <p className="text-[11px] text-muted-foreground">
              {data.length} article{data.length > 1 ? 's' : ''} — Page {safePage} / {totalPages}
            </p>
            <div className="flex items-center gap-1">
              <button
                disabled={safePage <= 1}
                onClick={() => onPageChange(safePage - 1)}
                className="p-1.5 rounded-lg hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                disabled={safePage >= totalPages}
                onClick={() => onPageChange(safePage + 1)}
                className="p-1.5 rounded-lg hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        }
      />
    </div>
  )
}
