"use client"

import * as React from "react"
import { AlertDialog as AstryxAlertDialog } from "@astryxdesign/core/AlertDialog"

// AlertDialog — Lot 3 (issue #90). Base UI composé → Astryx AlertDialog
// monolithique. Même pattern que dialog.tsx : context local collecte
// title/description/footer/action et pilote isOpen/onOpenChange.
//
// Astryx AlertDialog exige title + description (requis) et expose
// cancelLabel/actionLabel/onAction pour les boutons d'action primaire.

interface AlertDialogContextValue {
  isOpen: boolean
  setIsOpen: (next: boolean) => void
  title: string
  registerTitle: (title: string) => () => void
  description: string
  registerDescription: (desc: string) => () => void
  cancelLabel: string
  registerCancelLabel: (label: string) => () => void
  action: { label: string; onAction?: () => void | Promise<void> }
  registerAction: (label: string, onAction?: () => void | Promise<void>) => () => void
}

const AlertDialogContext = React.createContext<AlertDialogContextValue | null>(null)

function useAlertDialogContext() {
  const ctx = React.useContext(AlertDialogContext)
  if (!ctx) throw new Error("AlertDialog.* doit être utilisé dans <AlertDialog>")
  return ctx
}

type AlertDialogProps = {
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  children: React.ReactNode
}

function AlertDialog({ open, defaultOpen = false, onOpenChange, children }: AlertDialogProps) {
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
  const [cancelLabel, setCancelLabel] = React.useState("Annuler")
  const [action, setAction] = React.useState<{ label: string; onAction?: () => void | Promise<void> }>({
    label: "Confirmer",
  })

  const registerTitle = React.useCallback((t: string) => {
    setTitle(t)
    return () => setTitle("")
  }, [])
  const registerDescription = React.useCallback((d: string) => {
    setDescription(d)
    return () => setDescription("")
  }, [])
  const registerCancelLabel = React.useCallback((l: string) => {
    setCancelLabel(l)
    return () => setCancelLabel("Annuler")
  }, [])
  const registerAction = React.useCallback(
    (label: string, onAction?: () => void | Promise<void>) => {
      setAction({ label, onAction })
      return () => setAction({ label: "Confirmer" })
    },
    []
  )

  const value = React.useMemo<AlertDialogContextValue>(
    () => ({
      isOpen,
      setIsOpen,
      title,
      registerTitle,
      description,
      registerDescription,
      cancelLabel,
      registerCancelLabel,
      action,
      registerAction,
    }),
    [isOpen, setIsOpen, title, registerTitle, description, registerDescription, cancelLabel, registerCancelLabel, action, registerAction]
  )

  return <AlertDialogContext.Provider value={value}>{children}</AlertDialogContext.Provider>
}

type AlertDialogTriggerProps = React.ComponentProps<"button"> & {
  render?: React.ReactElement
}

function AlertDialogTrigger({ onClick, children, render, ...props }: AlertDialogTriggerProps) {
  const { setIsOpen } = useAlertDialogContext()
  const handleOpen = (e: React.MouseEvent) => {
    setIsOpen(true)
    ;(onClick as ((e: React.MouseEvent) => void) | undefined)?.(e)
  }
  if (render) {
    const renderProps = render.props as Record<string, unknown>
    return React.cloneElement(render, {
      "data-slot": "alert-dialog-trigger",
      onClick: (e: React.MouseEvent) => {
        handleOpen(e)
        ;(renderProps.onClick as ((e: React.MouseEvent) => void) | undefined)?.(e)
      },
      ...props,
    } as Record<string, unknown>)
  }
  return (
    <button data-slot="alert-dialog-trigger" onClick={handleOpen} {...props}>
      {children}
    </button>
  )
}

function AlertDialogContent({ className, children }: { className?: string; children?: React.ReactNode }) {
  const { isOpen, setIsOpen, title, description, cancelLabel, action } = useAlertDialogContext()
  return (
    <AstryxAlertDialog
      isOpen={isOpen}
      onOpenChange={setIsOpen}
      title={title || "Action requise"}
      description={description || "Veuillez confirmer."}
      cancelLabel={cancelLabel}
      actionLabel={action.label}
      onAction={async () => {
        await action.onAction?.()
        setIsOpen(false)
      }}
      className={className}
    />
  )
}

function AlertDialogHeader({ children }: { children?: React.ReactNode }) {
  // Passe-plat — title/description s'enregistrent via context.
  return <div data-slot="alert-dialog-header" className="contents">{children}</div>
}

function AlertDialogTitle({ children }: { children?: React.ReactNode }) {
  const { registerTitle } = useAlertDialogContext()
  const text = typeof children === "string" ? children : ""
  React.useEffect(() => {
    if (text) return registerTitle(text)
  }, [text, registerTitle])
  return null
}

function AlertDialogDescription({ children }: { children?: React.ReactNode }) {
  const { registerDescription } = useAlertDialogContext()
  const text = typeof children === "string" ? children : ""
  React.useEffect(() => {
    if (text) return registerDescription(text)
  }, [text, registerDescription])
  return null
}

function AlertDialogAction({
  children,
  onClick,
}: {
  children?: React.ReactNode
  onClick?: () => void | Promise<void>
}) {
  const { registerAction } = useAlertDialogContext()
  const label = typeof children === "string" ? children : "Confirmer"
  React.useEffect(() => {
    return registerAction(label, onClick)
  }, [label, onClick, registerAction])
  return null
}

function AlertDialogCancel({ children }: { children?: React.ReactNode }) {
  const { registerCancelLabel } = useAlertDialogContext()
  const label = typeof children === "string" ? children : "Annuler"
  React.useEffect(() => {
    if (label) return registerCancelLabel(label)
  }, [label, registerCancelLabel])
  return null
}

// Compat anciens consumers — no-op.
function AlertDialogPortal({ children }: { children?: React.ReactNode }) {
  return <>{children}</>
}
function AlertDialogOverlay({ children }: { children?: React.ReactNode }) {
  return <>{children}</>
}
function AlertDialogFooter({ children }: { children?: React.ReactNode }) {
  return <div data-slot="alert-dialog-footer" className="contents">{children}</div>
}

export {
  AlertDialog,
  AlertDialogPortal,
  AlertDialogOverlay,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
}
