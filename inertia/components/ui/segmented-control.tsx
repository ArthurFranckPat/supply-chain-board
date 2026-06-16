import { For, type Component } from 'solid-js'
import { cn } from '@/libs/cn'

/**
 * Contrôle segmenté (segmented control) — alternative compacte à des boutons
 * indépendants pour un choix mutuellement exclusif (ex: mode d'allocation).
 * Inspiration shadcn ; implémentation Solid légère (pas de dépendance Kobalte).
 */
export interface SegmentedOption<T extends string> {
  value: T
  label: string
  title?: string
}

export const SegmentedControl: Component<{
  options: SegmentedOption<string>[]
  value: string
  onChange: (v: string) => void
  class?: string
}> = (props) => {
  return (
    <div class={cn('inline-flex items-center bg-muted/60 p-0.5 rounded-lg border border-border', props.class)}>
      <For each={props.options}>
        {(opt) => (
          <button
            type="button"
            title={opt.title}
            onClick={() => props.onChange(opt.value)}
            class={cn(
              'px-2.5 h-7 text-[11px] font-bold rounded-md uppercase tracking-wider transition-all',
              props.value === opt.value
                ? 'bg-card text-primary shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {opt.label}
          </button>
        )}
      </For>
    </div>
  )
}
