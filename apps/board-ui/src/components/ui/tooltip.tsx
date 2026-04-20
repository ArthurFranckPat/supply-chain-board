import { Tooltip } from "@base-ui/react/tooltip"
import { cn } from "@/lib/utils"

interface SimpleTooltipProps {
  content: React.ReactNode
  children: React.ReactElement
  side?: "top" | "bottom" | "left" | "right"
}

export function SimpleTooltip({ content, children, side = "top" }: SimpleTooltipProps) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger render={children} />
      <Tooltip.Portal>
        <Tooltip.Positioner side={side} sideOffset={6}>
          <Tooltip.Popup
            className={cn(
              "z-50 rounded-lg border border-border/50 bg-popover/90 backdrop-blur-lg px-3 py-2 text-xs text-popover-foreground shadow-md shadow-black/8",
              "data-[side=top]:animate-in data-[side=top]:fade-in-0 data-[side=top]:slide-in-from-bottom-1",
              "data-[side=bottom]:animate-in data-[side=bottom]:fade-in-0 data-[side=bottom]:slide-in-from-top-1",
              "data-[side=left]:animate-in data-[side=left]:fade-in-0 data-[side=left]:slide-in-from-right-1",
              "data-[side=right]:animate-in data-[side=right]:fade-in-0 data-[side=right]:slide-in-from-left-1",
            )}
          >
            {content}
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  )
}
