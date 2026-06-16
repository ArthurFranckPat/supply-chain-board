import type { Component, ComponentProps } from 'solid-js'
import { splitProps } from 'solid-js'
import { cn } from '@/libs/cn'

/** Séparateur horizontal/vertical (shadcn). */
export const Separator: Component<ComponentProps<'div'> & { orientation?: 'horizontal' | 'vertical' }> = (
  props
) => {
  const [local, rest] = splitProps(props, ['class', 'orientation'])
  return (
    <div
      role="separator"
      aria-orientation={local.orientation ?? 'horizontal'}
      class={cn(
        'bg-border shrink-0',
        (local.orientation ?? 'horizontal') === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
        local.class
      )}
      {...rest}
    />
  )
}
