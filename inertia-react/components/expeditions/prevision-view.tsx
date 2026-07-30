import { useMemo, useState } from 'react'
import { TriangleAlert } from 'lucide-react'
import {
  type ExpeditionForecast,
  type DayCharge,
  fmtPal,
} from '@r/components/expeditions/forecast-types'
import { JourDetailSheet } from '@r/components/expeditions/jour-detail-sheet'
import { chargeBgClass, chargeText, chargeTier } from '@r/components/expeditions/palette-charge'
import { cn } from '@r/lib/utils'

/**
 * Vue prévision de charge transport J→J+n (issue #104).
 *
 * Motif aligné sur le bordereau réceptions + lit camion manifeste :
 * rail de date (Fraunces) + barre de remplissage horizontale vs capacité.
 * Pas d'histogramme vertical en grille de cartes.
 */

const railWeekday = new Intl.DateTimeFormat('fr-FR', { weekday: 'short' })
const railDay = new Intl.DateTimeFormat('fr-FR', { day: 'numeric' })
const railMonth = new Intl.DateTimeFormat('fr-FR', { month: 'short' })

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s)

function formatRail(iso: string): { weekday: string; day: string; month: string } {
  const d = new Date(`${iso}T00:00:00`)
  return {
    weekday: cap(railWeekday.format(d)).replace(/\.$/, ''),
    day: railDay.format(d),
    month: cap(railMonth.format(d)).replace(/\.$/, ''),
  }
}

function relatifOf(iso: string, today: string): string {
  const a = new Date(`${iso}T00:00:00`).getTime()
  const b = new Date(`${today}T00:00:00`).getTime()
  const diff = Math.round((a - b) / 86_400_000)
  if (diff === 0) return 'auj.'
  if (diff > 0) return `+${diff}j`
  return `${diff}j`
}

export function PrevisionView({ forecast }: { forecast: ExpeditionForecast }) {
  const [selectedDay, setSelectedDay] = useState<DayCharge | null>(null)
  const [showDeferred, setShowDeferred] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)

  /** Échelle commune : capa visible + headroom pour les spots. */
  const scaleMax = useMemo(() => {
    const peak = Math.max(
      forecast.capaciteJour,
      ...forecast.days.map((d) => Math.max(d.chargeNominale, d.chargeRealiste)),
      1
    )
    return peak * 1.08
  }, [forecast])

  const spotCount = forecast.days.filter((d) => d.spot).length
  const spotPal = forecast.days
    .filter((d) => d.spot)
    .reduce((s, d) => s + Math.max(d.deltaVsCapacite, 0), 0)

  const openDay = (d: DayCharge) => {
    setSelectedDay(d)
    setShowDeferred(false)
    setDetailOpen(true)
  }

  const openDeferred = () => {
    setSelectedDay(null)
    setShowDeferred(true)
    setDetailOpen(true)
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Bandeau — densifié comme la légende frise, pas un dashboard KPI */}
      <div className="flex flex-none flex-wrap items-center gap-x-5 gap-y-1 border-b border-rule-soft px-7 py-2 font-mono text-[10px] text-muted-foreground">
        <span>
          Capa <b className="tabular-nums text-foreground">{fmtPal(forecast.capaciteJour)}</b> pal/j
          <span className="text-muted-foreground/70">
            {' '}
            · {forecast.nbDepartsQuotidiens}×{forecast.camionCapacitePalettes}
          </span>
        </span>
        {spotCount > 0 ? (
          <span className="flex items-center gap-1 font-bold text-destructive">
            <TriangleAlert size={12} strokeWidth={1.75} />
            {spotCount} spot · +{fmtPal(spotPal)} pal
          </span>
        ) : (
          <span className="text-ferme">Sous capacité</span>
        )}
        <span className="ml-auto flex items-center gap-3">
          <Legend sw="bg-foreground/15" label="Nominale" />
          <Legend sw="bg-planifie" label="Réaliste" />
          <Legend sw="bg-suggere" label="Glissé" />
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-px bg-foreground/50" />
            Capa
          </span>
        </span>
      </div>

      <div className="flex-1 overflow-auto px-5 pb-8 pt-4">
        <div className="overflow-hidden rounded-lg border border-rule bg-card shadow-xs">
          {forecast.days.map((d, i) => (
            <DayRow
              key={d.date}
              day={d}
              today={forecast.from}
              scaleMax={scaleMax}
              camionCapacitePalettes={forecast.camionCapacitePalettes}
              first={i === 0}
              onClick={() => openDay(d)}
            />
          ))}
        </div>

        {/* Différé — pied discret, pas une carte d’alerte géante */}
        <button
          type="button"
          onClick={openDeferred}
          className={cn(
            'mt-3 flex w-full items-center gap-4 rounded-lg border px-5 py-3 text-left transition-colors',
            forecast.deferred.length > 0
              ? 'border-rule hover:border-destructive/40 hover:bg-destructive/[0.03]'
              : 'border-rule-soft text-muted-foreground hover:bg-secondary/40'
          )}
        >
          <div className="min-w-0 flex-1">
            <div className="font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
              Volume différé
            </div>
            <div className="mt-0.5 truncate text-[12.5px] font-medium text-foreground">
              {forecast.deferred.length === 0
                ? 'Rien de bloqué / sans couverture'
                : `${forecast.deferred.length} commande${forecast.deferred.length > 1 ? 's' : ''} hors calendrier`}
            </div>
          </div>
          <div
            className={cn(
              'font-fraunces text-[22px] font-black tabular-nums leading-none',
              forecast.deferred.length > 0 ? 'text-destructive' : 'text-muted-foreground/40'
            )}
          >
            {fmtPal(forecast.deferredPalTheo)}
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

