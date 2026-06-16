import type { ComponentProps, ValidComponent } from "solid-js"
import { splitProps } from "solid-js"
import { Badge as BadgePrimitive } from "@kobalte/core/badge"
import type { VariantProps } from "cva"

import { cva } from "@/libs/cva"

export const badgeVariants = cva({
  base: "inline-flex items-center justify-center rounded-md border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden",
  variants: {
    variant: {
      default:
        "border-transparent bg-primary text-primary-foreground [a&]:hover:bg-primary/90",
      secondary:
        "border-transparent bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90",
      destructive:
        "border-transparent bg-destructive text-white [a&]:hover:bg-destructive/90 focus-visible:ring-destructive/20",
      outline:
        "text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
      success:
        "border-transparent bg-emerald-500/15 text-emerald-700 [a&]:hover:bg-emerald-500/25",
      warning:
        "border-transparent bg-amber-500/15 text-amber-700 [a&]:hover:bg-amber-500/25",
    },
  },
  defaultVariants: {
    variant: "default",
  },
})

export type BadgeProps<T extends ValidComponent = "span"> = ComponentProps<
  typeof BadgePrimitive<T>
> &
  VariantProps<typeof badgeVariants>

export const Badge = <T extends ValidComponent = "span">(
  props: BadgeProps<T>,
) => {
  const [, rest] = splitProps(props as BadgeProps, ["class", "variant"])

  return (
    <BadgePrimitive
      data-slot="badge"
      class={badgeVariants({
        variant: props.variant,
        class: props.class,
      })}
      {...rest}
    />
  )
}
