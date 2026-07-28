/**
 * Barre d'affermissement batch — mode « À lancer » du séquenceur (#100).
 * Même UX que BatchFirmBar (programme), sans dépendance au store board.
 */
import { useState, useCallback } from 'react'
import { CircleCheck, RefreshCw, ShieldQuestion, TriangleAlert, X } from 'lucide-react'
import { Button } from '@r/components/ui/button'
import type { FeasStatus } from '@r/lib/board/types'

export type BatchItem = { st: 'running' | 'ok' | 'error'; msg?: string }

export function SequenceurFirmBar(props: {
  selected: string[]
  feasibility: Record<string, FeasStatus>
  batch: Record<string, BatchItem>
  batchRunning: boolean
  onFirm: (ids: string[]) => void
  onClear: () => void
}) {
  const [confirm, setConfirm] = useState(false)
  const blocked = props.selected.filter((id) => props.feasibility[id]?.st === 'blocked')

  let ok = 0
  let err = 0
  let total = 0
  for (const k in props.batch) {
    total++
    const s = props.batch[k].st
    if (s === 'ok') ok++
    else if (s === 'error') err++
  }

  const run = useCallback(() => {
    if (blocked.length > 0 && !confirm) {
      setConfirm(true)
      return
    }
    setConfirm(false)
    props.onFirm(props.selected)
  }, [blocked.length, confirm, props])

  if (props.selected.length === 0 && total === 0) return null

  return (
    <div className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2">
      <div className="flex items-center gap-3 rounded-full border border-rule bg-card px-4 py-2 shadow-float">
        {total > 0 ? (
          <span className="flex items-center gap-2 font-mono text-[12px] font-bold">
            {props.batchRunning && (
              <RefreshCw size={16} strokeWidth={1.75} className="animate-spin text-brand" />
            )}
            <span className="text-ferme">✓ {ok}</span>
            {err > 0 && <span className="text-destructive">✗ {err}</span>}
            <span className="text-muted-foreground">/ {total}</span>
          </span>
        ) : (
          <span className="font-mono text-[12px] font-bold text-foreground">
            {props.selected.length} OF sélectionné{props.selected.length > 1 ? 's' : ''}
          </span>
        )}

        {blocked.length > 0 && !props.batchRunning && (
          <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 font-mono text-[10px] font-bold text-destructive">
            <TriangleAlert size={13} strokeWidth={1.75} />
            {blocked.length} en rupture
          </span>
        )}

        <span className="h-5 w-px bg-rule" />

        <div className="relative">
          <Button
            size="sm"
            variant="default"
            className="gap-1.5"
            onClick={run}
            disabled={props.batchRunning || props.selected.length === 0}
          >
            {props.batchRunning ? (
              <RefreshCw size={15} strokeWidth={1.75} className="animate-spin" />
            ) : (
              <CircleCheck size={15} strokeWidth={1.75} />
            )}
            {props.batchRunning ? 'Affermissement…' : 'Affermir la sélection'}
          </Button>

          {confirm && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setConfirm(false)}
                aria-hidden="true"
              />
              <div className="absolute bottom-full left-1/2 z-50 mb-2 w-[22rem] -translate-x-1/2 rounded-lg border border-destructive/40 bg-background p-3 shadow-xl">
                <div className="flex items-start gap-2">
                  <TriangleAlert size={18} strokeWidth={1.75} className="mt-0.5 text-destructive" />
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-[12px] font-bold text-destructive">
                      {blocked.length} OF en rupture dans la sélection
                    </div>
                    <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                      Ces OF ne pourraient pas être produits immédiatement. Affermir toute la
                      sélection malgré tout ?
                    </div>
                  </div>
                </div>
                <div className="mt-2.5 flex justify-end gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-[11px]"
                    onClick={() => setConfirm(false)}
                  >
                    Annuler
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="h-7 gap-1 text-[11px]"
                    onClick={run}
                  >
                    <ShieldQuestion size={14} strokeWidth={1.75} />
                    Affermir malgré les ruptures
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>

        <Button
          size="sm"
          variant="ghost"
          className="gap-1.5"
          onClick={props.onClear}
          disabled={props.batchRunning}
        >
          <X size={15} strokeWidth={1.75} />
          Quitter
        </Button>
      </div>
    </div>
  )
}

export default SequenceurFirmBar
