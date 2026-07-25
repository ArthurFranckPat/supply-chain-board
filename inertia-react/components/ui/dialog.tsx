"use client"

import * as React from "react"
import { Dialog as AstryxDialog, DialogHeader as AstryxDialogHeader } from "@astryxdesign/core/Dialog"

import { cn } from "@r/lib/utils"
import { Button } from "@r/components/ui/button"

// Dialog — Lot 3 (issue #90). Base UI Dialog composé → Astryx Dialog
// monolithique. L'API shadcn composée (Dialog/DialogTrigger/DialogContent/
// DialogHeader/DialogTitle/DialogDescription/DialogFooter/DialogClose/
// DialogOverlay/DialogPortal) est préservée via un context local qui
// collecte title/description/footer et pilote isOpen/onOpenChange.
//
// Astryx Dialog est monolithique : <Dialog isOpen onOpenChange>{children}</Dialog>
// avec DialogHeader(title, subtitle). Le wrapper traduit la composition
// shadcn vers ce modèle.

interface DialogContextValue {
  isOpen: boolean
  setIsOpen: (next: boolean) => void
  title: string
  registerTitle: (title: string) => () => void
  description: string
  registerDescription: (desc: string) => () => void
  footer: React.ReactNode
  registerFooter: (node: React.ReactNode) => () => void
}

const DialogContext = React.createContext<DialogContextValue | null>(null)

function useDialogContext() {
  const ctx = React.useContext(DialogContext)
  if (!ctx) throw new Error("Dialog.* doit être utilisé dans <Dialog>")
  return ctx
}

type DialogProps = {
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  children: React.ReactNode
}

function Dialog({ open, defaultOpen = false, onOpenChange, children }: DialogProps) {
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

  // État collecté via registration par les sous-composants.
  const [title, setTitle] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [footer, setFooter] = React.useState<React.ReactNode>(null)

  // Registres — chaque sous-composant enregistre sa valeur et se désenregistre
  // au démontage. Dernier inscrit gagne (cas d'usage typique : un seul de chaque).
  const registerTitle = React.useCallback((t: string) => {
    setTitle(t)
    return () => setTitle("")
  }, [])
  const registerDescription = React.useCallback((d: string) => {
    setDescription(d)
    return () => setDescription("")
  }, [])
  const registerFooter = React.useCallback((node: React.ReactNode) => {
    setFooter(node)
    return () => setFooter(null)
  }, [])

  const value = React.useMemo<DialogContextValue>(
    () => ({ isOpen, setIsOpen, title, registerTitle, description, registerDescription, footer, registerFooter }),
    [isOpen, setIsOpen, title, registerTitle, description, registerDescription, footer, registerFooter]
  )

  return <DialogContext.Provider value={value}>{children}</DialogContext.Provider>
}

type DialogTriggerProps = React.ComponentProps<"button"> & {
  /** Pattern Base UI `render` — remplacer l'élément trigger. */
  render?: React.ReactElement
}

function DialogTrigger({ onClick, children, render, ...props }: DialogTriggerProps) {
  const { setIsOpen } = useDialogContext()
  const handleOpen = (e: React.MouseEvent) => {
    setIsOpen(true)
    ;(onClick as ((e: React.MouseEvent) => void) | undefined)?.(e)
  }
  if (render) {
    const renderProps = render.props as Record<string, unknown>
    return React.cloneElement(render, {
      "data-slot": "dialog-trigger",
      onClick: (e: React.MouseEvent) => {
        handleOpen(e)
        ;(renderProps.onClick as ((e: React.MouseEvent) => void) | undefined)?.(e)
      },
      ...props,
    } as Record<string, unknown>)
  }
  return (
    <button data-slot="dialog-trigger" onClick={handleOpen} {...props}>
      {children}
    </button>
  )
}

// Compat anciens consumers — no-op, Astryx Dialog gère portal + backdrop.
function DialogPortal({ children }: { children?: React.ReactNode }) {
  return <>{children}</>
}
function DialogOverlay({ children }: { children?: React.ReactNode }) {
  return <>{children}</>
}

function DialogClose({
  onClick,
  children,
  render,
  ...props
}: React.ComponentProps<"button"> & { render?: React.ReactElement }) {
  const { setIsOpen } = useDialogContext()
  if (render) {
    const renderProps = render.props as Record<string, unknown>
    return React.cloneElement(render, {
      "data-slot": "dialog-close",
      onClick: (e: React.MouseEvent) => {
        setIsOpen(false)
        ;(renderProps.onClick as ((e: React.MouseEvent) => void) | undefined)?.(e)
      },
      ...props,
    } as Record<string, unknown>)
  }
  return (
    <button
      data-slot="dialog-close"
      onClick={(e) => {
        setIsOpen(false)
        onClick?.(e)
      }}
      {...props}
    >
      {children}
    </button>
  )
}

interface DialogContentProps {
  className?: string
  children?: React.ReactNode
  showCloseButton?: boolean
}

function DialogContent({ className, children, showCloseButton = true }: DialogContentProps) {
  const { isOpen, setIsOpen, title, description, footer } = useDialogContext()

  return (
    <AstryxDialog isOpen={isOpen} onOpenChange={setIsOpen} className={cn("sm:max-w-[440px]", className)}>
      {title && (
        <AstryxDialogHeader
          title={title}
          subtitle={description || undefined}
          onOpenChange={showCloseButton ? setIsOpen : undefined}
        />
      )}
      {children}
      {footer}
    </AstryxDialog>
  )
}

function DialogHeader({ className, children, ...props }: React.ComponentProps<"div">) {
  // Header container — les enfants (DialogTitle/DialogDescription) s'y
  // enregistrent dans le context. Le rendu visuel est porté par Astryx
  // DialogHeader via DialogContent, ici c'est juste un passe-plat.
  return (
    <div data-slot="dialog-header" className={cn("contents", className)} {...props}>
      {children}
    </div>
  )
}

function DialogTitle({ children }: { children?: React.ReactNode }) {
  const { registerTitle } = useDialogContext()
  const text = typeof children === "string" ? children : ""
  React.useEffect(() => {
    if (text) return registerTitle(text)
  }, [text, registerTitle])
  return null
}

function DialogDescription({ children }: { children?: React.ReactNode }) {
  const { registerDescription } = useDialogContext()
  const text = typeof children === "string" ? children : ""
  React.useEffect(() => {
    if (text) return registerDescription(text)
  }, [text, registerDescription])
  return null
}

function DialogFooter({
  className,
  children,
  showCloseButton = false,
  ...props
}: React.ComponentProps<"div"> & { showCloseButton?: boolean }) {
  const { registerFooter, setIsOpen } = useDialogContext()
  React.useEffect(() => {
    const node = (
      <div
        data-slot="dialog-footer"
        className={cn(
          "-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-[14px] border-t bg-muted/50 p-4 sm:flex-row sm:justify-end",
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <Button variant="outline" onClick={() => setIsOpen(false)}>
            Close
          </Button>
        )}
      </div>
    )
    return registerFooter(node)
  }, [children, showCloseButton, className, registerFooter, setIsOpen, props])
  return null
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
