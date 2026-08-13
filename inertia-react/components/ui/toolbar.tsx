import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { CalendarDays, ChevronDown, RefreshCw, SlidersHorizontal } from 'lucide-react'
import { Popover } from '@base-ui/react/popover'
import type { DateRange as DayPickerRange } from 'react-day-picker'
import { fr } from 'react-day-picker/locale'

import { cn } from '@r/lib/utils'
import { DynamicIcon } from './dynamic-icon'
import { Pill } from './pill'
import { Calendar } from './calendar'
import { useRangeCalendar } from '@r/lib/use-range-calendar'

// Toolbar — composant unifié pour les barres de filtrage au-dessus des pages
// métier (dashboard, suivi, ruptures, expeditions, receptions, etc.).
//
// Extrait du pattern dupliqué à 8 endroits dans le codebase :
//   <div className="flex flex-none flex-wrap items-center gap-2.5 border-b
//     border-rule px-7 py-2">…</div>
//
// À utiliser via la prop `toolbar` du AppLayout :
//   <AppLayout
//     toolbar={
//       <Toolbar>
//         <ToolbarSegment … />
//         <ToolbarSearch … />
//         <ToolbarRefresh … />
//       </Toolbar>
//     }
//   >
//
// Principes Airbnb :
// - pills rounded-full pour actions et toggles (DESIGN.md button-pill-rausch)
// - segmented control en pills compactes, fond muted, actif = card + ink
// - hairline border-rule (1px #dddddd) cohérent avec le design system
// - pas d'ombres sur la toolbar (uniquement sur les dropdowns / cards)

/* ─── Toolbar ────────────────────────────────────────────────────────────
   Conteneur. Flex-wrap, gap-2.5, border-bottom hairline. Aligne les
   enfants sur une seule rangée tant que la largeur le permet. */

interface ToolbarProps extends React.ComponentProps<'div'> {
  /** Gap entre les enfants. Défaut '2.5' (10px). */
  gap?: '2' | '2.5' | '3'
  /** Padding vertical. Défaut '2' (8px). */
  py?: '1.5' | '2' | '2.5'
}

function Toolbar({ className, gap = '2.5', py = '2', ...props }: ToolbarProps) {
  return (
    <div
      data-slot="toolbar"
      className={cn(
        'flex flex-none flex-wrap items-center border-b border-border bg-background',
        'px-4',
        gap === '2' && 'gap-2',
        gap === '2.5' && 'gap-2.5',
        gap === '3' && 'gap-3',
        py === '1.5' && 'py-1.5',
        py === '2' && 'py-2',
        py === '2.5' && 'py-2.5',
        className
      )}
      {...props}
    />
  )
}

/* ─── ToolbarGroup ───────────────────────────────────────────────────────
   Groupement logique d'éléments (ex. filtres verdict). */

function ToolbarGroup({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="toolbar-group"
      className={cn('flex items-center gap-1.5', className)}
      {...props}
    />
  )
}

/* ─── ToolbarSegment ─────────────────────────────────────────────────────
   Segmented control — bouton groupé type iOS. 3+ choix exclusifs.
   DESIGN.md category-tab-active : transparent + ink text pour l'actif,
   muted pour l'inactif. Le conteneur `<ToolbarSegmented>` porte le fond
   muted et le border hairline. */

const segmentedItemVariants = cva(
  'rounded-[4px] px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider transition-colors outline-ring focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1',
  {
    variants: {
      active: {
        true: 'bg-primary text-primary-foreground',
        false: 'text-muted-foreground hover:text-foreground',
      },
      // Variante soft (sobre) — actif sur fond brand-soft + ink au lieu de Rausch.
      // Utile pour les filtres secondaires.
      tone: {
        solid: '',
        soft: '',
      },
    },
    compoundVariants: [
      {
        active: true,
        tone: 'soft',
        class: 'bg-[var(--brand-soft,rgba(255,56,92,0.10))] text-primary',
      },
    ],
    defaultVariants: {
      tone: 'solid',
    },
  }
)

/**
 * Sémantique du groupe — le même dessin sert deux contrats différents :
 *  • `tabs` (défaut)  : choix EXCLUSIF, un seul actif → tablist/tab + aria-selected.
 *  • `toggles`        : cases à cocher indépendantes (type de commande, ateliers…)
 *                       → group + bouton à `aria-pressed`.
 * Habiller des cases à cocher en onglets fait annoncer « onglet » par le lecteur
 * d'écran, promet un `tabpanel` qui n'existe pas, et un tablist multi-sélectionné
 * est invalide. Le contrat se déclare sur le conteneur, les segments le lisent.
 */
