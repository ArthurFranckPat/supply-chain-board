"use client"

import { Divider as AstryxDivider } from "@astryxdesign/core/Divider"

import { cx } from "@r/lib/cx"

// Separator — Lot 2 (issue #90). Wrap Astryx Divider au lieu de Base UI
// Separator. Conserve l'API shadcn (orientation + className + data-slot)
// pour ne pas casser les consumers existants.

function Separator({
  className,
  orientation = "horizontal",
  ...props
}: React.ComponentProps<"div"> & {
  orientation?: "horizontal" | "vertical"
}) {
  return (
    <AstryxDivider
      data-slot="separator"
      orientation={orientation}
      className={cx(
        "shrink-0 bg-border data-horizontal:h-px data-horizontal:w-full data-vertical:w-px data-vertical:self-stretch",
        className
      )}
      {...props}
    />
  )
}

export { Separator }