function DayRow({
  day,
  today,
  scaleMax,
  camionCapacitePalettes,
  first,
  onClick,
}: {
  day: DayCharge
  today: string
  scaleMax: number
  camionCapacitePalettes: number
  first: boolean
  onClick: () => void
}) {
  const rail = formatRail(day.date)
  const relatif = relatifOf(day.date, today)
  const tier = chargeTier(day.capaciteJour > 0 ? day.chargeRealiste / day.capaciteJour : 0)
  const nbCmd = day.lignesRealistes.length

  const pct = (n: number) => Math.min((n / scaleMax) * 100, 100)
  const realPct = pct(day.chargeRealiste)
  const nomPct = pct(day.chargeNominale)
  const capaPct = pct(day.capaciteJour)
  const glisseShare = day.chargeRealiste > 0 ? Math.min(day.partGlisse / day.chargeRealiste, 1) : 0
  const aDateShare = 1 - glisseShare

  const over = Math.max(day.chargeRealiste / Math.max(day.capaciteJour, 1) - 1, 0)
  const camionExtra =
    day.spot && camionCapacitePalettes > 0 ? day.deltaVsCapacite / camionCapacitePalettes : 0

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative flex w-full text-left transition-colors hover:bg-foreground/[0.025]',
        !first && 'border-t border-rule-soft',
        day.spot &&
          'before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-destructive'
      )}
    >
      {/* Rail date — même vocabulaire que réceptions */}
      <aside className="flex w-[7.5rem] flex-none flex-col border-r border-rule-soft py-4 pl-5 pr-3">
        <div className="font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
          {rail.weekday}
        </div>
        <div className="font-fraunces text-[32px] font-extrabold leading-none tracking-tight tabular-nums text-foreground">
          {rail.day}
        </div>
        <div className="mt-0.5 text-[11px] font-semibold text-muted-foreground">{rail.month}</div>
        <span
          className={cn(
            'mt-2 font-mono text-[10px] font-bold',
            relatif === 'auj.' ? 'text-brand' : 'text-muted-foreground'
          )}
        >
          {relatif}
        </span>
      </aside>

      {/* Charge */}
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-2.5 px-5 py-4">
        <div className="flex items-baseline justify-between gap-3">
          <span
            className={cn(
              'flex items-baseline gap-1.5 font-fraunces text-[28px] font-black leading-none tracking-tight tabular-nums',
              chargeText(tier)
            )}
          >
            {fmtPal(day.chargeRealiste)}
            <span className="font-mono text-[10px] font-semibold tracking-normal text-muted-foreground">
              / {fmtPal(day.capaciteJour)} pal
            </span>
            {day.spot && (
              <span
                className="ml-1 font-mono text-[12px] font-bold text-destructive"
                title={`${Math.round(over * 100)} % au-delà · ~${camionExtra.toFixed(1)} camion`}
              >
                +{fmtPal(day.deltaVsCapacite)}
              </span>
            )}
          </span>
          {day.spot ? (
            <span className="flex items-center gap-1 rounded bg-destructive/10 px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-destructive">
              <TriangleAlert size={12} strokeWidth={1.75} />
              Spot
            </span>
          ) : (
            <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
              {nbCmd} cmd
              {day.partGlisse > 0 ? ` · ${fmtPal(day.partGlisse)} glissés` : ''}
            </span>
          )}
        </div>

        {/* Lit de charge — réaliste plein + nominale en filigrane */}
        <div className="relative h-3.5 overflow-hidden rounded-full bg-secondary">
          {/* Nominale (sous-couche, plus large ou plus étroite) */}
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-foreground/12"
            style={{ width: `${Math.max(nomPct, day.chargeNominale > 0 ? 2 : 0)}%` }}
          />
          {/* Réaliste : à date + glissé */}
          <div
            className="absolute inset-y-0 left-0 flex overflow-hidden rounded-full"
            style={{ width: `${Math.max(realPct, day.chargeRealiste > 0 ? 2 : 0)}%` }}
          >
            <div
              className={cn('h-full', chargeBgClass(tier))}
              style={{ width: `${aDateShare * 100}%` }}
            />
            {glisseShare > 0 && (
              <div className="h-full bg-suggere" style={{ width: `${glisseShare * 100}%` }} />
            )}
          </div>
          {/* Marqueur capacité */}
          <div
            className="pointer-events-none absolute inset-y-0 w-px bg-foreground/55"
            style={{ left: `${capaPct}%` }}
            title={`Capacité ${fmtPal(day.capaciteJour)}`}
          />
        </div>

        <div className="flex items-center gap-4 font-mono text-[9.5px] tabular-nums text-muted-foreground">
          <span>
            Nom. <b className="text-foreground/80">{fmtPal(day.chargeNominale)}</b>
          </span>
          {day.partGlisse > 0 && (
            <span>
              Glissé <b className="text-suggere">{fmtPal(day.partGlisse)}</b>
            </span>
          )}
          {day.spot && (
            <span className="ml-auto font-bold text-destructive">
              ~{camionExtra.toFixed(1)} camion en plus
            </span>
          )}
        </div>
      </div>
    </button>
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
