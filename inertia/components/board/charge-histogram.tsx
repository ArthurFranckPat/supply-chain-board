import { For, Show, type Component } from 'solid-js'
import { cx } from '@/libs/cva'

/**
 * ChargeHistogram « Papier » — en-tête de charge d'un poste.
 *
 * Histogramme hebdo : une barre étroite et arrondie par semaine, empilée
 * Ferme (bas) / Planifié (milieu) / Suggéré (haut), avec la charge de chaque
 * statut inscrite dans son segment. Hero = total horizon + moyenne h/sem ;
 * ligne pointillée terra = moyenne h/sem ; axe = total hebdo.
 *
 * Heures absolues (pas de capacité par ligne). La hauteur des barres est
 * proportionnelle à `maxHours` (ex. le total hebdo le plus élevé du board).
 */

export type ChargeWeek = {
  week: number
  ferme: number
  planifie: number
  suggere: number
}

export type ChargeHistogramProps = {
  weeks: ChargeWeek[]
  /** Heures servant d'échelle pour la hauteur des barres (max du board). */
  maxHours: number
  class?: string
}

/** Seuil (part du total) en-dessous duquel on n'inscrit pas la charge. */
const LABEL_MIN = 0.18

const fmt = (h: number) => (Math.round(h * 10) / 10).toString().replace('.', ',')

const Seg: Component<{ bg: string; h: number; label: string | null; ink: string }> = (p) => (
  <div class={cx('flex w-full items-center justify-center', p.bg)} style={{ height: `${p.h}%` }}>
    <Show when={p.label}>
      <span class={cx('font-mono text-[8px] font-bold leading-none', p.ink)}>{p.label}</span>
    </Show>
  </div>
)

export const ChargeHistogram: Component<ChargeHistogramProps> = (props) => {
  const total = () =>
    props.weeks.reduce((s, w) => s + w.ferme + w.planifie + w.suggere, 0)
  const moyenne = () => (props.weeks.length ? total() / props.weeks.length : 0)
  const moyH = () => (props.maxHours ? (moyenne() / props.maxHours) * 100 : 0)

  return (
    <div class={cx('flex flex-col gap-1.5', props.class)}>
      {/* Hero : total horizon + moyenne h/sem */}
      <div class="flex flex-wrap items-baseline gap-1.5">
        <span class="font-fraunces text-[26px] font-black leading-none tracking-tight text-foreground">
          {total()}
        </span>
        <span class="text-[10px] font-medium text-muted-foreground">heures</span>
        <span class="ml-auto rounded-[5px] bg-terra-soft px-1.5 py-0.5 font-mono text-[10px] font-bold text-terra">
          moy. {fmt(moyenne())} h/sem
        </span>
      </div>

      {/* Barres empilées arrondies */}
      <div class="relative flex h-[56px] items-end justify-center gap-[22px] border-b border-rule-soft px-1">
        <div
          class="pointer-events-none absolute bottom-0 left-1 right-1 border-t-[1.5px] border-dashed border-terra"
          style={{ bottom: `${moyH()}%` }}
        >
          <span class="absolute right-0 -top-[7px] bg-card px-1 font-mono text-[7px] font-bold text-terra">
            {fmt(moyenne())} h
          </span>
        </div>
        <For each={props.weeks}>
          {(w) => {
            const t = w.ferme + w.planifie + w.suggere
            const barH = props.maxHours ? (t / props.maxHours) * 100 : 0
            const lab = (v: number) => (t > 0 && v / t >= LABEL_MIN ? `${v}h` : null)
            const pct = (v: number) => (t > 0 ? (v / t) * 100 : 0)
            return (
              <div
                class="flex w-[34px] shrink-0 flex-col justify-end overflow-hidden rounded-t-[6px]"
                style={{ height: `${barH}%` }}
              >
                <Seg bg="bg-suggere" h={pct(w.suggere)} label={lab(w.suggere)} ink="text-[#3a2a0e]" />
                <Seg bg="bg-planifie" h={pct(w.planifie)} label={lab(w.planifie)} ink="text-card" />
                <Seg bg="bg-ferme" h={pct(w.ferme)} label={lab(w.ferme)} ink="text-card" />
              </div>
            )
          }}
        </For>
      </div>

      {/* Axe : total hebdo */}
      <div class="flex justify-center gap-[22px] px-1">
        <For each={props.weeks}>
          {(w) => {
            const t = w.ferme + w.planifie + w.suggere
            return (
              <span class="w-[34px] shrink-0 text-center font-mono text-[8px] font-bold text-muted-foreground">
                S{w.week} · {t}h
              </span>
            )
          }}
        </For>
      </div>
    </div>
  )
}

export default ChargeHistogram
