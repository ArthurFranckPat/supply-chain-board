import { splitProps, type ComponentProps } from 'solid-js'
import { cx } from '@/libs/cva'

/**
 * Skeleton shadcn — placeholder animé pour les états de chargement.
 *
 * Issue #62 (lot 6) : la page /programme n'avait aucun skeleton au montage
 * (cache TTL 5 min → 5-10 s possibles au premier chargement), juste l'état
 * vide « Aucun OF dans l'horizon » — indissociable d'un board réellement vide.
 */
export type SkeletonProps = ComponentProps<'div'>

export function Skeleton(props: SkeletonProps) {
  const [, rest] = splitProps(props, ['class'])
  return (
    <div
      data-slot="skeleton"
      class={cx('animate-pulse rounded-md bg-muted', props.class)}
      {...rest}
    />
  )
}
