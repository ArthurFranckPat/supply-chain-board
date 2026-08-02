import { useState } from 'react'
import { TriangleAlert } from 'lucide-react'
import {
  type DayCharge,
  type ForecastLine,
  CONFIDENCE_LABEL,
  SOURCE_LABEL,
  fmtJour,
  fmtPal,
} from '@r/components/expeditions/forecast-types'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@r/components/ui/sheet'
import DataTable, { type ColumnDef, type SortingState } from '@r/components/ui/data-table'
import { cn } from '@r/lib/utils'

const TH =
  'px-3 py-2 text-left font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground'
const TD = 'px-3 py-2'

const columns: ColumnDef<ForecastLine>[] = [
  {
    accessorKey: 'chargeStatus',
    header: () => 'Statut',
    cell: ({ row: { original: line } }) => {
      if (!line.chargeStatus) return <span className="text-muted-foreground">—</span>
      const overflow = line.chargeStatus === 'overflow'
      return (
        <span
          className={cn(
            'font-mono text-[10px] font-bold uppercase tracking-[0.06em]',
            overflow ? 'text-destructive' : 'text-ferme'
          )}
        >
          {overflow ? 'Overflow' : 'Chargé'}
        </span>
      )
    },
    meta: { thClass: TH, tdClass: TD },
  },
  {
    accessorKey: 'client',
    header: () => 'Client',
    cell: ({ row: { original: line } }) => (
      <span className="font-medium text-foreground">{line.client || '—'}</span>
    ),
    meta: { thClass: TH, tdClass: TD },
  },
  {
    accessorKey: 'numCommande',
    header: () => 'Commande',
    cell: ({ row: { original: line } }) => (
      <span className="font-mono text-[11px] text-muted-foreground">
        {line.numCommande}
        {line.ligne ? `/${line.ligne}` : ''}
      </span>
    ),
    meta: { thClass: TH, tdClass: TD },
  },
  {
    accessorKey: 'article',
    header: () => 'Article',
    cell: ({ row: { original: line } }) => (
      <>
        <div className="font-mono text-[11px] font-semibold text-foreground">{line.article}</div>
        {line.description ? (
          <div className="max-w-[180px] truncate text-[10px] text-muted-foreground">
            {line.description}
          </div>
        ) : null}
      </>
    ),
    meta: { thClass: TH, tdClass: TD },
  },
  {
    accessorKey: 'qte',
    header: () => 'Qté',
    cell: ({ row: { original: line } }) => (
      <span className="font-mono tabular-nums">
        {line.qte.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}
      </span>
    ),
    meta: { thClass: cn(TH, 'text-right'), tdClass: cn(TD, 'text-right') },
  },
  {
    accessorKey: 'palTheo',
    header: () => 'Pal',
    cell: ({ row: { original: line } }) => (
      <span className="font-mono font-semibold tabular-nums">{fmtPal(line.palTheo)}</span>
    ),
    meta: { thClass: cn(TH, 'text-right'), tdClass: cn(TD, 'text-right') },
  },
  {
    accessorKey: 'source',
    header: () => 'Source',
    cell: ({ row: { original: line } }) => (
      <span className="font-mono text-[10px] font-bold text-foreground">
        {SOURCE_LABEL[line.source]}
      </span>
    ),
    meta: { thClass: TH, tdClass: TD },
  },
  {
    accessorKey: 'confidence',
    header: () => 'Fiabilité',
    cell: ({ row: { original: line } }) => (
      <span
        className={cn(
          'font-mono text-[10px] font-bold',
          line.confidence === 'faible'
            ? 'text-warning'
            : line.confidence === 'moyenne'
              ? 'text-suggere'
              : 'text-ferme'
        )}
      >
        {CONFIDENCE_LABEL[line.confidence]}
      </span>
    ),
    meta: { thClass: TH, tdClass: TD },
  },
  {
    accessorKey: 'cause',
    header: () => 'Cause / date',
    cell: ({ row: { original: line } }) => (
      <div className="max-w-[260px] text-[10px] text-muted-foreground">
        <div>{line.cause}</div>
        {line.dateMiseADispo ? (
          <span className="font-mono">dispo {fmtJour(line.dateMiseADispo)}</span>
        ) : null}
      </div>
    ),
    meta: { thClass: TH, tdClass: TD },
  },
]

