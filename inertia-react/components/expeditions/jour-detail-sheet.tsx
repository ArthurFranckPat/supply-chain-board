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
import { X3Link } from '@r/components/x3-link'
import DataTable, { type ColumnDef, type SortingState } from '@r/components/ui/data-table'
import { cn } from '@r/lib/utils'

const TH =
  'px-3 py-2 text-left font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground'
const TD = 'px-3 py-2'

const CONFIDENCE_CLASS: Record<ForecastLine['confidence'], string> = {
  faible: 'text-warning',
  moyenne: 'text-suggere',
  haute: 'text-ferme',
  constatee: 'text-ferme',
}

/**
 * Cinq colonnes, pas neuf : le sheet tient dans sa largeur.
 *
 * Le client est constant (80001, navette dédiée) — il n'apportait rien. Commande,
 * source, fiabilité et statut sont repliés sous la donnée qu'ils qualifient.
 * Une table qu'on lit en scrollant vers la droite ne se lit pas.
 */
const columns: ColumnDef<ForecastLine>[] = [
  {
    accessorKey: 'article',
    header: () => 'Article',
    cell: ({ row: { original: line } }) => (
      <>
        <div className="font-mono text-[11px] font-semibold text-foreground">{line.article}</div>
        {line.description ? (
          <div className="truncate text-[10px] text-muted-foreground">{line.description}</div>
        ) : null}
        <div className="font-mono text-[9px] text-muted-foreground/70">
          <X3Link
            fonction="GESSOH"
            cle={line.numCommande}
            title={`Ouvrir la commande ${line.numCommande} dans Sage X3`}
            className="font-mono text-[9px] text-muted-foreground/70"
          >
            {line.numCommande}
          </X3Link>
          {line.ligne ? `/${line.ligne}` : ''}
        </div>
      </>
    ),
    meta: { thClass: TH, tdClass: cn(TD, 'w-[30%]') },
  },
  {
    accessorKey: 'qte',
    header: () => 'Qté',
    cell: ({ row: { original: line } }) => (
      <span className="font-mono tabular-nums">
        {line.qte.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}
      </span>
    ),
    meta: { thClass: cn(TH, 'text-right'), tdClass: cn(TD, 'w-[10%] text-right') },
  },
  {
    accessorKey: 'palTheo',
    header: () => 'Pal',
    cell: ({ row: { original: line } }) => (
      <>
        <div className="font-mono text-[13px] font-bold tabular-nums">{fmtPal(line.palTheo)}</div>
        {line.chargeStatus ? (
          <div
            className={cn(
              'font-mono text-[9px] font-bold uppercase tracking-[0.06em]',
              line.chargeStatus === 'overflow' ? 'text-destructive' : 'text-ferme'
            )}
          >
            {line.chargeStatus === 'overflow' ? 'Spot' : 'Navette'}
          </div>
        ) : null}
      </>
    ),
    meta: { thClass: cn(TH, 'text-right'), tdClass: cn(TD, 'w-[10%] text-right') },
  },
  {
    accessorKey: 'source',
    header: () => 'Source',
    cell: ({ row: { original: line } }) => (
      <>
        <div className="font-mono text-[10px] font-bold text-foreground">
          {SOURCE_LABEL[line.source]}
        </div>
        <div className={cn('font-mono text-[9px]', CONFIDENCE_CLASS[line.confidence])}>
          {CONFIDENCE_LABEL[line.confidence]}
        </div>
      </>
    ),
    meta: { thClass: TH, tdClass: cn(TD, 'w-[16%]') },
  },
  {
    accessorKey: 'cause',
    header: () => 'Cause / date',
    cell: ({ row: { original: line } }) => (
      <div className="text-[10px] leading-snug text-muted-foreground">
        <div>{line.cause}</div>
        {line.dateMiseADispo ? (
          <span className="font-mono">dispo {fmtJour(line.dateMiseADispo)}</span>
        ) : null}
      </div>
    ),
    meta: { thClass: TH, tdClass: cn(TD, 'w-[34%]') },
  },
]

