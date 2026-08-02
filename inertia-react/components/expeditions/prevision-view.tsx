import { useState } from 'react'
import { TriangleAlert } from 'lucide-react'
import {
  type DayCharge,
  type ExpeditionForecast,
  type WeekCharge,
  fmtJour,
  fmtPal,
} from '@r/components/expeditions/forecast-types'
import { JourDetailSheet } from '@r/components/expeditions/jour-detail-sheet'
import { cn } from '@r/lib/utils'

/** Vue file quai : décision J−2, pré-alerte, puis carnet hebdomadaire. */
export function PrevisionView({ forecast }: { forecast: ExpeditionForecast }) {
  const [selectedDay, setSelectedDay] = useState<DayCharge | null>(null)
  const [showDeferred, setShowDeferred] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const decision = forecast.days.filter((day) => day.band === 'decision')
  const prealert = forecast.days.filter((day) => day.band === 'prealert')
  const peak = Math.max(
    forecast.capaciteJour,
    ...forecast.days.map((day) => day.available),
    ...forecast.weeks.map((week) => week.carnetPalettes),
    1
  )
  const scaleMax = peak * 1.08
  const spotDays = forecast.days.filter((day) => day.spot)
  const spotTrucks = spotDays.reduce((sum, day) => sum + day.nbCamionsSpot, 0)

  const openDay = (day: DayCharge) => {
    setSelectedDay(day)
    setShowDeferred(false)
    setDetailOpen(true)
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex flex-none flex-wrap items-center gap-x-5 gap-y-1 border-b border-rule-soft px-7 py-2 font-mono text-[10px] text-muted-foreground">
        <span>
          File quai · <b className="text-foreground">{forecast.initialQueuePalettes.toFixed(1)}</b>{' '}
          pal
          <span className="text-muted-foreground/70">
            {' '}
            · {forecast.nbDepartsQuotidiens}×{forecast.camionCapacitePalettes}/j
          </span>
        </span>
        {spotTrucks > 0 ? (
          <span className="flex items-center gap-1 font-bold text-destructive">
            <TriangleAlert size={12} strokeWidth={1.75} />
            {spotTrucks} camion{spotTrucks > 1 ? 's' : ''} spot à prévoir
          </span>
        ) : (
          <span className="text-ferme">Sous capacité navette</span>
        )}
        <span className="ml-auto flex items-center gap-3">
          <Legend sw="bg-ferme" label="Constaté / décision" />
          <Legend sw="bg-suggere" label="Pré-alerte" />
          <Legend sw="bg-planifie" label="Carnet semaine" />
        </span>
      </div>

      {forecast.nonQuantifiableLines > 0 && (
        <div className="flex flex-none items-center gap-2 border-b border-warning/25 bg-warning/5 px-7 py-2 font-mono text-[10px] text-warning">
          <TriangleAlert size={13} strokeWidth={1.75} />
          {forecast.nonQuantifiableLines} ligne
          {forecast.nonQuantifiableLines > 1 ? 's' : ''} sans coefficient de palettisation
          exploitable. Elles ne sont pas comptées dans la charge.
        </div>
      )}

      <div className="flex-1 overflow-auto px-5 pb-8 pt-4">
        <Band title="Décision · J à J+3" tone="decision" hint="préavis transport 48 h">
          {decision.map((day) => (
            <DayRow key={day.date} day={day} scaleMax={scaleMax} onClick={() => openDay(day)} />
          ))}
        </Band>

        <Band title="Pré-alerte · J+4 à J+7" tone="prealert" hint="OF planifiés / suggérés inclus">
          {prealert.length > 0 ? (
            prealert.map((day) => (
              <DayRow key={day.date} day={day} scaleMax={scaleMax} onClick={() => openDay(day)} />
            ))
          ) : (
            <EmptyBand text="Aucun jour ouvré dans cette fenêtre." />
          )}
        </Band>

        <Band
          title="Carnet · S+1 à S+6"
          tone="weekly"
          hint="date de livraison utilisée à cette maille"
        >
          <div className="overflow-hidden rounded-lg border border-rule bg-card shadow-xs">
            {forecast.weeks.map((week) => (
              <WeekRow key={week.key} week={week} scaleMax={scaleMax} />
            ))}
          </div>
        </Band>

        <button
          type="button"
          onClick={() => {
            setSelectedDay(null)
            setShowDeferred(true)
            setDetailOpen(true)
          }}
          className={cn(
            'mt-4 flex w-full items-center gap-4 rounded-lg border px-5 py-3 text-left transition-colors',
            forecast.deferred.length > 0
              ? 'border-destructive/30 hover:bg-destructive/[0.03]'
              : 'border-rule-soft text-muted-foreground hover:bg-secondary/40'
          )}
        >
          <div className="min-w-0 flex-1">
            <div className="font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
              Hors file jour
            </div>
            <div className="mt-0.5 truncate text-[12.5px] font-medium text-foreground">
              {forecast.deferred.length === 0
                ? 'Aucun reliquat sans date de chargement'
                : `${forecast.deferred.length} ligne${forecast.deferred.length > 1 ? 's' : ''} à qualifier`}
            </div>
          </div>
          <div className="font-fraunces text-[22px] font-black tabular-nums leading-none text-destructive">
            {fmtPal(forecast.deferredPalettes)}
            <span className="ml-1 align-baseline font-mono text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
              pal
            </span>
          </div>
        </button>
      </div>

      <JourDetailSheet
        day={showDeferred ? null : selectedDay}
        deferred={showDeferred ? forecast.deferred : null}
        camionCapacitePalettes={forecast.camionCapacitePalettes}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />
    </div>
  )
}

