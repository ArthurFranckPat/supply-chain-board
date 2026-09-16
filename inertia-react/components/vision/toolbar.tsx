import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from 'react'
import { fr } from 'react-day-picker/locale'
import type { DateRange as DayPickerRange } from 'react-day-picker'
import { Link } from '@inertiajs/react'
import { Popover } from '@base-ui/react/popover'
import { CalendarDays, ChevronDown, RefreshCw, SlidersHorizontal, X } from 'lucide-react'
import { cn } from '@r/lib/utils'
import { Calendar } from '@r/components/ui/calendar'
import { useRangeCalendar } from '@r/lib/use-range-calendar'

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
/** Géométrie et typographie d'un bouton de segment — communes aux trois états
 *  (actif, inactif, et actif-sous-pill). Ce qui les distingue vient après. */
export const SEG_BTN_BASE = 'min-h-[28px] rounded-md px-3 py-1 font-mono text-2xs font-semibold'
export const SEG_BTN_ON = `${SEG_BTN_BASE} bg-brand-soft text-brand transition-all duration-150 ease-out active:scale-95`
export const SEG_BTN_OFF = `${SEG_BTN_BASE} text-muted-foreground hover:text-foreground transition-all duration-150 ease-out active:scale-95`
export const SEG_LBL = 'px-1.5 font-mono text-3xs font-semibold text-muted-foreground'
export const PILL =
  'inline-flex min-h-[30px] items-center gap-1.5 rounded-full border border-rule bg-card px-3 py-1 text-xs font-semibold text-foreground transition-all duration-150 ease-out hover:border-brand active:scale-[0.97]'

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

/**
 * Le pill glissant n'a de sens que sur un choix EXCLUSIF : sur une sélection
 * multiple (chips de filtre), plusieurs options s'allument ensemble — il n'y a
 * pas UN fond à faire voyager. Le rôle `radiogroup` est donc le discriminant :
 * c'est déjà lui qui dit que les options s'excluent.
 */
const SlidingTabs = createContext(false)

