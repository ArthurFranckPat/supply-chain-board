import * as React from "react"
import { Spinner as AstryxSpinner } from "@astryxdesign/core/Spinner"
import { cva, type VariantProps } from "class-variance-authority"
import { cx } from "@r/lib/cx"

// Spinner — Lot 2 (issue #90). lucide LoaderCircle → Astryx Spinner.
// cva conservée pour variants shadcn (brand/muted/white/current) — Astryx
// expose `shade` (default/onMedia/subtle/inherit) mais pas de variant
// text-primary direct. Le wrapper traduit.

const spinnerVariants = cva(
  "animate-spin shrink-0 transition-opacity",
  {
    variants: {
      variant: {
        default: "text-muted-foreground",
        brand: "text-primary",
        muted: "text-muted-foreground/40",
        white: "text-white",
        current: "text-current",
      },
      size: {
        xs: "size-3",
        sm: "size-4",
        md: "size-5",
        lg: "size-7",
        xl: "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
    },
  }
)

/** Map size shadcn → size Astryx (sm/md/lg). */
const SIZE_TO_ASTRYX = { xs: "sm", sm: "sm", md: "md", lg: "lg", xl: "lg" } as const

export interface SpinnerProps
  extends React.ComponentPropsWithoutRef<"span">,
    VariantProps<typeof spinnerVariants> {
  strokeWidth?: number
}

export function Spinner({
  className,
  variant,
  size,
  strokeWidth = 2,
  "aria-label": ariaLabel,
  ...props
}: SpinnerProps) {
  return (
    <AstryxSpinner
      data-slot="spinner"
      label={ariaLabel ?? "Chargement"}
      size={size ? SIZE_TO_ASTRYX[size] : "md"}
      className={cx(spinnerVariants({ variant, size }), className)}
      {...props}
    />
  )
}