function LinesTable({ lines, empty }: { lines: ForecastLine[]; empty: string }) {
  const [sorting, setSorting] = useState<SortingState[]>([])
  if (lines.length === 0)
    return (
      <p className="px-1 py-6 text-center font-fraunces text-[13px] italic text-muted-foreground">
        {empty}
      </p>
    )
  return (
    <DataTable
      columns={columns}
      rows={lines}
      sorting={sorting}
      onSortingChange={setSorting}
      virtualize={false}
      // `table-fixed` + largeurs en % : la table s'adapte au sheet au lieu de
      // pousser une barre de défilement horizontale.
      tableClass="w-full table-fixed border-collapse text-[12px]"
      scrollContainerClass="overflow-hidden rounded-lg border border-rule shadow-float"
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
  deferredTitle,
  deferredHint,
  camionCapacitePalettes,
  open,
  onOpenChange,
}: {
  day: DayCharge | null
  /** Lignes hors bande jour : reliquat sans date, ou carnet en retard. */
  deferred?: ForecastLine[] | null
  deferredTitle?: string
  deferredHint?: string
  camionCapacitePalettes: number
  open: boolean
  onOpenChange: (value: boolean) => void
}) {
  const isDeferred = deferred !== null && deferred !== undefined
  const title = isDeferred
    ? (deferredTitle ?? 'Hors horizon jour')
    : day
      ? `Charge du ${fmtJour(day.date)}`
      : 'Détail'
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
              ? (deferredHint ??
                'Lignes sans date fiable à la maille jour, ou au-delà de la cadence atelier sur l’horizon. Conservées pour la bande semaine.')
              : day
                ? `${fmtPal(day.available)} disponibles · ${fmtPal(day.entriesProduites)} sortis atelier · ${fmtPal(day.loaded)} navette${day.loadedTasse > 0 ? ` (dont ${fmtPal(day.loadedTasse)} en tassant)` : ''} · ${fmtPal(day.loadedSpot)} spot · file ${fmtPal(day.fileAfter)}`
                : ''}
          </SheetDescription>
        </SheetHeader>

        {!isDeferred && day?.spot && (
          <div className="mt-5 flex items-start gap-2 border-l-[3px] border-destructive bg-destructive/5 px-3 py-2.5 text-[12px] text-foreground">
            <TriangleAlert size={15} strokeWidth={1.75} className="mt-0.5 text-destructive" />
            <div>
              <div className="font-bold text-destructive">
                {extraTrucks > 0
                  ? `${extraTrucks} camion${extraTrucks > 1 ? 's' : ''} spot à demander à J−2`
                  : 'Charge au-delà des navettes'}
              </div>
              <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                +{fmtPal(day.spotPalettes)} pal au-delà des {fmtPal(day.capaciteJourTassee)} pal des
                navettes en tassant · {extraTrucks} camion
                {extraTrucks > 1 ? 's' : ''} de {camionCapacitePalettes} pal
                {overflowPal > 0 ? ` · ${fmtPal(overflowPal)} pal sur spot ci-dessous` : ''}
              </div>
              {/* Le besoin non affrétable ne se convertit pas en camions : il reste
                  en file et se dit comme tel, sinon on promet 26 camions. */}
              {day.spotSature && (
                <div className="mt-1 font-mono text-[11px] font-bold text-destructive">
                  Besoin théorique {day.nbCamionsSpotTheorique} camions — au-delà de ce qui
                  s&apos;affrète en un jour. {fmtPal(day.fileAfter)} pal restent en file : arriéré
                  de production, pas une commande transport.
                </div>
              )}
            </div>
          </div>
        )}

        <div className="mt-5">
          <LinesTable
            lines={lines}
            empty={
              isDeferred ? 'Aucune ligne hors file.' : 'Aucune ligne dans la charge de ce jour.'
            }
          />
        </div>
      </SheetContent>
    </Sheet>
  )
}
