// inertia-react/components/sheet.tsx
//
// Sheet — wrapper léger sur Astryx Dialog positionné en drawer latéral
// ou bas/haut/gauche. Astryx n'a pas de Sheet natif ; on hard-code la
// position via la prop `side`.
//
// API simplifiée (plus de context-collector) :
//   <Sheet isOpen={open} onOpenChange={setOpen} side="right" title="..." description="...">
//     {children}
//   </Sheet>

import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog"

export type SheetSide = "top" | "right" | "bottom" | "left"

interface SheetProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  side?: SheetSide
  title?: string
  subtitle?: string
  showCloseButton?: boolean
  children?: React.ReactNode
  className?: string
}

const SIDE_POSITION: Record<SheetSide, { top?: number; bottom?: number; left?: number; right?: number }> = {
  right: { top: 0, bottom: 0, right: 0 },
  left: { top: 0, bottom: 0, left: 0 },
  top: { top: 0, left: 0, right: 0 },
  bottom: { bottom: 0, left: 0, right: 0 },
}

export function Sheet({
  isOpen,
  onOpenChange,
  side = "right",
  title,
  subtitle,
  showCloseButton = true,
  children,
  className,
}: SheetProps) {
  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      position={SIDE_POSITION[side]}
      variant="standard"
      data-slot="sheet"
      data-side={side}
      className={className}
    >
      {title && (
        <DialogHeader
          title={title}
          subtitle={subtitle}
          onOpenChange={showCloseButton ? onOpenChange : undefined}
        />
      )}
      {children}
    </Dialog>
  )
}