function LinesTable({
  lines,
  empty,
  showStatus,
}: {
  lines: ForecastLine[]
  empty: string
  showStatus: boolean
}) {
  const [sorting, setSorting] = useState<SortingState[]>([])
  if (lines.length === 0)
    return (
      <p className="px-1 py-6 text-center font-fraunces text-[13px] italic text-muted-foreground">
        {empty}
      </p>
    )
  const visibleColumns = showStatus
    ? columns
    : columns.filter((col) => col.accessorKey !== 'chargeStatus')
  return (
    <DataTable
      columns={visibleColumns}
      rows={lines}
      sorting={sorting}
      onSortingChange={setSorting}
      virtualize={false}
      tableClass="w-full border-collapse text-[12px]"
      scrollContainerClass="overflow-x-auto rounded-lg border border-rule shadow-float"
      theadRowClass="bg-secondary"
      getRowClass={(line) =>
        cn(
          'border-t border-rule-soft transition-colors even:bg-foreground/[0.015] hover:bg-foreground/[0.07]',
          line.chargeStatus === 'overflow' && 'bg-destructive/[0.04]'
        )
      }
      getRowKey={(line) =>
        `${line.numCommande}|${line.ligne ?? ''}|${line.vcrseq ?? ''}|${line.article}|${line.dateChargement ?? 'deferred'}|${line.chargeStatus ?? ''}|${line.source}|${line.ofNum ?? ''}|${line.cause}`
      }
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
  onOpenChange: (value: boolean) => void
}) {
  const isDeferred = deferred !== null && deferred !== undefined
  const title = isDeferred ? 'Hors file jour' : day ? `Charge du ${fmtJour(day.date)}` : 'Détail'
  const lines = isDeferred ? (deferred ?? []) : (day?.lignes ?? [])
  const extraTrucks = day?.nbCamionsSpot ?? 0
  const overflowPal = !isDeferred
    ? lines
        .filter((line) => line.chargeStatus === 'overflow')
        .reduce((sum, line) => sum + (line.palTheo ?? 0), 0)
    : 0

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto sm:max-w-6xl">
        <SheetHeader>
          <SheetTitle className="font-fraunces text-[20px] font-bold tracking-tight">
            {title}
          </SheetTitle>
          <SheetDescription className="font-mono text-[11px] text-muted-foreground">
            {isDeferred
              ? 'Lignes sans date fiable à la maille jour, conservées pour la bande semaine.'
              : day
                ? `${fmtPal(day.available)} disponibles · ${fmtPal(day.loaded)} chargées · overflow ${fmtPal(day.fileAfter)}`
                : ''}
          </SheetDescription>
        </SheetHeader>

        {!isDeferred && day?.spot && (
          <div className="mt-5 flex items-start gap-2 border-l-[3px] border-destructive bg-destructive/5 px-3 py-2.5 text-[12px] text-foreground">
            <TriangleAlert size={15} strokeWidth={1.75} className="mt-0.5 text-destructive" />
            <div>
              <div className="font-bold text-destructive">Camion spot à demander à J−2</div>
              <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                +{fmtPal(day.spotPalettes)} pal · {extraTrucks} camion{extraTrucks > 1 ? 's' : ''}{' '}
                de {camionCapacitePalettes} pal
                {overflowPal > 0 ? ` · ${fmtPal(overflowPal)} pal en overflow ci-dessous` : ''}
              </div>
            </div>
          </div>
        )}

        <div className="mt-5">
          <LinesTable
            lines={lines}
            empty={
              isDeferred ? 'Aucune ligne hors file.' : 'Aucune ligne dans la charge de ce jour.'
            }
            showStatus={!isDeferred}
          />
        </div>
      </SheetContent>
    </Sheet>
  )
}
