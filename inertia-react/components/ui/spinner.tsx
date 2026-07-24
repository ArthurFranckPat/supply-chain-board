import * as React from "react"
import { LoaderCircle } from "lucide-react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@r/lib/utils"

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

export interface SpinnerProps
  extends React.ComponentPropsWithoutRef<"svg">,
    VariantProps<typeof spinnerVariants> {
  strokeWidth?: number
}

export function Spinner({
  className,
  variant,
  size,
  strokeWidth = 2,
  ...props
}: SpinnerProps) {
  return (
    <LoaderCircle
      data-slot="spinner"
      strokeWidth={strokeWidth}
      className={cn(spinnerVariants({ variant, size }), className)}
      {...props}
    />
  )
}