function Band({
  title,
  hint,
  tone,
  children,
}: {
  title: string
  hint: string
  tone: 'decision' | 'prealert' | 'weekly'
  children: React.ReactNode
}) {
  return (
    <section className="mb-5">
      <div className="mb-2 flex items-baseline gap-3 px-1">
        <h2
          className={cn(
            'font-fraunces text-[16px] font-bold tracking-tight',
            tone === 'decision' && 'text-ferme',
            tone === 'prealert' && 'text-suggere',
            tone === 'weekly' && 'text-planifie'
          )}
        >
          {title}
        </h2>
        <span className="font-mono text-[9px] text-muted-foreground">{hint}</span>
      </div>
      {children}
    </section>
  )
}

function DayRow({
  day,
  scaleMax,
  onClick,
}: {
  day: DayCharge
  scaleMax: number
  onClick: () => void
}) {
  const pct = (value: number) => Math.min(100, Math.max(0, (value / scaleMax) * 100))
  const capacityPct = pct(day.capaciteJour)
  const availablePct = pct(day.available)
  const loadedPct = pct(day.loaded)
  const relative = day.offset === 0 ? 'auj.' : `+${day.offset}j`

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative flex w-full border border-rule bg-card text-left transition-colors hover:bg-foreground/[0.025]',
        day.spot &&
          'border-destructive/35 before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-destructive'
      )}
    >
      <aside className="flex w-[7.5rem] flex-none flex-col border-r border-rule-soft py-4 pl-5 pr-3">
        <div className="font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
          {new Intl.DateTimeFormat('fr-FR', { weekday: 'short' }).format(
            new Date(`${day.date}T00:00:00`)
          )}
        </div>
        <div className="font-fraunces text-[30px] font-extrabold leading-none tracking-tight tabular-nums text-foreground">
          {day.date.slice(8)}
        </div>
        <span className="mt-1 font-mono text-[10px] font-bold text-muted-foreground">
          {relative}
        </span>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col justify-center gap-2.5 px-5 py-4">
        <div className="flex items-baseline justify-between gap-3">
          <span
            className={cn(
              'font-fraunces text-[26px] font-black leading-none tabular-nums',
              day.spot ? 'text-destructive' : 'text-foreground'
            )}
          >
            {fmtPal(day.available)}
            <span className="ml-1 font-mono text-[10px] font-semibold text-muted-foreground">
              dispo / {fmtPal(day.capaciteJour)} pal
            </span>
          </span>
          {day.spot ? (
            <span className="flex items-center gap-1 rounded bg-destructive/10 px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-destructive">
              <TriangleAlert size={12} strokeWidth={1.75} />
              {day.nbCamionsSpot} spot
            </span>
          ) : (
            <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
              {day.lignes.length} ligne{day.lignes.length > 1 ? 's' : ''}
            </span>
          )}
        </div>

        <div className="relative h-3.5 overflow-hidden rounded-full bg-secondary">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-foreground/15"
            style={{ width: `${availablePct}%` }}
          />
          <div
            className={cn(
              'absolute inset-y-0 left-0 rounded-full',
              day.spot ? 'bg-destructive' : day.band === 'decision' ? 'bg-ferme' : 'bg-suggere'
            )}
            style={{ width: `${loadedPct}%` }}
          />
          <div
            className="pointer-events-none absolute inset-y-0 w-px bg-foreground/60"
            style={{ left: `${capacityPct}%` }}
          />
        </div>

        <div className="flex flex-wrap items-center gap-4 font-mono text-[9.5px] tabular-nums text-muted-foreground">
          <span>
            Entrées <b className="text-foreground/80">{fmtPal(day.entries)}</b>
          </span>
          <span>
            Chargé <b className="text-foreground/80">{fmtPal(day.loaded)}</b>
          </span>
          <span>
            File après <b className="text-foreground/80">{fmtPal(day.fileAfter)}</b>
          </span>
          {day.spot && (
            <span className="ml-auto font-bold text-destructive">
              +{fmtPal(day.spotPalettes)} pal
            </span>
          )}
        </div>
      </div>
    </button>
  )
}

