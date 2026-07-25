import * as React from "react"
import { Spinner, type SpinnerProps } from "./spinner"
import { cx } from "@r/lib/cx"

export interface LoadingStateProps extends React.ComponentPropsWithoutRef<"div"> {
  title?: string
  description?: string
  spinnerSize?: SpinnerProps["size"]
  spinnerVariant?: SpinnerProps["variant"]
  compact?: boolean
  icon?: React.ReactNode
}

export function LoadingState({
  title = "Chargement des données...",
  description,
  spinnerSize = "lg",
  spinnerVariant = "brand",
  compact = false,
  icon,
  className,
  ...props
}: LoadingStateProps) {
  return (
    <div
      data-slot="loading-state"
      className={cx(
        "flex flex-col items-center justify-center text-center animate-in fade-in-50 duration-200",
        compact ? "py-6 gap-2" : "py-16 gap-3.5 px-4",
        className
      )}
      {...props}
    >
      <div className="relative flex items-center justify-center">
        {icon ?? <Spinner size={spinnerSize} variant={spinnerVariant} />}
      </div>
      {(title || description) && (
        <div className="space-y-1 max-w-xs">
          {title && (
            <p className={cx("font-medium tracking-tight text-foreground", compact ? "text-xs" : "text-sm")}>
              {title}
            </p>
          )}
          {description && (
            <p className="text-xs text-muted-foreground leading-relaxed">
              {description}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
