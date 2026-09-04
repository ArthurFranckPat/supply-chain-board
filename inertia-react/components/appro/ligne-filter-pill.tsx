/**
 * Filtre « ligne de production » de la toolbar Approvisionnement.
 *
 * Porté en grammaire BoardUI (MCP `boardui`) : `Dropdown` + `DropdownItem`
 * pour le menu, `Input` pour la recherche, `Badge` pour le compte de lignes
 * de demande. Le déclencheur reprend la recette du bouton secondaire BoardUI
 * (cf. `./chrome`) — pas un sosie dessiné à la main.
 *
 * Contrairement aux filtres secondaires du menu Filtres, changer de ligne
 * REFETCH le plan : les quantités sont recalculées serveur sur la population
 * de la ligne, pas masquées sur des totaux toutes lignes. Sélection unique,
 * « Toutes les lignes » par défaut, croix d'effacement sur le déclencheur.
 */
import { useState } from 'react'
import { RiArrowDownSLine, RiBuilding2Line, RiCloseLine, RiSearchLine } from '@remixicon/react'

import { cx } from '@r/utils/cx'
import { Badge } from '@r/components/base/badges/badge'
import {
  Dropdown,
  DropdownItem,
  DropdownPopover,
  DropdownTrigger,
} from '@r/components/base/dropdown/dropdown'
import { Input } from '@r/components/base/input/input'
import { TRIGGER_SECONDARY } from '@r/components/appro/chrome'
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

  const pick = (code: string | null) => {
    props.onChange(code)
    setOpen(false)
  }

  return (
    <span data-print-keep>
      <Dropdown
        isOpen={open}
        onOpenChange={(o) => {
          setOpen(o)
          if (!o) setQuery('')
        }}
      >
        <DropdownTrigger
          aria-label={`Ligne de production : ${active?.label ?? 'toutes'}`}
          className={cx(
            TRIGGER_SECONDARY,
            props.value && 'border-border-button-active bg-background-primary-hover'
          )}
        >
          <RiBuilding2Line
            className="size-[18px] shrink-0 text-foreground-icon-secondary"
            aria-hidden
          />
          <span
            className={cx(
              'max-w-[150px] truncate whitespace-nowrap',
              !props.value && 'text-text-secondary'
            )}
          >
            {active ? active.label : 'Ligne de prod'}
          </span>
          {props.value && (
            // `span` et non `button` : on est déjà à l'intérieur du bouton
            // déclencheur, un bouton imbriqué est un markup invalide.
            <span
              role="button"
              tabIndex={-1}
              aria-label="Retirer le filtre ligne de production"
              onPointerDown={(e) => {
                e.stopPropagation()
                e.preventDefault()
                pick(null)
              }}
              className="text-foreground-icon-secondary hover:text-foreground-icon-hover"
            >
              <RiCloseLine className="size-4" aria-hidden />
            </span>
          )}
          <RiArrowDownSLine
            className="size-[18px] shrink-0 text-foreground-icon-secondary"
            aria-hidden
          />
        </DropdownTrigger>
        <DropdownPopover aria-label="Lignes de production" className="w-[288px]">
          <Input
            size="small"
            aria-label="Rechercher une ligne de production"
            placeholder="Rechercher une ligne…"
            leadingIcon={RiSearchLine}
            value={query}
            onChange={setQuery}
          />
          <div className="-mr-1 max-h-[280px] overflow-y-auto pr-1">
            <DropdownItem
              selected={!props.value}
              onSelect={() => pick(null)}
              className="px-2 py-1.5"
            >
              Toutes les lignes
            </DropdownItem>
            {filtered.map((l) => (
              <DropdownItem
                key={l.code}
                selected={l.code === props.value}
                onSelect={() => pick(l.code === props.value ? null : l.code)}
                className="justify-between px-2 py-1.5"
              >
                <span className="min-w-0 truncate">
                  {l.label}
                  {l.label !== l.code && (
                    <span className="ml-1.5 font-mono text-caption-2-medium text-text-tertiary">
                      {l.code}
                    </span>
                  )}
                </span>
                <Badge className="tabular-nums">{l.count}</Badge>
              </DropdownItem>
            ))}
            {filtered.length === 0 && (
              <p className="px-2 py-3 text-center text-body-regular text-text-secondary">
                Aucune ligne ne correspond.
              </p>
            )}
          </div>
        </DropdownPopover>
      </Dropdown>
    </span>
  )
}
