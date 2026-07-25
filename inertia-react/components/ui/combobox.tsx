"use client"

import * as React from "react"
import { Typeahead as AstryxTypeahead, createStaticSource, type SearchableItem } from "@astryxdesign/core/Typeahead"

import { cn } from "@r/lib/utils"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@r/components/ui/input-group"
import { ChevronDownIcon, XIcon } from "lucide-react"

// Combobox — Lot 3 (issue #90). Base UI Combobox composé (16 exports,
// z-stacking custom via layerClassName) → Astryx Typeahead monolithique.
//
// Le wrapper préserve l'API shadcn via un context local qui collecte
// options + gère value/onChange. Les sous-composants avancés (Chips,
// Chip, ChipsInput, Collection) deviennent des no-ops ou wrappers triviaux
// — Astryx Typeahead ne supporte pas le multi-select chips natif.
// Consumers : print-test, calendrier, charge-period-sheet (single-select).

interface ComboboxOption extends SearchableItem {
  id: string
  label: string
  value: string
}

interface ComboboxContextValue {
  value: ComboboxOption | null
  setValue: (next: ComboboxOption | null) => void
  options: ComboboxOption[]
  registerOption: (opt: ComboboxOption) => () => void
  label: string
  registerLabel: (label: string) => () => void
  placeholder: string
  registerPlaceholder: (p: string) => () => void
  query: string
  setQuery: (q: string) => void
}

const ComboboxContext = React.createContext<ComboboxContextValue | null>(null)

function useComboboxContext() {
  const ctx = React.useContext(ComboboxContext)
  if (!ctx) throw new Error("Combobox.* doit être utilisé dans <Combobox>")
  return ctx
}

type ComboboxProps = {
  value?: unknown
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onValueChange?: (value: any) => void
  /** API Base UI — ignoré, Astryx Typeahead gère via onChangeQuery. */
  onInputValueChange?: (value: string) => void
  /** Multi-select — non supporté par Astryx Typeahead (single-select only). */
  multiple?: boolean
  children: React.ReactNode
}

function Combobox({ value: _value, onValueChange, onInputValueChange: _onInputValueChange, multiple: _multiple, children }: ComboboxProps) {
  const [internalValue, setInternalValue] = React.useState<ComboboxOption | null>(null)
  const [options, setOptions] = React.useState<ComboboxOption[]>([])
  const [label, setLabel] = React.useState("Combobox")
  const [placeholder, setPlaceholder] = React.useState("")
  const [query, setQuery] = React.useState("")

  const setValue = React.useCallback(
    (next: ComboboxOption | null) => {
      setInternalValue(next)
      onValueChange?.(next?.value ?? null)
    },
    [onValueChange]
  )

  const registerOption = React.useCallback((opt: ComboboxOption) => {
    setOptions((prev) => {
      if (prev.some((o) => o.value === opt.value)) return prev
      return [...prev, opt]
    })
    return () => setOptions((prev) => prev.filter((o) => o.value !== opt.value))
  }, [])
  const registerLabel = React.useCallback((l: string) => {
    setLabel(l)
    return () => setLabel("Combobox")
  }, [])
  const registerPlaceholder = React.useCallback((p: string) => {
    setPlaceholder(p)
    return () => setPlaceholder("")
  }, [])

  const ctx = React.useMemo<ComboboxContextValue>(
    () => ({
      value: internalValue,
      setValue,
      options,
      registerOption,
      label,
      registerLabel,
      placeholder,
      registerPlaceholder,
      query,
      setQuery,
    }),
    [internalValue, setValue, options, registerOption, label, registerLabel, placeholder, registerPlaceholder, query]
  )

  return <ComboboxContext.Provider value={ctx}>{children}</ComboboxContext.Provider>
}

// Passe-plats — sous-composants shadcn qui ne font que décorer/enregistrer.
function ComboboxValue({ children }: { children?: React.ReactNode }) {
  return <>{children}</>
}

function ComboboxTrigger({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <div data-slot="combobox-trigger" className={cn("[&_svg:not([class*='size-'])]:size-4", className)}>
      {children}
      <ChevronDownIcon className="pointer-events-none size-4 text-muted-foreground" />
    </div>
  )
}

function ComboboxClear({ onClick, className, disabled }: { onClick?: () => void; className?: string; disabled?: boolean }) {
  return (
    <InputGroupButton variant="ghost" size="icon-xs" onClick={onClick} className={className} disabled={disabled} data-slot="combobox-clear">
      <XIcon className="pointer-events-none" />
    </InputGroupButton>
  )
}

