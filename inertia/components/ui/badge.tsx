import { splitProps, type Component, type ComponentProps } from 'solid-js'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/libs/cn'

/**
 * Badge — primitive shadcn-solid (port manuel, Tailwind v4 + tokens @theme).
 */
const badgeVariants = cva(
  'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold transition-colors',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        destructive: 'border-transparent bg-destructive text-destructive-foreground',
        outline: 'border-border text-foreground',
        success: 'border-transparent bg-emerald-500 text-white',
        warning: 'border-transparent bg-amber-500 text-white',
      },
    },
    defaultVariants: { variant: 'default' },
  }
)

export type BadgeProps = ComponentProps<'span'> & VariantProps<typeof badgeVariants>

export const Badge: Component<BadgeProps> = (props) => {
  const [local, rest] = splitProps(props, ['class', 'variant'])
  return <span class={cn(badgeVariants({ variant: local.variant }), local.class)} {...rest} />
}
