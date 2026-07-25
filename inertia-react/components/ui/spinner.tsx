import * as React from "react"
import { Spinner as AstryxSpinner } from "@astryxdesign/core/Spinner"
import { cx } from "@r/lib/cx"

// Spinner — Lot 4 (issue #90). lucide LoaderCircle → Astryx Spinner.
// Plus de cva : records simples pour variants.

const SPINNER_VARIANT: Record<string, string> = {
  default: "text-muted-foreground",
  brand: "text-primary",
  muted: "text-muted-foreground/40",
  white: "text-white",
  current: "text-current",
}
const SPINNER_SIZE: Record<string, string> = {
  xs: "size-3",
  sm: "size-4",
  md: "size-5",
  lg: "size-7",
  xl: "size-9",
}
const SIZE_TO_ASTRYX: Record<string, "sm" | "md" | "lg"> = {
  xs: "sm",
  sm: "sm",
  md: "md",
  lg: "lg",
  xl: "lg",
}

type SpinnerVariant = keyof typeof SPINNER_VARIANT
type SpinnerSize = keyof typeof SPINNER_SIZE

export interface SpinnerProps extends React.ComponentPropsWithoutRef<"span"> {
  variant?: SpinnerVariant
  size?: SpinnerSize
  strokeWidth?: number
}

export function Spinner({
  className,
  variant = "default",
  size = "md",
  strokeWidth = 2,
  "aria-label": ariaLabel,
  ...props
}: SpinnerProps) {
  return (
    <AstryxSpinner
      data-slot="spinner"
      label={ariaLabel ?? "Chargement"}
      size={SIZE_TO_ASTRYX[size]}
      className={cx("animate-spin shrink-0 transition-opacity", SPINNER_VARIANT[variant], SPINNER_SIZE[size], className)}
      {...props}
    />
  )
}
