import type { ComponentProps } from 'solid-js'
import { splitProps } from 'solid-js'

export interface SwitchProps extends ComponentProps<'button'> {
  checked?: boolean
  onCheckedChange?: (checked: boolean) => void
}

export const Switch = (props: SwitchProps) => {
  const [local, rest] = splitProps(props, ['class', 'checked', 'onCheckedChange'])

  return (
    <button
      type="button"
      role="switch"
      aria-checked={local.checked}
      onClick={() => local.onCheckedChange?.(!local.checked)}
      data-slot="switch"
      class={`peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        local.checked ? 'bg-primary' : 'bg-input'
      } ${local.class || ''}`}
      {...rest}
    >
      <span
        data-slot="switch-thumb"
        class={`pointer-events-none block size-5 rounded-full bg-background shadow-xs ring-0 transition-transform ${
          local.checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  )
}
