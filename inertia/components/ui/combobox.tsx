import { Combobox as Cb } from '@kobalte/core/combobox'
import { createMemo } from 'solid-js'

/**
 * Select avec recherche (Kobalte Combobox), stylé comme `ui/select`.
 * API simple : options { value, label }, valeur contrôlée par `value` (string).
 * La saisie filtre la liste (defaultFilter Kobalte, insensible à la casse).
 */
export interface ComboOption {
  value: string
  label: string
}

export function Combobox(props: {
  options: ComboOption[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  class?: string
}) {
  const selected = createMemo(() => props.options.find((o) => o.value === props.value) ?? null)

  return (
    <Cb<ComboOption>
      options={props.options}
      optionValue="value"
      optionTextValue="label"
      optionLabel="label"
      value={selected()}
      onChange={(o) => o && props.onChange(o.value)}
      placeholder={props.placeholder ?? 'Rechercher…'}
      class={props.class}
      itemComponent={(ip) => (
        <Cb.Item
          item={ip.item}
          class="focus:bg-accent focus:text-accent-foreground relative flex cursor-default items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-sm outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
        >
          <Cb.ItemLabel>{ip.item.rawValue.label}</Cb.ItemLabel>
          <Cb.ItemIndicator>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="size-4">
              <path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m5 12l5 5L20 7" />
            </svg>
          </Cb.ItemIndicator>
        </Cb.Item>
      )}
    >
      <Cb.Control class="border-input focus-within:border-ring focus-within:ring-ring/50 flex items-center justify-between gap-1 rounded-md border bg-card px-3 shadow-xs transition-[color,box-shadow] focus-within:ring-[3px]">
        <Cb.Input class="h-[32px] w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
        <Cb.Trigger class="shrink-0 opacity-50">
          <Cb.Icon>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="size-4">
              <path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m6 9l6 6l6-6" />
            </svg>
          </Cb.Icon>
        </Cb.Trigger>
      </Cb.Control>
      <Cb.Portal>
        <Cb.Content class="bg-popover text-popover-foreground relative z-50 max-h-[300px] min-w-[var(--kb-popper-anchor-width)] overflow-y-auto rounded-md border shadow-md">
          <Cb.Listbox class="p-1 outline-none" />
        </Cb.Content>
      </Cb.Portal>
    </Cb>
  )
}
