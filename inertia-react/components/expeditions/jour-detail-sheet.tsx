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
import { CellDate, CellNumber, CellStack, rowToneClass } from '@r/components/ui/table-row'
import { LoadingState } from '@r/components/ui/loading-state'

const CONFIDENCE_TONE: Record<ForecastLine['confidence'], 'warning' | 'ok' | null> = {
  faible: 'warning',
  moyenne: 'warning',
  haute: 'ok',
  constatee: 'ok',
}

/** ISO YYYY-MM-DD → JJ/MM/AAAA. */
function fmtDateFr(iso: string | null): string {
  if (!iso) return '—'
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso
}

const TH = 'bg-card'

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
    header: 'Article',
    cell: ({ row: { original: line } }) => (
      <CellStack
        code={line.article}
        label={
          <>
            {line.description ? `${line.description} · ` : null}
            <X3Link
              fonction="GESSOH"
              cle={line.numCommande}
              title={`Ouvrir la commande ${line.numCommande} dans Sage X3`}
              className="font-mono text-2xs text-muted-foreground"
            >
              {line.numCommande}
              {line.ligne ? `/${line.ligne}` : ''}
            </X3Link>
          </>
        }
        labelTitle={line.description || line.numCommande}
      />
    ),
    meta: { thClass: `${TH} w-[30%]`, tdClass: 'w-[30%]' },
  },
  {
    accessorKey: 'qte',
    header: 'Qté',
    cell: ({ row: { original: line } }) => (
      <CellNumber
        value={line.qte.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}
        emphasis="plain"
      />
    ),
    meta: { thClass: `${TH} w-[10%] text-right!`, tdClass: 'w-[10%] text-right' },
  },
  {
    accessorKey: 'palTheo',
    header: 'Pal',
    cell: ({ row: { original: line } }) => (
      <span className="flex flex-col items-end gap-px">
        <CellNumber
          value={fmtPal(line.palTheo)}
          tone={line.chargeStatus === 'overflow' ? 'critical' : null}
        />
        {line.chargeStatus ? (
          <span
            className={
              line.chargeStatus === 'overflow'
                ? 'font-mono text-2xs font-bold uppercase tracking-wide text-destructive'
                : 'font-mono text-2xs font-bold uppercase tracking-wide text-ferme'
            }
          >
            {line.chargeStatus === 'overflow' ? 'Spot' : 'Navette'}
          </span>
        ) : null}
      </span>
    ),
    meta: { thClass: `${TH} w-[10%] text-right!`, tdClass: 'w-[10%] text-right' },
  },
  {
    accessorKey: 'source',
    header: 'Source',
    cell: ({ row: { original: line } }) => (
      <CellStack
        code={SOURCE_LABEL[line.source]}
        label={CONFIDENCE_LABEL[line.confidence]}
        className={
          CONFIDENCE_TONE[line.confidence] === 'warning'
            ? '[&_span:last-child]:text-suggere'
            : CONFIDENCE_TONE[line.confidence] === 'ok'
              ? '[&_span:last-child]:text-ferme'
              : undefined
        }
      />
    ),
    meta: { thClass: TH, tdClass: 'w-[16%]' },
  },
  {
    accessorKey: 'cause',
    header: 'Cause / date',
    cell: ({ row: { original: line } }) => (
      <span className="flex min-w-0 flex-col gap-px">
        <span className="font-sans text-xs leading-snug text-muted-foreground">{line.cause}</span>
        {line.dateMiseADispo ? <CellDate date={fmtDateFr(line.dateMiseADispo)} /> : null}
      </span>
    ),
    meta: { thClass: TH, tdClass: 'w-[34%]' },
  },
]

function LinesTable({ lines, empty }: { lines: ForecastLine[]; empty: string }) {
  const [sorting, setSorting] = useState<SortingState[]>([])
  if (lines.length === 0) return <LoadingState compact title={empty} className="py-8" />
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
      scrollContainerClass="overflow-hidden rounded-lg border border-border"
      theadRowClass="sticky top-0 z-10"
      // Dépassement de charge : barre de gravité à gauche, pas de fond teinté
      // — un fond sur toute la largeur se dispute avec le survol.
      getRowClass={(line) => rowToneClass(line.chargeStatus === 'overflow' ? 'critical' : null)}
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
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>
            {isDeferred
              ? (deferredHint ??
                'Lignes sans date fiable à la maille jour, ou au-delà de la cadence atelier sur l’horizon. Conservées pour la bande semaine.')
              : day
                ? `${fmtPal(day.available)} disponibles · ${fmtPal(day.entriesProduites)} sortis atelier · ${fmtPal(day.loaded)} navette${day.loadedTasse > 0 ? ` (dont ${fmtPal(day.loadedTasse)} en tassant)` : ''} · ${fmtPal(day.loadedSpot)} spot · file ${fmtPal(day.fileAfter)}`
                : ''}
          </SheetDescription>
        </SheetHeader>

        {!isDeferred && day?.spot && (
          <div className="mx-4 mt-1 flex items-start gap-2 border-b border-destructive/30 bg-destructive/10 px-3 py-2.5 text-[12px] text-foreground">
            <TriangleAlert size={15} strokeWidth={1.75} className="mt-0.5 text-destructive" />
            <div>
              <div className="font-medium text-destructive">
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

        <div className="p-4 pt-2">
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