type SegmentedSemantics = 'tabs' | 'toggles'
const SegmentedSemanticsContext = React.createContext<SegmentedSemantics>('tabs')

interface ToolbarSegmentedProps extends React.ComponentProps<'div'> {
  tone?: VariantProps<typeof segmentedItemVariants>['tone']
  semantics?: SegmentedSemantics
  /**
   * Sans boîte : jeu de chips libres au lieu d'un segmented control.
   * Un segmented control qui passe à la ligne est une contradiction — le cadre
   * promet une rangée de choix adjacents. Dès que les chips s'enroulent (types,
   * ateliers, verdicts d'un panneau de filtres), le cadre doit tomber et chaque
   * chip se signaler seule par son remplissage.
   */
  flat?: boolean
}

function ToolbarSegmented({
  className,
  tone = 'solid',
  semantics = 'tabs',
  flat = false,
  ...props
}: ToolbarSegmentedProps) {
  return (
    <SegmentedSemanticsContext.Provider value={semantics}>
      <div
        data-slot="toolbar-segmented"
        data-flat={flat ? 'true' : undefined}
        role={semantics === 'tabs' ? 'tablist' : 'group'}
        className={cn(
          'inline-flex items-center gap-0.5 rounded-md border border-border bg-card p-0.5',
          flat && 'gap-1 border-transparent bg-transparent p-0',
          className
        )}
        {...props}
      />
    </SegmentedSemanticsContext.Provider>
  )
}

interface ToolbarSegmentProps extends Omit<React.ComponentProps<'button'>, 'tone'> {
  active?: boolean
  tone?: VariantProps<typeof segmentedItemVariants>['tone']
}

function ToolbarSegment({
  className,
  active = false,
  tone = 'solid',
  type,
  ...props
}: ToolbarSegmentProps) {
  const semantics = React.useContext(SegmentedSemanticsContext)
  const isTab = semantics === 'tabs'
  return (
    <button
      type={type ?? 'button'}
      data-slot="toolbar-segment"
      role={isTab ? 'tab' : undefined}
      aria-selected={isTab ? active : undefined}
      aria-pressed={isTab ? undefined : active}
      data-active={active ? 'true' : undefined}
      className={cn(segmentedItemVariants({ active, tone }), className)}
      {...props}
    />
  )
}

/* ─── ToolbarSearch ──────────────────────────────────────────────────────
   Champ de recherche pill (DESIGN.md search-bar-pill, version compacte
   30px de haut pour la toolbar — vs 64px pour la search bar hero). */

interface ToolbarSearchProps extends Omit<React.ComponentProps<'input'>, 'onChange'> {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  icon?: string
}

function ToolbarSearch({
  className,
  value,
  onChange,
  placeholder = 'Rechercher…',
  icon = 'search',
  ...props
}: ToolbarSearchProps) {
  return (
    <div
      data-slot="toolbar-search"
      className={cn(
        'flex h-[30px] items-center gap-1.5 rounded-full border border-border bg-card px-3',
        'transition-shadow focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/25',
        className
      )}
    >
      <DynamicIcon name={icon} size={17} strokeWidth={1.75} className="text-muted-foreground" />
      <input
        type="text"
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.currentTarget.value)}
        placeholder={placeholder}
        className="w-[180px] border-0 bg-transparent px-0 text-[12px] font-medium text-foreground shadow-none outline-none placeholder:text-muted-foreground"
        {...props}
      />
    </div>
  )
}

/* ─── ToolbarRefresh ─────────────────────────────────────────────────────
   Bouton Actualiser avec spinner intégré. DESIGN.md button-pill-rausch
   sobriété : outline card par défaut, passe à ink primary au hover. */

interface ToolbarRefreshProps extends React.ComponentProps<'button'> {
  loading?: boolean
  /** Label textuel. Par défaut vide (l'icône refresh est explicite).
   *  Passer une chaîne pour afficher un label à côté de l'icône. */
  label?: string
}

function ToolbarRefresh({
  className,
  loading = false,
  label,
  disabled,
  type,
  ...props
}: ToolbarRefreshProps) {
  return (
    <button
      type={type ?? 'button'}
      data-slot="toolbar-refresh"
      data-labeled={label ? 'true' : undefined}
      disabled={disabled || loading}
      title="Recharger les données X3"
      className={cn(
        'inline-flex items-center gap-1 rounded-full border border-border bg-card p-2',
        'text-foreground transition-colors',
        'hover:border-primary disabled:opacity-50',
        label && 'px-3 py-1 text-[11px] font-semibold',
        className
      )}
      {...props}
    >
      <RefreshCw
        size={14}
        strokeWidth={1.75}
        className={cn('text-muted-foreground', loading && 'animate-spin')}
        aria-hidden="true"
      />
      {label}
    </button>
  )
}

