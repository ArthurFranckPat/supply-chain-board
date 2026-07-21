import { useRef, useEffect, useState } from 'react'
import { cn } from '@r/lib/utils'
import { useBoardStore, statusActive } from '@r/lib/board/store'
import { ChevronDown, SlidersHorizontal, FlaskConical, ClipboardList } from 'lucide-react'
import { DynamicIcon } from '../ui/dynamic-icon'
import {
  PILL,
  Segment,
  SegmentButton,
  DateWindowPill,
  RefreshPill,
  ToolbarRow,
  ToolbarSpacer,
  FilterMenu,
} from './toolbar'

export type DateRange = { from: Date | undefined; to: Date | undefined }

export type VisionMode = 'combined' | 'ordonnancement' | 'planification'

const MODE_LABELS: Record<VisionMode, string> = {
  ordonnancement: 'OF',
  combined: 'Combiné',
  planification: 'Cmdes',
}

const MODE_TITLES: Record<VisionMode, string> = {
  ordonnancement: "Mode Ordonnancement — OF seuls",
  combined: 'Mode Combiné — OF + liens commandes + impacts',
  planification: 'Mode Commandes — planification par ligne de commande',
}

const STATUS_FILTER_CHIPS: { k: 'ferme' | 'planifie' | 'suggere'; label: string }[] = [
  { k: 'ferme', label: 'Ferme' },
  { k: 'planifie', label: 'Planifié' },
  { k: 'suggere', label: 'Suggéré' },
]

// Classes littérales (pas de `bg-${k}` dynamique — Tailwind v4 scanne le
// source statiquement, une interpolation ne serait pas détectée).
const STATUS_DOT_CLASS: Record<'ferme' | 'planifie' | 'suggere', string> = {
  ferme: 'bg-ferme',
  planifie: 'bg-planifie',
  suggere: 'bg-suggere',
}

/**
 * Toolbar de la page Programme — rangée COMMANDE (48px fixe).
 * Programme v2 : ne contient que l'identité de la page (mode, fenêtre,
 * actions). Les filtres sont descendus dans le contexte-row.
 */
export function ProgrammeToolbar(props: {
  mode: VisionMode
  switchMode: (m: VisionMode) => void
  feasLoading: boolean
  runFeasibility: () => void
  refreshing: boolean
  doRefresh: () => void
  calOpen: boolean
  setCalOpen: (open: boolean) => void
  range: DateRange
  applyRange: (r: DateRange) => void
  scenarioActive?: boolean
  onToggleScenario?: () => void
  /** Slot recherche/portée — vit à droite du <ToolbarSpacer /> (avant le menu
   *  Actions). Sorti du Masthead pour éviter le doublon visuel avec la toolbar. */
  search?: React.ReactNode
}) {
  // Statut — sélecteurs primitifs (pas d'objet littéral : un nouvel objet à
  // chaque rendu casse le cache de snapshot de useSyncExternalStore → boucle
  // infinie « Maximum update depth exceeded »). Pas de hook dans un .map()
  // conditionnel non plus : cf. directive plus bas.
  const statusFerme = useBoardStore((s) => statusActive(s, 'ferme'))
  const statusPlanifie = useBoardStore((s) => statusActive(s, 'planifie'))
  const statusSuggere = useBoardStore((s) => statusActive(s, 'suggere'))
  const statuses = { ferme: statusFerme, planifie: statusPlanifie, suggere: statusSuggere }
  const toggleStatus = useBoardStore((s) => s.toggleStatus)

  return (
    <ToolbarRow>
      {/* Mode — segment */}
      <Segment role="radiogroup" ariaLabel="Mode d'affichage">
        {(['ordonnancement', 'combined', 'planification'] as const).map((m) => (
          <SegmentButton
            key={m}
            role="radio"
            active={props.mode === m}
            title={MODE_TITLES[m]}
            onClick={() => props.switchMode(m)}
          >
            {MODE_LABELS[m]}
          </SegmentButton>
        ))}
      </Segment>

      {/* Fenêtre — pill calendrier (dd/MM → dd/MM) */}
      <DateWindowPill
        open={props.calOpen}
        onOpenChange={props.setCalOpen}
        selected={{ from: props.range.from, to: props.range.to }}
        onSelect={(range) => {
          if (range) props.applyRange({ from: range.from, to: range.to })
        }}
      />

      {/* Statut — déclencheur unique (masqué en mode Commandes, pas de
          statut OF applicable). Les pastilles colorées sur le pill fermé
          reflètent les statuts actifs, pas besoin d'ouvrir pour le savoir. */}
      {props.mode !== 'planification' && (
        <FilterMenu
          label="Statut"
          indicators={
            [statuses.ferme, statuses.planifie, statuses.suggere].some(Boolean) ? (
              <span className="ml-0.5 flex items-center gap-0.5" aria-hidden="true">
                {STATUS_FILTER_CHIPS.filter(({ k }) => statuses[k]).map(({ k }) => (
                  <span key={k} className={cn('size-1.5 rounded-full', STATUS_DOT_CLASS[k])} />
                ))}
              </span>
            ) : null
          }
        >
          <Segment className="w-full justify-between">
            {STATUS_FILTER_CHIPS.map(({ k, label }) => (
              <SegmentButton key={k} active={statuses[k]} onClick={() => toggleStatus(k)}>
                {label}
              </SegmentButton>
            ))}
          </Segment>
        </FilterMenu>
      )}

      <ToolbarSpacer />

      {/* Recherche + portée — sortis du Masthead (évite le doublon avec la
          toolbar). Prop `search` injectée depuis programme.tsx. Reste
          toujours visible : ce n'est pas un filtre secondaire, pas de
          consolidation derrière un clic. */}
      {props.search}

      <RefreshPill loading={props.refreshing} onClick={props.doRefresh} />

      {/* Menu Actions — regroupe Scénario + Faisabilité + Sélection pour
          désencombrer la toolbar. Comportement identique (mêmes handlers),
          regroupé sous un seul déclencheur. Le state actif de chaque action
          est reflété par une coche pour ne pas perdre le signal visuel. */}
      <ActionsMenu
        mode={props.mode}
        scenarioActive={props.scenarioActive}
        onToggleScenario={props.onToggleScenario}
        feasLoading={props.feasLoading}
        runFeasibility={props.runFeasibility}
      />
    </ToolbarRow>
  )
}

