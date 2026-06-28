import { For, Show, type Component } from 'solid-js'
import { cx } from '@/libs/cva'

/**
 * ChargeHistogram « Papier » — charge d'un poste (hebdo, empilé Ferme/Planifié/Suggéré).
 *
 *  • variant="full" (défaut, design system) : hero total + moyenne h/sem,
 *    barres avec valeurs inscrites, ligne pointillée terra = moyenne, axe total.
 *  • variant="line" (en-tête de poste du board) : plus grand, SANS labels in-bar
 *    ni moyenne (anti-fouillis), axe = n° de semaine seul.
 *
 * Heures absolues, hauteur proportionnelle à `maxHours`.
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

/** Seuil (part du total) en-dessous duquel on n'inscrit pas la charge. */
const LABEL_MIN = 0.18
/** Heures à 2 décimales (virgule FR). */
const fmt = (h: number) => (Math.round(h * 100) / 100).toFixed(2).replace('.', ',')

const Seg: Component<{ bg: string; h: number; label: string | null; ink: string }> = (p) => (
  <div class={cx('flex w-full items-center justify-center', p.bg)} style={{ height: `${p.h}%` }}>
    <Show when={p.label}>
      <span class={cx('font-mono text-[8px] font-bold leading-none', p.ink)}>{p.label}</span>
    </Show>
  </div>
)

export const ChargeHistogram: Component<ChargeHistogramProps> = (props) => {
  const variant = () => props.variant ?? 'full'
  const line = () => variant() === 'line'

  const total = () => props.weeks.reduce((s, w) => s + w.ferme + w.planifie + w.suggere + w.induit, 0)
  const fermeTotal = () => props.weeks.reduce((s, w) => s + w.ferme, 0)
  const induitTotal = () => props.weeks.reduce((s, w) => s + w.induit, 0)
  const moyenne = () => (props.weeks.length ? total() / props.weeks.length : 0)
  const moyH = () => (props.maxHours ? (moyenne() / props.maxHours) * 100 : 0)

  // 'line' : barres flexibles (remplissent la colonne « Poste », largeur variable
  // selon le nombre de semaines) -> jamais de débordement hors de l'en-tête.
  // 'full' : largeur fixe (composant autonome du design system).
  const barW = () => (line() ? 'min-w-0 flex-1 basis-0 max-w-[44px]' : 'w-[34px] shrink-0')
  const barH = () => (line() ? 'h-[72px]' : 'h-[56px]')
  const gap = () => (line() ? 'gap-2' : 'gap-[22px]')

  const lab = (v: number, t: number) =>
    line() || t <= 0 || v / t < LABEL_MIN ? null : `${fmt(v)}h`
  const pct = (v: number, t: number) => (t > 0 ? (v / t) * 100 : 0)

  return (
    <div class={cx('flex flex-col gap-1.5', props.class)}>
      {/* Hero : total horizon (+ moyenne h/sem en 'full') */}
      <div class="flex flex-wrap items-baseline gap-1.5">
        <span class="font-fraunces text-[26px] font-black leading-none tracking-tight text-foreground">
          {fmt(total())}
        </span>
        <span class="text-[10px] font-medium text-muted-foreground">heures</span>
        <Show when={line() && fermeTotal() > 0}>
          <span class="ml-auto inline-flex items-center gap-1 rounded-[5px] bg-ferme/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-ferme">
            <span class="size-1.5 rounded-[2px] bg-ferme" />
            {fmt(fermeTotal())} h ferme
          </span>
        </Show>
        <Show when={line() && induitTotal() > 0}>
          <span
            class="ml-auto inline-flex items-center gap-1 rounded-[5px] px-1.5 py-0.5 font-mono text-[10px] font-bold text-terra"
            style={{ 'background-color': 'rgba(168,67,31,.10)' }}
          >
            <span
              class="size-1.5 rounded-[2px]"
              style={{
                'background-color': 'rgba(168,67,31,.18)',
                'background-image': 'repeating-linear-gradient(45deg, rgba(168,67,31,.5) 0 1px, transparent 1px 3px)',
              }}
            />
            {fmt(induitTotal())} h amont
          </span>
        </Show>
        <Show when={!line()}>
          <span class="ml-auto rounded-[5px] bg-terra-soft px-1.5 py-0.5 font-mono text-[10px] font-bold text-terra">
            moy. {fmt(moyenne())} h/sem
          </span>
        </Show>
      </div>

      {/* Barres empilées arrondies */}
      <div class={cx('relative flex items-end justify-center border-b border-rule-soft px-1', barH(), gap())}>
        <Show when={!line()}>
          <div
            class="pointer-events-none absolute bottom-0 left-1 right-1 border-t-[1.5px] border-dashed border-terra"
            style={{ bottom: `${moyH()}%` }}
          >
            <span class="absolute right-0 -top-[7px] bg-card px-1 font-mono text-[7px] font-bold text-terra">
              {fmt(moyenne())} h
            </span>
          </div>
        </Show>
        <For each={props.weeks}>
          {(w) => {
            const t = w.ferme + w.planifie + w.suggere + w.induit
            const barHeight = props.maxHours ? (t / props.maxHours) * 100 : 0
            return (
              <div
                class={cx('flex flex-col justify-end overflow-hidden rounded-t-[6px]', barW())}
                style={{ height: `${barHeight}%` }}
              >
                {/* Induit (besoin brut depth-1) — hachuré terra, en haut de la barre. */}
                <Show when={w.induit > 0}>
                  <span
                    class="flex w-full items-center justify-center"
                    style={{
                      height: `${pct(w.induit, t)}%`,
                      'background-color': 'rgba(168,67,31,.12)',
                      'background-image':
                        'repeating-linear-gradient(45deg, rgba(168,67,31,.4) 0 1.5px, transparent 1.5px 5px)',
                    }}
                  >
                    <Show when={lab(w.induit, t)}>
                      <span class="font-mono text-[8px] font-bold leading-none text-terra">{lab(w.induit, t)}</span>
                    </Show>
                  </span>
                </Show>
                <Seg bg="bg-suggere" h={pct(w.suggere, t)} label={lab(w.suggere, t)} ink="text-[#3a2a0e]" />
                <Seg bg="bg-planifie" h={pct(w.planifie, t)} label={lab(w.planifie, t)} ink="text-card" />
                <Seg bg="bg-ferme" h={pct(w.ferme, t)} label={lab(w.ferme, t)} ink="text-card" />
              </div>
            )
          }}
        </For>
      </div>

      {/* Axe : n° de semaine (+ total en 'full') */}
      <div class={cx('flex justify-center px-1', gap())}>
        <For each={props.weeks}>
          {(w) => (
            <span
              class={cx(
                'text-center font-mono font-bold text-muted-foreground',
                barW(),
                line() ? 'text-[10px]' : 'text-[8px]',
              )}
            >
              S{w.week}
              <Show when={!line()}> · {fmt(w.ferme + w.planifie + w.suggere + w.induit)}h</Show>
              {/* En-tête de poste (line) : charge hebdo sous le n° de semaine. */}
              <Show when={line()}>
                <span class="block text-[9px] font-bold tabular-nums text-foreground">
                  {fmt(w.ferme + w.planifie + w.suggere + w.induit)} h
                </span>
              </Show>
            </span>
          )}
        </For>
      </div>
    </div>
  )
}

export default ChargeHistogram