/** Groupe de choix exclusifs (mode, statut, vue…). */
export function Segment(props: {
  label?: string
  ariaLabel?: string
  role?: 'radiogroup'
  className?: string
  children: ReactNode
}) {
  const sliding = props.role === 'radiogroup'
  const barRef = useRef<HTMLDivElement>(null)
  const pillRef = useRef<HTMLSpanElement>(null)
  /** Dernière mesure écrite sur le pill (null = rien de placé encore). */
  const placed = useRef<{ sig: string; x: number; y: number; w: number; h: number } | null>(null)
  /** Redimensionnement (fenêtre, chargement de police) sans changement d'état. */
  const [measureTick, setMeasureTick] = useState(0)

  useEffect(() => {
    if (!sliding) return
    const bar = barRef.current
    if (!bar || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => setMeasureTick((t) => t + 1))
    ro.observe(bar)
    return () => ro.disconnect()
  }, [sliding])

  /**
   * Placement du pill. AUCUNE dépendance : c'est le rendu lui-même qui est le
   * signal — `Segment` ne se re-rend que si son appelant a re-rendu, donc
   * qu'une option a changé d'état (ou que `measureTick` a bougé).
   *
   * Le motif actif (quels boutons sont allumés) se lit sur les attributs, ce
   * qui ne coûte rien ; la MESURE (`offsetLeft`/`offsetWidth`), qui force un
   * calcul de mise en page, n'est faite que si ce motif a bougé.
   *
   * Trois cas, et trois comportements distincts :
   *   • premier placement → sans transition, sinon le pill traverserait tout
   *     le segment depuis translate(0) / width: 0 ;
   *   • motif changé → transition : c'est le geste qu'on est venu voir ;
   *   • même motif, mesure différente → sans transition : un redimensionnement
   *     n'est pas un changement d'avis, il ne doit pas faire glisser le pill.
   */
  useEffect(() => {
    if (!sliding) return
    const bar = barRef.current
    const pill = pillRef.current
    if (!bar || !pill) return

    const btns = Array.from(bar.querySelectorAll<HTMLElement>('[data-seg-active]'))
    const sig = btns.map((b) => (b.dataset.segActive === 'true' ? '1' : '0')).join('')
    const active = btns.find((b) => b.dataset.segActive === 'true')
    if (!active) {
      // Sélection vide (tous les filtres décochés) : plus rien à désigner.
      pill.style.opacity = '0'
      placed.current = null
      return
    }

    // `offsetLeft`/`offsetTop` partent de la boîte de BORDURE de la barre ;
    // les pixels absolus du pill partent de sa boîte de PADDING. L'écart est
    // la largeur de bordure de la barre.
    const x = active.offsetLeft - bar.clientLeft
    const y = active.offsetTop - bar.clientTop
    const w = active.offsetWidth
    const h = active.offsetHeight
    const prev = placed.current
    pill.style.opacity = '1'

    /**
     * `animate` distingue les deux natures de changement : un CHANGEMENT
     * D'OPTION (le pill voyage) d'un simple repositionnement — premier
     * placement, redimensionnement — où la transition doit être suspendue le
     * temps d'écrire, sinon le pill traverserait tout le segment depuis
     * `translate(0) / width: 0`.
     */
    const write = (animate: boolean) => {
      const at = `translate(${x}px, ${y}px)`
      if (animate) {
        pill.style.transform = at
        pill.style.width = `${w}px`
        pill.style.height = `${h}px`
        return
      }
      const t = pill.style.transition
      pill.style.transition = 'none'
      pill.style.transform = at
      pill.style.width = `${w}px`
      pill.style.height = `${h}px`
      // Calcul de style forcé : le saut est acquis AVANT que la transition
      // soit rendue, sans quoi le navigateur ne verrait qu'une écriture.
      void pill.offsetWidth
      pill.style.transition = t
    }

    if (!prev) write(false)
    else if (prev.sig !== sig) write(true)
    else if (prev.x !== x || prev.y !== y || prev.w !== w || prev.h !== h) write(false)

    placed.current = { sig, x, y, w, h }
  })

  return (
    <div
      ref={barRef}
      className={cn(SEG, sliding && 'motion-tabs', props.className)}
      role={props.role}
      aria-label={props.ariaLabel}
    >
      {sliding && <span ref={pillRef} className="motion-tabs-pill" aria-hidden="true" />}
      <SlidingTabs.Provider value={sliding}>
        {props.label && <span className={SEG_LBL}>{props.label}</span>}
        {props.children}
      </SlidingTabs.Provider>
    </div>
  )
}

export function SegmentButton(props: {
  active: boolean
  onClick: () => void
  title?: string
  role?: 'radio'
  /** Option hors d'état de servir (ex. capacité en pièces) : visible mais inerte. */
  disabled?: boolean
  children: ReactNode
}) {
  const sliding = useContext(SlidingTabs)
  return (
    <button
      type="button"
      role={props.role}
      aria-checked={props.role === 'radio' ? props.active : undefined}
      aria-pressed={props.role !== 'radio' ? props.active : undefined}
      disabled={props.disabled}
      title={props.title}
      // Le pill lit ces deux attributs pour se placer : ils sont le contrat
      // entre le bouton et lui, pas seulement de la sémantique.
      data-seg-active={sliding ? String(props.active) : undefined}
      className={cn(
        sliding
          ? cn(
              SEG_BTN_BASE,
              'motion-tabs-btn',
              // Le fond n'est plus porté par le bouton : c'est le pill qui
              // voyage. Le bouton ne dit que la couleur de son libellé.
              props.active ? 'text-brand' : 'text-muted-foreground hover:text-foreground'
            )
          : props.active
            ? SEG_BTN_ON
            : SEG_BTN_OFF,
        props.disabled && 'cursor-not-allowed opacity-40'
      )}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  )
}

