import * as React from "react"

import { cx } from "@r/lib/cx"

// Bubble — Lot 4 (issue #90). Plus de Base UI (mergeProps/useRender) ni cva.
// Refactor en divs natifs + lookup records pour les variants.

const BUBBLE_BASE =
  "group/bubble relative flex w-fit max-w-[80%] min-w-0 flex-col gap-1 group-data-[align=end]/message:self-end data-[align=end]:self-end data-[variant=ghost]:max-w-full"

const BUBBLE_VARIANT: Record<string, string> = {
  default:
    "*:data-[slot=bubble-content]:bg-primary *:data-[slot=bubble-content]:text-primary-foreground [&>[data-slot=bubble-content]:is(button,a):hover]:bg-primary/80",
  secondary:
    "*:data-[slot=bubble-content]:bg-secondary *:data-[slot=bubble-content]:text-secondary-foreground [&>[data-slot=bubble-content]:is(button,a):hover]:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)]",
  muted:
    "*:data-[slot=bubble-content]:bg-muted [&>[data-slot=bubble-content]:is(button,a):hover]:bg-[color-mix(in_oklch,var(--muted),var(--foreground)_5%)]",
  tinted:
    "*:data-[slot=bubble-content]:bg-[oklch(from_var(--primary)_0.93_calc(c*0.4)_h)] *:data-[slot=bubble-content]:text-foreground dark:*:data-[slot=bubble-content]:bg-[oklch(from_var(--primary)_0.3_calc(c*0.4)_h)] [&>[data-slot=bubble-content]:is(button,a):hover]:bg-[oklch(from_var(--primary)_0.88_calc(c*0.5)_h)] dark:[&>[data-slot=bubble-content]:is(button,a):hover]:bg-[oklch(from_var(--primary)_0.35_calc(c*0.5)_h)]",
  outline:
    "*:data-[slot=bubble-content]:bg-card *:data-[slot=bubble-content]:text-card-foreground [&>[data-slot=bubble-content]:is(button,a):hover]:bg-muted",
  ghost: "",
}

const BUBBLE_REACTIONS_BASE =
  "absolute z-10 flex w-fit shrink-0 items-center justify-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-sm ring-3 ring-card has-[button]:p-0"
const BUBBLE_REACTIONS_SIDE: Record<string, string> = {
  top: "top-0 -translate-y-3/4",
  bottom: "bottom-0 translate-y-3/4",
}
const BUBBLE_REACTIONS_ALIGN: Record<string, string> = {
  start: "left-3",
  end: "right-3",
}

function BubbleGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="bubble-group"
      className={cx("flex min-w-0 flex-col gap-2", className)}
      {...props}
    />
  )
}

function Bubble({
  variant = "default",
  align = "start",
  className,
  ...props
}: React.ComponentProps<"div"> & {
  variant?: "default" | "secondary" | "muted" | "tinted" | "outline" | "ghost"
  align?: "start" | "end"
}) {
  return (
    <div
      data-slot="bubble"
      data-variant={variant}
      data-align={align}
      className={cx(BUBBLE_BASE, BUBBLE_VARIANT[variant], className)}
      {...props}
    />
  )
}

function BubbleContent({
  className,
  render,
  ...props
}: React.ComponentProps<"div"> & { render?: React.ReactElement }) {
  const baseClass = cx(
    "w-fit max-w-full min-w-0 overflow-hidden rounded-xl border border-transparent px-3 py-2 text-sm leading-relaxed wrap-break-word group-data-[align=end]/bubble:self-end [button]:text-left [button,a]:transition-colors [button,a]:outline-none [button,a]:focus-visible:border-ring [button,a]:focus-visible:ring-3 [button,a]:focus-visible:ring-ring/50",
    className
  )
  if (render) {
    return React.cloneElement(render, {
      "data-slot": "bubble-content",
      className: cx(baseClass, (render.props as Record<string, unknown>).className as string | undefined),
      ...props,
    } as Record<string, unknown>)
  }
  return (
    <div data-slot="bubble-content" className={baseClass} {...props} />
  )
}

function BubbleReactions({
  side = "bottom",
  align = "end",
  className,
  ...props
}: React.ComponentProps<"div"> & {
  align?: "start" | "end"
  side?: "top" | "bottom"
}) {
  return (
    <div
      data-slot="bubble-reactions"
      data-align={align}
      data-side={side}
      className={cx(BUBBLE_REACTIONS_BASE, BUBBLE_REACTIONS_SIDE[side], BUBBLE_REACTIONS_ALIGN[align], className)}
      {...props}
    />
  )
}

export { BubbleGroup, Bubble, BubbleContent, BubbleReactions }
