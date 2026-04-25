import type { LotEcoArticle, StatutLot } from '@/types/lot-eco'
import { StatutBadge } from '@/components/ui/StatutBadge'
import { useMemo } from 'react'
import { GridTable } from '@/components/ui/GridTable'
import type { GridTableColumn } from '@/components/ui/GridTable'

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

function SortHeader({ label, active, dir }: { label: string; active: boolean; dir: SortDir | null }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {label}
      {active && (
        <span className="text-[9px]">{dir === 'asc' ? '▲' : '▼'}</span>
      )}
    </span>
  )
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

  const columns: GridTableColumn<LotEcoArticle>[] = [
    {
      key: 'select',
      header: (
        <input
          type="checkbox"
          checked={allSelected}
          onChange={onToggleAll}
          className="h-3 w-3"
        />
      ),
      align: 'center',
      width: '40px',
      cell: (a) => (
        <input
          type="checkbox"
          checked={selected.has(a.article)}
          onChange={() => onToggleOne(a.article)}
          className="h-3 w-3"
        />
      ),
    },
    {
      key: 'article',
      header: (
        <button onClick={() => onSort('article')} className="uppercase tracking-wide">
          <SortHeader label="Article" active={sortKey === 'article'} dir={sortKey === 'article' ? sortDir : null} />
        </button>
      ),
      cell: (a) => <span className="font-mono text-[12px] font-semibold">{a.article}</span>,
      width: '120px',
    },
    {
      key: 'description',
      header: (
        <button onClick={() => onSort('description')} className="uppercase tracking-wide">
          <SortHeader label="Description" active={sortKey === 'description'} dir={sortKey === 'description' ? sortDir : null} />
        </button>
      ),
      cell: (a) => <span className="text-[12px] text-muted-foreground block max-w-[220px] truncate">{a.description}</span>,
    },
    {
      key: 'lot_eco',
      header: (
        <button onClick={() => onSort('lot_eco')} className="uppercase tracking-wide">
          <SortHeader label="Lot éco" active={sortKey === 'lot_eco'} dir={sortKey === 'lot_eco' ? sortDir : null} />
        </button>
      ),
      align: 'right',
      width: '80px',
      cell: (a) => <span className="font-mono text-[12px] tabular-nums">{a.lot_eco.toLocaleString('fr-FR', { maximumFractionDigits: 0 })}</span>,
    },
    {
      key: 'lot_optimal',
      header: (
        <button onClick={() => onSort('lot_optimal')} className="uppercase tracking-wide">
          <SortHeader label="Lot opt." active={sortKey === 'lot_optimal'} dir={sortKey === 'lot_optimal' ? sortDir : null} />
        </button>
      ),
      align: 'right',
      width: '80px',
      cell: (a) => <span className="font-mono text-[12px] tabular-nums">{a.lot_optimal.toLocaleString('fr-FR', { maximumFractionDigits: 0 })}</span>,
    },
    {
      key: 'demande_hebdo',
      header: (
        <button onClick={() => onSort('demande_hebdo')} className="uppercase tracking-wide">
          <SortHeader label="Dem./sem" active={sortKey === 'demande_hebdo'} dir={sortKey === 'demande_hebdo' ? sortDir : null} />
        </button>
      ),
      align: 'right',
      width: '85px',
      cell: (a) => <span className="font-mono text-[12px] tabular-nums">{a.demande_hebdo.toLocaleString('fr-FR', { maximumFractionDigits: 0 })}</span>,
    },
    {
      key: 'couverture',
      header: (
        <button onClick={() => onSort('couverture_lot_semaines')} className="uppercase tracking-wide">
          <SortHeader label="Couv. (sem)" active={sortKey === 'couverture_lot_semaines'} dir={sortKey === 'couverture_lot_semaines' ? sortDir : null} />
        </button>
      ),
      align: 'right',
      width: '90px',
      cell: (a) => <span className="font-mono text-[12px] tabular-nums">{a.couverture_lot_semaines.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}</span>,
    },
    {
      key: 'ratio',
      header: (
        <button onClick={() => onSort('ratio_couverture')} className="uppercase tracking-wide">
          <SortHeader label="Ratio" active={sortKey === 'ratio_couverture'} dir={sortKey === 'ratio_couverture' ? sortDir : null} />
        </button>
      ),
      align: 'right',
      width: '70px',
      cell: (a) => <span className="font-mono text-[12px] tabular-nums">{a.ratio_couverture.toLocaleString('fr-FR', { maximumFractionDigits: 2 })}</span>,
    },
    {
      key: 'stock',
      header: (
        <button onClick={() => onSort('stock_physique')} className="uppercase tracking-wide">
          <SortHeader label="Stock" active={sortKey === 'stock_physique'} dir={sortKey === 'stock_physique' ? sortDir : null} />
        </button>
      ),
      align: 'right',
      width: '80px',
      cell: (a) => <span className="font-mono text-[12px] tabular-nums">{a.stock_physique.toLocaleString('fr-FR', { maximumFractionDigits: 0 })}</span>,
    },
    {
      key: 'stock_jours',
      header: (
        <button onClick={() => onSort('stock_jours')} className="uppercase tracking-wide">
          <SortHeader label="Stock (j)" active={sortKey === 'stock_jours'} dir={sortKey === 'stock_jours' ? sortDir : null} />
        </button>
      ),
      align: 'right',
      width: '80px',
      cell: (a) => <span className="font-mono text-[12px] tabular-nums">{a.stock_jours.toLocaleString('fr-FR', { maximumFractionDigits: 0 })}</span>,
    },
    {
      key: 'statut',
      header: (
        <button onClick={() => onSort('statut')} className="uppercase tracking-wide">
          <SortHeader label="Statut" active={sortKey === 'statut'} dir={sortKey === 'statut' ? sortDir : null} />
        </button>
      ),
      align: 'center',
      width: '90px',
      cell: (a) => <StatutBadge statut={a.statut as StatutLot} />,
    },
    {
      key: 'valeur_stock',
      header: (
        <button onClick={() => onSort('valeur_stock')} className="uppercase tracking-wide">
          <SortHeader label="Valeur" active={sortKey === 'valeur_stock'} dir={sortKey === 'valeur_stock' ? sortDir : null} />
        </button>
      ),
      align: 'right',
      width: '90px',
      cell: (a) => (
        <span className="font-mono text-[12px] tabular-nums">
          {a.valeur_stock.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })}
        </span>
      ),
    },
    {
      key: 'economie',
      header: (
        <button onClick={() => onSort('economie_immobilisation')} className="uppercase tracking-wide">
          <SortHeader label="Éco. immob." active={sortKey === 'economie_immobilisation'} dir={sortKey === 'economie_immobilisation' ? sortDir : null} />
        </button>
      ),
      align: 'right',
      width: '95px',
      cell: (a) => (
        <span className="font-mono text-[12px] tabular-nums text-muted-foreground">
          {a.economie_immobilisation.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })}
        </span>
      ),
    },
  ]

  const handleRowClick = (a: LotEcoArticle) => {
    onSelectArticle(a)
  }

  return (
    <div className="space-y-3">
      <GridTable
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
              <button disabled={safePage <= 1} onClick={() => onPageChange(safePage - 1)} className="h-6 px-2 text-[11px] border border-border hover:bg-muted disabled:opacity-30">←</button>
              <button disabled={safePage >= totalPages} onClick={() => onPageChange(safePage + 1)} className="h-6 px-2 text-[11px] border border-border hover:bg-muted disabled:opacity-30">→</button>
            </div>
          </div>
        }
      />
    </div>
  )
}