/* ─── ToolbarSeparator ───────────────────────────────────────────────────
   Séparateur vertical entre groupes. */

function ToolbarSeparator({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      aria-hidden="true"
      className={cn('mx-1 h-5 w-px self-center bg-border', className)}
      {...props}
    />
  )
}

/* ─── ToolbarSpacer ──────────────────────────────────────────────────────
   Pousse les éléments suivants à droite. */

function ToolbarSpacer() {
  return <div className="ml-auto" aria-hidden="true" />
}

/* ─── Fenêtre de dates ───────────────────────────────────────────────────
   Rôle « portée temporelle ». Existait en trois exemplaires : DateWindowPill
   (vision/toolbar, 5 pages), une réimplémentation Popover dans /suivi, et le
   format de libellé recopié dans les deux. Une seule maison ici, format de
   libellé compris. */

const MOIS_COURTS_FR = [
  'janv.',
  'févr.',
  'mars',
  'avr.',
  'mai',
  'juin',
  'juil.',
  'août',
  'sept.',
  'oct.',
  'nov.',
  'déc.',
]

/** « 11 août → 18 août ». Tableau statique plutôt qu'Intl : déterministe, pas
 *  de coût de chargement de locale par rendu. */
function formatWindowLabel(from?: Date, to?: Date): string {
  const f = from
    ? `${String(from.getDate()).padStart(2, '0')} ${MOIS_COURTS_FR[from.getMonth()]}`
    : null
  const t = to ? `${String(to.getDate()).padStart(2, '0')} ${MOIS_COURTS_FR[to.getMonth()]}` : null
  if (!f && !t) return '—'
  if (!f) return t as string
  if (!t) return f
  return `${f} → ${t}`
}

interface ToolbarDateWindowProps {
  value: DayPickerRange | undefined
  /** Appelé UNIQUEMENT avec une plage complète (deux clics). */
  onCommit: (range: DayPickerRange) => void
  numberOfMonths?: number
  align?: 'start' | 'end'
  title?: string
  /** Désactive le déclencheur entier (pas de photos, chargement…). */
  disabled?: boolean
  /** Jours inchoisissables — Matcher react-day-picker (fn, Date, plage…). */
  disabledDays?: React.ComponentProps<typeof Calendar>['disabled']
}

function ToolbarDateWindow({
  value,
  onCommit,
  numberOfMonths = 2,
  align = 'start',
  title = "Filtrer par plage de dates d'expédition",
  disabled,
  disabledDays,
}: ToolbarDateWindowProps) {
  const [open, setOpen] = React.useState(false)
  const label = formatWindowLabel(value?.from, value?.to)
  const cal = useRangeCalendar({
    open,
    value,
    onCommit: (r) => {
      onCommit(r)
      setOpen(false)
    },
  })

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        render={
          <Pill
            variant="outline"
            className="gap-1.5"
            disabled={disabled}
            // Une feuille imprimée doit dire de quelle fenêtre elle est l'extrait :
            // c'est le seul contrôle que l'impression conserve.
            data-print-keep
            title={title}
            aria-label={`Fenêtre : ${label}`}
          >
            <CalendarDays size={14} strokeWidth={1.75} className="text-muted-foreground" />
            <span className="whitespace-nowrap font-mono tabular-nums">{label}</span>
            <ChevronDown size={16} strokeWidth={1.75} className="text-muted-foreground" />
          </Pill>
        }
      />
      {/* Positioner Base UI = évitement de collision natif : le panneau ne sort
          pas du viewport, contrairement à un `absolute right-0` qui rognait le
          premier mois sur écran étroit. */}
      <Popover.Portal>
        <Popover.Positioner
          side="bottom"
          align={align}
          sideOffset={8}
          collisionPadding={8}
          className="z-50"
        >
          <Popover.Popup
            data-slot="popover-content"
            className="max-w-(--available-width) overflow-x-auto rounded-lg border border-rule bg-popover shadow-float"
          >
            <Calendar
              mode="range"
              locale={fr}
              numberOfMonths={numberOfMonths}
              selected={cal.selected}
              onSelect={cal.onSelect}
              disabled={disabledDays}
            />
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}

/* ─── Filtres secondaires ────────────────────────────────────────────────
   Déclencheur UNIQUE. Empiler les segmented controls dans la rangée force un
   scroll horizontal ; tout ce qui n'est ni la portée ni la recherche vit ici.
   Le nombre de filtres actifs est porté par le déclencheur : « des filtres
   sont actifs » n'aide personne à savoir s'il en reste un ou quatre à défaire. */

