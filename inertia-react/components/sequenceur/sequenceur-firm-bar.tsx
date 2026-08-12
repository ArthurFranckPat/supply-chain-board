/**
 * Barre d'affermissement batch — mode « À lancer » du séquenceur (#100).
 * Même UX que BatchFirmBar (programme), sans dépendance au store board.
 *
 * Migrée sur le design system : la confirmation « affermir malgré les
 * ruptures » était un popover fait main (overlay `fixed inset-0` maison,
 * `shadow-xl` hors tokens, aucune sémantique de dialogue) — c'est un
 * `AlertDialog`, qui apporte le focus piégé, l'échappement au clavier et
 * l'annonce du rôle. Les compteurs passent en `Badge`.
 */
import { useCallback, useState } from 'react'
import { CircleCheck, RefreshCw, ShieldQuestion, TriangleAlert, X } from 'lucide-react'

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPortal,
  AlertDialogTitle,
} from '@r/components/ui/alert-dialog'
import { Badge } from '@r/components/ui/badge'
import { Button } from '@r/components/ui/button'
import { Separator } from '@r/components/ui/separator'
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
    <>
      <div className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2">
        <div className="flex items-center gap-3 rounded-full border border-border bg-card px-4 py-2 shadow-float">
          {total > 0 ? (
            <span className="flex items-center gap-2 font-mono text-xs font-bold tabular-nums">
              {props.batchRunning && (
                <RefreshCw size={15} strokeWidth={1.75} className="animate-spin text-primary" />
              )}
              <span className="text-ferme">✓ {ok}</span>
              {err > 0 && <span className="text-destructive">✗ {err}</span>}
              <span className="text-muted-foreground">/ {total}</span>
            </span>
          ) : (
            <span className="font-mono text-xs font-bold tabular-nums text-foreground">
              {props.selected.length} OF sélectionné{props.selected.length > 1 ? 's' : ''}
            </span>
          )}

          {blocked.length > 0 && !props.batchRunning && (
            <Badge variant="destructive" className="gap-1 font-mono text-2xs font-semibold">
              <TriangleAlert strokeWidth={2} aria-hidden="true" />
              {blocked.length} en rupture
            </Badge>
          )}

          <Separator orientation="vertical" className="h-5" />

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

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogPortal>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{blocked.length} OF en rupture dans la sélection</AlertDialogTitle>
              <AlertDialogDescription>
                Ces OF ne pourraient pas être produits immédiatement : au moins un composant manque.
                Affermir toute la sélection malgré tout ?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <Button size="sm" variant="outline" onClick={() => setConfirm(false)}>
                Annuler
              </Button>
              <Button size="sm" variant="destructive" className="gap-1.5" onClick={run}>
                <ShieldQuestion size={15} strokeWidth={1.75} />
                Affermir malgré les ruptures
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialogPortal>
      </AlertDialog>
    </>
  )
}

export default SequenceurFirmBar
