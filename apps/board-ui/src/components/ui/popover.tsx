import * as React from "react"
import { Popover as PopoverRoot } from "@base-ui/react/popover"
import { cn } from "@/lib/utils"

function Popover({ children, ...props }: React.ComponentProps<typeof PopoverRoot.Root>) {
  return <PopoverRoot.Root {...props}>{children}</PopoverRoot.Root>
}

function PopoverTrigger({ className, ...props }: React.ComponentProps<typeof PopoverRoot.Trigger>) {
  return <PopoverRoot.Trigger className={cn("outline-none cursor-pointer", className)} {...props} />
}

function PopoverContent({
  className,
  children,
  side = "bottom",
  sideOffset = 4,
  align = "center",
  ...props
}: React.ComponentProps<typeof PopoverRoot.Popup> & {
  side?: "top" | "bottom" | "left" | "right"
  sideOffset?: number
  align?: "start" | "center" | "end"
}) {
  return (
    <PopoverRoot.Portal>
      <PopoverRoot.Positioner side={side} sideOffset={sideOffset} align={align}>
        <PopoverRoot.Popup
          className={cn(
            "z-50 rounded-xl border border-border/60 bg-popover/60 backdrop-blur-2xl p-3 text-popover-foreground shadow-lg shadow-black/10 ring-1 ring-black/5",
            "data-[side=top]:animate-in data-[side=top]:fade-in-0 data-[side=top]:slide-in-from-bottom-2",
            "data-[side=bottom]:animate-in data-[side=bottom]:fade-in-0 data-[side=bottom]:slide-in-from-top-2",
            "data-[side=left]:animate-in data-[side=left]:fade-in-0 data-[side=left]:slide-in-from-right-2",
            "data-[side=right]:animate-in data-[side=right]:fade-in-0 data-[side=right]:slide-in-from-left-2",
            className
          )}
          {...props}
        >
          {children}
        </PopoverRoot.Popup>
      </PopoverRoot.Positioner>
    </PopoverRoot.Portal>
  )
}

export { Popover, PopoverTrigger, PopoverContent }
