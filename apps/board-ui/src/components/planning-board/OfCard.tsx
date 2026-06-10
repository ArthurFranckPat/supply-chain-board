import { useDraggable } from '@dnd-kit/core'
import { Clock, Pencil } from 'lucide-react'
import type { PlanningBoardOF } from '@/types/planningBoard'

export const STATUT_STYLES: Record<number, { label: string; chip: string; border: string }> = {
  1: { label: 'Ferme', chip: 'bg-green text-white', border: 'border-l-green' },
  2: { label: 'Planifié', chip: 'bg-orange text-white', border: 'border-l-orange' },
  3: { label: 'Suggéré', chip: 'bg-muted text-muted-foreground', border: 'border-l-border' },
}

interface OfCardProps {
  of: PlanningBoardOF
  selected: boolean
  late: boolean
  onClick: () => void
  /** Rendu statique (DragOverlay) */
  overlay?: boolean
}

export function OfCard({ of, selected, late, onClick, overlay = false }: OfCardProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: of.num_of,
    disabled: overlay,
  })
  const statut = STATUT_STYLES[of.statut_num] ?? STATUT_STYLES[3]

  return (
    <div
      ref={overlay ? undefined : setNodeRef}
      {...(overlay ? {} : { ...listeners, ...attributes })}
      onClick={onClick}
      className={[
        'group relative cursor-grab select-none rounded-lg border border-border/80 border-l-[3px] bg-card px-2 py-1.5 text-left shadow-sm transition-shadow',
        statut.border,
        isDragging ? 'opacity-30' : 'hover:shadow-md',
        overlay ? 'rotate-2 cursor-grabbing shadow-xl ring-2 ring-primary/40' : '',
        selected ? 'ring-2 ring-primary/60' : '',
        late ? 'bg-destructive/5' : '',
      ].join(' ')}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="truncate font-mono text-[10px] font-bold tracking-tight text-foreground">
          {of.num_of}
        </span>
        <span className={`shrink-0 rounded-full px-1.5 py-px text-[8px] font-black uppercase tracking-wider ${statut.chip}`}>
          {statut.label}
        </span>
      </div>
      <div className="mt-0.5 truncate text-[10px] text-muted-foreground" title={of.description}>
        {of.article} — {of.description}
      </div>
      <div className="mt-1 flex items-center gap-2 text-[9px] text-muted-foreground">
        <span className="font-semibold text-foreground/80">{of.qte_restante} pcs</span>
        {of.duree_heures != null && (
          <span className="inline-flex items-center gap-0.5">
            <Clock className="h-2.5 w-2.5" />
            {of.duree_heures.toFixed(1)}h
          </span>
        )}
        {of.modified && (
          <span className="ml-auto inline-flex items-center gap-0.5 rounded bg-primary/10 px-1 py-px font-semibold text-primary">
            <Pencil className="h-2.5 w-2.5" />
            modifié
          </span>
        )}
      </div>
      {late && (
        <div className="mt-0.5 text-[9px] font-semibold text-destructive">
          fin {of.date_fin} dépassée
        </div>
      )}
    </div>
  )
}
