import { useMemo } from 'react'
import { Clock, ArrowUpRight, TrendingUp, Layers } from 'lucide-react'
import { cn } from '@r/lib/utils'
import type { WorkstationProducedCard } from '@r/lib/produced-hours/types'

interface ProducedHoursCardsProps {
  workstations: WorkstationProducedCard[]
  onSelectPoste: (poste: string) => void
}

export function ProducedHoursCards({ workstations, onSelectPoste }: ProducedHoursCardsProps) {
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

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
      {workstations.map((wst) => {
        // Max daily for mini sparkline
        const maxDaily = wst.timeline.length ? Math.max(...wst.timeline.map((d) => d.hours), 1) : 1

        const isGoodEff = wst.efficiency >= 100
        const isMedEff = wst.efficiency >= 85 && wst.efficiency < 100

        return (
          <div
            key={wst.poste}
            onClick={() => onSelectPoste(wst.poste)}
            className="group relative flex cursor-pointer flex-col justify-between rounded-2xl border border-rule bg-card p-4 shadow-xs transition-all duration-150 hover:border-foreground/30 hover:shadow-md"
          >
            {/* Card Header */}
            <div>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-base font-bold text-foreground group-hover:text-brand">
                    {wst.poste}
                  </span>
                  {wst.atelier && (
                    <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                      {wst.atelier}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 font-mono text-[10px] font-bold',
                      isGoodEff
                        ? 'bg-emerald-50 text-emerald-700'
                        : isMedEff
                          ? 'bg-amber-50 text-amber-700'
                          : 'bg-red-50 text-red-700'
                    )}
                  >
                    {wst.efficiency}%
                  </span>
                  <ArrowUpRight className="size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </div>
              </div>

              <div className="mt-1 line-clamp-1 text-xs text-muted-foreground" title={wst.name}>
                {wst.name}
              </div>
            </div>

            {/* Metrics */}
            <div className="my-3 grid grid-cols-2 gap-2 border-y border-rule/60 py-2.5">
              <div>
                <div className="text-[10px] font-medium text-muted-foreground">Heures réelles</div>
                <div className="font-mono text-base font-bold text-foreground">
                  {wst.totalHours.toLocaleString('fr-FR', { minimumFractionDigits: 1 })} h
                </div>
                <div className="text-[9px] text-muted-foreground">
                  Opé {wst.operationHours}h · Régl {wst.setupHours}h
                </div>
              </div>

              <div>
                <div
                  className="text-[10px] font-medium text-muted-foreground"
                  title="Temps standard de gamme prévu pour la quantité produite"
                >
                  Standard gamme
                </div>
                <div className="font-mono text-base font-bold text-muted-foreground">
                  {wst.totalAllocatedHours.toLocaleString('fr-FR', { minimumFractionDigits: 1 })} h
                </div>
                <div
                  className={cn(
                    'text-[9px] font-semibold font-mono',
                    wst.deltaHours > 0
                      ? 'text-amber-600'
                      : wst.deltaHours < 0
                        ? 'text-emerald-600'
                        : 'text-muted-foreground'
                  )}
                >
                  {wst.deltaHours > 0 ? `+${wst.deltaHours}h dép.` : `${wst.deltaHours}h`}
                </div>
              </div>
            </div>

            {/* Bottom: Pieces and Sparkline */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-medium text-muted-foreground">Volume</span>
                <span className="font-mono font-semibold text-foreground">
                  {wst.quantity.toLocaleString('fr-FR')} pcs
                  {wst.rejectQuantity > 0 && (
                    <span className="ml-1 text-[10px] font-normal text-red-500">
                      ({wst.rejectRate}% reb)
                    </span>
                  )}
                </span>
              </div>

              {/* Sparkline */}
              {wst.timeline.length > 0 ? (
                <div className="flex h-7 items-end gap-1 pt-1">
                  {wst.timeline.slice(-14).map((pt) => {
                    const hPct = Math.min(100, (pt.hours / maxDaily) * 100)
                    return (
                      <div
                        key={pt.date}
                        className="group/bar relative flex-1 h-full flex items-end justify-center"
                        title={`${pt.date} : ${pt.hours}h (${pt.qty} pcs)`}
                      >
                        <div
                          style={{ height: `${Math.max(12, hPct)}%` }}
                          className="w-full rounded-t-xs bg-brand/75 transition-all group-hover/bar:bg-brand"
                        />
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="h-7 text-[10px] text-muted-foreground/60 italic flex items-center">
                  Pas de chronologie
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
