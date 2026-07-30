import { useMemo, useState } from 'react'
import { TriangleAlert, CalendarRange } from 'lucide-react'
import {
  type ExpeditionForecast,
  type DayCharge,
  fmtJour,
  fmtPal,
} from '@r/components/expeditions/forecast-types'
import { JourDetailSheet } from '@r/components/expeditions/jour-detail-sheet'
import { chargeBgClass, chargeTier } from '@r/components/expeditions/palette-charge'
import { cn } from '@r/lib/utils'

/**
 * Vue prévision de charge transport J→J+n (issue #104).
 * Frise calendaire : double barre nominale / réaliste, seuil capacité, badge spot.
 */

export function PrevisionView({ forecast }: { forecast: ExpeditionForecast }) {
  const [selectedDay, setSelectedDay] = useState<DayCharge | null>(null)
  const [showDeferred, setShowDeferred] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)

  const maxCharge = useMemo(() => {
    const peak = Math.max(
      forecast.capaciteJour,
      ...forecast.days.map((d) => Math.max(d.chargeNominale, d.chargeRealiste)),
      1
    )
    return peak
  }, [forecast])

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

  const spotCount = forecast.days.filter((d) => d.spot).length

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Résumé horizon */}
      <div className="flex flex-none flex-wrap items-center gap-4 border-b border-rule-soft px-7 py-2 font-mono text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <CalendarRange size={13} strokeWidth={1.75} />
          {fmtJour(forecast.from)} → {fmtJour(forecast.to)}
        </span>
        <span>
          Capa <b className="text-foreground">{fmtPal(forecast.capaciteJour)}</b> pal/j (
          {forecast.nbDepartsQuotidiens}×{forecast.camionCapacitePalettes})
        </span>
        {spotCount > 0 && (
          <span className="flex items-center gap-1 text-destructive">
            <TriangleAlert size={13} strokeWidth={1.75} />
            {spotCount} jour{spotCount > 1 ? 's' : ''} spot
          </span>
        )}
        <span className="ml-auto flex items-center gap-3">
          <Legend sw="bg-planifie/40" label="Nominale" />
          <Legend sw="bg-planifie" label="Réaliste" />
          <Legend sw="bg-suggere" label="Glissé" />
          <Legend sw="border border-dashed border-foreground/40" label="Capa" dashed />
        </span>
      </div>

      {/* Frise jours */}
      <div className="flex-1 overflow-auto p-5">
        <div
          className="grid gap-3"
          style={{
            gridTemplateColumns: `repeat(${Math.max(forecast.days.length, 1)}, minmax(96px, 1fr))`,
          }}
        >
          {forecast.days.map((d) => (
            <DayColumn key={d.date} day={d} maxCharge={maxCharge} onClick={() => openDay(d)} />
          ))}
        </div>

        {/* Volume différé */}
        <button
          type="button"
          onClick={openDeferred}
          className={cn(
            'mt-6 w-full rounded-md border px-4 py-3 text-left transition-colors',
            forecast.deferred.length > 0
              ? 'border-destructive/30 bg-destructive/5 hover:bg-destructive/10'
              : 'border-rule bg-card hover:bg-secondary/40'
          )}
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                Volume différé
              </div>
              <div className="mt-0.5 text-[13px] text-foreground">
                {forecast.deferred.length === 0
                  ? 'Aucune commande bloquée / sans couverture'
                  : `${forecast.deferred.length} commande${forecast.deferred.length > 1 ? 's' : ''} hors calendrier`}
              </div>
            </div>
            <div className="font-mono text-[16px] font-bold tabular-nums text-foreground">
              {fmtPal(forecast.deferredPalTheo)}{' '}
              <span className="text-[11px] font-normal text-muted-foreground">pal</span>
            </div>
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

function DayColumn({
  day,
  maxCharge,
  onClick,
}: {
  day: DayCharge
  maxCharge: number
  onClick: () => void
}) {
  const capaPct = Math.min((day.capaciteJour / maxCharge) * 100, 100)
  const nomPct = Math.min((day.chargeNominale / maxCharge) * 100, 100)
  const realPct = Math.min((day.chargeRealiste / maxCharge) * 100, 100)
  const glissePct = day.chargeRealiste > 0 ? (day.partGlisse / day.chargeRealiste) * realPct : 0
  const aDatePct = Math.max(realPct - glissePct, 0)
  const tier = chargeTier(day.capaciteJour > 0 ? day.chargeRealiste / day.capaciteJour : 0)

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex flex-col rounded-md border bg-card p-2 text-left transition-colors hover:border-brand/40',
        day.spot ? 'border-destructive/50' : 'border-rule'
      )}
    >
      <div className="mb-2 flex items-baseline justify-between gap-1">
        <span className="font-mono text-[11px] font-bold text-foreground">{fmtJour(day.date)}</span>
        {day.spot && (
          <span className="rounded bg-destructive/15 px-1 py-0.5 font-mono text-[8px] font-bold uppercase tracking-wider text-destructive">
            Spot
          </span>
        )}
      </div>

      {/* Barres verticales */}
      <div className="relative flex h-36 items-end justify-center gap-1.5">
        {/* Seuil capacité */}
        <div
          className="pointer-events-none absolute inset-x-0 border-t border-dashed border-foreground/35"
          style={{ bottom: `${capaPct}%` }}
          title={`Capacité ${fmtPal(day.capaciteJour)}`}
        />

        {/* Nominale (arrière) */}
        <div
          className="w-4 rounded-t bg-planifie/35"
          style={{ height: `${Math.max(nomPct, day.chargeNominale > 0 ? 4 : 0)}%` }}
          title={`Nominale ${fmtPal(day.chargeNominale)}`}
        />

        {/* Réaliste : à date + glissé empilés */}
        <div
          className="flex w-5 flex-col justify-end overflow-hidden rounded-t"
          style={{ height: `${Math.max(realPct, day.chargeRealiste > 0 ? 4 : 0)}%` }}
          title={`Réaliste ${fmtPal(day.chargeRealiste)}`}
        >
          {glissePct > 0 && (
            <div
              className="w-full bg-suggere"
              style={{ height: `${(glissePct / realPct) * 100}%` }}
            />
          )}
          <div
            className={cn('w-full', chargeBgClass(tier))}
            style={{ height: `${realPct > 0 ? (aDatePct / realPct) * 100 : 100}%` }}
          />
        </div>
      </div>

      <div className="mt-2 space-y-0.5 font-mono text-[10px] tabular-nums">
        <div className="flex justify-between text-muted-foreground">
          <span>Nom.</span>
          <span>{fmtPal(day.chargeNominale)}</span>
        </div>
        <div className="flex justify-between font-semibold text-foreground">
          <span>Réal.</span>
          <span className={day.spot ? 'text-destructive' : undefined}>
            {fmtPal(day.chargeRealiste)}
          </span>
        </div>
        {day.spot && <div className="text-destructive">+{fmtPal(day.deltaVsCapacite)} pal</div>}
      </div>
    </button>
  )
}

function Legend({ sw, label, dashed }: { sw: string; label: string; dashed?: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn('h-[9px] w-5 rounded-[2px]', sw, dashed && 'bg-transparent')} />
      {label}
    </span>
  )
}
