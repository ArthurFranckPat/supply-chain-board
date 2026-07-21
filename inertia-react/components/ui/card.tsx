import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@r/lib/utils"

// Card — alignée sur Airbnb DESIGN.md `property-card` / `reservation-card` /
// `host-card`. Toutes les cartes de l'app utilisent les mêmes tokens :
// • surface blanche (bg-card)
// • radius 14px (rounded-lg sous --radius 14px)
// • 1px hairline border (border-border)
// • l'unique shadow tier du DESIGN.md, optionnel (variant `raised`).
//
// L'app Solid utilisait `rounded-lg border-rule shadow-[0_1px_2px_...]` inline
// à ~20 endroits. Centraliser ici permet de retargeter toutes les cards via
// les tokens, sans toucher aux pages.

const cardVariants = cva(
  "flex flex-col gap-2 rounded-lg border bg-card text-card-foreground",
  {
    variants: {
      // elevation — Airbnb a UN seul shadow tier.
      elevation: {
        flat: "",
        raised:
          "shadow-float",
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

function Card({
  className,
  elevation,
  padding,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof cardVariants>) {
  return (
    <div
      data-slot="card"
      className={cn(cardVariants({ elevation, padding }), className)}
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
