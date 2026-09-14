'use client'

import * as React from 'react'
import { Tooltip as TooltipPrimitive } from '@base-ui/react/tooltip'

import { cn } from '@r/lib/utils'

/**
 * Tooltip shadcn sur Base UI — la primitive manquait dans `components/ui`.
 *
 * Il en existe un autre dans `components/base/tooltip` : celui-là est BoardUI, monté sur
 * react-aria et sur SES tokens (`text-text-primary`, `bg-background-primary-default`).
 * Les deux systèmes cohabitent dans le dépôt mais ne doivent pas se croiser dans une même
 * page : /sequenceur, /programme et /suivi sont en shadcn + tokens du thème (`foreground`,
 * `popover`, `border`), donc c'est CE fichier qu'ils utilisent.
 *
 * Géométrie et animations alignées sur `select.tsx` (même Portal/Positioner/Popup, mêmes
 * transitions d'ouverture) pour que les surfaces flottantes de la page se ressemblent.
 */

function TooltipProvider({
  delay = 200,
  closeDelay = 0,
  ...props
}: TooltipPrimitive.Provider.Props) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delay={delay}
      closeDelay={closeDelay}
      {...props}
    />
  )
}

/**
 * Le délai d'ouverture se règle sur `TooltipProvider`, pas ici (Base UI 1.6) : poser UN
 * provider autour de la vue plutôt qu'un par déclencheur — un board en compte des centaines.
 */
function Tooltip(props: TooltipPrimitive.Root.Props) {
  return <TooltipPrimitive.Root data-slot="tooltip" {...props} />
}

/**
 * `render` permet d'habiller un élément existant (un badge, une pastille) plutôt que
 * d'injecter un bouton : Base UI fusionne alors ses handlers dans cet élément.
 */
function TooltipTrigger(props: TooltipPrimitive.Trigger.Props) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />
}

function TooltipContent({
  className,
  children,
  side = 'top',
  sideOffset = 6,
  align = 'center',
  showArrow = true,
  ...props
}: TooltipPrimitive.Popup.Props &
  Pick<TooltipPrimitive.Positioner.Props, 'side' | 'sideOffset' | 'align'> & {
    /** Petit caret pointant vers le déclencheur. */
    showArrow?: boolean
  }) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        className="isolate z-50"
      >
        <TooltipPrimitive.Popup
          data-slot="tooltip-content"
          className={cn(
            'relative z-50 max-w-[320px] origin-(--transform-origin) rounded-[10px] border border-border bg-popover px-2.5 py-2 text-[12px] text-popover-foreground shadow-float duration-[140ms] data-[side=bottom]:slide-in-from-top-1 data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1 data-[side=top]:slide-in-from-bottom-1 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95',
            className
          )}
          {...props}
        >
          {showArrow && (
            <TooltipPrimitive.Arrow className="data-[side=bottom]:top-[-5px] data-[side=bottom]:rotate-180 data-[side=left]:right-[-8px] data-[side=left]:rotate-90 data-[side=right]:left-[-8px] data-[side=right]:-rotate-90 data-[side=top]:bottom-[-5px]">
              {/* Deux triangles superposés : le premier peint la bordure, le second la
                  surface, décalé d'un pixel — un seul path ne peut pas rendre les deux. */}
              <svg width="12" height="6" viewBox="0 0 12 6" className="block">
                <path d="M0 6 L6 0 L12 6" className="fill-border" />
                <path d="M1.5 6 L6 1.5 L10.5 6" className="fill-popover" />
              </svg>
            </TooltipPrimitive.Arrow>
          )}
          {children}
        </TooltipPrimitive.Popup>
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  )
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
