import { useDraggable } from '@dnd-kit/core'
import { Pencil } from 'lucide-react'
import type { FeasibilityEntry, PlanningBoardOF } from '@/types/planningBoard'

const FEASIBILITY_DOT: Record<string, { cls: string; label: string }> = {
  ok: { cls: 'bg-green', label: 'Faisable (composants disponibles)' },
  bloque: { cls: 'bg-destructive animate-pulse', label: 'Bloqué — composants manquants' },
  sans_nomenclature: { cls: 'bg-orange', label: 'Nomenclature non disponible' },
}

export const STATUT_STYLES: Record<number, { label: string; letter: string; chip: string; border: string }> = {
  1: { label: 'Ferme', letter: 'F', chip: 'bg-green text-white', border: 'border-l-green' },
  2: { label: 'Planifié', letter: 'P', chip: 'bg-orange text-white', border: 'border-l-orange' },
  3: { label: 'Suggéré', letter: 'S', chip: 'bg-muted text-muted-foreground', border: 'border-l-border' },
}

interface OfCardProps {
  of: PlanningBoardOF
  selected: boolean
  late: boolean
  onClick: () => void
  /** Rendu statique (DragOverlay) */
  overlay?: boolean
  feasibility?: FeasibilityEntry | null
}

export function OfCard({ of, selected, late, onClick, overlay = false, feasibility }: OfCardProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: of.num_of,
    disabled: overlay,
  })
  const statut = STATUT_STYLES[of.statut_num] ?? STATUT_STYLES[3]

  const tooltip = [
    `${of.num_of} · ${statut.label}`,
    `${of.article} — ${of.description}`,
    `${of.qte_restante} pcs${of.duree_heures != null ? ` · ${of.duree_heures.toFixed(1)}h` : ''}`,
    of.date_debut ? `Début ${of.date_debut} → fin ${of.date_fin}` : `Fin ${of.date_fin}`,
    late ? '⚠ date de fin dépassée' : '',
    feasibility
      ? `${FEASIBILITY_DOT[feasibility.statut]?.label ?? ''}${
          Object.keys(feasibility.missing_components).length
            ? ` : ${Object.entries(feasibility.missing_components)
                .map(([c, q]) => `${c} (-${q})`)
                .join(', ')}`
            : ''
        }`
      : '',
  ]
    .filter(Boolean)
    .join('\n')

  return (
    <div
      ref={overlay ? undefined : setNodeRef}
      {...(overlay ? {} : { ...listeners, ...attributes })}
      onClick={onClick}
      title={tooltip}
      className={[
        'group relative cursor-grab select-none rounded border border-border/70 border-l-2 bg-card px-1 py-0.5 text-left shadow-sm transition-shadow',
        statut.border,
        isDragging ? 'opacity-30' : 'hover:shadow-md',
        overlay ? 'rotate-2 cursor-grabbing shadow-xl ring-2 ring-primary/40' : '',
        selected ? 'ring-2 ring-primary/60' : '',
        late ? 'bg-destructive/5' : '',
      ].join(' ')}
    >
      <div className="flex items-center gap-1">
        {feasibility && (
          <span
            className={`h-1.5 w-1.5 shrink-0 rounded-full ${FEASIBILITY_DOT[feasibility.statut]?.cls ?? 'bg-muted'}`}
          />
        )}
        <span className={`truncate font-mono text-[9px] font-bold leading-tight tracking-tight ${late ? 'text-destructive' : 'text-foreground'}`}>
          {of.num_of}
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-0.5">
          {of.modified && <Pencil className="h-2 w-2 text-primary" />}
          <span className={`rounded-sm px-0.5 text-[7px] font-black leading-tight ${statut.chip}`}>
            {statut.letter}
          </span>
        </span>
      </div>
      <div className="flex items-center gap-1 text-[8px] leading-tight text-muted-foreground">
        <span className="truncate">{of.article}</span>
        <span className="ml-auto shrink-0 font-semibold text-foreground/70">
          {of.duree_heures != null ? `${of.duree_heures.toFixed(1)}h` : `${of.qte_restante}p`}
        </span>
      </div>
    </div>
  )
}
