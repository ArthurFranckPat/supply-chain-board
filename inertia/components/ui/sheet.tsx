import { Dialog as DialogPrimitive } from '@kobalte/core/dialog'
import type { VariantProps } from 'cva'
import { cva, cx } from '@/libs/cva'
import type { Component, ComponentProps, ValidComponent } from 'solid-js'
import { Show, splitProps } from 'solid-js'

/**
 * Sheet — drawer latéral. shadcn-solid n'expose pas de composant `sheet` dans son
 * registre (uniquement dialog/drawer) ; on le construit donc sur la primitive
 * native Dialog (même base que dialog.tsx) avec des variantes de côté, à l'image
 * du composant Sheet React shadcn (= Dialog + côté).
 *
 * Animations via tailwindcss-animate (slide-in/out + fade).
 */
const sheetVariants = cva({
  base: 'fixed z-50 gap-4 bg-background text-foreground shadow-lg flex flex-col',
  variants: {
    side: {
      right:
        'inset-y-0 right-0 h-full w-3/4 sm:max-w-md border-l data-[expanded]:slide-in-from-right data-[closed]:slide-out-to-right',
      left: 'inset-y-0 left-0 h-full w-3/4 sm:max-w-sm border-r data-[expanded]:slide-in-from-left data-[closed]:slide-out-to-left',
      top: 'inset-x-0 top-0 border-b data-[expanded]:slide-in-from-top data-[closed]:slide-out-to-top',
      bottom:
        'inset-x-0 bottom-0 border-t data-[expanded]:slide-in-from-bottom data-[closed]:slide-out-to-bottom',
    },
  },
  defaultVariants: { side: 'right' },
})

export const Sheet = DialogPrimitive
export const SheetTrigger = DialogPrimitive.Trigger
export const SheetCloseButton = DialogPrimitive.CloseButton

type SheetContentProps<T extends ValidComponent = 'div'> = ComponentProps<
  typeof DialogPrimitive.Content<T>
> &
  VariantProps<typeof sheetVariants> & { showCloseButton?: boolean }

export function SheetContent<T extends ValidComponent = 'div'>(props: SheetContentProps<T>) {
  const [, rest] = splitProps(props as SheetContentProps, [
    'class',
    'side',
    'children',
    'showCloseButton',
  ])
  return (
    <>
      <DialogPrimitive.Overlay
        data-slot="sheet-overlay"
        class="data-[expanded]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[expanded]:fade-in-0 fixed inset-0 z-50 bg-black/50"
      />
      <DialogPrimitive.Content
        data-slot="sheet-content"
        class={cx(
          'data-[expanded]:animate-in data-[closed]:animate-out data-[expanded]:duration-300 data-[closed]:duration-200',
          sheetVariants({ side: props.side }),
          props.class
        )}
        {...rest}
      >
        {props.children}
        <Show when={props.showCloseButton !== false}>
          <DialogPrimitive.CloseButton
            aria-label="Fermer"
            class="focus-visible:ring-ring absolute top-4 right-4 rounded-md opacity-70 transition-opacity hover:opacity-100 focus-visible:ring-2 focus-visible:outline-none"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="size-4">
              <path
                fill="none"
                stroke="currentColor"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M18 6L6 18M6 6l12 12"
              />
            </svg>
          </DialogPrimitive.CloseButton>
        </Show>
      </DialogPrimitive.Content>
    </>
  )
}

export const SheetHeader: Component<ComponentProps<'div'>> = (props) => (
  <div class="flex flex-col gap-2 px-5 pt-5 pb-4 border-b border-border" {...props} />
)

export const SheetTitle = <T extends ValidComponent = 'h2'>(
  props: ComponentProps<typeof DialogPrimitive.Title<T>>
) => (
  <DialogPrimitive.Title
    data-slot="sheet-title"
    class="text-base font-bold tracking-tight text-foreground break-words"
    {...(props as any)}
  />
)

export const SheetDescription = <T extends ValidComponent = 'p'>(
  props: ComponentProps<typeof DialogPrimitive.Description<T>>
) => (
  <DialogPrimitive.Description
    data-slot="sheet-description"
    class="text-xs text-muted-foreground"
    {...(props as any)}
  />
)

export const SheetBody: Component<ComponentProps<'div'>> = (props) => (
  <div class="flex-1 overflow-y-auto px-5 py-4 space-y-5" {...props} />
)
