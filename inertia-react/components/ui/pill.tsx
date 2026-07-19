import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@r/lib/utils"

// Pill — pattern le plus dupliqué du codebase (8 occurrences en Solid,
// initialement `h-[30px] rounded-full border-rule bg-card px-3`). Extrait
// en primitive réutilisable.
//
// Aligné sur Airbnb DESIGN.md `button-pill-rausch` / `category-tab-active` :
// • pill-shape (rounded-full)
// • 30px hauteur par défaut, sm = 28px, lg = 40px
// • variantes default (border + card), active (Rausch fill), outline, ghost, soft.
// • polymorphique via la prop `as` (button | a), pour les cas où la pill est
//   un lien (rare dans l'app mais utile pour la nav inter-runtimes).

const pillVariants = cva(
  "inline-flex items-center justify-center gap-1.5 rounded-full border whitespace-nowrap text-xs font-semibold transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
  {
    variants: {
      variant: {
        default:
          "border-border bg-card text-foreground hover:border-primary hover:text-primary",
        active:
          "border-transparent bg-primary text-primary-foreground hover:bg-[var(--color-rausch-active,#e00b41)]",
        outline:
          "border-border bg-transparent text-foreground hover:bg-muted hover:text-foreground",
        ghost:
          "border-transparent bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
        soft:
          "border-transparent bg-[var(--brand-soft,rgba(255,56,92,0.10))] text-primary hover:bg-[color-mix(in_oklch,var(--brand-soft),var(--primary)_10%)]",
      },
      size: {
        sm: "h-7 px-3 text-[11px]",
        default: "h-[30px] px-3",
        lg: "h-10 px-4 text-sm",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

interface PillOwnProps extends VariantProps<typeof pillVariants> {
  /** Affiche un point statut (cf. programme-toolbar / triage-rail). */
  dot?: boolean
  dotClassName?: string
}

type PillProps = PillOwnProps & React.ComponentProps<"button">

function Pill({
  className,
  variant = "default",
  size = "default",
  dot = false,
  dotClassName,
  children,
  ...props
}: PillProps) {
  const classes = cn(pillVariants({ variant, size }), className)

  return (
    <button type="button" className={classes} {...props}>
      {dot && (
        <span
          aria-hidden="true"
          className={cn("size-1.5 rounded-full bg-current", dotClassName)}
        />
      )}
      {children}
    </button>
  )
}

export { Pill, pillVariants }
export type { PillProps }