const MONTHS_SHORT_FR = [
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
  /** Libellé affiché quand aucune borne n'est choisie (défaut « — »). */
  emptyLabel?: string
  /** Présent => croix d'effacement affichée dès qu'une borne existe. */
  onClear?: () => void
  /** Passthrough vers <Calendar> — ex. `{ after: new Date() }` pour interdire
   *  les dates futures (expéditions : pas de sélection au-delà d'aujourd'hui). */
  disabled?: ComponentProps<typeof Calendar>['disabled']
}) {
  const align = props.align ?? 'left'
  const hasRange = Boolean(props.selected.from || props.selected.to)
  const label = hasRange
    ? formatWindowLabel(props.selected.from, props.selected.to)
    : (props.emptyLabel ?? '—')
  const { selected, onSelect } = useRangeCalendar({
    open: props.open,
    value: props.selected.from ? { from: props.selected.from, to: props.selected.to } : undefined,
    onCommit: props.onSelect,
  })
  return (
    <Popover.Root open={props.open} onOpenChange={props.onOpenChange}>
      <div data-print-keep className="relative">
        <Popover.Trigger
          aria-label={`Fenêtre : ${label}${props.open ? ' — fermer' : ' — ouvrir'}`}
          title={props.title}
          className={PILL}
        >
          <CalendarDays size={14} strokeWidth={1.75} className="text-muted-foreground" />
          <span className="whitespace-nowrap font-mono tabular-nums">{label}</span>
          {props.onClear && hasRange && (
            <span
              role="button"
              tabIndex={-1}
              aria-label="Effacer la plage de dates"
              onClick={(e) => {
                e.stopPropagation()
                props.onClear?.()
              }}
              className="text-muted-foreground hover:text-foreground"
            >
              <X size={13} strokeWidth={2} />
            </span>
          )}
          <ChevronDown size={16} strokeWidth={1.75} className="text-muted-foreground" />
        </Popover.Trigger>
        {/* Positioner base-ui = évitement de collision natif : le panneau ne sort
            plus du viewport (l'ancien `absolute right-0` rognait le 1er mois sur
            écran étroit). `--available-width` + overflow = filet de sécurité. */}
        <Popover.Portal>
          <Popover.Positioner
            side="bottom"
            align={align === 'right' ? 'end' : 'start'}
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
                numberOfMonths={props.numberOfMonths ?? 2}
                selected={selected}
                onSelect={onSelect}
                disabled={props.disabled}
              />
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </div>
    </Popover.Root>
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
  const title =
    props.title ??
    (props.loading ? 'Actualisation en cours…' : 'Recharger les données X3 (cache → re-fetch live)')
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
 *  déclencheur (pastilles colorées, badge…) pour rester lisible fermé.
 *
 *  Animation : le panneau grandit depuis son déclencheur (transitions.dev #05,
 *  cf. `.motion-dropdown` dans styles/app.css). Le `<details>` natif retire ses
 *  enfants du rendu dès qu'il se ferme : impossible d'animer une sortie qu'on
 *  n'a pas vue. La fermeture est donc RETARDÉE — on annule la fermeture native,
 *  on joue la sortie, et on ferme vraiment au bout du tween. */
export function FilterMenu(props: {
  label?: string
  indicators?: ReactNode
  panelClassName?: string
  align?: 'left' | 'right'
  /**
   * Ref sur le `<details>` — pour ouvrir le panneau depuis un raccourci clavier.
   * L'ouverture programmatique passe par l'événement `toggle` natif, donc l'état
   * React suit (fermeture au clic extérieur et à Échap comprises).
   */
  detailsRef?: React.RefObject<HTMLDetailsElement | null>
  /** Raccourci clavier, affiché dans l'infobulle du déclencheur (« F »). */
  hotkey?: string
  children: ReactNode
}) {
  const ownRef = useRef<HTMLDetailsElement>(null)
  const detailsRef = props.detailsRef ?? ownRef
  const [open, setOpen] = useState(false)
  /** Arrivée jouée, sortie en cours, ou repos (pré-ouverture). */
  const [phase, setPhase] = useState<'idle' | 'open' | 'closing'>('idle')
  /** Miroir de `phase` pour les décisions : `onToggle` est un écouteur natif,
   *  il ne doit pas dépendre d'une fermeture React périmée. */
  const phaseRef = useRef<'idle' | 'open' | 'closing'>('idle')
  /** Vrai le temps que NOTRE fermeture programmée traverse `toggle`. */
  const selfClosing = useRef(false)
  const closeTimer = useRef<number | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const align = props.align ?? 'right'

  const goTo = useCallback((p: 'idle' | 'open' | 'closing') => {
    phaseRef.current = p
    setPhase(p)
  }, [])

  /**
   * Durée de sortie LUE dans le token, comme le fait transitions.dev : le JS
   * n'a pas à recopier 150 ms, sinon la constante et la feuille de style
   * divergent au premier réglage.
   */
  const closeMs = useCallback(() => {
    const raw = getComputedStyle(document.documentElement)
      .getPropertyValue('--duration-quick')
      .trim()
    const n = Number.parseFloat(raw)
    if (!Number.isFinite(n) || n <= 0) return 150
    return raw.endsWith('ms') ? n : n * 1000
  }, [])

  const startClose = useCallback(() => {
    goTo('closing')
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current)
    closeTimer.current = window.setTimeout(() => {
      closeTimer.current = null
      selfClosing.current = true
      goTo('idle')
      setOpen(false)
    }, closeMs())
  }, [closeMs, goTo])

  useEffect(
    () => () => {
      if (closeTimer.current !== null) window.clearTimeout(closeTimer.current)
    },
    []
  )

  /**
   * L'arrivée ne peut pas être une simple bascule de classe : le panneau vient
   * d'entrer dans le rendu (le `<details>` s'ouvre), il n'a donc AUCUN état
   * antérieur à quitter. On force un calcul de style sur l'état de repos —
   * « pré-échelle » 0.97, invisible — puis on bascule dans le même passage,
   * avant peinture.
   */
  useLayoutEffect(() => {
    if (phase !== 'idle' || !open) return
    void panelRef.current?.offsetWidth
    goTo('open')
  }, [open, phase, goTo])

  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      if (!detailsRef.current?.contains(e.target as Node)) startClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') startClose()
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, detailsRef, startClose])

  return (
    <details
      ref={detailsRef}
      open={open}
      onToggle={(e) => {
        const el = e.currentTarget
        if (el.open) {
          setOpen(true)
          return
        }
        // C'est bien NOUS qui fermons : la fermeture programmée a traversé le
        // `<details>`, plus rien à retarder.
        if (selfClosing.current) {
          selfClosing.current = false
          return
        }
        // Fermeture demandée (résumé, Échap, clic extérieur). Le `<details>`
        // retire ses enfants du rendu dès qu'il se ferme : une sortie jouée
        // après coup ne se verrait pas. On annule donc la fermeture native le
        // temps du tween, et on referme vraiment à son terme.
        el.open = true
        if (phaseRef.current === 'closing') return
        startClose()
      }}
      className="relative"
    >
      <summary
        className={cn(
          PILL,
          'cursor-pointer list-none [&::-webkit-details-marker]:hidden',
          open && 'border-brand'
        )}
        title={props.hotkey ? `${props.label ?? 'Filtres'} (${props.hotkey})` : 'Filtres'}
      >
        <SlidersHorizontal size={14} strokeWidth={1.75} className="text-muted-foreground" />
        {props.label ?? 'Filtres'}
        {props.indicators}
        <ChevronDown size={16} strokeWidth={1.75} className="text-muted-foreground" />
      </summary>

      <div
        ref={panelRef}
        data-origin={align === 'right' ? 'top-right' : 'top-left'}
        className={cn(
          'motion-dropdown absolute top-full z-50 mt-1.5 w-[280px] rounded-lg border border-rule bg-popover p-2.5 shadow-lg',
          align === 'right' ? 'right-0' : 'left-0',
          phase === 'closing' && 'is-closing',
          phase === 'open' && 'is-open',
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
