import React, { useState, useMemo } from 'react'
import {
  ChevronUp,
  ChevronDown,
  ChevronRight,
  ArrowUpDown,
  Layers,
  Package,
  ChevronsUpDown,
  ExternalLink,
} from 'lucide-react'
import { cn } from '@r/lib/utils'
import {
  formatDateFr,
  type WorkstationOrderedCard,
  type OrderedProductItem,
} from '@r/lib/produced-hours/types'

type SortField = 'poste' | 'atelier' | 'totalQuantity' | 'nbProducts' | 'nbOrders'

interface ProducedOrdersTableProps {
  workstations: WorkstationOrderedCard[]
  onSelectPoste?: (poste: string) => void
}

export function ProducedOrdersTable({ workstations, onSelectPoste }: ProducedOrdersTableProps) {
  const [sortField, setSortField] = useState<SortField>('totalQuantity')
  const [sortAsc, setSortAsc] = useState(false)
  const [expandedPostes, setExpandedPostes] = useState<Set<string>>(new Set())

  const totalAllQuantity = useMemo(() => {
    return workstations.reduce((acc, w) => acc + w.totalQuantity, 0)
  }, [workstations])

  const toggleExpand = (poste: string) => {
    setExpandedPostes((prev) => {
      const next = new Set(prev)
      if (next.has(poste)) {
        next.delete(poste)
      } else {
        next.add(poste)
      }
      return next
    })
  }

  const toggleExpandAll = () => {
    if (expandedPostes.size === workstations.length) {
      setExpandedPostes(new Set())
    } else {
      setExpandedPostes(new Set(workstations.map((w) => w.poste)))
    }
  }

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc)
    } else {
      setSortField(field)
      setSortAsc(false)
    }
  }

  const sortedWorkstations = useMemo(() => {
    return [...workstations].sort((a, b) => {
      let valA = a[sortField]
      let valB = b[sortField]

      if (typeof valA === 'string') {
        const cmp = valA.localeCompare(valB as string)
        return sortAsc ? cmp : -cmp
      }

      valA = Number(valA) || 0
      valB = Number(valB) || 0
      return sortAsc ? (valA as number) - (valB as number) : (valB as number) - (valA as number)
    })
  }, [workstations, sortField, sortAsc])

  if (workstations.length === 0) {
    return (
      <div className="flex h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-rule bg-card p-8 text-center">
        <Layers className="size-8 text-muted-foreground/50" />
        <h3 className="mt-3 text-sm font-semibold text-foreground">Aucune commande trouvée</h3>
        <p className="mt-1 max-w-sm text-xs text-muted-foreground">
          Aucune commande de produit fini niveau 0 n'a été enregistrée pour les filtres et la
          période sélectionnés sur les postes d'assemblage final.
        </p>
      </div>
    )
  }

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) {
      return (
        <ArrowUpDown className="ml-1 size-3 text-muted-foreground/40 opacity-0 group-hover:opacity-100" />
      )
    }
    return sortAsc ? (
      <ChevronUp className="ml-1 size-3 text-brand" />
    ) : (
      <ChevronDown className="ml-1 size-3 text-brand" />
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-end px-1">
        <button
          type="button"
          onClick={toggleExpandAll}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronsUpDown className="size-3.5" />
          <span>
            {expandedPostes.size === workstations.length ? 'Tout replier' : 'Tout déplier'}
          </span>
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-rule bg-card shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-rule bg-surface-muted/60 text-[11px] font-semibold text-muted-foreground select-none">
              <tr>
                <th className="w-10 px-3 py-3 text-center" />
                <th
                  onClick={() => handleSort('poste')}
                  className="group cursor-pointer px-4 py-3 hover:text-foreground"
                >
                  <div className="flex items-center">
                    <span>Ligne de production (Assemblage PF)</span>
                    <SortIcon field="poste" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('atelier')}
                  className="group cursor-pointer px-3 py-3 hover:text-foreground"
                >
                  <div className="flex items-center">
                    <span>Atelier</span>
                    <SortIcon field="atelier" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('totalQuantity')}
                  className="group cursor-pointer px-3 py-3 text-right hover:text-foreground"
                >
                  <div className="flex items-center justify-end">
                    <span>Quantité commandée</span>
                    <SortIcon field="totalQuantity" />
                  </div>
                </th>
                <th className="px-3 py-3 text-left w-36 hidden sm:table-cell">
                  <span>Part du volume</span>
                </th>
                <th
                  onClick={() => handleSort('nbProducts')}
                  className="group cursor-pointer px-3 py-3 text-right hover:text-foreground hidden md:table-cell"
                >
                  <div className="flex items-center justify-end">
                    <span>Références PF</span>
                    <SortIcon field="nbProducts" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('nbOrders')}
                  className="group cursor-pointer px-3 py-3 text-right hover:text-foreground hidden md:table-cell"
                >
                  <div className="flex items-center justify-end">
                    <span>Commandes</span>
                    <SortIcon field="nbOrders" />
                  </div>
                </th>
                <th className="px-4 py-3 text-center">Tendance</th>
                <th className="px-3 py-3 text-center">Action</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-rule font-mono text-[12px]">
              {sortedWorkstations.map((wst) => {
                const isExpanded = expandedPostes.has(wst.poste)
                const sharePct =
                  totalAllQuantity > 0
                    ? Math.round((wst.totalQuantity / totalAllQuantity) * 1000) / 10
                    : 0
                const maxDaily = Math.max(1, ...wst.timeline.map((p) => p.qty))

                return (
                  <React.Fragment key={wst.poste}>
                    <tr
                      onClick={() => toggleExpand(wst.poste)}
                      className={cn(
                        'cursor-pointer transition-colors',
                        isExpanded ? 'bg-surface-muted/40 font-medium' : 'hover:bg-surface-hover/60'
                      )}
                    >
                      {/* Chevron expand */}
                      <td className="px-3 py-3 text-center">
                        <button
                          type="button"
                          className="inline-flex size-5 items-center justify-center rounded text-muted-foreground hover:text-foreground"
                          onClick={(e) => {
                            e.stopPropagation()
                            toggleExpand(wst.poste)
                          }}
                        >
                          {isExpanded ? (
                            <ChevronDown className="size-3.5 text-brand" />
                          ) : (
                            <ChevronRight className="size-3.5" />
                          )}
                        </button>
                      </td>

                      {/* Ligne / Poste */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-foreground tracking-tight">
                            {wst.poste}
                          </span>
                          <span className="text-[11px] font-sans font-normal text-muted-foreground truncate max-w-[260px]">
                            {wst.name}
                          </span>
                        </div>
                      </td>

                      {/* Atelier */}
                      <td className="px-3 py-3">
                        <span className="inline-flex items-center rounded-md border border-rule px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">
                          {wst.atelier}
                        </span>
                      </td>

                      {/* Quantité commandée */}
                      <td className="px-3 py-3 text-right font-bold text-foreground">
                        <span className="text-[13px]">
                          {wst.totalQuantity.toLocaleString('fr-FR')}
                        </span>
                        <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                          pièces
                        </span>
                      </td>

                      {/* Part de volume (barre) */}
                      <td className="px-3 py-3 hidden sm:table-cell">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-20 rounded-full bg-surface-muted overflow-hidden">
                            <div
                              className="h-full rounded-full bg-brand"
                              style={{ width: `${Math.min(100, sharePct)}%` }}
                            />
                          </div>
                          <span className="text-[10px] text-muted-foreground font-normal">
                            {sharePct}%
                          </span>
                        </div>
                      </td>

                      {/* Nb références PF */}
                      <td className="px-3 py-3 text-right text-muted-foreground hidden md:table-cell">
                        <span className="inline-flex items-center gap-1">
                          <Package className="size-3 text-muted-foreground/60" />
                          <span>{wst.nbProducts}</span>
                        </span>
                      </td>

                      {/* Nb commandes */}
                      <td className="px-3 py-3 text-right text-muted-foreground hidden md:table-cell">
                        {wst.nbOrders}
                      </td>

                      {/* Sparkline journalière */}
                      <td className="px-4 py-3 text-center">
                        {wst.timeline.length > 0 ? (
                          <div className="flex h-5 w-24 mx-auto items-end gap-0.5">
                            {wst.timeline.slice(-14).map((pt) => {
                              const pct = Math.min(100, (pt.qty / maxDaily) * 100)
                              return (
                                <div
                                  key={pt.date}
                                  style={{ height: `${Math.max(15, pct)}%` }}
                                  className="flex-1 rounded-t-xs bg-brand/70 hover:bg-brand transition-colors"
                                  title={`${formatDateFr(pt.date)}: ${pt.qty.toLocaleString('fr-FR')} pces`}
                                />
                              )
                            })}
                          </div>
                        ) : (
                          <span className="text-[10px] text-muted-foreground/40">—</span>
                        )}
                      </td>

                      {/* Action */}
                      <td className="px-3 py-3 text-center">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            onSelectPoste?.(wst.poste)
                          }}
                          className="inline-flex size-7 items-center justify-center rounded-lg border border-rule bg-card text-muted-foreground transition-colors hover:border-brand hover:text-brand"
                          title="Ouvrir la fiche détaillée de la ligne et des commandes"
                        >
                          <ExternalLink className="size-3.5" />
                        </button>
                      </td>
                    </tr>

                    {/* Sous-table des Produits finis niveau 0 */}
                    {isExpanded && (
                      <tr className="bg-surface-muted/20">
                        <td colSpan={9} className="p-0 border-b border-rule">
                          <div className="py-2 pl-12 pr-6">
                            <div className="rounded-xl border border-rule/60 bg-card overflow-hidden">
                              <div className="border-b border-rule/60 bg-surface-muted/40 px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center justify-between">
                                <span>
                                  Produits finis niveau 0 assemblés sur {wst.poste} (
                                  {wst.products.length})
                                </span>
                                <div className="flex items-center gap-3 lowercase first-letter:uppercase">
                                  <span>Quantités commandées</span>
                                  {onSelectPoste && (
                                    <button
                                      type="button"
                                      onClick={() => onSelectPoste(wst.poste)}
                                      className="inline-flex items-center gap-1 font-sans text-[11px] font-semibold text-brand hover:underline"
                                    >
                                      <span>Fiche détaillée</span>
                                      <ExternalLink className="size-3" />
                                    </button>
                                  )}
                                </div>
                              </div>

                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="border-b border-rule/40 text-[10px] text-muted-foreground font-sans">
                                    <th className="px-3 py-2 text-left">Code article</th>
                                    <th className="px-3 py-2 text-left">Désignation</th>
                                    <th className="px-3 py-2 text-right">Quantité</th>
                                    <th className="px-3 py-2 text-right w-24 hidden sm:table-cell">
                                      Part ligne
                                    </th>
                                    <th className="px-3 py-2 text-right w-24 hidden md:table-cell">
                                      Commandes
                                    </th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-rule/30 font-mono text-[11px]">
                                  {wst.products.map((prod) => {
                                    const prodPct =
                                      wst.totalQuantity > 0
                                        ? Math.round((prod.quantity / wst.totalQuantity) * 1000) /
                                          10
                                        : 0
                                    return (
                                      <tr
                                        key={prod.code}
                                        className="hover:bg-surface-hover/40 transition-colors"
                                      >
                                        <td className="px-3 py-2 font-bold text-foreground">
                                          {prod.code}
                                        </td>
                                        <td className="px-3 py-2 font-sans text-muted-foreground truncate max-w-[320px]">
                                          {prod.name}
                                        </td>
                                        <td className="px-3 py-2 text-right font-bold text-foreground">
                                          {prod.quantity.toLocaleString('fr-FR')}
                                        </td>
                                        <td className="px-3 py-2 text-right text-muted-foreground hidden sm:table-cell">
                                          {prodPct}%
                                        </td>
                                        <td className="px-3 py-2 text-right text-muted-foreground hidden md:table-cell">
                                          {prod.nbOrders}
                                        </td>
                                      </tr>
                                    )
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
