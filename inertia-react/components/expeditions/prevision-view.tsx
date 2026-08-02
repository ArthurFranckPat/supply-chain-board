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
      <div className="flex flex-none flex-wrap items-center gap-x-4 gap-y-1 border-b border-rule-soft px-7 py-2 font-mono text-[10px] text-muted-foreground">
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
          className="flex flex-none items-center gap-2 border-b border-warning/30 bg-warning/5 px-7 py-2 font-mono text-[11px] text-foreground"
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
        <div className="flex flex-none items-center gap-2 border-b border-destructive/30 bg-destructive/5 px-7 py-2 font-mono text-[11px] text-foreground">
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
        <div className="flex flex-none items-center gap-2 border-b border-warning/25 bg-warning/5 px-7 py-2 font-mono text-[10px] text-warning">
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
            'flex w-full items-center gap-3 border px-3.5 py-2.5 text-left transition-colors',
            forecast.deferred.length > 0
              ? 'border-destructive/30 hover:bg-destructive/[0.03]'
              : 'border-rule-soft text-muted-foreground hover:bg-secondary/40'
          )}
        >
          <div className="min-w-0 flex-1">
            <div className="font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
              Hors horizon jour
            </div>
            <div className="truncate text-[12px] font-medium text-foreground">
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
          'text-[13px] font-bold tracking-tight',
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
      <div className="border border-rule-soft bg-card px-3.5 py-3 font-mono text-[11px] text-muted-foreground">
        {empty}
      </div>
    )
  }

  return (
    <div className="overflow-hidden border border-rule bg-card">
      <div className="grid grid-cols-[5.5rem_minmax(0,1fr)_4.5rem_4.5rem_4.5rem_5rem] gap-2 border-b border-rule-soft bg-secondary/60 px-3 py-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
        <span>Jour</span>
        <span>Charge</span>
        <span className="text-right">Dispo</span>
        <span className="text-right">Chargé</span>
        <span className="text-right">File</span>
        <span className="text-right">Spot</span>
      </div>
      {days.map((day) => (
        <DayRow key={day.date} day={day} peak={peak} onClick={() => onOpen(day)} />
      ))}
    </div>
  )
}

