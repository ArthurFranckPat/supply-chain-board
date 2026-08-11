import { useMemo } from 'react'
import { HistogrammeCharge, type PeriodeCharge } from '@r/components/ui/chart'
import { cn } from '@r/lib/utils'
import type { LoadLine, LoadView } from '@r/lib/load/types'
import { satColor, satRate, segmentsDeVue, total } from '@r/lib/load/chart-math'

/**
 * Mini-graphe (carte poste) de la vue « Projection de charge » (issue #52 —
 * extrait de scheduler/load.tsx).
 *
 * Les barres passent par HistogrammeCharge (@tanstack/charts), muet : ni axe ni
 * grille dans une tuile de 190 px. La capacité est la courbe, le pic la
 * pastille ; la lecture chiffrée vit dans le texte sous le graphe.
 */
interface MiniCardProps {
  line: LoadLine
  months: string[]
  view: LoadView
  selected: boolean
  showCapacity: boolean
  onSelect: () => void
}

export function MiniCard({ line, months, view, selected, showCapacity, onSelect }: MiniCardProps) {
  const totals = useMemo(() => line.monthly.map(total), [line.monthly])
  const sum = useMemo(() => totals.reduce((a, b) => a + b, 0), [totals])

  const peakIdx = useMemo(() => {
    return totals.length ? totals.indexOf(Math.max(...totals)) : 0
  }, [totals])

  const caps = useMemo(() => line.capacity.monthly, [line.capacity.monthly])

  const peakSat = useMemo(() => {
    return satRate(totals[peakIdx] ?? 0, caps[peakIdx] ?? 0)
  }, [totals, caps, peakIdx])

  const segments = useMemo(() => segmentsDeVue(view), [view])

  const periodes = useMemo<PeriodeCharge[]>(
    () =>
      line.monthly.map((d, i) => ({
        cle: `m${i}`,
        label: months[i] ?? '',
        valeurs: Object.fromEntries(
          segments.map((s) => {
            const k = s.cle ?? s.serie
            return [k, k in d ? d[k as keyof typeof d] : 0]
          })
        ),
        capacite: caps[i] > 0 ? caps[i] : null,
      })),
    [line.monthly, months, caps, segments]
  )

  // Borne de la tuile : max de l'horizon avec marge haute pour la pastille de pic.
  const max = useMemo(() => Math.max(...totals, ...caps, 0) * 1.1 || 1, [totals, caps])

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex w-[190px] shrink-0 flex-col rounded-lg border bg-card p-3 text-left transition-all hover:-translate-y-px',
        selected
          ? 'border-brand shadow-[0_0_0_2px_var(--color-brand-soft),0_4px_12px_-4px_rgba(0,0,0,.25)]'
          : 'border-rule hover:border-foreground'
      )}
    >
      <div className="mb-1.5 flex items-center gap-2">
        <span className="size-[9px] flex-none rounded-[2px]" style={{ background: line.color }} />
        <div className="min-w-0">
          <div className="font-fraunces text-[14px] font-extrabold leading-none tracking-tight">
            {line.code}
          </div>
          <div className="truncate font-sans text-[10px] text-muted-foreground">{line.name}</div>
        </div>
      </div>
      <HistogrammeCharge
        periodes={periodes}
        segments={segments}
        hauteur={44}
        max={max}
        afficherCapacite={showCapacity}
        afficherAxes={false}
        pic
        largeurInitiale={160}
        ariaLabel={`Charge mensuelle de ${line.code}`}
        ariaDescription={`${sum} heures sur l'horizon, pic ${months[peakIdx] ?? ''} à ${totals[peakIdx] ?? 0} heures`}
      />
      <div className="mt-1.5 flex items-baseline justify-between">
        <span className="font-fraunces text-[16px] font-extrabold tracking-tight">{sum}h</span>
        <span
          className={cn(
            'font-mono text-[9px] font-bold',
            selected && peakSat < 85 && 'text-brand',
            !selected && peakSat < 85 && 'text-suggere'
          )}
          style={{
            color: peakSat >= 85 ? satColor(totals[peakIdx] ?? 0, caps[peakIdx] ?? 0) : undefined,
          }}
        >
          pic {months[peakIdx]} {totals[peakIdx] ?? 0}h
          {caps[peakIdx] > 0 && ` · ${Math.round(peakSat)}%`}
        </span>
      </div>
    </button>
  )
}
