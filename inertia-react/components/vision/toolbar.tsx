import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react'
import { fr } from 'react-day-picker/locale'
import type { DateRange as DayPickerRange } from 'react-day-picker'
import { Link } from '@inertiajs/react'
import { CalendarDays, ChevronDown, RefreshCw, SlidersHorizontal } from 'lucide-react'
import { cn } from '@r/lib/utils'
import { Calendar } from '@r/components/ui/calendar'

/** Grammaire visuelle unifiée des toolbars de page (Programme, Charge, Suivi,
 *  Ruptures) — SOURCE UNIQUE. Avant ce fichier, chaque page recopiait ses
 *  propres variantes (`h-[30px]` vs `min-h-[30px]`, `text-[11px]` vs `text-xs`,
 *  refresh icône+texte vs icône seule, pill fenêtre positionnée différemment
 *  selon la page). Toute nouvelle toolbar DOIT réutiliser ces primitives au
 *  lieu de recopier des classes à la main.
 *
 *  Ordre canonique d'une rangée : segment(s) de vue → pill fenêtre de dates →
 *  segment(s) de filtre → <ToolbarSpacer /> → recherche/portée → RefreshPill →
 *  actions optionnelles. */

export const SEG = 'inline-flex items-center gap-0.5 rounded-lg border border-rule bg-card p-0.5'
export const SEG_BTN_ON =
  'min-h-[28px] rounded-md px-3 py-1 font-mono text-2xs font-semibold bg-brand-soft text-brand transition-colors'
export const SEG_BTN_OFF =
  'min-h-[28px] rounded-md px-3 py-1 font-mono text-2xs font-semibold text-muted-foreground hover:text-foreground transition-colors'
export const SEG_LBL =
  'px-1.5 font-mono text-3xs font-semibold text-muted-foreground'
export const PILL =
  'inline-flex min-h-[30px] items-center gap-1.5 rounded-full border border-rule bg-card px-3 py-1 text-xs font-semibold text-foreground transition-colors hover:border-brand'

export function ToolbarRow(props: { children: ReactNode; className?: string; noWrap?: boolean }) {
  return (
    <div
      data-print-toolbar
      className={cn(
        'flex flex-none items-center gap-2.5 border-b border-rule px-7 py-2 min-h-[48px]',
        props.noWrap ? 'flex-nowrap' : 'flex-wrap',
        props.className
      )}
    >
      {props.children}
    </div>
  )
}

export function ToolbarSpacer() {
  return <div className="flex-1" />
}

/** Groupe de choix exclusifs (mode, statut, vue…). */
export function Segment(props: {
  label?: string
  ariaLabel?: string
  role?: 'radiogroup'
  className?: string
  children: ReactNode
}) {
  return (
    <div className={cn(SEG, props.className)} role={props.role} aria-label={props.ariaLabel}>
      {props.label && <span className={SEG_LBL}>{props.label}</span>}
      {props.children}
    </div>
  )
}

export function SegmentButton(props: {
  active: boolean
  onClick: () => void
  title?: string
  role?: 'radio'
  children: ReactNode
}) {
  return (
    <button
      type="button"
      role={props.role}
      aria-checked={props.role === 'radio' ? props.active : undefined}
      aria-pressed={props.role !== 'radio' ? props.active : undefined}
      title={props.title}
      className={props.active ? SEG_BTN_ON : SEG_BTN_OFF}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  )
}

const MONTHS_SHORT_FR = [
  'janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin',
  'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.',
]

/** Pill fenêtre de dates — même position, même popover partout. Chaque page
 *  garde son propre câblage (state local, navigation serveur…) via `onSelect`.
 *  Le libellé est calculé ICI depuis `selected` (01 janv. → 01 janv., sans
 *  année) — chaque page passait avant son propre format (ISO serveur avec
 *  tiret cadratin, dd/mm/yyyy complet…), d'où l'incohérence visuelle entre
 *  pages. Tableau statique plutôt qu'Intl : déterministe, pas de coût de
 *  locale-loading par rendu. */
