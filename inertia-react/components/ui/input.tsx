import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@r/lib/utils"

// Aligné sur Airbnb DESIGN.md `text-input` :
// • 56px (h-14), 14×12px padding, 8px radius (rounded-md)
// • hairline border (border-input = --input token, déjà #c1c1c1 sous .theme-airbnb)
// • focus = ink border épais, PAS de ring bleu / glow.
//   Implémentation : on retire le focus-visible:ring-* et on force border-foreground
//   à 2px. Le `border` default reste 1px hairline.
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        // Grammaire : contrôle = rayon 8 px (airbnb-grammar.html).
        "h-14 w-full min-w-0 rounded-[8px] border bg-transparent px-3.5 py-3.5 text-base font-normal transition-colors outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground hover:border-[var(--input,#c1c1c1)] focus-visible:border-2 focus-visible:border-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:border-2 dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive",
        className
      )}
      {...props}
    />
  )
}

export { Input }
