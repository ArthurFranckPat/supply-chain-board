import { Dialog } from '@kobalte/core'
import { cva, type VariantProps } from 'class-variance-authority'
import type { Component, ComponentProps } from 'solid-js'
import { splitProps } from 'solid-js'
import { cn } from '@/libs/cn'

/**
 * Sheet — primitive shadcn-solid (port manuel sur Kobalte Dialog). Drawer latéral.
 * Side "right" par défaut. Contrôle piloté par `open` / `onOpenChange`.
 */
const sheetVariants = cva(
  'fixed z-50 gap-4 bg-card text-card-foreground shadow-lg border-border flex flex-col h-full w-full sm:max-w-md',
  {
    variants: {
      side: {
        right: 'inset-y-0 right-0 border-l',
        left: 'inset-y-0 left-0 border-r',
        top: 'inset-x-0 top-0 border-b',
        bottom: 'inset-x-0 bottom-0 border-t',
      },
    },
    defaultVariants: { side: 'right' },
  }
)

// Racine contrôlée : <Sheet open={open()} onOpenChange={setOpen}>.
export const Sheet = Dialog.Root
export const SheetTrigger = Dialog.Trigger
export const SheetCloseButton = Dialog.CloseButton

type SheetContentProps = ComponentProps<typeof Dialog.Content> & VariantProps<typeof sheetVariants>

export const SheetContent: Component<SheetContentProps> = (props) => {
  const [local, rest] = splitProps(props, ['class', 'side', 'children'])
  return (
    <Dialog.Portal>
      <Dialog.Overlay class="fixed inset-0 z-50 bg-black/40" />
      <Dialog.Content class={cn(sheetVariants({ side: local.side }), local.class)} {...rest}>
        {local.children}
        <Dialog.CloseButton
          class="absolute right-4 top-4 text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Fermer"
        >
          <span class="material-symbols-outlined text-[20px]">close</span>
        </Dialog.CloseButton>
      </Dialog.Content>
    </Dialog.Portal>
  )
}

export const SheetHeader: Component<ComponentProps<'div'>> = (props) => (
  <div class="flex flex-col gap-1.5 p-5 border-b border-border" {...props} />
)

export const SheetTitle: Component<ComponentProps<typeof Dialog.Title>> = (props) => (
  <Dialog.Title class="text-base font-bold tracking-tight" {...props} />
)

export const SheetDescription: Component<ComponentProps<typeof Dialog.Description>> = (props) => (
  <Dialog.Description class="text-xs text-muted-foreground" {...props} />
)

export const SheetBody: Component<ComponentProps<'div'>> = (props) => (
  <div class="flex-1 overflow-y-auto p-5 space-y-4" {...props} />
)
