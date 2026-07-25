import * as React from "react"
import { Selector as AstryxSelector, type SelectorOptionType } from "@astryxdesign/core/Selector"

import { cn } from "@r/lib/utils"
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react"

// Select — Lot 3 (issue #90). Base UI Select composé → Astryx Selector
// monolithique. Context local collecte options/label/value/onChange via
// les sous-composants (SelectTrigger/SelectContent/SelectItem).
//
// Astryx Selector attend options: T[] + value + onChange. Le wrapper scanne
// les <SelectItem value label> dans <SelectContent> pour construire le
// tableau options.

interface SelectOption {
  value: string
  label: string
}

interface SelectContextValue {
  value: string | undefined
  setValue: (next: string) => void
  options: SelectOption[]
  registerOption: (opt: SelectOption) => () => void
  label: string
  registerLabel: (label: string) => () => void
  placeholder: string
  registerPlaceholder: (p: string) => () => void
  isOpen: boolean
  setIsOpen: (next: boolean) => void
}

const SelectContext = React.createContext<SelectContextValue | null>(null)

function useSelectContext() {
  const ctx = React.useContext(SelectContext)
  if (!ctx) throw new Error("Select.* doit être utilisé dans <Select>")
  return ctx
}

type SelectProps = {
  value?: string | null
  defaultValue?: string
  onValueChange?: (value: string | null) => void
  /** API custom react_lab — ignoré, options collectées via SelectItem. */
  items?: unknown
  children: React.ReactNode
}

function Select({ value, defaultValue, onValueChange, items: _items, children }: SelectProps) {
  const [internalValue, setInternalValue] = React.useState(defaultValue ?? "")
  const isControlled = value !== undefined
  const currentValue = isControlled ? value! : internalValue
  const setValue = React.useCallback(
    (next: string) => {
      if (!isControlled) setInternalValue(next)
      onValueChange?.(next)
    },
    [isControlled, onValueChange]
  )

  const [options, setOptions] = React.useState<SelectOption[]>([])
  const [label, setLabel] = React.useState("Select")
  const [placeholder, setPlaceholder] = React.useState("")

  const registerOption = React.useCallback((opt: SelectOption) => {
    setOptions((prev) => {
      if (prev.some((o) => o.value === opt.value)) return prev
      return [...prev, opt]
    })
    return () => setOptions((prev) => prev.filter((o) => o.value !== opt.value))
  }, [])
  const registerLabel = React.useCallback((l: string) => {
    setLabel(l)
    return () => setLabel("Select")
  }, [])
  const registerPlaceholder = React.useCallback((p: string) => {
    setPlaceholder(p)
    return () => setPlaceholder("")
  }, [])

  const value_ = React.useMemo<SelectContextValue>(
    () => ({
      value: currentValue,
      setValue,
      options,
      registerOption,
      label,
      registerLabel,
      placeholder,
      registerPlaceholder,
      isOpen: false,
      setIsOpen: () => {},
    }),
    [currentValue, setValue, options, registerOption, label, registerLabel, placeholder, registerPlaceholder]
  )

  return <SelectContext.Provider value={value_}>{children}</SelectContext.Provider>
}

function SelectTrigger({
  className,
  children,
  "aria-label": ariaLabel,
}: {
  className?: string
  children?: React.ReactNode
  size?: "sm" | "default"
  "aria-label"?: string
}) {
  const { label, registerLabel } = useSelectContext()
  React.useEffect(() => {
    if (ariaLabel) return registerLabel(ariaLabel)
  }, [ariaLabel, registerLabel])
  return (
    <div data-slot="select-trigger" className={cn("hidden", className)} aria-hidden>
      {/* Passe-plat invisible — Astryx Selector rend son propre trigger. */}
      {children ?? label}
    </div>
  )
}

function SelectValue({ placeholder }: { placeholder?: string; children?: React.ReactNode }) {
  const { registerPlaceholder } = useSelectContext()
  React.useEffect(() => {
    if (placeholder) return registerPlaceholder(placeholder)
  }, [placeholder, registerPlaceholder])
  return null
}

function SelectContent({
  children,
  side: _side,
}: {
  children?: React.ReactNode
  /** Side du menu — ignoré, Astryx gère le positionnement. */
  side?: "top" | "bottom"
}) {
  // Les <SelectItem> enfants s'enregistrent via context. AstryxSelector
  // rend le menu lui-même. Ce composant est un passe-plat qui déclenche
  // l'enregistrement des options.
  return <div data-slot="select-content" className="contents">{children}</div>
}

function SelectItem({ value, children }: { value: string | null; children?: React.ReactNode }) {
  const { registerOption } = useSelectContext()
  const label = typeof children === "string" ? children : (value ?? "")
  const safeValue = value ?? ""
  React.useEffect(() => {
    return registerOption({ value: safeValue, label })
  }, [safeValue, label, registerOption])
  return null
}

function SelectGroup({ children }: { children?: React.ReactNode }) {
  return <div data-slot="select-group" className="contents">{children}</div>
}

function SelectLabel({ children }: { children?: React.ReactNode }) {
  return <div data-slot="select-label">{children}</div>
}

function SelectSeparator() {
  return <div data-slot="select-separator" />
}

function SelectScrollUpButton() {
  return <ChevronUpIcon data-slot="select-scroll-up" className="hidden" />
}

function SelectScrollDownButton() {
  return <ChevronDownIcon data-slot="select-scroll-down" className="hidden" />
}

// Composant effectif : AstryxSelector rendu dans <Select> après les children
// pour collecter options. On l'expose via un wrapper externe.
function SelectRender() {
  const { value, setValue, options, label, placeholder } = useSelectContext()
  if (!options.length) return null
  const astryxOptions: SelectorOptionType[] = options.map((o) => ({ value: o.value, label: o.label }))
  return (
    <AstryxSelector
      label={label}
      options={astryxOptions}
      value={value ?? ""}
      onChange={(v: string) => setValue(v)}
      placeholder={placeholder}
    />
  )
}

export {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  SelectGroup,
  SelectLabel,
  SelectSeparator,
  SelectScrollUpButton,
  SelectScrollDownButton,
  SelectRender,
}
