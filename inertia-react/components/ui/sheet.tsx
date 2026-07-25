"use client"

import * as React from "react"
import { Dialog as AstryxDialog } from "@astryxdesign/core/Dialog"

import { cn } from "@r/lib/utils"
import { Button } from "@r/components/ui/button"
import { XIcon } from "lucide-react"

// Sheet — Lot 3 (issue #90). Base UI Dialog (side variants) → Astryx Dialog
// positionné pour simuler un drawer latéral/bas/haut/gauche.
//
// Astryx n'a pas de Sheet natif — on utilise AstryxDialog avec position
// + styling custom pour recréer les side panels. Context local collecte
// title/description/isOpen (similaire à dialog.tsx).

interface SheetContextValue {
  isOpen: boolean
  setIsOpen: (next: boolean) => void
  title: string
  registerTitle: (title: string) => () => void
  description: string
  registerDescription: (desc: string) => () => void
}

const SheetContext = React.createContext<SheetContextValue | null>(null)

function useSheetContext() {
  const ctx = React.useContext(SheetContext)
  if (!ctx) throw new Error("Sheet.* doit être utilisé dans <Sheet>")
  return ctx
}

type SheetProps = {
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  children: React.ReactNode
}

function Sheet({ open, defaultOpen = false, onOpenChange, children }: SheetProps) {
  const [internalOpen, setInternalOpen] = React.useState(defaultOpen)
  const isControlled = open !== undefined
  const isOpen = isControlled ? open! : internalOpen
  const setIsOpen = React.useCallback(
    (next: boolean) => {
      if (!isControlled) setInternalOpen(next)
      onOpenChange?.(next)
    },
    [isControlled, onOpenChange]
  )

  const [title, setTitle] = React.useState("")
  const [description, setDescription] = React.useState("")

  const registerTitle = React.useCallback((t: string) => {
    setTitle(t)
    return () => setTitle("")
  }, [])
  const registerDescription = React.useCallback((d: string) => {
    setDescription(d)
    return () => setDescription("")
  }, [])

  const value = React.useMemo<SheetContextValue>(
    () => ({ isOpen, setIsOpen, title, registerTitle, description, registerDescription }),
    [isOpen, setIsOpen, title, registerTitle, description, registerDescription]
  )

  return <SheetContext.Provider value={value}>{children}</SheetContext.Provider>
}

type SheetTriggerProps = React.ComponentProps<"button"> & { render?: React.ReactElement }

function SheetTrigger({ onClick, children, render, ...props }: SheetTriggerProps) {
  const { setIsOpen } = useSheetContext()
  const handleOpen = (e: React.MouseEvent) => {
    setIsOpen(true)
    ;(onClick as ((e: React.MouseEvent) => void) | undefined)?.(e)
  }
  if (render) {
    const renderProps = render.props as Record<string, unknown>
    return React.cloneElement(render, {
      "data-slot": "sheet-trigger",
      onClick: (e: React.MouseEvent) => {
        handleOpen(e)
        ;(renderProps.onClick as ((e: React.MouseEvent) => void) | undefined)?.(e)
      },
      ...props,
    } as Record<string, unknown>)
  }
  return (
    <button data-slot="sheet-trigger" onClick={handleOpen} {...props}>
      {children}
    </button>
  )
}

function SheetClose({
  onClick,
  children,
  render,
  ...props
}: React.ComponentProps<"button"> & { render?: React.ReactElement }) {
  const { setIsOpen } = useSheetContext()
  const handleClose = (e: React.MouseEvent) => {
    setIsOpen(false)
    ;(onClick as ((e: React.MouseEvent) => void) | undefined)?.(e)
  }
  if (render) {
    const renderProps = render.props as Record<string, unknown>
    return React.cloneElement(render, {
      "data-slot": "sheet-close",
      onClick: (e: React.MouseEvent) => {
        handleClose(e)
        ;(renderProps.onClick as ((e: React.MouseEvent) => void) | undefined)?.(e)
      },
      ...props,
    } as Record<string, unknown>)
  }
  return (
    <button data-slot="sheet-close" onClick={handleClose} {...props}>
      {children}
    </button>
  )
}