function WeekRow({ week, scaleMax }: { week: WeekCharge; scaleMax: number }) {
  const pct = Math.min(100, Math.max(0, (week.carnetPalettes / scaleMax) * 100))
  const capPct = Math.min(100, Math.max(0, (week.capacite / scaleMax) * 100))
  return (
    <div
      className={cn(
        'border-t border-rule-soft px-5 py-4 first:border-t-0',
        week.spot && 'bg-destructive/[0.025]'
      )}
    >
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <span className="font-mono text-[10px] font-bold text-muted-foreground">{week.key}</span>
          <span className="ml-3 font-mono text-[10px] text-muted-foreground">
            {fmtJour(week.from)} → {fmtJour(week.to)}
          </span>
        </div>
        <span
          className={cn(
            'font-fraunces text-[24px] font-black tabular-nums',
            week.spot ? 'text-destructive' : 'text-planifie'
          )}
        >
          {fmtPal(week.carnetPalettes)}{' '}
          <span className="font-mono text-[10px] font-semibold text-muted-foreground">
            / {fmtPal(week.capacite)} pal
          </span>
        </span>
      </div>
      <div className="relative mt-2 h-3 overflow-hidden rounded-full bg-secondary">
        <div
          className={cn(
            'absolute inset-y-0 left-0 rounded-full',
            week.spot ? 'bg-destructive' : 'bg-planifie'
          )}
          style={{ width: `${pct}%` }}
        />
        <div
          className="pointer-events-none absolute inset-y-0 w-px bg-foreground/60"
          style={{ left: `${capPct}%` }}
        />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-4 font-mono text-[9.5px] text-muted-foreground">
        <span>Transport {fmtPal(week.capaciteTransport)} pal</span>
        <span>
          Production{' '}
          {Number.isFinite(week.capaciteProduction) ? fmtPal(week.capaciteProduction) : '—'} pal
        </span>
        <span>
          {week.lignes.length} ligne{week.lignes.length > 1 ? 's' : ''}
        </span>
        {week.nonQuantifiableLines > 0 && (
          <span className="text-warning">
            {week.nonQuantifiableLines} non chiffrable{week.nonQuantifiableLines > 1 ? 's' : ''}
          </span>
        )}
        {week.spot && (
          <span className="ml-auto font-bold text-destructive">
            {week.nbCamionsSpot} camion{week.nbCamionsSpot > 1 ? 's' : ''} spot
          </span>
        )}
      </div>
    </div>
  )
}

function EmptyBand({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-rule-soft bg-card px-5 py-6 text-center font-fraunces text-[13px] italic text-muted-foreground">
      {text}
    </div>
  )
}

function Legend({ sw, label }: { sw: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn('h-[9px] w-5 rounded-[2px]', sw)} />
      {label}
    </span>
  )
}
