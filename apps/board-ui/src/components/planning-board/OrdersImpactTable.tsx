import { useMemo, useState } from 'react'
import { ShoppingCart, ChevronDown, ChevronRight } from 'lucide-react'
import type { OrderImpactRow, OrderImpactsResponse, OrderStatut } from '@/types/planningBoard'

export const ORDER_STATUT_STYLES: Record<OrderStatut, { label: string; chip: string }> = {
  on_time: { label: "À l'heure", chip: 'bg-green text-white' },
  stock: { label: 'Stock', chip: 'bg-green/70 text-white' },
  retard: { label: 'Retard', chip: 'bg-orange text-white' },
  bloquee: { label: 'Bloquée', chip: 'bg-destructive text-white' },
  sans_couverture: { label: 'Sans couverture', chip: 'bg-destructive/70 text-white' },
}

const FILTERS: Array<{ value: OrderStatut | 'all'; label: string }> = [
  { value: 'all', label: 'Toutes' },
  { value: 'retard', label: 'Retards' },
  { value: 'bloquee', label: 'Bloquées' },
  { value: 'sans_couverture', label: 'Sans couverture' },
  { value: 'on_time', label: "À l'heure" },
]

interface OrdersImpactTableProps {
  impacts: OrderImpactsResponse
  onSelectOf: (numOf: string) => void
}

function OrderRow({ row, onSelectOf }: { row: OrderImpactRow; onSelectOf: (n: string) => void }) {
  const [expanded, setExpanded] = useState(false)
  const statut = ORDER_STATUT_STYLES[row.statut]

  return (
    <>
      <tr
        onClick={() => setExpanded((v) => !v)}
        className="cursor-pointer border-b border-border/40 transition-colors hover:bg-muted/30"
      >
        <td className="px-2 py-1.5">
          {row.ofs.length > 0 ? (
            expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />
          ) : null}
        </td>
        <td className="px-2 py-1.5 font-mono text-[10px] font-bold">{row.num_commande}</td>
        <td className="max-w-[140px] truncate px-2 py-1.5 text-[11px]" title={row.client}>{row.client}</td>
        <td className="px-2 py-1.5 font-mono text-[10px]">{row.article}</td>
        <td className="px-2 py-1.5 text-right text-[11px] font-semibold">{row.qte_restante}</td>
        <td className={`px-2 py-1.5 text-[11px] ${row.deja_en_retard ? 'font-bold text-destructive' : ''}`}>
          {row.date_expedition}
        </td>
        <td className="px-2 py-1.5">
          <span className={`inline-flex rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${statut.chip}`}>
            {statut.label}
            {row.statut === 'retard' && ` +${row.jours_retard}j`}
          </span>
        </td>
        <td className="px-2 py-1.5 text-[10px] text-muted-foreground">
          {row.nature === 'prevision' ? 'Prévision' : row.type_commande}
        </td>
        <td className="px-2 py-1.5 text-[10px] text-muted-foreground">
          {row.ofs.length > 0 ? `${row.ofs.length} OF` : row.matching_method}
        </td>
      </tr>
      {expanded &&
        row.ofs.map((of) => (
          <tr key={of.num_of} className="border-b border-border/30 bg-muted/15">
            <td />
            <td colSpan={8} className="px-2 py-1">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onSelectOf(of.num_of)
                }}
                className="inline-flex items-center gap-2 rounded-lg border border-border/60 bg-card px-2 py-1 text-left transition-colors hover:bg-muted"
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    of.faisable === false ? 'bg-destructive' : of.faisable ? 'bg-green' : 'bg-muted-foreground/40'
                  }`}
                />
                <span className="font-mono text-[10px] font-bold">{of.num_of}</span>
                <span className="text-[10px] text-muted-foreground">{of.article}</span>
                <span className="text-[10px]">{of.qte_allouee} pcs</span>
                <span className="text-[10px] text-muted-foreground">fin {of.date_fin}</span>
                {of.modified && (
                  <span className="rounded bg-primary/10 px-1 text-[9px] font-semibold text-primary">modifié</span>
                )}
              </button>
            </td>
          </tr>
        ))}
    </>
  )
}

export function OrdersImpactTable({ impacts, onSelectOf }: OrdersImpactTableProps) {
  const [filter, setFilter] = useState<OrderStatut | 'all'>('all')

  const rows = useMemo(
    () =>
      impacts.orders.filter((r) =>
        filter === 'all' ? true : filter === 'on_time' ? r.statut === 'on_time' || r.statut === 'stock' : r.statut === filter,
      ),
    [impacts.orders, filter],
  )

  return (
    <div className="rounded-2xl border border-border bg-card/60 shadow-sm">
      <div className="flex flex-wrap items-center gap-3 border-b border-border/60 px-4 py-2.5">
        <span className="inline-flex items-center gap-1.5 text-[12px] font-black tracking-tight text-foreground">
          <ShoppingCart className="h-4 w-4 text-primary" />
          Commandes clients ({impacts.stats.nb_commandes})
        </span>
        <span className="text-[11px] font-semibold text-green">{impacts.stats.nb_on_time} à l'heure</span>
        <span className="text-[11px] font-semibold text-orange">{impacts.stats.nb_retard} en retard</span>
        <span className="text-[11px] font-semibold text-destructive">{impacts.stats.nb_bloquees} bloquées</span>
        <span className="text-[11px] font-semibold text-destructive/70">
          {impacts.stats.nb_sans_couverture} sans couverture
        </span>
        <div className="ml-auto inline-flex rounded-full border border-border bg-muted/55 p-0.5">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`rounded-full px-2.5 py-1 text-[10px] font-semibold transition-all ${
                filter === f.value
                  ? 'bg-card text-foreground shadow-sm ring-1 ring-border/70'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>
      <div className="max-h-[340px] overflow-y-auto">
        <table className="w-full border-collapse text-left">
          <thead className="sticky top-0 z-10 bg-muted/90 backdrop-blur-sm">
            <tr className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
              <th className="w-6 px-2 py-1.5" />
              <th className="px-2 py-1.5">Commande</th>
              <th className="px-2 py-1.5">Client</th>
              <th className="px-2 py-1.5">Article</th>
              <th className="px-2 py-1.5 text-right">Qté</th>
              <th className="px-2 py-1.5">Exp. demandée</th>
              <th className="px-2 py-1.5">Statut</th>
              <th className="px-2 py-1.5">Type</th>
              <th className="px-2 py-1.5">Couverture</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <OrderRow
                key={`${row.num_commande}-${row.article}-${row.date_expedition}-${idx}`}
                row={row}
                onSelectOf={onSelectOf}
              />
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-6 text-center text-[12px] text-muted-foreground">
                  Aucune commande avec ce filtre.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
