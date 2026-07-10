/**
 * Tooltip shadcn-solid (Kobalte Tooltip).
 *
 * Issue #62 (lot 3) : les boutons de mode et le toggle « Scénario » ont besoin
 * de tooltips (libellés explicites, raison du disabled). Kobalte fournit le
 * positioning, le focus management et le délai d'apparition.
 *
 * Usage :
 *   <Tooltip>
 *     <TooltipTrigger class="…" onClick={…}>Label</TooltipTrigger>
 *     <TooltipContent>Texte</TooltipContent>
 *   </Tooltip>
 *
 * NB : Kobalte ne supporte PAS `asChild` (modèle Radix). Le Trigger est
 * lui-même un <button> polymorphe — on passe class/props/children directement.
 */
import type { ComponentProps, ValidComponent } from 'solid-js'
import { splitProps } from 'solid-js'
import { Tooltip as TooltipPrimitive } from '@kobalte/core/tooltip'
import { cx } from '@/libs/cva'

export const Tooltip = TooltipPrimitive.Root
export const TooltipTrigger = TooltipPrimitive.Trigger

export type TooltipContentProps<T extends ValidComponent = 'div'> = ComponentProps<
  typeof TooltipPrimitive.Content<T>
>

export const TooltipContent = <T extends ValidComponent = 'div'>(
  props: TooltipContentProps<T>,
) => {
  const [, rest] = splitProps(props as TooltipContentProps, ['class'])
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        class={cx(
          'z-50 max-w-xs rounded-md bg-primary px-2.5 py-1 text-xs text-primary-foreground shadow-md',
          'data-[expanded]:animate-in data-[expanded]:fade-in-0 data-[expanded]:zoom-in-95',
          'data-[closed]:animate-out data-[closed]:fade-out-0 data-[closed]:zoom-out-95',
          props.class,
        )}
        {...rest}
      />
    </TooltipPrimitive.Portal>
  )
}
