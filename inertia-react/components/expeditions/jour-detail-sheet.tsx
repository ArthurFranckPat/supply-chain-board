import { useMemo } from 'react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@r/components/ui/sheet'
import {
  type DayCharge,
  type ForecastLine,
  STATUT_LABEL,
  fmtJour,
  fmtPal,
} from '@r/components/expeditions/forecast-types'
import { TriangleAlert } from 'lucide-react'
import { cn } from '@r/lib/utils'

/**
 * Drill-down jour / différé (issue #104) — même densité que CamionDetailSheet.
 */

const TH =
  'px-3 py-2 text-left font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground border-b border-rule'

function statutTone(s: ForecastLine['statut']): string {
  switch (s) {
    case 'on_time':
    case 'stock':
      return 'text-ferme'
    case 'retard':
      return 'text-suggere'
    case 'bloquee':
    case 'sans_couverture':
      return 'text-destructive'
  }
}

function LinesTable({ lines, empty }: { lines: ForecastLine[]; empty: string }) {
  if (lines.length === 0) {
    return (
      <p className="px-1 py-6 text-center font-fraunces text-[13px] italic text-muted-foreground">
        {empty}
      </p>
    )
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-rule shadow-float">
      <table className="w-full border-collapse text-[12px]">
        <thead className="bg-secondary">
          <tr>
            <th className={TH}>Client</th>
            <th className={TH}>Commande</th>
            <th className={TH}>Article</th>
            <th className={cn(TH, 'text-right')}>Qté</th>
            <th className={cn(TH, 'text-right')}>Pal</th>
            <th className={TH}>Statut</th>
            <th className={TH}>OF</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr
              key={`${l.numCommande}|${l.ligne ?? ''}|${l.article}`}
              className="border-b border-rule-soft last:border-b-0"
            >
              <td className="px-3 py-2 font-medium text-foreground">{l.client || '—'}</td>
              <td className="px-3 py-2 font-mono text-[11px] text-muted-foreground">
                {l.numCommande}
                {l.ligne ? `/${l.ligne}` : ''}
              </td>
              <td className="px-3 py-2">
                <div className="font-mono text-[11px] font-semibold text-foreground">
                  {l.article}
                </div>
                {l.description ? (
                  <div className="max-w-[200px] truncate text-[10px] text-muted-foreground">
                    {l.description}
                  </div>
                ) : null}
              </td>
              <td className="px-3 py-2 text-right font-mono tabular-nums">{l.qte}</td>
              <td className="px-3 py-2 text-right font-mono font-semibold tabular-nums">
                {fmtPal(l.palTheo)}
              </td>
              <td className={cn('px-3 py-2 font-mono text-[10px] font-bold', statutTone(l.statut))}>
                {STATUT_LABEL[l.statut]}
                {l.glisse ? ' · glissé' : ''}
              </td>
              <td className="px-3 py-2 font-mono text-[11px] text-muted-foreground">
                {l.ofNum ? (
                  <>
                    {l.ofNum}
                    {l.ofDateFin ? (
                      <span className="text-muted-foreground/70"> · {fmtJour(l.ofDateFin)}</span>
                    ) : null}
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
          <SheetTitle className="font-fraunces text-[20px] font-bold tracking-tight">
            {title}
          </SheetTitle>
          <SheetDescription className="font-mono text-[11px] text-muted-foreground">
            {isDeferred
              ? 'Bloquées / sans couverture — date de sortie inconnue'
              : day
                ? `${fmtPal(day.chargeRealiste)} réaliste · ${fmtPal(day.chargeNominale)} nominale · capa ${fmtPal(day.capaciteJour)}`
                : ''}
          </SheetDescription>
        </SheetHeader>

        {isDeferred ? (
          <div className="mt-5">
            <LinesTable lines={deferred ?? []} empty="Aucun volume différé." />
          </div>
        ) : day ? (
          <div className="mt-5 space-y-6">
            {day.spot && (
              <div className="flex items-start gap-2 border-l-[3px] border-destructive bg-destructive/5 px-3 py-2.5 text-[12px] text-foreground">
                <TriangleAlert size={15} strokeWidth={1.75} className="mt-0.5 text-destructive" />
                <div>
                  <div className="font-bold text-destructive">Spot à prévoir</div>
                  <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                    +{fmtPal(day.deltaVsCapacite)} pal (~{camionFrac.toFixed(1)} camion)
                  </div>
                </div>
              </div>
            )}

            <section>
              <h3 className="mb-2 font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                Réaliste · {realistLines.length}
              </h3>
              <LinesTable lines={realistLines} empty="Aucune commande ce jour." />
            </section>

            <section>
              <h3 className="mb-2 font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                Nominale · {nominalLines.length}
              </h3>
              <LinesTable lines={nominalLines} empty="Rien à cette date contractuelle." />
            </section>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
