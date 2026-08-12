import { useMemo } from 'react'
import { HistogrammeCharge, type PeriodeCharge } from '@r/components/ui/chart'
import { cn } from '@r/lib/utils'
import type { LoadLine, LoadView } from '@r/lib/load/types'
import { satRate, segmentsDeVue, total } from '@r/lib/load/chart-math'

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

  /**
   * Gravité du pic. Elle ne passe plus par `satColor()` : celui-ci rend
   * `var(--color-danger)` / `var(--color-warn)`, deux tokens qui ne sont
   * déclarés dans aucune feuille — la valeur était invalide et la couleur
   * retombait sur l'héritage, donc un pic à 130 % se peignait comme un pic
   * sain. Mêmes paliers que `satColor` (> 100 %, ≥ 85 %), en tokens du thème.
   * Sous les 85 %, un pic n'est pas un signal : il reste tertiaire.
   */
  const peakTone =
    peakSat > 100 ? 'text-destructive' : peakSat >= 85 ? 'text-suggere' : 'text-muted-foreground'

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex w-[190px] shrink-0 flex-col rounded-lg border bg-card p-3 text-left transition-all hover:-translate-y-px',
        selected
          ? 'border-brand shadow-[0_0_0_2px_var(--color-brand-soft)]'
          : 'border-rule hover:border-foreground/30'
      )}
    >
      <div className="mb-1.5 flex items-center gap-2">
        <span
          aria-hidden="true"
          className="size-[9px] flex-none rounded-[2px]"
          style={{ background: line.color }}
        />
        {/* Échelle micro (app.css) : `cell-lg` (13 px, « valeurs emphase ») pour
            l'identité du poste, `2xs` (10 px) pour son libellé. Le code est un
            identifiant : chasse fixe, comme partout ailleurs. Plus de serif —
            `font-fraunces` est la grammaire Airbnb. */}
        <div className="min-w-0">
          <div className="font-mono text-cell-lg font-bold leading-none tracking-tight text-foreground">
            {line.code}
          </div>
          <div className="truncate text-2xs text-muted-foreground">{line.name}</div>
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
      <div className="mt-1.5 flex items-baseline justify-between gap-2">
        <span className="font-mono text-cell-lg font-bold tracking-tight tabular-nums text-foreground">
          {sum} h
        </span>
        {/* Le pic est un repère, pas une valeur : palier `3xs` (9 px). */}
        <span className={cn('truncate font-mono text-3xs font-bold tabular-nums', peakTone)}>
          pic {months[peakIdx]} {totals[peakIdx] ?? 0} h
          {caps[peakIdx] > 0 && ` · ${Math.round(peakSat)} %`}
        </span>
      </div>
    </button>
  )
}
