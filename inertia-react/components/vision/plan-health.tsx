import { useMemo } from 'react'
import { cn } from '@r/lib/utils'

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
  nbRetards: number
  nbLimites: number
  nbRuptures: number
  rupturesAvailable: boolean
  nbSansLien: number
  onSelect: (cat: HealthCategory) => void
}) {
  const badges = useMemo<Badge[]>(() => {
    const { nbRetards, nbLimites, nbRuptures, rupturesAvailable, nbSansLien } = props
    return [
      {
        key: 'retards',
        count: nbRetards,
        label: nbRetards === 0 ? '✓ 0 retard' : `${nbRetards} retard${nbRetards > 1 ? 's' : ''}`,
        tone: nbRetards === 0 ? 'okz' : 'crit',
        clickable: nbRetards > 0,
      },
      {
        key: 'limites',
        count: nbLimites,
        label: nbLimites === 0 ? '✓ 0 limite' : `${nbLimites} limite${nbLimites > 1 ? 's' : ''}`,
        tone: nbLimites === 0 ? 'okz' : 'warn',
        clickable: nbLimites > 0,
      },
      {
        key: 'ruptures',
        count: nbRuptures,
        label: !rupturesAvailable
          ? 'Ruptures ?'
          : nbRuptures === 0
            ? '✓ 0 rupture'
            : `${nbRuptures} rupture${nbRuptures > 1 ? 's' : ''}`,
        tone: !rupturesAvailable ? 'mut' : nbRuptures === 0 ? 'okz' : 'crit',
        clickable: rupturesAvailable && nbRuptures > 0,
      },
      {
        key: 'sanslien',
        count: nbSansLien,
        label: nbSansLien === 0 ? '✓ 0 sans lien' : `${nbSansLien} sans lien`,
        tone: nbSansLien === 0 ? 'okz' : 'mut',
        clickable: nbSansLien > 0,
      },
    ]
  }, [props.nbRetards, props.nbLimites, props.nbRuptures, props.rupturesAvailable, props.nbSansLien])

  return (
    <>
      {badges.map((b) => (
        <button
          key={b.key}
          type="button"
          disabled={!b.clickable}
          onClick={() => b.clickable && props.onSelect(b.key as HealthCategory)}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-2xs font-bold transition-colors',
            TONE_CLASS[b.tone],
            b.clickable ? 'cursor-pointer hover:opacity-80' : 'cursor-default'
          )}
          aria-label={b.label}
        >
          <span className={cn('size-1.5 rounded-full', DOT_CLASS[b.tone])} />
          {b.label}
        </button>
      ))}
    </>
  )
}
