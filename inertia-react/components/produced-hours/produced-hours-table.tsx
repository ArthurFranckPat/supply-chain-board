import { useState, useMemo } from 'react'
import { ChevronUp, ChevronDown, ArrowUpDown, ExternalLink, Layers } from 'lucide-react'
import { cn } from '@r/lib/utils'
import { formatDateFr, type WorkstationProducedCard } from '@r/lib/produced-hours/types'

type SortField =
  | 'poste'
  | 'atelier'
  | 'totalHours'
  | 'operationHours'
  | 'setupHours'
  | 'totalAllocatedHours'
  | 'deltaHours'
  | 'efficiency'
  | 'quantity'
  | 'rejectRate'
  | 'nbOfs'

interface ProducedHoursTableProps {
  workstations: WorkstationProducedCard[]
  onSelectPoste: (poste: string) => void
}

export function ProducedHoursTable({ workstations, onSelectPoste }: ProducedHoursTableProps) {
  const [sortField, setSortField] = useState<SortField>('totalHours')
  const [sortAsc, setSortAsc] = useState(false)

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
        <h3 className="mt-3 text-sm font-semibold text-foreground">Aucun poste actif trouvé</h3>
        <p className="mt-1 max-w-sm text-xs text-muted-foreground">
          Aucun pointage d'opération n'a été enregistré pour les filtres et la période sélectionnés.
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
                  <span>Poste de charge</span>
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
                onClick={() => handleSort('totalHours')}
                className="group cursor-pointer px-3 py-3 text-right hover:text-foreground"
              >
                <div className="flex items-center justify-end">
                  <span>Heures réelles</span>
                  <SortIcon field="totalHours" />
                </div>
              </th>
              <th
                onClick={() => handleSort('operationHours')}
                className="group cursor-pointer px-3 py-3 text-right hover:text-foreground hidden lg:table-cell"
              >
                <div className="flex items-center justify-end">
                  <span>Dont opé</span>
                  <SortIcon field="operationHours" />
                </div>
              </th>
              <th
                onClick={() => handleSort('setupHours')}
                className="group cursor-pointer px-3 py-3 text-right hover:text-foreground hidden lg:table-cell"
              >
                <div className="flex items-center justify-end">
                  <span>Dont régl</span>
                  <SortIcon field="setupHours" />
                </div>
              </th>
              <th
                onClick={() => handleSort('totalAllocatedHours')}
                className="group cursor-pointer px-3 py-3 text-right hover:text-foreground"
                title="Temps standard de gamme prévu pour la quantité produite"
              >
                <div className="flex items-center justify-end">
                  <span>Standard gamme</span>
                  <SortIcon field="totalAllocatedHours" />
                </div>
              </th>
              <th
                onClick={() => handleSort('deltaHours')}
                className="group cursor-pointer px-3 py-3 text-right hover:text-foreground"
              >
                <div className="flex items-center justify-end">
                  <span>Écart (h)</span>
                  <SortIcon field="deltaHours" />
                </div>
              </th>
              <th
                onClick={() => handleSort('efficiency')}
                className="group cursor-pointer px-3 py-3 text-right hover:text-foreground"
              >
                <div className="flex items-center justify-end">
                  <span>Efficience</span>
                  <SortIcon field="efficiency" />
                </div>
              </th>
              <th
                onClick={() => handleSort('quantity')}
                className="group cursor-pointer px-3 py-3 text-right hover:text-foreground"
              >
                <div className="flex items-center justify-end">
                  <span>Pièces</span>
                  <SortIcon field="quantity" />
                </div>
              </th>
              <th
                onClick={() => handleSort('nbOfs')}
                className="group cursor-pointer px-3 py-3 text-right hover:text-foreground hidden sm:table-cell"
              >
                <div className="flex items-center justify-end">
                  <span>OFs (pointages)</span>
                  <SortIcon field="nbOfs" />
                </div>
              </th>
              <th className="px-4 py-3 text-center">Tendance</th>
              <th className="px-3 py-3 text-center">Action</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-rule font-mono text-[12px]">
            {sortedWorkstations.map((wst) => {
              const isGoodEff = wst.efficiency >= 100
              const isMedEff = wst.efficiency >= 85 && wst.efficiency < 100
              const maxDaily = wst.timeline.length
                ? Math.max(...wst.timeline.map((d) => d.hours), 1)
                : 1

              return (
                <tr
                  key={wst.poste}
                  onClick={() => onSelectPoste(wst.poste)}
                  className="cursor-pointer transition-colors hover:bg-surface-hover/80"
                >
                  {/* Poste & Description */}
                  <td className="px-4 py-2.5 font-sans">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-foreground">{wst.poste}</span>
                      {wst.wstType === 2 && (
                        <span className="rounded-sm bg-purple-50 px-1.5 py-0.5 text-[9px] font-medium text-purple-700">
                          MO
                        </span>
                      )}
                    </div>
                    <div
                      className="truncate max-w-[200px] text-[11px] text-muted-foreground"
                      title={wst.name}
                    >
                      {wst.name}
                    </div>
                  </td>

                  {/* Atelier */}
                  <td className="px-3 py-2.5 font-sans">
                    <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                      {wst.atelier}
                    </span>
                  </td>

                  {/* Heures réelles */}
                  <td className="px-3 py-2.5 text-right font-bold text-foreground">
                    {wst.totalHours.toLocaleString('fr-FR', { minimumFractionDigits: 1 })} h
                  </td>

                  {/* Operation hours */}
                  <td className="px-3 py-2.5 text-right text-muted-foreground hidden lg:table-cell">
                    {wst.operationHours.toLocaleString('fr-FR', { minimumFractionDigits: 1 })}
                  </td>

                  {/* Setup hours */}
                  <td className="px-3 py-2.5 text-right text-muted-foreground hidden lg:table-cell">
                    {wst.setupHours.toLocaleString('fr-FR', { minimumFractionDigits: 1 })}
                  </td>

                  {/* Heures allouées */}
                  <td className="px-3 py-2.5 text-right text-muted-foreground">
                    {wst.totalAllocatedHours.toLocaleString('fr-FR', { minimumFractionDigits: 1 })}{' '}
                    h
                  </td>

                  {/* Écart */}
                  <td
                    className={cn(
                      'px-3 py-2.5 text-right font-semibold',
                      wst.deltaHours > 0
                        ? 'text-amber-600'
                        : wst.deltaHours < 0
                          ? 'text-emerald-600'
                          : 'text-muted-foreground'
                    )}
                  >
                    {wst.deltaHours > 0 ? `+${wst.deltaHours}` : wst.deltaHours}
                  </td>

                  {/* Efficience */}
                  <td className="px-3 py-2.5 text-right font-bold">
                    <span
                      className={cn(
                        'inline-block rounded-md px-1.5 py-0.5 text-[11px]',
                        isGoodEff
                          ? 'bg-emerald-50 text-emerald-700'
                          : isMedEff
                            ? 'bg-amber-50 text-amber-700'
                            : 'bg-red-50 text-red-700'
                      )}
                    >
                      {wst.efficiency}%
                    </span>
                  </td>

                  {/* Pièces */}
                  <td className="px-3 py-2.5 text-right font-semibold text-foreground">
                    <div>{wst.quantity.toLocaleString('fr-FR')}</div>
                    {wst.rejectQuantity > 0 && (
                      <div className="text-[9px] text-red-500 font-normal">
                        {wst.rejectQuantity} reb ({wst.rejectRate}%)
                      </div>
                    )}
                  </td>

                  {/* Nb OFs */}
                  <td className="px-3 py-2.5 text-right text-muted-foreground hidden sm:table-cell">
                    {wst.nbOfs} ({wst.nbTrackings})
                  </td>

                  {/* Sparkline */}
                  <td className="px-4 py-2.5 text-center">
                    {wst.timeline.length > 0 ? (
                      <div className="flex h-5 w-20 mx-auto items-end gap-0.5">
                        {wst.timeline.slice(-10).map((pt) => {
                          const hPct = Math.min(100, (pt.hours / maxDaily) * 100)
                          return (
                            <div
                              key={pt.date}
                              style={{ height: `${Math.max(15, hPct)}%` }}
                              className="flex-1 rounded-t-xs bg-brand/70"
                              title={`${formatDateFr(pt.date)}: ${pt.hours}h`}
                            />
                          )
                        })}
                      </div>
                    ) : (
                      <span className="text-[10px] text-muted-foreground/40">—</span>
                    )}
                  </td>

                  {/* Action */}
                  <td className="px-3 py-2.5 text-center">
                    <button
                      type="button"
                      className="inline-flex size-7 items-center justify-center rounded-lg border border-rule bg-card text-muted-foreground transition-colors hover:border-brand hover:text-brand"
                      title="Ouvrir le détail des pointages"
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