function DayRow({ day, peak, onClick }: { day: DayCharge; peak: number; onClick: () => void }) {
  const availPct = Math.min(100, (day.available / peak) * 100)
  const loadPct = Math.min(100, (day.loaded / peak) * 100)
  const capPct = Math.min(100, (day.capaciteJour / peak) * 100)
  const relative = day.offset === 0 ? 'auj.' : `+${day.offset}j`

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative grid w-full grid-cols-[5.5rem_minmax(0,1fr)_4.5rem_4.5rem_4.5rem_5rem] items-center gap-2 border-t border-rule-soft px-3 py-2 text-left transition-colors hover:bg-foreground/[0.03]',
        day.spot &&
          'bg-destructive/[0.03] before:absolute before:inset-y-0 before:left-0 before:w-[2px] before:bg-destructive'
      )}
    >
      <div className="min-w-0">
        <div className="flex items-baseline gap-1.5">
          <span className="font-mono text-[10px] font-bold uppercase text-muted-foreground">
            {weekdayShort(day.date)}
          </span>
          <span className="text-[13px] font-bold tabular-nums text-foreground">
            {fmtJour(day.date)}
          </span>
        </div>
        <div className="font-mono text-[9px] text-muted-foreground">{relative}</div>
      </div>

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

      <span
        className={cn(
          'text-right font-mono text-[12px] font-bold tabular-nums',
          day.spot ? 'text-destructive' : 'text-foreground'
        )}
      >
        {fmtPal(day.available)}
      </span>
      <span className="text-right font-mono text-[12px] tabular-nums leading-tight text-muted-foreground">
        {fmtPal(day.loaded)}
        {/* Les 2 palettes/camion gagnées en tassant évitent un spot entier :
            elles se disent, sinon le chargé paraît dépasser la capacité. */}
        {day.loadedTasse > 0 && (
          <span className="block text-[9px] text-muted-foreground/70">
            dont {fmtPal(day.loadedTasse)} tassé
          </span>
        )}
      </span>
      <span className="text-right font-mono text-[12px] tabular-nums text-muted-foreground">
        {fmtPal(day.fileAfter)}
      </span>
      <span
        className={cn(
          'text-right font-mono text-[11px] font-bold tabular-nums leading-tight',
          day.spot ? 'text-destructive' : 'text-muted-foreground'
        )}
      >
        {day.spot ? `${day.nbCamionsSpot} cam.` : day.reportePalettes > 0 ? 'reporté' : '—'}
        {/* Le besoin non affrétable n'est pas un camion de plus : c'est de
            l'arriéré. On l'écrit, on ne le fond pas dans le compte. */}
        {day.spotSature && (
          <span className="block font-normal text-[9px] text-destructive/80">
            arriéré {fmtPal(day.fileAfter)}
          </span>
        )}
        {!day.spot && day.reportePalettes > 0 && (
          <span className="block font-normal text-[9px] text-muted-foreground/70">
            {fmtPal(day.reportePalettes)} pal à J+1
          </span>
        )}
      </span>
    </button>
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
    <div className="overflow-hidden border border-rule bg-card">
      <div className="grid grid-cols-[7.5rem_minmax(0,1fr)_5rem_5rem_5rem] gap-2 border-b border-rule-soft bg-secondary/60 px-3 py-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
        <span>Semaine</span>
        <span>Carnet</span>
        <span className="text-right">Carnet</span>
        <span className="text-right">Capacité</span>
        <span className="text-right">Écart</span>
      </div>
      {/* Le carnet à échéance dépassée n'appartient à aucune semaine à venir.
          Sans cette ligne, il disparaissait purement de l'écran. */}
      {retardPalettes > 0 && (
        <button
          type="button"
          onClick={onOpenRetard}
          className="grid w-full grid-cols-[7.5rem_minmax(0,1fr)_5rem_5rem_5rem] items-center gap-2 border-t border-rule-soft bg-destructive/[0.04] px-3 py-2 text-left transition-colors hover:bg-destructive/[0.08]"
        >
          <div className="min-w-0">
            <div className="font-mono text-[11px] font-bold text-destructive">Retard</div>
            <div className="font-mono text-[9px] text-muted-foreground">échéance dépassée</div>
          </div>
          <div className="relative h-2 overflow-hidden rounded-sm bg-secondary">
            <div
              className="absolute inset-y-0 left-0 bg-destructive"
              style={{ width: `${Math.min(100, (retardPalettes / peak) * 100)}%` }}
            />
          </div>
          <span className="text-right font-mono text-[12px] font-bold tabular-nums text-destructive">
            {fmtPal(retardPalettes)}
          </span>
          <span className="text-right font-mono text-[12px] tabular-nums text-muted-foreground">
            —
          </span>
          <span className="text-right font-mono text-[11px] font-bold tabular-nums text-destructive">
            à rattraper
          </span>
        </button>
      )}
      {weeks.map((week) => {
        const pct = Math.min(100, (week.carnetPalettes / peak) * 100)
        const capPct = Math.min(100, (week.capacite / peak) * 100)
        return (
          <div
            key={week.key}
            className={cn(
              'grid grid-cols-[7.5rem_minmax(0,1fr)_5rem_5rem_5rem] items-center gap-2 border-t border-rule-soft px-3 py-2',
              week.usineFermee && 'bg-secondary/40',
              week.spot && 'bg-destructive/[0.03]'
            )}
          >
            <div className="min-w-0">
              <div className="font-mono text-[11px] font-bold text-foreground">{week.key}</div>
              <div className="font-mono text-[9px] text-muted-foreground">
                {fmtJour(week.from)}→{fmtJour(week.to)}
                {week.usineFermee ? ' · fermée' : ''}
              </div>
            </div>
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
            <span
              className={cn(
                'text-right font-mono text-[12px] font-bold tabular-nums',
                week.spot
                  ? 'text-destructive'
                  : week.usineFermee
                    ? 'text-muted-foreground'
                    : 'text-planifie'
              )}
            >
              {fmtPal(week.carnetPalettes)}
            </span>
            <span className="text-right font-mono text-[12px] tabular-nums text-muted-foreground">
              {week.usineFermee ? '—' : fmtPal(week.capacite)}
            </span>
            <span
              className={cn(
                'text-right font-mono text-[11px] font-bold tabular-nums',
                week.spot ? 'text-destructive' : 'text-muted-foreground'
              )}
            >
              {week.usineFermee
                ? 'fermée'
                : week.spot
                  ? `+${week.nbCamionsSpot} cam.`
                  : fmtPal(week.deltaVsCapacite)}
            </span>
          </div>
        )
      })}
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