function ComboboxInput({
  className,
  children,
  disabled = false,
  showTrigger = true,
  showClear = false,
  placeholder,
  id: _id,
  "aria-label": ariaLabel,
}: {
  className?: string
  children?: React.ReactNode
  disabled?: boolean
  showTrigger?: boolean
  showClear?: boolean
  placeholder?: string
  id?: string
  "aria-label"?: string
}) {
  const { registerLabel, registerPlaceholder, setQuery } = useComboboxContext()
  React.useEffect(() => {
    if (ariaLabel) return registerLabel(ariaLabel)
  }, [ariaLabel, registerLabel])
  React.useEffect(() => {
    if (placeholder) return registerPlaceholder(placeholder)
  }, [placeholder, registerPlaceholder])

  return (
    <InputGroup className={cn("w-auto", className)}>
      <InputGroupInput
        disabled={disabled}
        placeholder={placeholder}
        aria-label={ariaLabel}
        onChange={(e) => setQuery((e.target as HTMLInputElement).value)}
      />
      <InputGroupAddon align="inline-end">
        {showTrigger && (
          <InputGroupButton size="icon-xs" variant="ghost" data-slot="input-group-button" disabled={disabled}>
            <ChevronDownIcon className="size-4" />
          </InputGroupButton>
        )}
        {showClear && <ComboboxClear disabled={disabled} />}
      </InputGroupAddon>
      {children}
    </InputGroup>
  )
}

function ComboboxContent({
  children,
  side: _side,
  sideOffset: _sideOffset,
  align: _align,
  alignOffset: _alignOffset,
  anchor: _anchor,
  layerClassName: _layerClassName,
  className,
}: {
  children?: React.ReactNode
  side?: "top" | "bottom"
  sideOffset?: number
  align?: "start" | "center" | "end"
  alignOffset?: number
  anchor?: unknown
  layerClassName?: string
  className?: string
}) {
  const { options, value, setValue, label, placeholder, query } = useComboboxContext()
  const source = React.useMemo(() => {
    const filtered = query
      ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
      : options
    return createStaticSource(filtered as SearchableItem[])
  }, [options, query])

  return (
    <div data-slot="combobox-content" className={cn("relative", className)}>
      <AstryxTypeahead
        label={label}
        value={value as SearchableItem | null}
        onChange={(item: SearchableItem | null) => setValue(item as ComboboxOption | null)}
        placeholder={placeholder}
        searchSource={source}
        isLabelHidden
      />
      {children}
    </div>
  )
}

function ComboboxItem({
  value,
  children,
}: {
  value: string | null
  children?: React.ReactNode
}) {
  const { registerOption } = useComboboxContext()
  const label = typeof children === "string" ? children : (value ?? "")
  const safeValue = value ?? ""
  React.useEffect(() => {
    return registerOption({ id: safeValue, value: safeValue, label })
  }, [safeValue, label, registerOption])
  return null
}

// No-ops / passes-plats pour les sous-composants non critiques.
function ComboboxList({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <div data-slot="combobox-list" className={className}>{children}</div>
}
function ComboboxGroup({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <div data-slot="combobox-group" className={className}>{children}</div>
}
function ComboboxLabel({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <div data-slot="combobox-label" className={className}>{children}</div>
}
function ComboboxCollection({ children }: { children?: React.ReactNode }) {
  return <>{children}</>
}
function ComboboxEmpty({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <div data-slot="combobox-empty" className={className}>{children ?? "Aucun résultat"}</div>
}
function ComboboxSeparator({ className }: { className?: string }) {
  return <div data-slot="combobox-separator" className={cn("h-px bg-border", className)} />
}
function ComboboxChips({ children, className }: { children?: React.ReactNode; className?: string }) {
  // Astryx Typeahead ne supporte pas le multi-select chips natif.
  // Wrapper minimum pour compat — consumers multi-select doivent adapter.
  return <div data-slot="combobox-chips" className={className}>{children}</div>
}
function ComboboxChip({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <div data-slot="combobox-chip" className={className}>{children}</div>
}
function ComboboxChipsInput({ className, ...props }: React.ComponentProps<"input">) {
  return <input data-slot="combobox-chip-input" className={cn("min-w-16 flex-1 outline-none", className)} {...props} />
}
function useComboboxAnchor() {
  return React.useRef<HTMLDivElement | null>(null)
}

export {
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
  ComboboxGroup,
  ComboboxLabel,
  ComboboxCollection,
  ComboboxEmpty,
  ComboboxSeparator,
  ComboboxChips,
  ComboboxChip,
  ComboboxChipsInput,
  ComboboxTrigger,
  ComboboxValue,
  ComboboxClear,
  useComboboxAnchor,
}