/**
 * Menu Actions — déclencheur unique qui regroupe Scénario, Faisabilité et
 * Sélection. Désencombre la toolbar sans perdre les fonctionnalités.
 *
 * Implémentation: <details> natif (accessible, zero deps, gère le clic
 * extérieur via un listener). Le state actif/loading est reflété par des
 * indicateurs visuels dans chaque item pour préserver le feedback usager.
 */
function ActionsMenu(props: {
  mode: VisionMode
  scenarioActive?: boolean
  onToggleScenario?: () => void
  feasLoading: boolean
  runFeasibility: () => void
}) {
  const selectMode = useBoardStore((s) => s.selectMode)
  const detailsRef = useRef<HTMLDetailsElement>(null)
  const [open, setOpen] = useState(false)

  // Ferme au clic extérieur ou sur Échap (parité popover).
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

  // Au moins une action active/connue → le déclencheur porte un dot.
  const hasActive = Boolean(props.scenarioActive || selectMode)

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
        title="Actions (scénario, faisabilité, sélection)"
      >
        <SlidersHorizontal size={14} strokeWidth={1.75} className="text-muted-foreground" />
        Actions
        {hasActive && (
          <span className="ml-0.5 size-1.5 rounded-full bg-brand" aria-hidden="true" />
        )}
        <ChevronDown size={16} strokeWidth={1.75} className="text-muted-foreground" />
      </summary>

      {/* Panneau déroulant — aligné à droite du déclencheur. */}
      <div className="absolute right-0 top-full z-50 mt-1.5 w-[220px] rounded-lg border border-rule bg-popover p-1 shadow-lg">
        {/* Scénario */}
        {props.onToggleScenario && (
          <button
            type="button"
            disabled={props.mode !== 'combined'}
            onClick={() => {
              props.onToggleScenario?.()
              setOpen(false)
            }}
            className={cn(
              'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-semibold transition-colors',
              props.mode !== 'combined'
                ? 'cursor-not-allowed opacity-40'
                : 'hover:bg-muted',
              props.scenarioActive && 'text-brand'
            )}
          >
            <FlaskConical size={14} strokeWidth={1.75} className="text-muted-foreground" />
            <span className="flex-1">Scénario</span>
            {props.scenarioActive && (
              <span className="font-mono text-3xs uppercase tracking-wider">ON</span>
            )}
            {props.mode !== 'combined' && (
              <span className="font-mono text-3xs uppercase tracking-wider text-muted-foreground">
                Combiné
              </span>
            )}
          </button>
        )}

        {/* Faisabilité */}
        <button
          type="button"
          disabled={props.feasLoading}
          onClick={() => {
            props.runFeasibility()
            setOpen(false)
          }}
          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-semibold transition-colors hover:bg-muted disabled:opacity-60"
        >
          <DynamicIcon
            name={props.feasLoading ? 'progress_activity' : 'fact_check'}
            size={14}
            strokeWidth={1.75}
            className={cn('text-muted-foreground', props.feasLoading && 'animate-spin')}
          />
          <span className="flex-1">
            {props.feasLoading ? 'Calcul en cours…' : 'Faisabilité'}
          </span>
        </button>

        {/* Sélection — OF / Combiné uniquement */}
        {props.mode !== 'planification' && (
          <button
            type="button"
            aria-pressed={selectMode}
            onClick={() => {
              const s = useBoardStore.getState()
              s.selectMode ? s.exitSelect() : s.enterSelect()
              setOpen(false)
            }}
            className={cn(
              'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-semibold transition-colors hover:bg-muted',
              selectMode && 'text-brand'
            )}
          >
            <ClipboardList size={14} strokeWidth={1.75} className="text-muted-foreground" />
            <span className="flex-1">Sélection</span>
            {selectMode && (
              <span className="font-mono text-3xs uppercase tracking-wider">ON</span>
            )}
          </button>
        )}
      </div>
    </details>
  )
}
