import { Dialog } from '@kobalte/core'
import { cva, type VariantProps } from 'class-variance-authority'
import type { Component, ComponentProps } from 'solid-js'
import { splitProps } from 'solid-js'
import { cn } from '@/libs/cn'

/**
 * Sheet — primitive shadcn-solid (port manuel sur Kobalte Dialog). Drawer latéral.
 * Side "right" par défaut, largeur fixe 420px (max 92vw). Animations via .sch-sheet.
 * Contrôle piloté par `open` / `onOpenChange`.
 */
const sheetVariants = cva(
  'sch-sheet fixed z-50 bg-card text-card-foreground shadow-2xl border-border flex flex-col h-full',
  {
    variants: {
      side: {
        right: 'inset-y-0 right-0 w-[420px] max-w-[92vw] border-l',
        left: 'inset-y-0 left-0 w-[420px] max-w-[92vw] border-r',
        top: 'inset-x-0 top-0 max-h-[85vh] border-b',
        bottom: 'inset-x-0 bottom-0 max-h-[85vh] border-t',
      },
    },
    defaultVariants: { side: 'right' },
  }
)

export const Sheet = Dialog.Root
export const SheetTrigger = Dialog.Trigger
export const SheetCloseButton = Dialog.CloseButton

type SheetContentProps = ComponentProps<typeof Dialog.Content> & VariantProps<typeof sheetVariants>

export const SheetContent: Component<SheetContentProps> = (props) => {
  const [local, rest] = splitProps(props, ['class', 'side', 'children'])
  return (
    <Dialog.Portal>
      <Dialog.Overlay class="sch-overlay fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-[1px]" />
      <Dialog.Content class={cn(sheetVariants({ side: local.side }), local.class)} {...rest}>
        {local.children}
        <Dialog.CloseButton
          class="absolute right-3 top-3 z-10 w-8 h-8 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          aria-label="Fermer"
        >
          <span class="material-symbols-outlined text-[20px]">close</span>
        </Dialog.CloseButton>
      </Dialog.Content>
    </Dialog.Portal>
  )
}

export const SheetHeader: Component<ComponentProps<'div'>> = (props) => (
  <div class="flex flex-col gap-2 px-5 pt-5 pb-4 border-b border-border" {...props} />
)

export const SheetTitle: Component<ComponentProps<typeof Dialog.Title>> = (props) => (
  <Dialog.Title class="text-[15px] font-bold tracking-tight text-foreground break-words" {...props} />
)

export const SheetDescription: Component<ComponentProps<typeof Dialog.Description>> = (props) => (
  <Dialog.Description class="text-xs text-muted-foreground" {...props} />
)

export const SheetBody: Component<ComponentProps<'div'>> = (props) => (
  <div class="flex-1 overflow-y-auto px-5 py-4 space-y-5" {...props} />
)

export const SheetFooter: Component<ComponentProps<'div'>> = (props) => (
  <div class="flex items-center gap-2 px-5 py-4 border-t border-border" {...props} />
)
