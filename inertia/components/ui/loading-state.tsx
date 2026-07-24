import type { ComponentProps } from 'solid-js'
import { Show, splitProps } from 'solid-js'
import { Spinner, type SpinnerProps } from './spinner'

export interface LoadingStateProps extends ComponentProps<'div'> {
  title?: string
  description?: string
  spinnerSize?: SpinnerProps['size']
  spinnerVariant?: SpinnerProps['variant']
  compact?: boolean
}

export const LoadingState = (props: LoadingStateProps) => {
  const [local, rest] = splitProps(props, [
    'class',
    'title',
    'description',
    'spinnerSize',
    'spinnerVariant',
    'compact',
  ])

  const title = () => local.title ?? 'Chargement des données...'
  const compact = () => local.compact ?? false

  return (
    <div
      data-slot="loading-state"
      class={`flex flex-col items-center justify-center text-center animate-in fade-in-50 duration-200 ${
        compact() ? 'py-6 gap-2' : 'py-16 gap-3.5 px-4'
      } ${local.class || ''}`}
      {...rest}
    >
      <div class="relative flex items-center justify-center">
        <Spinner size={local.spinnerSize || 'lg'} variant={local.spinnerVariant || 'brand'} />
      </div>
      <Show when={title() || local.description}>
        <div class="space-y-1 max-w-xs">
          <Show when={title()}>
            <p class={`font-medium tracking-tight text-foreground ${compact() ? 'text-xs' : 'text-sm'}`}>
              {title()}
            </p>
          </Show>
          <Show when={local.description}>
            <p class="text-xs text-muted-foreground leading-relaxed">
              {local.description}
            </p>
          </Show>
        </div>
      </Show>
    </div>
  )
}
