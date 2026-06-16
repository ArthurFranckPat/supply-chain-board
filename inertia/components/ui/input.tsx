import { splitProps, type Component, type ComponentProps } from 'solid-js'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/libs/cn'

const inputVariants = cva(
  'flex w-full rounded-md border border-border bg-card text-sm text-foreground transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50',
  {
    variants: {
      size: { default: 'h-9 px-3', sm: 'h-8 px-2.5 text-xs' },
    },
    defaultVariants: { size: 'default' },
  }
)

export type InputProps = ComponentProps<'input'> & VariantProps<typeof inputVariants>

export const Input: Component<InputProps> = (props) => {
  const [local, rest] = splitProps(props, ['class', 'size'])
  return <input class={cn(inputVariants({ size: local.size }), local.class)} {...rest} />
}
