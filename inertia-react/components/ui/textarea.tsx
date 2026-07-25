import * as React from "react"
import { TextArea as AstryxTextArea } from "@astryxdesign/core/TextArea"

import { cn } from "@r/lib/utils"

// Textarea — Lot 2 (issue #90). Wrap Astryx TextArea (était <textarea> natif).
// API shadcn conservée : tous les props <textarea> HTML standard + className.
// Astryx TextArea exige `label` (a11y), `value: string` (pas number/readonly)
// et `onChange(value, e)` au lieu de `onChange(e)`. Le wrapper adapte.

type TextareaProps = Omit<
  React.ComponentProps<"textarea">,
  "onChange" | "value" | "defaultValue"
> & {
  /** Valeur contrôlée — normalisée en string. */
  value?: string | number | readonly string[]
  /** Valeur initiale non contrôlée. */
  defaultValue?: string | number | readonly string[]
  /** Callback React standard `(e) => void`. */
  onChange?: React.ChangeEventHandler<HTMLTextAreaElement>
  /** Label accessible — requis par Astryx. */
  "aria-label"?: string
}

function Textarea({
  className,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  onChange,
  value,
  defaultValue,
  ...props
}: TextareaProps) {
  const label = ariaLabel ?? "Textarea"
  // Astryx TextArea exige value: string (contrôlé). On normalise :
  // undefined → "" (mode non-contrôlé via defaultValue).
  const normalizedValue = (value ?? defaultValue ?? "") as string
  return (
    <AstryxTextArea
      data-slot="textarea"
      label={label}
      aria-labelledby={ariaLabelledBy}
      value={normalizedValue}
      onChange={onChange ? (_v: string, e: React.ChangeEvent<HTMLTextAreaElement>) => onChange(e) : undefined}
      className={cn(
        "flex field-sizing-content min-h-16 w-full rounded-[8px] border border-input bg-transparent px-2.5 py-2 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
export type { TextareaProps }
