import { useMemo } from 'react'
import { HistogrammeCharge, type PeriodeCharge, type SegmentCharge } from '@r/components/ui/chart'
import { cn } from '@r/lib/utils'

/**
 * ChargeHistogram — charge d'un poste (hebdo, empilé Ferme/Planifié/Suggéré).
 *
 *  • variant="full" (défaut, design system) : hero total + moyenne h/sem,
 *    barres avec valeurs inscrites, ligne pointillée = moyenne, totaux sous l'axe.
 *  • variant="line" (en-tête de poste du board) : plus grand, SANS labels in-bar
 *    ni moyenne (anti-fouillis), charge hebdo sous le n° de semaine.
 *
 * Les barres passent par HistogrammeCharge (@tanstack/charts) : le domaine
 * `[0, maxHours]` est déclaré et partagé entre tous les postes du board — c'est
 * lui qui rend deux colonnes comparables. Hero et axe restent du HTML : ce sont
 * des textes, pas des marques.
 */

export type ChargeWeek = {
  week: number
  ferme: number
  planifie: number
  suggere: number
  /** Besoin brut induit (depth-1) — pas une commande, charge dérivée. */
  induit: number
}

export type ChargeHistogramProps = {
  weeks: ChargeWeek[]
  /** Heures servant d'échelle pour la hauteur des barres (max du board). */
  maxHours: number
  variant?: 'full' | 'line'
  class?: string
}

/** Heures à 2 décimales (virgule FR). */
const fmt = (h: number) => (Math.round(h * 100) / 100).toFixed(2).replace('.', ',')

/** Segments de la pile, du bas vers le haut — l'induit n'existe que s'il pèse. */
function segments(weeks: ChargeWeek[]): SegmentCharge[] {
  const base: SegmentCharge[] = [
    { cle: 'ferme', serie: 'ferme', label: 'Ferme' },
    { cle: 'planifie', serie: 'planifie', label: 'Planifié' },
    { cle: 'suggere', serie: 'suggere', label: 'Suggéré' },
  ]
  if (weeks.some((w) => w.induit > 0))
    base.push({ cle: 'induit', serie: 'induit', label: 'Induit' })
  return base
}

const periodes = (weeks: ChargeWeek[]): PeriodeCharge[] =>
  weeks.map((w) => ({
    cle: String(w.week),
    label: `S${w.week}`,
    valeurs: { ferme: w.ferme, planifie: w.planifie, suggere: w.suggere, induit: w.induit },
  }))

export function ChargeHistogram(props: ChargeHistogramProps) {
  const variant = props.variant ?? 'full'
  const line = variant === 'line'

  const totals = useMemo(() => {
    const total = props.weeks.reduce((s, w) => s + w.ferme + w.planifie + w.suggere + w.induit, 0)
    const fermeTotal = props.weeks.reduce((s, w) => s + w.ferme, 0)
    const induitTotal = props.weeks.reduce((s, w) => s + w.induit, 0)
    const moyenne = props.weeks.length ? total / props.weeks.length : 0
    return { total, fermeTotal, induitTotal, moyenne }
  }, [props.weeks])

  const axe = line ? 'text-[10px]' : 'text-[8px]'
  const totalSem = (w: ChargeWeek) => w.ferme + w.planifie + w.suggere + w.induit
  return (
    <div className={cn('flex flex-col gap-1.5', props.class)}>
      {/* Hero : total horizon (+ moyenne h/sem en 'full').
          En-tête de poste : le chiffre passe en mono tabular au palier
          `cell-lg` de l'échelle micro. À 26 px en display noir, il pesait plus
          que le code du poste — une charge n'est pas l'identité de la ligne —
          et deux postes voisins ne s'alignaient pas, faute de chasse fixe. */}
      <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
        <span
          className={cn(
            'leading-none tracking-tight text-foreground tabular-nums',
            line ? 'font-mono text-[17px] font-bold' : 'font-fraunces text-[26px] font-black'
          )}
        >
          {fmt(totals.total)}
        </span>
        <span className="text-[10px] font-medium text-muted-foreground">heures</span>
        {/* Décomposition du total, sur la même ligne de base et dans la même
            chasse : `ml-auto` la renvoyait à la ligne suivante dès que le hero
            était large, où elle se posait par-dessus le graphe. */}
        {line && totals.fermeTotal > 0 && (
          <span className="font-mono text-[10px] font-bold tabular-nums text-ferme">
            · {fmt(totals.fermeTotal)} h ferme
          </span>
        )}
        {line && totals.induitTotal > 0 && (
          <span className="font-mono text-[10px] font-bold tabular-nums text-muted-foreground">
            · {fmt(totals.induitTotal)} h amont
          </span>
        )}
        {!line && (
          <span className="ml-auto rounded-[5px] bg-brand-soft px-1.5 py-0.5 font-mono text-[10px] font-bold text-brand">
            moy. {fmt(totals.moyenne)} h/sem
          </span>
        )}
      </div>

      {/* Barres empilées — domaine partagé, axes muets (l'axe est en HTML dessous). */}
      <HistogrammeCharge
        periodes={periodes(props.weeks)}
        segments={segments(props.weeks)}
        max={props.maxHours}
        hauteur={line ? 72 : 56}
        afficherAxes={false}
        afficherCapacite={false}
        labelsEnBarre={!line}
        format={(v) => `${fmt(v)}h`}
        regles={line ? [] : [{ valeur: totals.moyenne }]}
        largeurInitiale={line ? 220 : 300}
        ariaLabel={`Charge hebdomadaire du poste, ${fmt(totals.total)} heures sur l'horizon`}
      />

      {/* Axe : n° de semaine (+ total en 'full', charge hebdo en 'line').
          Sans gap : les centres des colonnes doivent tomber exactement sous
          les bandes du graphe — un `gap` HTML les décale progressivement. */}
      <div className="flex overflow-hidden px-1">
        {props.weeks.map((w) => (
          <span
            key={w.week}
            className={cn(
              'min-w-0 flex-1 basis-0 text-center font-mono font-bold text-muted-foreground',
              line ? 'text-3xs' : axe
            )}
          >
            S{w.week}
            {!line && ` · ${fmt(totalSem(w))}h`}
            {/* En-tête de poste (line) : charge hebdo sous le n° de semaine.
                La valeur porte l'encre et la taille, la semaine n'est que son
                étiquette — l'inverse mettait le repère au-dessus de la donnée.
                Semaine vide : un tiret. « 0,00 h » occupe la place d'un chiffre
                pour dire qu'il n'y en a pas. */}
            {line && (
              <span className="block truncate text-2xs font-bold tabular-nums text-foreground">
                {totalSem(w) > 0 ? `${fmt(totalSem(w))} h` : '—'}
              </span>
            )}
          </span>
        ))}
      </div>
    </div>
  )
}

export default ChargeHistogram