interface SheetContentProps {
  className?: string
  children?: React.ReactNode
  side?: "top" | "right" | "bottom" | "left"
  showCloseButton?: boolean
}

function SheetContent({ className, children, side = "right", showCloseButton = true }: SheetContentProps) {
  const { isOpen, setIsOpen, title, description } = useSheetContext()

  // Position AstryxDialog selon side — simule un drawer.
  const position: { top?: number; bottom?: number; left?: number; right?: number } = {
    right: { top: 0, bottom: 0, right: 0 },
    left: { top: 0, bottom: 0, left: 0 },
    top: { top: 0, left: 0, right: 0 },
    bottom: { bottom: 0, left: 0, right: 0 },
  }[side]

  return (
    <AstryxDialog
      isOpen={isOpen}
      onOpenChange={setIsOpen}
      position={position}
      variant="standard"
      data-slot="sheet-content"
      data-side={side}
      className={cn(
        // Recrée la grammaire overlays Airbnb : ombre --shadow-overlay, slide
        // 320 ms cubic-bezier. Latéral = 480 px, bas = 640 px centré.
        "fixed z-[60] flex flex-col gap-4 bg-popover bg-clip-padding text-sm text-popover-foreground shadow-overlay transition duration-[320ms] ease-[cubic-bezier(0.2,0.7,0.2,1)]",
        "data-[side=bottom]:mx-auto data-[side=bottom]:h-auto data-[side=bottom]:max-w-[640px] data-[side=bottom]:rounded-t-[16px] data-[side=bottom]:border-t",
        "data-[side=left]:h-full data-[side=left]:w-3/4 data-[side=left]:border-r data-[side=left]:sm:max-w-[480px]",
        "data-[side=right]:h-full data-[side=right]:w-3/4 data-[side=right]:border-l data-[side=right]:sm:w-[480px] data-[side=right]:sm:max-w-[480px]",
        "data-[side=top]:h-auto data-[side=top]:border-b",
        className
      )}
    >
      {showCloseButton && (
        <SheetClose
          render={
            <Button variant="ghost" className="absolute top-3 right-3" size="icon-sm" />
          }
        >
          <XIcon />
          <span className="sr-only">Close</span>
        </SheetClose>
      )}
      {title && <SheetTitle>{title}</SheetTitle>}
      {description && <SheetDescription>{description}</SheetDescription>}
      {children}
    </AstryxDialog>
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="sheet-header" className={cn("flex flex-col gap-0.5 p-4", className)} {...props} />
  )
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="sheet-footer" className={cn("mt-auto flex flex-col gap-2 p-4", className)} {...props} />
  )
}

function SheetTitle({ children, className }: { children?: React.ReactNode; className?: string }) {
  const { registerTitle } = useSheetContext()
  const text = typeof children === "string" ? children : ""
  React.useEffect(() => {
    if (text) return registerTitle(text)
  }, [text, registerTitle])
  return text ? (
    <div data-slot="sheet-title" className={cn("font-heading text-base font-medium text-foreground p-4 pb-0", className)}>
      {text}
    </div>
  ) : null
}

function SheetDescription({ children, className }: { children?: React.ReactNode; className?: string }) {
  const { registerDescription } = useSheetContext()
  const text = typeof children === "string" ? children : ""
  React.useEffect(() => {
    if (text) return registerDescription(text)
  }, [text, registerDescription])
  return text ? (
    <div data-slot="sheet-description" className={cn("text-sm text-muted-foreground px-4", className)}>
      {text}
    </div>
  ) : null
}

// Compat anciens consumers.
function SheetPortal({ children }: { children?: React.ReactNode }) {
  return <>{children}</>
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
  SheetPortal,
}
