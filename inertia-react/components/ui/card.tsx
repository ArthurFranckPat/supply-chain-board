import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Card as AstryxCard } from "@astryxdesign/core/Card"

import { cn } from "@r/lib/utils"

/** Spacing scale Astryx (cf. @astryxdesign/core/utils/types SpacingStep). */
type SpacingStep = 0 | 0.5 | 1 | 1.5 | 2 | 3 | 4 | 5 | 6 | 8 | 10

// Card — alignée sur Airbnb DESIGN.md `property-card` / `reservation-card` /
// `host-card`. Toutes les cartes de l'app utilisent les mêmes tokens :
// • surface blanche (bg-card)
// • radius 14px (rounded-lg sous --radius 14px)
// • 1px hairline border (border-border)
// • l'unique shadow tier du DESIGN.md, optionnel (variant `raised`).
//
// Spike Lot 0 (issue #90) — wrapper sur @astryxdesign/core/Card.
// L'API shadcn (Card/CardHeader/CardTitle/CardDescription/CardContent/
// CardFooter + cardVariants) est préservée pour ne pas casser les 44
// fichiers consumers. Astryx Card gère surface/border/radius ; on injecte
// le shadow tier via className utilitaire (token Tailwind shadow-float).

const cardVariants = cva(
  "flex flex-col gap-2 rounded-lg border bg-card text-card-foreground transition-all duration-200 ease-out hover:border-border/90 hover:shadow-md",
  {
    variants: {
      // elevation — Airbnb a UN seul shadow tier.
      elevation: {
        flat: "",
        raised: "shadow-float",
      },
      padding: {
        none: "",
        sm: "p-4",
        default: "p-5",
        lg: "p-6",
      },
    },
    defaultVariants: {
      elevation: "flat",
      padding: "none",
    },
  }
)

/** Map padding shadcn → SpacingStep Astryx (0=0px, 2=8px, 4=16px, 6=24px). */
const PADDING_TO_STEP: Record<NonNullable<VariantProps<typeof cardVariants>["padding"]>, SpacingStep> = {
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
}: React.ComponentProps<"div"> & VariantProps<typeof cardVariants>) {
  // Astryx Card avec variant="default" (surface + border + radius).
  // padding est délégué à Astryx quand présent (préserve l'inset border-aware
  // d'Astryx), sinon la classe Tailwind p-* prend le relais via className.
  const step = padding ? PADDING_TO_STEP[padding] : undefined
  return (
    <AstryxCard
      data-slot="card"
      variant="default"
      padding={step}
      className={cn(cardVariants({ elevation, padding: undefined }), className)}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn("flex flex-col gap-1", className)}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"h3">) {
  return (
    <h3
      data-slot="card-title"
      className={cn("text-base font-semibold leading-tight tracking-tight", className)}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="card-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("flex-1", className)}
      {...props}
    />
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex items-center", className)}
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
  cardVariants,
}
