import { useMemo, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { CalendarRange, Loader2 } from 'lucide-react'
import { usePlanningBoard } from '@/hooks/usePlanningBoard'
import { BoardGrid } from '@/components/planning-board/BoardGrid'
import { BoardToolbar } from '@/components/planning-board/BoardToolbar'
import { OfCard } from '@/components/planning-board/OfCard'
import { OfDetailPanel } from '@/components/planning-board/OfDetailPanel'

export function PlanningBoardView() {
  const board = usePlanningBoard()
  const [draggingOf, setDraggingOf] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  )

  const draggingCard = useMemo(
    () => board.ofs.find((o) => o.num_of === draggingOf) ?? null,
    [board.ofs, draggingOf],
  )

  const handleDragStart = (event: DragStartEvent) => {
    setDraggingOf(String(event.active.id))
  }

  const handleDragEnd = (event: DragEndEvent) => {
    setDraggingOf(null)
    const { active, over } = event
    if (!over) return
    const of = board.ofs.find((o) => o.num_of === String(active.id))
    if (!of) return
    // Format de cellule : "cell|<poste>|<jour>"
    const [kind, poste, day] = String(over.id).split('|')
    if (kind !== 'cell' || !day) return
    const ofPoste = of.poste_charge ?? '__sans_poste__'
    if (poste !== ofPoste) return // pas de changement de poste : la gamme fixe la ligne
    board.moveOf(of, day)
  }

  const stats = useMemo(() => {
    const counts = { 1: 0, 2: 0, 3: 0 } as Record<number, number>
    let hours = 0
    for (const of of board.ofs) {
      counts[of.statut_num] = (counts[of.statut_num] ?? 0) + 1
      hours += of.duree_heures ?? 0
    }
    return { counts, hours }
  }, [board.ofs])

  return (
    <div className="flex flex-col gap-4">
      {/* En-tête */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-[18px] font-black tracking-tight text-foreground">
            <CalendarRange className="h-5 w-5 text-primary" />
            Planning OF
          </h1>
          <p className="text-[12px] text-muted-foreground">
            Glissez un OF pour le replanifier · cliquez pour affermir ou éditer. Modifications locales, l'ERP reste inchangé.
          </p>
        </div>
        <div className="flex items-center gap-3 text-[11px] font-semibold text-muted-foreground">
          <span><span className="font-black text-foreground">{board.ofs.length}</span> OF</span>
          <span className="text-green">{stats.counts[1] ?? 0} fermes</span>
          <span className="text-orange">{stats.counts[2] ?? 0} planifiés</span>
          <span>{stats.counts[3] ?? 0} suggérés</span>
          <span><span className="font-black text-foreground">{stats.hours.toFixed(0)}h</span> de charge</span>
          {board.isSaving && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />}
        </div>
      </div>

      <BoardToolbar
        weekStart={board.weekStart}
        onWeekStartChange={board.setWeekStart}
        weeks={board.weeks}
        onWeeksChange={board.setWeeks}
        filters={board.filters}
        onFiltersChange={board.setFilters}
        postes={board.data?.postes ?? []}
        nbModified={board.data?.nb_modified ?? 0}
        onResetAll={board.resetAll}
      />

      {board.error != null && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-[12px] font-semibold text-destructive">
          {board.error instanceof Error ? board.error.message : 'Erreur de chargement des OF.'}
        </div>
      )}

      {board.isLoading ? (
        <div className="flex h-64 items-center justify-center gap-2 rounded-2xl border border-border bg-card/60 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Chargement des ordres de fabrication…
        </div>
      ) : (
        <div className="flex items-start gap-4">
          <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            <div className="min-w-0 flex-1">
              <BoardGrid
                workdays={board.workdays}
                ofs={board.ofs}
                selectedOf={board.selectedOf}
                onSelect={(numOf) =>
                  board.setSelectedOf(board.selectedOf === numOf ? null : numOf)
                }
              />
            </div>
            <DragOverlay dropAnimation={null}>
              {draggingCard && (
                <div className="w-[140px]">
                  <OfCard of={draggingCard} selected={false} late={false} onClick={() => {}} overlay />
                </div>
              )}
            </DragOverlay>
          </DndContext>

          {board.selected && (
            <OfDetailPanel
              of={board.selected}
              onClose={() => board.setSelectedOf(null)}
              onPatch={board.patchOf}
              onReset={(numOf) => {
                board.resetOf(numOf)
              }}
              isSaving={board.isSaving}
            />
          )}
        </div>
      )}
    </div>
  )
}
