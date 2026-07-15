import { For, type Accessor } from 'solid-js'
import { cx } from '@/libs/cva'

/**
 * Programme v2 — santé du plan. 4 badges toujours rendus (zéro CLS) :
 * retards, limites, ruptures (opt-in), sans-lien. Clic sur un badge = ouvre
 * le rail filtré sur cette catégorie.
 *
 * L'absence d'un problème est une information : « ✓ 0 retard » au lieu d'un
 * badge absent. Les ruptures restent neutres (« ? ») tant que la faisabilité
 * n'a pas tourné — on ne fake pas un compte qu'on n'a pas.
 */

type Tone = 'crit' | 'warn' | 'okz' | 'mut'

const TONE_CLASS: Record<Tone, string> = {
  crit: 'bg-error/10 text-error',
  warn: 'bg-amber-500/10 text-amber-600',
  okz: 'bg-ferme/10 text-ferme',
  mut: 'bg-muted text-muted-foreground',
}
const DOT_CLASS: Record<Tone, string> = {
  crit: 'bg-error',
  warn: 'bg-amber-500',
  okz: 'bg-ferme',
  mut: 'bg-muted-foreground',
}

interface Badge {
  key: string
  count: number
  label: string
  tone: Tone
  /** Indique si un clic filtre le rail (count > 0 et catégorie rail-able). */
  clickable: boolean
}

export type HealthCategory = 'retards' | 'limites' | 'ruptures' | 'sanslien'

export function PlanHealth(props: {
  nbRetards: Accessor<number>
  nbLimites: Accessor<number>
  nbRuptures: Accessor<number>
  rupturesAvailable: Accessor<boolean>
  nbSansLien: Accessor<number>
  onSelect: (cat: HealthCategory) => void
}) {
  const badges = (): Badge[] => {
    const retards = props.nbRetards()
    const limites = props.nbLimites()
    const ruptures = props.nbRuptures()
    const sansLien = props.nbSansLien()
    const ruptOk = props.rupturesAvailable()
    return [
      {
        key: 'retards',
        count: retards,
        label: retards === 0 ? '✓ 0 retard' : `${retards} retard${retards > 1 ? 's' : ''}`,
        tone: retards === 0 ? 'okz' : 'crit',
        clickable: retards > 0,
      },
      {
        key: 'limites',
        count: limites,
        label: limites === 0 ? '✓ 0 limite' : `${limites} limite${limites > 1 ? 's' : ''}`,
        tone: limites === 0 ? 'okz' : 'warn',
        clickable: limites > 0,
      },
      {
        key: 'ruptures',
        count: ruptures,
        label: !ruptOk
          ? 'Ruptures ?'
          : ruptures === 0
            ? '✓ 0 rupture'
            : `${ruptures} rupture${ruptures > 1 ? 's' : ''}`,
        tone: !ruptOk ? 'mut' : ruptures === 0 ? 'okz' : 'crit',
        clickable: ruptOk && ruptures > 0,
      },
      {
        key: 'sanslien',
        count: sansLien,
        label: sansLien === 0 ? '✓ 0 sans lien' : `${sansLien} sans lien`,
        tone: sansLien === 0 ? 'okz' : 'mut',
        clickable: sansLien > 0,
      },
    ]
  }
  return (
    <For each={badges()}>
      {(b) => (
        <button
          type="button"
          disabled={!b.clickable}
          onClick={() => b.clickable && props.onSelect(b.key as HealthCategory)}
          class={cx(
            'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-2xs font-bold transition-colors',
            TONE_CLASS[b.tone],
            b.clickable ? 'cursor-pointer hover:opacity-80' : 'cursor-default'
          )}
          aria-label={b.label}
        >
          <span class={cx('size-1.5 rounded-full', DOT_CLASS[b.tone])} />
          {b.label}
        </button>
      )}
    </For>
  )
}
