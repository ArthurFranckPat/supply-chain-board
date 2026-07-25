import * as React from "react"
import { Card as AstryxCard } from "@astryxdesign/core/Card"

import { cx } from "@r/lib/cx"

/** Spacing scale Astryx (cf. @astryxdesign/core/utils/types SpacingStep). */
type SpacingStep = 0 | 0.5 | 1 | 1.5 | 2 | 3 | 4 | 5 | 6 | 8 | 10

// Card — Lot 4 (issue #90). Wrapper @astryxdesign/core/Card. Plus de cva :
// les variants sont des records simples.

const CARD_BASE =
  "flex flex-col gap-2 rounded-lg border bg-card text-card-foreground transition-all duration-200 ease-out hover:border-border/90 hover:shadow-md"
const CARD_ELEVATION: Record<string, string> = { flat: "", raised: "shadow-float" }
const CARD_PADDING_CLASS: Record<string, string> = { none: "", sm: "p-4", default: "p-5", lg: "p-6" }

type CardElevation = keyof typeof CARD_ELEVATION
type CardPadding = keyof typeof CARD_PADDING_CLASS

/** Map padding shadcn → SpacingStep Astryx (0=0px, 2=8px, 4=16px, 6=24px). */
const PADDING_TO_STEP: Record<CardPadding, SpacingStep> = {
  none: 0,
  sm: 2,
  default: 4,
  lg: 6,
}

function Card({
  className,
  elevation,
  padding,
  ...props
}: React.ComponentProps<"div"> & {
  elevation?: CardElevation
  padding?: CardPadding
}) {
  // Astryx Card avec variant="default" (surface + border + radius).
  // padding est délégué à Astryx quand présent (préserve l'inset border-aware
  // d'Astryx), sinon la classe Tailwind p-* prend le relais via className.
  const step = padding ? PADDING_TO_STEP[padding] : undefined
  return (
    <AstryxCard
      data-slot="card"
      variant="default"
      padding={step}
      className={cx(CARD_BASE, elevation && CARD_ELEVATION[elevation], className)}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cx("flex flex-col gap-1", className)}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"h3">) {
  return (
    <h3
      data-slot="card-title"
      className={cx("text-base font-semibold leading-tight tracking-tight", className)}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="card-description"
      className={cx("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cx("flex-1", className)}
      {...props}
    />
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cx("flex items-center", className)}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
}