function formatShort(d?: Date): string | null {
  if (!d) return null
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS_SHORT_FR[d.getMonth()]}`
}

function formatWindowLabel(from?: Date, to?: Date): string {
  const f = formatShort(from)
  const t = formatShort(to)
  if (!f && !t) return '—'
  if (!f) return t ?? '—'
  if (!t) return f
  return `${f} → ${t}`
}

export function DateWindowPill(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  selected: { from?: Date; to?: Date }
  onSelect: (range: DayPickerRange | undefined) => void
  align?: 'left' | 'right'
  numberOfMonths?: number
  title?: string
  /** Passthrough vers <Calendar> — ex. `{ after: new Date() }` pour interdire
   *  les dates futures (expéditions : pas de sélection au-delà d'aujourd'hui). */
  disabled?: ComponentProps<typeof Calendar>['disabled']
}) {
  const align = props.align ?? 'left'
  const label = formatWindowLabel(props.selected.from, props.selected.to)
  return (
    <div data-print-keep className="relative">
      <button
        type="button"
        aria-label={`Fenêtre : ${label}${props.open ? ' — fermer' : ' — ouvrir'}`}
        aria-expanded={props.open}
        title={props.title}
        onClick={() => props.onOpenChange(!props.open)}
        className={PILL}
      >
        <CalendarDays size={14} strokeWidth={1.75} className="text-muted-foreground" />
        <span className="whitespace-nowrap font-mono tabular-nums">{label}</span>
        <ChevronDown size={16} strokeWidth={1.75} className="text-muted-foreground" />
      </button>
      {props.open && (
        <>
          <button
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => props.onOpenChange(false)}
          />
          <div
            className={cn(
              'absolute top-full z-50 mt-2 rounded-lg border border-rule bg-popover shadow-float',
              align === 'right' ? 'right-0' : 'left-0'
            )}
          >
            <Calendar
              mode="range"
              locale={fr}
              numberOfMonths={props.numberOfMonths ?? 2}
              selected={
                props.selected.from ? { from: props.selected.from, to: props.selected.to } : undefined
              }
              onSelect={props.onSelect}
              disabled={props.disabled}
            />
          </div>
        </>
      )}
    </div>
  )
}

/** Bouton actualiser — icône seule partout (désencombre), title porte le
 *  label complet pour a11y/tooltip. `href` rend un <Link> Inertia (navigation
 *  serveur) ; sinon un <button> (refetch client via onClick). */
export function RefreshPill(props: {
  loading?: boolean
  onClick?: () => void
  href?: string
  title?: string
}) {
  const title = props.title ?? (props.loading ? 'Actualisation en cours…' : 'Recharger les données X3 (cache → re-fetch live)')
  const icon = (
    <RefreshCw
      size={14}
      strokeWidth={1.75}
      className={cn('text-muted-foreground', props.loading && 'animate-spin')}
    />
  )
  if (props.href) {
    return (
      <Link href={props.href} className={PILL} title={title} aria-label="Actualiser">
        {icon}
      </Link>
    )
  }
  return (
    <button
      type="button"
      disabled={props.loading}
      onClick={props.onClick}
      className={cn(PILL, 'disabled:opacity-60')}
      title={title}
      aria-label="Actualiser"
    >
      {icon}
    </button>
  )
}

/** Déclencheur unique qui regroupe les filtres secondaires (statut, verdict,
 *  type, atelier…) derrière un seul pill au lieu d'empiler un `<Segment>`
 *  par facette dans la rangée — c'est ce qui provoquait le débordement sur
 *  Programme/Suivi/Ruptures. La recherche N'EST PAS un filtre secondaire :
 *  elle reste toujours visible dans la rangée principale, jamais ici.
 *
 *  Implémentation : `<details>` natif (accessible, zero deps, clic extérieur
 *  + Échap ferment). `indicators` porte le signal d'état actif sur le
 *  déclencheur (pastilles colorées, badge…) pour rester lisible fermé. */
export function FilterMenu(props: {
  label?: string
  indicators?: ReactNode
  panelClassName?: string
  align?: 'left' | 'right'
  children: ReactNode
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null)
  const [open, setOpen] = useState(false)
  const align = props.align ?? 'right'

  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      if (!detailsRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <details
      ref={detailsRef}
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
      className="relative"
    >
      <summary
        className={cn(
          PILL,
          'cursor-pointer list-none [&::-webkit-details-marker]:hidden',
          open && 'border-brand'
        )}
        title="Filtres"
      >
        <SlidersHorizontal size={14} strokeWidth={1.75} className="text-muted-foreground" />
        {props.label ?? 'Filtres'}
        {props.indicators}
        <ChevronDown size={16} strokeWidth={1.75} className="text-muted-foreground" />
      </summary>

      <div
        className={cn(
          'absolute top-full z-50 mt-1.5 w-[280px] rounded-lg border border-rule bg-popover p-2.5 shadow-lg',
          align === 'right' ? 'right-0' : 'left-0',
          props.panelClassName
        )}
      >
        {props.children}
      </div>
    </details>
  )
}

/** En-tête de section dans un panneau `FilterMenu` (ex. "Statut", "Atelier"). */
export function FilterMenuSectionLabel(props: { children: ReactNode }) {
  return (
    <div className="px-0.5 pb-1.5 font-mono text-3xs font-bold uppercase tracking-wider text-muted-foreground">
      {props.children}
    </div>
  )
}
