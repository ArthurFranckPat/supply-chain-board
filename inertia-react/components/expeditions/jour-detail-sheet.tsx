import { useMemo } from 'react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@r/components/ui/sheet'
import { Badge } from '@r/components/ui/badge'
import {
  type DayCharge,
  type ForecastLine,
  STATUT_LABEL,
  fmtJour,
  fmtPal,
} from '@r/components/expeditions/forecast-types'
import { cn } from '@r/lib/utils'

/**
 * Drill-down d'un jour de prévision (issue #104) — commandes composant la charge.
 */

const TH =
  'px-3 py-2 text-left font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground border-b border-rule'

function statutClass(s: ForecastLine['statut']): string {
  switch (s) {
    case 'on_time':
    case 'stock':
      return 'bg-ferme/15 text-ferme'
    case 'retard':
      return 'bg-suggere/15 text-suggere'
    case 'bloquee':
    case 'sans_couverture':
      return 'bg-destructive/15 text-destructive'
  }
}

function LinesTable({ lines, empty }: { lines: ForecastLine[]; empty: string }) {
  if (lines.length === 0) {
    return <p className="px-1 py-4 text-[12px] text-muted-foreground">{empty}</p>
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[12px]">
        <thead>
          <tr>
            <th className={TH}>Client</th>
            <th className={TH}>Commande</th>
            <th className={TH}>Article</th>
            <th className={cn(TH, 'text-right')}>Qté</th>
            <th className={cn(TH, 'text-right')}>Pal</th>
            <th className={TH}>Statut</th>
            <th className={TH}>OF / fin</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr
              key={`${l.numCommande}|${l.ligne ?? ''}|${l.article}`}
              className="border-b border-rule-soft"
            >
              <td className="px-3 py-1.5 font-medium text-foreground">{l.client || '—'}</td>
              <td className="px-3 py-1.5 font-mono text-[11px] text-muted-foreground">
                {l.numCommande}
                {l.ligne ? `/${l.ligne}` : ''}
              </td>
              <td className="px-3 py-1.5">
                <div className="font-mono text-[11px] font-semibold text-foreground">
                  {l.article}
                </div>
                {l.description ? (
                  <div className="max-w-[180px] truncate text-[10px] text-muted-foreground">
                    {l.description}
                  </div>
                ) : null}
              </td>
              <td className="px-3 py-1.5 text-right font-mono tabular-nums">{l.qte}</td>
              <td className="px-3 py-1.5 text-right font-mono tabular-nums">{fmtPal(l.palTheo)}</td>
              <td className="px-3 py-1.5">
                <Badge className={cn('text-[9px] uppercase tracking-wider', statutClass(l.statut))}>
                  {STATUT_LABEL[l.statut]}
                  {l.glisse ? ' · glissé' : ''}
                </Badge>
              </td>
              <td className="px-3 py-1.5 font-mono text-[11px] text-muted-foreground">
                {l.ofNum ? (
                  <>
                    {l.ofNum}
                    {l.ofDateFin ? ` · ${fmtJour(l.ofDateFin)}` : ''}
                  </>
                ) : (
                  '—'
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function JourDetailSheet({
  day,
  deferred,
  camionCapacitePalettes,
  open,
  onOpenChange,
}: {
  day: DayCharge | null
  /** Si fourni, affiche le volume différé au lieu d'un jour. */
  deferred?: ForecastLine[] | null
  camionCapacitePalettes: number
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const isDeferred = deferred != null
  const title = isDeferred ? 'Volume différé' : day ? `Charge du ${fmtJour(day.date)}` : 'Détail'

  const realistLines = useMemo(() => day?.lignesRealistes ?? [], [day])
  const nominalLines = useMemo(() => day?.lignesNominales ?? [], [day])
  const camionFrac =
    day && camionCapacitePalettes > 0 ? day.deltaVsCapacite / camionCapacitePalettes : 0

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto sm:max-w-3xl">
        <SheetHeader>
          <SheetTitle className="font-fraunces text-[18px]">{title}</SheetTitle>
          <SheetDescription className="font-mono text-[11px] text-muted-foreground">
            {isDeferred
              ? 'Commandes bloquées / sans couverture — hors calendrier'
              : day
                ? `${fmtPal(day.chargeRealiste)} pal réaliste · ${fmtPal(day.chargeNominale)} pal nominale · capa ${fmtPal(day.capaciteJour)}`
                : ''}
          </SheetDescription>
        </SheetHeader>

        {isDeferred ? (
          <div className="mt-4">
            <LinesTable lines={deferred ?? []} empty="Aucun volume différé." />
          </div>
        ) : day ? (
          <div className="mt-4 space-y-6">
            {day.spot && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-[12px] text-foreground">
                Spot à prévoir — dépassement de{' '}
                <span className="font-mono font-bold">{fmtPal(day.deltaVsCapacite)}</span>{' '}
                éq-palettes (~{camionFrac.toFixed(1)} camion)
              </div>
            )}

            <section>
              <h3 className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                Charge réaliste ({realistLines.length})
              </h3>
              <LinesTable lines={realistLines} empty="Aucune commande ce jour (réaliste)." />
            </section>

            <section>
              <h3 className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                Charge nominale ({nominalLines.length})
              </h3>
              <LinesTable
                lines={nominalLines}
                empty="Aucune commande à cette date contractuelle."
              />
            </section>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
