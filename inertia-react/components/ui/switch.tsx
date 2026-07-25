import * as React from "react"
import { Switch as AstryxSwitch } from "@astryxdesign/core/Switch"
import { cx } from "@r/lib/cx"

// Switch — Lot 2 (issue #90). Wrap Astryx Switch (était Base UI Root+Thumb).
//
// API shadcn conservée : checked (contrôlé), defaultChecked (non-contrôlé),
// onCheckedChange, disabled, className, aria-label.
//
// Astryx Switch est contrôlé-only (value: boolean requis) — le wrapper
// gère l'état interne quand ni `checked` ni `defaultChecked` ne sont
// passés, pour préserver le mode non-contrôlé shadcn.

type SwitchProps = Omit<React.ComponentProps<"input">, "onChange" | "value" | "checked" | "defaultChecked" | "type"> & {
  /** État contrôlé. */
  checked?: boolean
  /** État initial non contrôlé. */
  defaultChecked?: boolean
  /** Callback Base UI / shadcn — signature (checked: boolean) => void. */
  onCheckedChange?: (checked: boolean) => void
  /** Label accessible — requis par Astryx. Si absent, fallback générique. */
  "aria-label"?: string
}

function Switch({
  className,
  checked,
  defaultChecked = false,
  onCheckedChange,
  ...props
}: SwitchProps) {
  const label = props["aria-label"] ?? "Switch"
  // Si non contrôlé, on maintient l'état localement pour simuler
  // defaultChecked — Astryx Switch n'a pas de mode non-contrôlé natif.
  const isControlled = checked !== undefined
  const [internalValue, setInternalValue] = React.useState(defaultChecked)
  const value = isControlled ? checked! : internalValue

  return (
    <AstryxSwitch
      data-slot="switch"
      label={label}
      isLabelHidden
      value={value}
      onChange={(next: boolean) => {
        if (!isControlled) setInternalValue(next)
        onCheckedChange?.(next)
      }}
      className={cx(
        "peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input",
        className
      )}
      {...props}
    />
  )
}

export { Switch }
export type { SwitchProps }
