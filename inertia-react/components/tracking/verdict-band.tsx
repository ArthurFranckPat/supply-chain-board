/**
 * Bandeau de synthèse par verdict (référence obvia-07-about) : quatre grands
 * chiffres tabulaires, chacun surmonté d'un liseré de sa couleur de verdict, et
 * chacun bouton filtre du tableau. Les chiffres viennent du moteur.
 */
import type { CSSProperties } from 'react'

import { cn } from '@r/lib/utils'
import type { ProactiveVerdictCounts, ProactiveVerdictKey } from '@r/lib/suivi/types'
import { VERDICT_GROUPS } from '@r/lib/suivi/proactive-design'

export interface VerdictBandProps {
  counts: ProactiveVerdictCounts
  loading: boolean
  selected: ReadonlySet<ProactiveVerdictKey>
  onToggleGroup: (keys: readonly ProactiveVerdictKey[]) => void
}

const rank = (i: number) => ({ '--i': i, '--enter-base': '280ms' }) as CSSProperties

export function VerdictBand(props: VerdictBandProps) {
  return (
    <section
      id="verdict_band"
      aria-labelledby="verdict_band_title"
      data-print-hide
      className="scroll-mt-2 px-4 py-7 sm:px-7 sm:py-8 print:hidden"
    >
      <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        Synthèse par verdict
      </p>
      <h2
        id="verdict_band_title"
        data-section-title
        tabIndex={-1}
        className="mt-3 max-w-[42%] text-[24px] font-bold leading-[1.15] tracking-[-0.01em] text-foreground outline-none max-sm:max-w-none sm:max-w-[60%] sm:text-[28px] xl:max-w-[42%] xl:text-[30px]"
      >
        Combien de commandes tiennent leur date d'expédition ?
      </h2>
      <p className="mt-2 text-[14px] text-muted-foreground">
        Chaque compteur filtre le tableau. Un second clic retire le filtre.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4 xl:gap-6">
        {VERDICT_GROUPS.map((g, i) => {
          const count = g.keys.reduce((n, k) => n + props.counts[k], 0)
          const on = g.keys.every((k) => props.selected.has(k))
          return (
            <button
              key={g.id}
              type="button"
              aria-pressed={on}
              aria-label={`${g.action} : ${props.loading ? 'chargement' : count}`}
              onClick={() => props.onToggleGroup(g.keys)}
              style={rank(i)}
              className={cn(
                'suivi-enter relative flex min-h-24 flex-col justify-end overflow-hidden rounded-[14px] px-4 pb-4 pt-5 text-left transition-[background-color,box-shadow,transform] duration-150 ease-out active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground',
                on
                  ? 'bg-brand-soft shadow-[0_0_0_2px_var(--foreground)]'
                  : 'bg-secondary hover:bg-muted'
              )}
            >
              <span className={cn('absolute inset-x-0 top-0 h-[3px]', g.bar)} aria-hidden="true" />
              {props.loading ? (
                <span
                  className="h-11 w-16 animate-pulse rounded-md bg-foreground/[0.08] sm:h-12 xl:h-14"
                  aria-hidden="true"
                />
              ) : (
                <span className="text-[44px] font-bold leading-none tabular-nums text-foreground sm:text-[48px] xl:text-[56px]">
                  {count}
                </span>
              )}
              <span className="mt-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                {g.label}
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
