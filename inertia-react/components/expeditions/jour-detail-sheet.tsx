import { useMemo, useState } from 'react'
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
import DataTable, { type ColumnDef, type SortingState } from '@r/components/ui/data-table'

/**
 * Drill-down jour / différé (issue #104) — même densité que CamionDetailSheet.
 */

const TH =
  'px-3 py-2 text-left font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground'
const TD = 'px-3 py-2'

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

const forecastColumns: ColumnDef<ForecastLine>[] = [
  {
    accessorKey: 'client',
    header: () => 'Client',
    cell: ({ row: { original: l } }) => (
      <span className="font-medium text-foreground">{l.client || '—'}</span>
    ),
    meta: { thClass: TH, tdClass: TD },
  },
  {
    accessorKey: 'numCommande',
    header: () => 'Commande',
    cell: ({ row: { original: l } }) => (
      <span className="font-mono text-[11px] text-muted-foreground">
        {l.numCommande}
        {l.ligne ? `/${l.ligne}` : ''}
      </span>
    ),
    meta: { thClass: TH, tdClass: TD },
  },
  {
    accessorKey: 'article',
    header: () => 'Article',
    cell: ({ row: { original: l } }) => (
      <>
        <div className="font-mono text-[11px] font-semibold text-foreground">{l.article}</div>
        {l.description ? (
          <div className="max-w-[200px] truncate text-[10px] text-muted-foreground">
            {l.description}
          </div>
        ) : null}
      </>
    ),
    meta: { thClass: TH, tdClass: TD },
  },
  {
    accessorKey: 'qte',
    header: () => 'Qté',
    cell: ({ row: { original: l } }) => <span className="font-mono tabular-nums">{l.qte}</span>,
    meta: { thClass: cn(TH, 'text-right'), tdClass: cn(TD, 'text-right') },
  },
  {
    accessorKey: 'palTheo',
    header: () => 'Pal',
    cell: ({ row: { original: l } }) => (
      <span className="font-mono font-semibold tabular-nums">{fmtPal(l.palTheo)}</span>
    ),
    meta: { thClass: cn(TH, 'text-right'), tdClass: cn(TD, 'text-right') },
  },
  {
    accessorKey: 'statut',
    header: () => 'Statut',
    cell: ({ row: { original: l } }) => (
      <span className={cn('font-mono text-[10px] font-bold', statutTone(l.statut))}>
        {STATUT_LABEL[l.statut]}
        {l.glisse ? ' · glissé' : ''}
      </span>
    ),
    meta: { thClass: TH, tdClass: TD },
  },
  {
    accessorKey: 'ofNum',
    header: () => 'OF',
    cell: ({ row: { original: l } }) => (
      <span className="font-mono text-[11px] text-muted-foreground">
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
      </span>
    ),
    meta: { thClass: TH, tdClass: TD },
  },
]

function LinesTable({ lines, empty }: { lines: ForecastLine[]; empty: string }) {
  const [sorting, setSorting] = useState<SortingState[]>([])

  if (lines.length === 0) {
    return (
      <p className="px-1 py-6 text-center font-fraunces text-[13px] italic text-muted-foreground">
        {empty}
      </p>
    )
  }
  return (
    <DataTable
      columns={forecastColumns}
      rows={lines}
      sorting={sorting}
      onSortingChange={setSorting}
      virtualize={false}
      tableClass="w-full border-collapse text-[12px]"
      scrollContainerClass="overflow-x-auto rounded-lg border border-rule shadow-float"
      theadRowClass="bg-secondary"
      getRowClass={() => 'border-b border-rule-soft last:border-b-0'}
      getRowKey={(l) => `${l.numCommande}|${l.ligne ?? ''}|${l.article}`}
    />
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
