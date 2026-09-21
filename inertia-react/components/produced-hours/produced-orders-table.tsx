import React, { useState, useMemo } from 'react'
import { ChevronUp, ChevronDown, ArrowUpDown, Layers, Package, ExternalLink } from 'lucide-react'
import { cn } from '@r/lib/utils'
import { formatDateFr, type WorkstationOrderedCard } from '@r/lib/produced-hours/types'

type SortField = 'poste' | 'atelier' | 'totalQuantity' | 'nbProducts' | 'nbOrders'

interface ProducedOrdersTableProps {
  workstations: WorkstationOrderedCard[]
  onSelectPoste?: (poste: string) => void
}

export function ProducedOrdersTable({ workstations, onSelectPoste }: ProducedOrdersTableProps) {
  const [sortField, setSortField] = useState<SortField>('totalQuantity')
  const [sortAsc, setSortAsc] = useState(false)

  const totalAllQuantity = useMemo(() => {
    return workstations.reduce((acc, w) => acc + w.totalQuantity, 0)
  }, [workstations])

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
    <div className="overflow-hidden rounded-2xl border border-rule bg-card shadow-xs">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-rule bg-surface-muted/60 text-[11px] font-semibold text-muted-foreground select-none">
            <tr>
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
              const sharePct =
                totalAllQuantity > 0
                  ? Math.round((wst.totalQuantity / totalAllQuantity) * 1000) / 10
                  : 0
              const maxDaily = Math.max(1, ...wst.timeline.map((p) => p.qty))

              return (
                <tr
                  key={wst.poste}
                  onClick={() => onSelectPoste?.(wst.poste)}
                  className="cursor-pointer transition-colors hover:bg-surface-hover/80"
                >
                  {/* Ligne / Poste */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-foreground tracking-tight">{wst.poste}</span>
                      <span className="text-[11px] font-sans font-normal text-muted-foreground truncate max-w-[280px]">
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
                    <span className="text-[13px]">{wst.totalQuantity.toLocaleString('fr-FR')}</span>
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
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
