import { useState } from 'react'
import { TriangleAlert } from 'lucide-react'
import {
  type DayCharge,
  type ExpeditionForecast,
  type WeekCharge,
  fmtJour,
  fmtPal,
  weekdayShort,
} from '@r/components/expeditions/forecast-types'
import { JourDetailSheet } from '@r/components/expeditions/jour-detail-sheet'
import {
  CellNumber,
  CellStack,
  TableCell,
  TableHead,
  TableHeadRow,
  TableRow,
} from '@r/components/ui/table-row'
import { cn } from '@r/lib/utils'

/** Vue file quai : décision, pré-alerte, carnet — densité type manifeste. */
export function PrevisionView({ forecast }: { forecast: ExpeditionForecast }) {
  const [selectedDay, setSelectedDay] = useState<DayCharge | null>(null)
  const [sheetList, setSheetList] = useState<'none' | 'deferred' | 'retard'>('none')
  const [detailOpen, setDetailOpen] = useState(false)

  const decision = forecast.days.filter((day) => day.band === 'decision')
  const prealert = forecast.days.filter((day) => day.band === 'prealert')
  const peak = Math.max(
    forecast.capaciteJour,
    ...forecast.days.map((day) => day.available),
    ...forecast.weeks.map((week) => week.carnetPalettes),
    forecast.retardPalettes,
    1
  )
  const spotTrucks = forecast.days.reduce((sum, day) => sum + day.nbCamionsSpot, 0)
  const saturedDays = forecast.days.filter((day) => day.spotSature).length
  const activeClosures = forecast.plantClosures.filter(
    (closure) => closure.to >= forecast.from && closure.from <= forecast.to
  )
  const hasCharge = forecast.days.some((day) => day.available > 0)
  // La bande décision commence au premier jour ouvré, pas à J : pendant les
  // congès, afficher « 02/08 → 20/08 » laissait croire à une décision à J−2.
  const decisionFrom = decision[0]?.date ?? forecast.firstWorkingDay ?? forecast.from

  const openDay = (day: DayCharge) => {
    setSelectedDay(day)
    setSheetList('none')
    setDetailOpen(true)
  }

  const openList = (which: 'deferred' | 'retard') => {
    setSelectedDay(null)
    setSheetList(which)
    setDetailOpen(true)
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex flex-none flex-wrap items-center gap-x-4 gap-y-1 border-b border-border px-6 py-2 font-mono text-[10px] text-muted-foreground">
        <span>
          File quai · <b className="text-foreground">{fmtPal(forecast.initialQueuePalettes)}</b> pal
          <span className="text-muted-foreground/70">
            {' '}
            · {forecast.nbDepartsQuotidiens}×{forecast.camionCapacitePalettes}/j (
            {forecast.capaciteJourTassee} en tassant)
          </span>
        </span>
        <span title="Cadence de sortie atelier retenue par le portillon de production">
          Atelier · <b className="text-foreground">{fmtPal(forecast.productionDailyCapacity)}</b>{' '}
          pal/j
        </span>
        {spotTrucks > 0 ? (
          <span className="flex items-center gap-1 font-bold text-destructive">
            <TriangleAlert size={12} strokeWidth={1.75} />
            {spotTrucks} camion{spotTrucks > 1 ? 's' : ''} spot
            <span className="font-normal text-muted-foreground">
              (max {forecast.maxSpotTrucks}/j)
            </span>
          </span>
        ) : hasCharge ? (
          <span className="text-ferme">Sous capacité navette</span>
        ) : (
          <span>Aucune charge sur l&apos;horizon ouvré</span>
        )}
        {forecast.firstWorkingDay && forecast.firstWorkingDay !== forecast.from && (
          <span className="text-muted-foreground">
            1<sup>er</sup> jour ouvré {fmtJour(forecast.firstWorkingDay)}
          </span>
        )}
        <span className="ml-auto flex items-center gap-3">
          <Legend sw="bg-ferme" label="Décision" />
          <Legend sw="bg-suggere" label="Pré-alerte" />
          <Legend sw="bg-planifie" label="Carnet" />
        </span>
      </div>

      {activeClosures.map((closure) => (
        <div
          key={`${closure.from}-${closure.to}`}
          className="flex flex-none items-center gap-2 border-b border-warning/30 bg-warning/5 px-6 py-2 font-mono text-[11px] text-foreground"
        >
          <TriangleAlert size={13} strokeWidth={1.75} className="text-warning" />
          <span>
            Usine fermée <b>{fmtJour(closure.from)}</b> → <b>{fmtJour(closure.to)}</b>
            <span className="text-muted-foreground"> · {closure.motif}</span>
            {forecast.firstWorkingDay ? (
              <span className="text-muted-foreground">
                {' '}
                · reprise {fmtJour(forecast.firstWorkingDay)}
              </span>
            ) : null}
          </span>
        </div>
      ))}

      {saturedDays > 0 && (
        <div className="flex flex-none items-center gap-2 border-b border-destructive/30 bg-destructive/10 px-6 py-2 font-mono text-[11px] text-foreground">
          <TriangleAlert size={13} strokeWidth={1.75} className="text-destructive" />
          <span>
            <b>
              {saturedDays} jour{saturedDays > 1 ? 's' : ''}
            </b>{' '}
            au-delà de {forecast.maxSpotTrucks} camions spot — ce n&apos;est plus une commande
            transport, c&apos;est un arriéré. Le surplus reste en file.
          </span>
        </div>
      )}

      {forecast.nonQuantifiableLines > 0 && (
        <div className="flex flex-none items-center gap-2 border-b border-warning/25 bg-warning/5 px-6 py-2 font-mono text-[10px] text-warning">
          <TriangleAlert size={13} strokeWidth={1.75} />
          {forecast.nonQuantifiableLines} ligne
          {forecast.nonQuantifiableLines > 1 ? 's' : ''} sans coefficient — hors charge.
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6 pt-3">
        <section className="mb-4">
          <SectionHead
            title="Décision"
            hint={`préavis 48 h · ${fmtJour(decisionFrom)} → ${fmtJour(forecast.decisionTo)}`}
            tone="decision"
          />
          <DayTable days={decision} peak={peak} onOpen={openDay} empty="Aucun jour ouvré." />
        </section>

        <section className="mb-4">
          <SectionHead
            title="Pré-alerte"
            hint={`OF planifiés · → ${fmtJour(forecast.prealertTo)}`}
            tone="prealert"
          />
          <DayTable
            days={prealert}
            peak={peak}
            onOpen={openDay}
            empty="Aucun jour ouvré dans cette bande."
          />
        </section>

        <section className="mb-4">
          <SectionHead
            title="Carnet"
            hint="S+1 → S+6 · date livraison · net de la bande jour"
            tone="weekly"
          />
          <WeekTable
            weeks={forecast.weeks}
            peak={peak}
            retardPalettes={forecast.retardPalettes}
            onOpenRetard={() => openList('retard')}
          />
        </section>

        <button
          type="button"
          onClick={() => openList('deferred')}
          className={cn(
            'flex w-full items-center gap-3 rounded-lg border px-3.5 py-2.5 text-left transition-colors',
            forecast.deferred.length > 0
              ? 'border-destructive/30 hover:bg-destructive/[0.03]'
              : 'border-border text-muted-foreground hover:bg-muted/50'
          )}
        >
          <div className="min-w-0 flex-1">
            <div className="font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
              Hors horizon jour
            </div>
            <div className="truncate font-sans text-[12px] font-medium text-foreground">
              {forecast.deferred.length === 0
                ? 'Aucun reliquat sans date'
                : `${forecast.deferred.length} ligne${forecast.deferred.length > 1 ? 's' : ''} — sans date, ou au-delà de la cadence atelier sur l'horizon`}
            </div>
          </div>
          <div className="font-mono text-[13px] font-bold tabular-nums text-destructive">
            {fmtPal(forecast.deferredPalettes)} pal
          </div>
        </button>
      </div>

      <JourDetailSheet
        day={sheetList === 'none' ? selectedDay : null}
        deferred={
          sheetList === 'retard'
            ? forecast.retardLines
            : sheetList === 'deferred'
              ? forecast.deferred
              : null
        }
        deferredTitle={sheetList === 'retard' ? 'Carnet en retard' : undefined}
        deferredHint={
          sheetList === 'retard'
            ? 'Lignes dont la date de livraison est déjà passée et que la bande jour n’a pas absorbées.'
            : undefined
        }
        camionCapacitePalettes={forecast.camionCapacitePalettes}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />
    </div>
  )
}

function SectionHead({
  title,
  hint,
  tone,
}: {
  title: string
  hint: string
  tone: 'decision' | 'prealert' | 'weekly'
}) {
  return (
    <div className="mb-1.5 flex items-baseline gap-2 px-0.5">
      <h2
        className={cn(
          'font-sans text-[13px] font-medium tracking-tight',
          tone === 'decision' && 'text-ferme',
          tone === 'prealert' && 'text-suggere',
          tone === 'weekly' && 'text-planifie'
        )}
      >
        {title}
      </h2>
      <span className="font-mono text-[9px] text-muted-foreground">{hint}</span>
    </div>
  )
}

const TH = 'bg-card'

function DayTable({
  days,
  peak,
  onOpen,
  empty,
}: {
  days: DayCharge[]
  peak: number
  onOpen: (day: DayCharge) => void
  empty: string
}) {
  if (days.length === 0) {
    return (
      <p className="rounded-lg border border-border bg-card px-4 py-3 font-sans text-sm text-muted-foreground">
        {empty}
      </p>
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <table className="w-full table-fixed border-collapse">
        <colgroup>
          <col style={{ width: '7rem' }} />
          <col />
          <col style={{ width: '4.5rem' }} />
          <col style={{ width: '4.5rem' }} />
          <col style={{ width: '4.5rem' }} />
          <col style={{ width: '5.5rem' }} />
        </colgroup>
        <thead>
          {/* Fond sur les cellules : `.theme-cursor table thead tr` force
              background transparent !important. */}
          <TableHeadRow className="sticky top-0 z-10">
            <TableHead className={TH}>Jour</TableHead>
            <TableHead className={TH}>Charge</TableHead>
            <TableHead align="right" className={`${TH} text-right!`}>
              Dispo
            </TableHead>
            <TableHead align="right" className={`${TH} text-right!`}>
              Chargé
            </TableHead>
            <TableHead align="right" className={`${TH} text-right!`}>
              File
            </TableHead>
            <TableHead align="right" className={`${TH} text-right!`}>
              Spot
            </TableHead>
          </TableHeadRow>
        </thead>
        <tbody>
          {days.map((day) => (
            <DayRow key={day.date} day={day} peak={peak} onClick={() => onOpen(day)} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function DayRow({ day, peak, onClick }: { day: DayCharge; peak: number; onClick: () => void }) {
  const availPct = Math.min(100, (day.available / peak) * 100)
  const loadPct = Math.min(100, (day.loaded / peak) * 100)
  const capPct = Math.min(100, (day.capaciteJour / peak) * 100)
  const relative = day.offset === 0 ? 'auj.' : `+${day.offset}j`

  return (
    <TableRow clickable tone={day.spot ? 'critical' : null} onClick={onClick}>
      <TableCell>
        <CellStack code={fmtJour(day.date)} label={`${weekdayShort(day.date)} · ${relative}`} />
      </TableCell>
      <TableCell>
        <div className="relative h-2 overflow-hidden rounded-sm bg-secondary">
          <div
            className="absolute inset-y-0 left-0 bg-foreground/12"
            style={{ width: `${availPct}%` }}
          />
          <div
            className={cn(
              'absolute inset-y-0 left-0',
              day.spot ? 'bg-destructive' : day.band === 'decision' ? 'bg-ferme' : 'bg-suggere'
            )}
            style={{ width: `${loadPct}%` }}
          />
          <div
            className="pointer-events-none absolute inset-y-0 w-px bg-foreground/50"
            style={{ left: `${capPct}%` }}
          />
        </div>
      </TableCell>
      <TableCell align="right">
        <CellNumber value={fmtPal(day.available)} tone={day.spot ? 'critical' : null} />
      </TableCell>
      <TableCell align="right">
        <span className="flex flex-col items-end gap-px">
          <CellNumber value={fmtPal(day.loaded)} emphasis="plain" />
          {/* Les 2 palettes/camion gagnées en tassant évitent un spot entier :
              elles se disent, sinon le chargé paraît dépasser la capacité. */}
          {day.loadedTasse > 0 && (
            <span className="font-mono text-2xs text-muted-foreground/70">
              dont {fmtPal(day.loadedTasse)} tassé
            </span>
          )}
        </span>
      </TableCell>
      <TableCell align="right">
        <CellNumber value={fmtPal(day.fileAfter)} emphasis="plain" />
      </TableCell>
      <TableCell align="right">
        <span className="flex flex-col items-end gap-px">
          <CellNumber
            value={
              day.spot ? `${day.nbCamionsSpot} cam.` : day.reportePalettes > 0 ? 'reporté' : '—'
            }
            tone={day.spot ? 'critical' : null}
            emphasis={day.spot ? 'strong' : 'plain'}
          />
          {/* Le besoin non affrétable n'est pas un camion de plus : c'est de
              l'arriéré. On l'écrit, on ne le fond pas dans le compte. */}
          {day.spotSature && (
            <span className="font-mono text-2xs text-destructive/80">
              arriéré {fmtPal(day.fileAfter)}
            </span>
          )}
          {!day.spot && day.reportePalettes > 0 && (
            <span className="font-mono text-2xs text-muted-foreground/70">
              {fmtPal(day.reportePalettes)} pal à J+1
            </span>
          )}
        </span>
      </TableCell>
    </TableRow>
  )
}

function WeekTable({
  weeks,
  peak,
  retardPalettes,
  onOpenRetard,
}: {
  weeks: WeekCharge[]
  peak: number
  retardPalettes: number
  onOpenRetard: () => void
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <table className="w-full table-fixed border-collapse">
        <colgroup>
          <col style={{ width: '8.5rem' }} />
          <col />
          <col style={{ width: '5rem' }} />
          <col style={{ width: '5rem' }} />
          <col style={{ width: '5.5rem' }} />
        </colgroup>
        <thead>
          <TableHeadRow className="sticky top-0 z-10">
            <TableHead className={TH}>Semaine</TableHead>
            <TableHead className={TH}>Carnet</TableHead>
            <TableHead align="right" className={`${TH} text-right!`}>
              Carnet
            </TableHead>
            <TableHead align="right" className={`${TH} text-right!`}>
              Capacité
            </TableHead>
            <TableHead align="right" className={`${TH} text-right!`}>
              Écart
            </TableHead>
          </TableHeadRow>
        </thead>
        <tbody>
          {/* Le carnet à échéance dépassée n'appartient à aucune semaine à venir.
              Sans cette ligne, il disparaissait purement de l'écran. */}
          {retardPalettes > 0 && (
            <TableRow clickable tone="critical" onClick={onOpenRetard}>
              <TableCell>
                <CellStack code="Retard" label="échéance dépassée" />
              </TableCell>
              <TableCell>
                <div className="relative h-2 overflow-hidden rounded-sm bg-secondary">
                  <div
                    className="absolute inset-y-0 left-0 bg-destructive"
                    style={{ width: `${Math.min(100, (retardPalettes / peak) * 100)}%` }}
                  />
                </div>
              </TableCell>
              <TableCell align="right">
                <CellNumber value={fmtPal(retardPalettes)} tone="critical" />
              </TableCell>
              <TableCell align="right">
                <CellNumber value="—" emphasis="plain" />
              </TableCell>
              <TableCell align="right">
                <CellNumber value="à rattraper" tone="critical" emphasis="plain" />
              </TableCell>
            </TableRow>
          )}
          {weeks.map((week) => {
            const pct = Math.min(100, (week.carnetPalettes / peak) * 100)
            const capPct = Math.min(100, (week.capacite / peak) * 100)
            return (
              <TableRow
                key={week.key}
                tone={week.spot ? 'critical' : null}
                className={week.usineFermee ? 'bg-muted/40' : undefined}
              >
                <TableCell>
                  <CellStack
                    code={week.key}
                    label={`${fmtJour(week.from)}→${fmtJour(week.to)}${week.usineFermee ? ' · fermée' : ''}`}
                  />
                </TableCell>
                <TableCell>
                  <div className="relative h-2 overflow-hidden rounded-sm bg-secondary">
                    {!week.usineFermee && (
                      <>
                        <div
                          className={cn(
                            'absolute inset-y-0 left-0',
                            week.spot ? 'bg-destructive' : 'bg-planifie'
                          )}
                          style={{ width: `${pct}%` }}
                        />
                        <div
                          className="pointer-events-none absolute inset-y-0 w-px bg-foreground/50"
                          style={{ left: `${capPct}%` }}
                        />
                      </>
                    )}
                  </div>
                </TableCell>
                <TableCell align="right">
                  <CellNumber
                    value={fmtPal(week.carnetPalettes)}
                    tone={week.spot ? 'critical' : week.usineFermee ? null : 'info'}
                    className={week.usineFermee ? 'text-muted-foreground' : undefined}
                  />
                </TableCell>
                <TableCell align="right">
                  <CellNumber
                    value={week.usineFermee ? '—' : fmtPal(week.capacite)}
                    emphasis="plain"
                  />
                </TableCell>
                <TableCell align="right">
                  <CellNumber
                    value={
                      week.usineFermee
                        ? 'fermée'
                        : week.spot
                          ? `+${week.nbCamionsSpot} cam.`
                          : fmtPal(week.deltaVsCapacite)
                    }
                    tone={week.spot ? 'critical' : null}
                    emphasis={week.spot ? 'strong' : 'plain'}
                  />
                </TableCell>
              </TableRow>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function Legend({ sw, label }: { sw: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn('h-2 w-3.5 rounded-[1px]', sw)} />
      {label}
    </span>
  )
}
