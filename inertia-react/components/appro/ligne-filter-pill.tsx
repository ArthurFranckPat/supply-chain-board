/**
 * Filtre « ligne de production » de la toolbar Approvisionnement — pill
 * dropdown dédiée (même grammaire que le filtre client du Suivi : Popover
 * base-ui + PILL). Contrairement aux filtres secondaires du menu, changer de
 * ligne REFETCH le plan : les quantités sont recalculées serveur sur la
 * population de la ligne (pas un masque sur des totaux toutes lignes).
 * Sélection unique — « Toutes les lignes » par défaut, croix d'effacement,
 * compte de lignes de demande par ligne de production.
 */
import { useState } from 'react'
import { Popover } from '@base-ui/react/popover'
import { ChevronDown, Factory, Search, X } from 'lucide-react'

import { cn } from '@r/lib/utils'
import { PILL } from '@r/components/vision/toolbar'
import type { ApproLigne } from '@r/lib/appro/types'

const fold = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

export function LigneFilterPill(props: {
  lignes: ApproLigne[]
  /** Poste retenu — null = toutes. */
  value: string | null
  onChange: (code: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const q = fold(query.trim())
  const filtered = q
    ? props.lignes.filter((l) => fold(`${l.code} ${l.label}`).includes(q))
    : props.lignes
  const active = props.value ? props.lignes.find((l) => l.code === props.value) : null

  return (
    <Popover.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) setQuery('')
      }}
    >
      <div data-print-keep className="relative">
        <Popover.Trigger
          aria-label={`Ligne de production : ${active?.label ?? 'toutes'}${open ? ' — fermer' : ' — ouvrir'}`}
          title="Filtrer par ligne de production"
          className={cn(PILL, props.value && 'border-brand')}
        >
          <Factory size={14} strokeWidth={1.75} className="text-muted-foreground" />
          <span
            className={cn(
              'max-w-[160px] truncate whitespace-nowrap',
              !props.value && 'text-muted-foreground'
            )}
          >
            {active ? active.label : 'Ligne de prod'}
          </span>
          {props.value && (
            <span
              role="button"
              tabIndex={-1}
              aria-label="Retirer le filtre ligne de production"
              onClick={(e) => {
                e.stopPropagation()
                props.onChange(null)
              }}
              className="text-muted-foreground hover:text-foreground"
            >
              <X size={13} strokeWidth={2} />
            </span>
          )}
          <ChevronDown size={16} strokeWidth={1.75} className="text-muted-foreground" />
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Positioner
            side="bottom"
            align="start"
            sideOffset={8}
            collisionPadding={8}
            className="z-50"
          >
            <Popover.Popup className="w-[280px] rounded-lg border border-rule bg-popover p-2 shadow-lg">
              <div className="flex min-h-[30px] items-center gap-1.5 rounded-full border border-rule bg-card px-3">
                <Search size={13} strokeWidth={1.75} className="text-muted-foreground" />
                <input
                  className="w-full border-0 bg-transparent px-0 text-xs font-medium text-foreground shadow-none outline-none"
                  placeholder="Rechercher une ligne…"
                  type="text"
                  autoComplete="off"
                  value={query}
                  onChange={(e) => setQuery(e.currentTarget.value)}
                />
              </div>
              <div className="mt-1.5 max-h-[280px] overflow-y-auto">
                <button
                  type="button"
                  className={cn(
                    'flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors',
                    !props.value
                      ? 'bg-brand-soft font-semibold text-brand'
                      : 'text-foreground hover:bg-secondary'
                  )}
                  onClick={() => props.onChange(null)}
                >
                  Toutes les lignes
                </button>
                {filtered.map((l) => {
                  const isActive = l.code === props.value
                  return (
                    <button
                      key={l.code}
                      type="button"
                      className={cn(
                        'flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors',
                        isActive
                          ? 'bg-brand-soft font-semibold text-brand'
                          : 'text-foreground hover:bg-secondary'
                      )}
                      onClick={() => props.onChange(isActive ? null : l.code)}
                    >
                      <span className="truncate">
                        {l.label}
                        {l.label !== l.code && (
                          <span className="ml-1.5 font-mono text-[10px] font-medium text-muted-foreground">
                            {l.code}
                          </span>
                        )}
                      </span>
                      <span className="font-mono text-2xs tabular-nums text-muted-foreground">
                        {l.count}
                      </span>
                    </button>
                  )
                })}
                {filtered.length === 0 && (
                  <p className="px-2 py-3 text-center text-xs text-muted-foreground">
                    Aucune ligne ne correspond.
                  </p>
                )}
              </div>
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </div>
    </Popover.Root>
  )
}
