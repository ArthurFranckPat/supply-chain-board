import { useEffect, useMemo, useRef, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  CalendarRange,
  Loader2,
  ShieldCheck,
  FlaskConical,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react'
import { usePlanningBoard } from '@/hooks/usePlanningBoard'
import { useBoardFeasibility } from '@/hooks/useBoardFeasibility'
import { BoardGrid } from '@/components/planning-board/BoardGrid'
import { BoardToolbar } from '@/components/planning-board/BoardToolbar'
import { OfCard } from '@/components/planning-board/OfCard'
import { OfDetailPanel } from '@/components/planning-board/OfDetailPanel'
import { WhatIfPanel } from '@/components/planning-board/WhatIfPanel'

export function PlanningBoardView() {
  const board = usePlanningBoard()
  const [draggingOf, setDraggingOf] = useState<string | null>(null)
  const [showWhatIf, setShowWhatIf] = useState(false)

  const windowFrom = board.workdays[0]
  const windowTo = board.workdays[board.workdays.length - 1]
  const feasibility = useBoardFeasibility(windowFrom, windowTo)

  /* Fenêtre changée → l'évaluation précédente n'est plus comparable */
  useEffect(() => {
    feasibility.invalidateBaseline()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowFrom, windowTo])

  /* Réévaluation automatique après chaque sauvegarde (affermissement, déplacement…) */
  const wasSaving = useRef(false)
  useEffect(() => {
    if (wasSaving.current && !board.isSaving && feasibility.entries) {
      feasibility.evaluate()
    }
    wasSaving.current = board.isSaving
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board.isSaving])

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
          {feasibility.feasibility && (
            <>
              <span className="text-green">{feasibility.feasibility.stats.nb_ok} faisables</span>
              <span className="text-destructive">{feasibility.feasibility.stats.nb_bloques} bloqués</span>
            </>
          )}
          {board.isSaving && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
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
        <button
          onClick={feasibility.evaluate}
          disabled={feasibility.isEvaluating}
          className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/5 px-3 py-1.5 text-[11px] font-bold text-primary transition-colors hover:bg-primary/10 disabled:opacity-50"
        >
          {feasibility.isEvaluating ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <ShieldCheck className="h-3.5 w-3.5" />
          )}
          Évaluer faisabilité
        </button>
        <button
          onClick={() => setShowWhatIf((v) => !v)}
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-bold transition-colors ${
            showWhatIf
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-border bg-card text-foreground hover:bg-muted'
          }`}
        >
          <FlaskConical className="h-3.5 w-3.5" />
          Simuler une commande
        </button>
      </div>

      {/* Bannière diff après réévaluation (ex. : suite à un affermissement) */}
      {feasibility.diff && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-orange/50 bg-orange/5 px-4 py-2.5 text-[12px]">
          <span className="font-bold text-foreground">Impact de la modification :</span>
          {feasibility.diff.degraded.length > 0 && (
            <span className="inline-flex items-center gap-1 font-semibold text-destructive">
              <TrendingDown className="h-3.5 w-3.5" />
              {feasibility.diff.degraded.length} OF dégradé(s) : {feasibility.diff.degraded.slice(0, 5).join(', ')}
              {feasibility.diff.degraded.length > 5 && '…'}
            </span>
          )}
          {feasibility.diff.improved.length > 0 && (
            <span className="inline-flex items-center gap-1 font-semibold text-green">
              <TrendingUp className="h-3.5 w-3.5" />
              {feasibility.diff.improved.length} OF redevenu(s) faisable(s) : {feasibility.diff.improved.slice(0, 5).join(', ')}
              {feasibility.diff.improved.length > 5 && '…'}
            </span>
          )}
          <button
            onClick={feasibility.clearDiff}
            className="ml-auto rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Fermer"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

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
                feasibilityMap={feasibility.entries}
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

          {showWhatIf && (
            <WhatIfPanel
              windowFrom={windowFrom}
              windowTo={windowTo}
              onClose={() => setShowWhatIf(false)}
            />
          )}

          {board.selected && !showWhatIf && (
            <OfDetailPanel
              of={board.selected}
              onClose={() => board.setSelectedOf(null)}
              onPatch={board.patchOf}
              onReset={(numOf) => {
                board.resetOf(numOf)
              }}
              isSaving={board.isSaving}
              feasibility={feasibility.entries?.[board.selected.num_of] ?? null}
            />
          )}
        </div>
      )}
    </div>
  )
}