interface ToolbarFilterMenuProps {
  label?: string
  /** Nombre de filtres qui S'ÉCARTENT du défaut (0 = aucun). */
  activeCount?: number
  width?: number
  align?: 'start' | 'end'
  children: React.ReactNode
}

function ToolbarFilterMenu({
  label = 'Filtres',
  activeCount = 0,
  width = 280,
  align = 'end',
  children,
}: ToolbarFilterMenuProps) {
  const actif = activeCount > 0
  return (
    <Popover.Root>
      <Popover.Trigger
        render={
          <Pill
            variant={actif ? 'active' : 'outline'}
            className="gap-1.5"
            title={
              actif
                ? `${activeCount} filtre${activeCount > 1 ? 's' : ''} actif${activeCount > 1 ? 's' : ''}`
                : label
            }
          >
            <SlidersHorizontal size={14} strokeWidth={1.75} className="text-muted-foreground" />
            {label}
            {actif ? (
              <span className="rounded-full bg-brand px-1.5 py-px text-3xs font-semibold leading-none text-white tabular-nums">
                {activeCount}
              </span>
            ) : null}
            <ChevronDown size={16} strokeWidth={1.75} className="text-muted-foreground" />
          </Pill>
        }
      />
      <Popover.Portal>
        <Popover.Positioner
          side="bottom"
          align={align}
          sideOffset={8}
          collisionPadding={8}
          className="z-50"
        >
          <Popover.Popup
            data-slot="filter-menu-panel"
            className="p-2"
            style={{ width: `${width}px` }}
          >
            {children}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}

/** Libellé de section dans le panneau de filtres. */
function ToolbarFilterSection({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-0.5 pb-1 font-mono text-2xs font-medium uppercase tracking-wide text-muted-foreground">
      {children}
    </div>
  )
}

/* ─── Chip de filtre à gravité ───────────────────────────────────────────
   Vit DANS le panneau, jamais dans la rangée. Un point coloré, un libellé, un
   compte : le point porte la gravité, le compte porte le volume, et les deux
   restent lisibles sur une chip de 22 px. */

const GRAVITE_POINT: Record<'critical' | 'warning' | 'ok' | 'neutral', string> = {
  critical: 'bg-destructive',
  warning: 'bg-suggere',
  ok: 'bg-ferme',
  neutral: 'bg-muted-foreground/50',
}

interface ToolbarFilterChipProps {
  label: string
  count?: number
  tone?: keyof typeof GRAVITE_POINT
  active?: boolean
  onClick?: () => void
  title?: string
}

function ToolbarFilterChip({
  label,
  count,
  tone = 'neutral',
  active,
  onClick,
  title,
}: ToolbarFilterChipProps) {
  return (
    <ToolbarSegment active={active} onClick={onClick} title={title}>
      <span
        aria-hidden="true"
        className={cn('size-1.5 shrink-0 rounded-full', GRAVITE_POINT[tone])}
      />
      {label}
      {count !== undefined && count > 0 ? (
        <span
          className={cn(
            'text-2xs tabular-nums',
            active ? 'text-foreground' : 'text-muted-foreground'
          )}
        >
          {count}
        </span>
      ) : null}
    </ToolbarSegment>
  )
}

/* ─── Indicateur en lecture seule ────────────────────────────────────────
   Compteur filtré, fraîcheur, durée de chargement. Jamais cliquable : un
   chiffre qui répond au survol comme un bouton est une promesse non tenue. */

function ToolbarMetric({
  children,
  title,
  emphasis,
  tone,
}: {
  children: React.ReactNode
  title?: string
  emphasis?: boolean
  /** `warning` : l'indicateur ne parle que pour signaler un écart (péremption). */
  tone?: 'warning'
}) {
  return (
    <span
      data-slot="toolbar-metric"
      title={title}
      className={cn(
        'whitespace-nowrap font-mono text-xs tabular-nums',
        tone === 'warning'
          ? 'font-medium text-suggere'
          : emphasis
            ? 'font-medium text-foreground'
            : 'text-muted-foreground'
      )}
    >
      {children}
    </span>
  )
}

export {
  Toolbar,
  ToolbarGroup,
  ToolbarSegmented,
  ToolbarSegment,
  ToolbarSearch,
  ToolbarRefresh,
  ToolbarSeparator,
  ToolbarSpacer,
  ToolbarDateWindow,
  ToolbarFilterMenu,
  ToolbarFilterSection,
  ToolbarFilterChip,
  ToolbarMetric,
  formatWindowLabel,
}
