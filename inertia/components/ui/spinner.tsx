import type { ComponentProps } from 'solid-js'
import { splitProps } from 'solid-js'
import { cva, type VariantProps } from '@/libs/cva'

export const spinnerVariants = cva({
  base: 'animate-spin shrink-0 transition-opacity',
  variants: {
    variant: {
      default: 'text-muted-foreground',
      brand: 'text-primary',
      muted: 'text-muted-foreground/40',
      white: 'text-white',
      current: 'text-current',
    },
    size: {
      xs: 'size-3',
      sm: 'size-4',
      md: 'size-5',
      lg: 'size-7',
      xl: 'size-9',
    },
  },
  defaultVariants: {
    variant: 'default',
    size: 'md',
  },
})

export type SpinnerProps = ComponentProps<'svg'> & VariantProps<typeof spinnerVariants>

export const Spinner = (props: SpinnerProps) => {
  const [local, rest] = splitProps(props, ['class', 'variant', 'size'])

  return (
    <svg
      data-slot="spinner"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class={spinnerVariants({
        variant: local.variant,
        size: local.size,
        class: local.class,
      })}
      {...rest}
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  )
}
