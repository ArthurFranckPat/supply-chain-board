import { useMemo } from 'react'
import { cn } from '@r/lib/utils'
import { Calendar } from '@r/components/ui/calendar'
import { useBoardStore, statusActive } from '@r/lib/board/store'

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

const BESOIN_CHIPS = [
  { k: 'COMMANDE', label: 'Cmde' },
  { k: 'PREVISION', label: 'Prév' },
] as const

/** Programme v2 — grammaire visuelle unifiée : 2 styles seulement.
 *  • Segment (rounded-lg) pour les choix groupés exclusifs (mode, stock, liens).
 *  • Pill (rounded-full) pour les actions et toggles (fenêtre, actualiser, etc.).
 *  Plus de mix rounded-md / rounded-full / shadcn-button. */
const SEG = 'inline-flex items-center gap-0.5 rounded-lg border border-rule bg-card p-0.5'
const SEG_BTN_ON =
  'min-h-[28px] rounded-md px-3 py-1 font-mono text-2xs font-bold uppercase tracking-wider bg-brand-soft text-brand transition-colors'
const SEG_BTN_OFF =
  'min-h-[28px] rounded-md px-3 py-1 font-mono text-2xs font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors'
const SEG_LBL = 'px-1.5 font-mono text-3xs font-bold uppercase tracking-wider text-muted-foreground'
const PILL =
  'inline-flex min-h-[30px] items-center gap-1.5 rounded-full border border-rule bg-card px-3 py-1 text-xs font-semibold text-foreground transition-colors hover:border-brand'

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
  dateRange: string
  calOpen: boolean
  setCalOpen: (open: boolean) => void
  range: DateRange
  applyRange: (r: DateRange) => void
  scenarioActive?: boolean
  onToggleScenario?: () => void
  /** Slot recherche/portée — vit à droite du <flex-1> (avant les pills
   *  Faisabilité/Sélection). Sorti du Masthead pour éviter le doublon
   *  visuel avec la toolbar. */
  search?: React.ReactNode
}) {
  return (
    <div
      data-print-toolbar
      className="flex flex-none flex-wrap items-center gap-2.5 border-b border-rule px-7 py-2 min-h-[48px]"
    >
      {/* Mode — segment */}
      <div className={SEG} role="radiogroup" aria-label="Mode d'affichage">
        {(['ordonnancement', 'combined', 'planification'] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={props.mode === m}
            title={MODE_TITLES[m]}
            className={props.mode === m ? SEG_BTN_ON : SEG_BTN_OFF}
            onClick={() => props.switchMode(m)}
          >
            {MODE_LABELS[m]}
          </button>
        ))}
      </div>

      {/* Fenêtre — pill, conservée à l'impression */}
      <div data-print-keep className="relative">
        <button
          type="button"
          aria-label={`Fenêtre : ${props.dateRange}${props.calOpen ? ' — fermer' : ' — ouvrir'}`}
          aria-expanded={props.calOpen}
          onClick={() => props.setCalOpen(!props.calOpen)}
          className={PILL}
        >
          <span className="material-symbols-outlined text-sm text-muted-foreground">
            calendar_month
          </span>
          {props.dateRange}
          <span className="material-symbols-outlined text-[16px] text-muted-foreground">
            expand_more
          </span>
        </button>
        {props.calOpen && (
          <>
            <button
              type="button"
              tabIndex={-1}
              aria-hidden="true"
              className="fixed inset-0 z-40 cursor-default"
              onClick={() => props.setCalOpen(false)}
            />
            <div className="absolute left-0 top-full z-50 mt-2">
              <Calendar
                mode="range"
                selected={props.range.from ? { from: props.range.from, to: props.range.to } : undefined}
                onSelect={(range) => {
                  if (range) {
                    props.applyRange({ from: range.from, to: range.to })
                  }
                }}
              />
            </div>
          </>
        )}
      </div>

      {/* Actualiser — pill */}
      <button
        type="button"
        disabled={props.refreshing}
        onClick={props.doRefresh}
        className={cn(PILL, 'disabled:opacity-60')}
        title="Recharger les données X3 (cache → re-fetch live)"
      >
        <span
          className={`material-symbols-outlined text-sm text-muted-foreground ${props.refreshing ? 'animate-spin' : ''}`}
        >
          refresh
        </span>
        {props.refreshing ? 'Actualisation…' : 'Actualiser'}
      </button>

      <div className="flex-1" />

      {/* Recherche + portée — sortis du Masthead (évite le doublon avec la
          toolbar). Prop `search` injectée depuis programme.tsx. */}
      {props.search}

      {/* Scénario — pill toggle (tous modes, disabled hors Combiné) */}
      {props.onToggleScenario && (
        <button
          type="button"
          disabled={props.mode !== 'combined'}
          aria-pressed={props.scenarioActive ?? false}
          title={
            props.mode === 'combined'
              ? 'Mode scénario (aucun envoi X3)'
              : 'Disponible en mode Combiné'
          }
          onClick={() => props.onToggleScenario?.()}
          className={cn(
            PILL,
            'disabled:cursor-not-allowed disabled:opacity-40',
            props.scenarioActive && '!border-brand !bg-brand !text-white'
          )}
        >
          <span className="material-symbols-outlined text-sm">science</span>
          Scénario
        </button>
      )}

      {/* Faisabilité — pill (primary) */}
      <button
        type="button"
        disabled={props.feasLoading}
        onClick={props.runFeasibility}
        className={cn(PILL, '!border-transparent !bg-foreground !text-background disabled:opacity-60')}
      >
        <span
          className={`material-symbols-outlined text-sm ${props.feasLoading ? 'animate-spin' : ''}`}
        >
          {props.feasLoading ? 'progress_activity' : 'fact_check'}
        </span>
        {props.feasLoading ? 'Calcul…' : 'Faisabilité'}
      </button>

      {/* Sélection — pill (OF uniquement) */}
      {props.mode !== 'planification' && (
        <button
          type="button"
          aria-pressed={useBoardStore((s) => s.selectMode)}
          onClick={() => {
            const s = useBoardStore.getState()
            s.selectMode ? s.exitSelect() : s.enterSelect()
          }}
          className={cn(PILL, useBoardStore((s) => s.selectMode) && '!border-brand !bg-brand-soft !text-brand')}
        >
          <span className="material-symbols-outlined text-sm">checklist</span>
          Sélection
        </button>
      )}
    </div>
  )
}

/**
 * Programme v2 — rangée CONTEXTE (40px fixe). Filtres du mode courant +
 * segment Liens + santé du plan + bouton rail. Hauteur constante, zéro CLS.
 */
export function ProgrammeContextBar(props: {
  mode: VisionMode
  feasMode: 'immediate' | 'sequential'
  setFeasMode: (m: 'immediate' | 'sequential') => void
  children?: React.ReactNode
}) {
  const store = useBoardStore()

  return (
    <div className="flex flex-none items-center gap-2.5 border-b border-rule bg-muted/30 px-7 py-1.5 min-h-[40px]">
      {/* Statut — segment (OF / Combiné) */}
      {props.mode !== 'planification' && (
        <div className={SEG}>
          <span className={SEG_LBL}>Statut</span>
          {STATUS_FILTER_CHIPS.map(({ k, label }) => (
            <button
              key={k}
              type="button"
              aria-pressed={useBoardStore((s) => statusActive(s, k))}
              className={useBoardStore((s) => (statusActive(s, k) ? SEG_BTN_ON : SEG_BTN_OFF))}
              onClick={() => store.toggleStatus(k)}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Liens segment + PlanHealth + Rail : injectés via children (programme.tsx) */}
      {props.children}
    </div>
  )
}
