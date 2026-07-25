import * as React from "react"
import { TextInput as AstryxTextInput, type TextInputType } from "@astryxdesign/core/TextInput"

import { cx } from "@r/lib/cx"

// Aligné sur Airbnb DESIGN.md `text-input` :
// • 56px (h-14), 14×12px padding, 8px radius (rounded-md)
// • hairline border (border-input = --input token)
// • focus = ink border épais, PAS de ring bleu / glow.
//
// Lot 2 (issue #90) — Base UI Input → Astryx TextInput.
// Astryx TextInput exige `label` (a11y), `value: string` (contrôlé),
// `onChange(value, e)`. Wrapper normalise.

type InputProps = Omit<
  React.ComponentProps<"input">,
  "onChange" | "value" | "defaultValue" | "size"
> & {
  value?: string | number | readonly string[]
  defaultValue?: string | number | readonly string[]
  onChange?: React.ChangeEventHandler<HTMLInputElement>
  "aria-label"?: string
}

function Input({
  className,
  type = "text",
  "aria-label": ariaLabel,
  value,
  defaultValue,
  onChange,
  ...props
}: InputProps) {
  const label = ariaLabel ?? "Input"
  const normalizedValue = (value ?? defaultValue ?? "") as string
  return (
    <AstryxTextInput
      type={(["text", "password", "email"].includes(type as string) ? (type as TextInputType) : "text")}
      data-slot="input"
      label={label}
      isLabelHidden
      value={normalizedValue}
      onChange={onChange ? (_v: string, e: React.ChangeEvent<HTMLInputElement>) => onChange(e) : undefined}
      className={cx(
        // Grammaire : contrôle = rayon 8 px (airbnb-grammar.html).
        "h-14 w-full min-w-0 rounded-[8px] border bg-transparent px-3.5 py-3.5 text-base font-normal transition-colors outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground hover:border-[var(--input,#c1c1c1)] focus-visible:border-2 focus-visible:border-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:border-2 dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive",
        className
      )}
      {...props}
    />
  )
}

export { Input }
export type { InputProps }
