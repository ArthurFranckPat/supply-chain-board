import { useState, useCallback } from 'react'
import { useBoardStore, batchCounts } from '@r/lib/board/store'
import { Button } from '@r/components/ui/button'

/**
 * Barre d'actions flottante — affermissement en batch (issue #34).
 *
 * Visible dès qu'on entre en mode sélection (store.selectMode). Affermit la
 * sélection en série (file côté store, ZSOAPFIRM non thread-safe), feedback par
 * OF via badges sur les cartes + récap de progression ici. Un OF en rupture
 * (faisabilité bloquée) déclenche un seul warning groupé avant exécution.
 */

export function BatchFirmBar() {
  const store = useBoardStore()
  const [confirm, setConfirm] = useState(false)
  const counts = batchCounts(store)

  const ids = Array.from(store.selected)
  /** OF sélectionnés en rupture (faisabilité connue uniquement après « Faisabilité »). */
  const blocked = ids.filter((id) => store.feasibility[id]?.st === 'blocked')

  const run = useCallback(() => {
    if (blocked.length > 0 && !confirm) {
      setConfirm(true)
      return
    }
    setConfirm(false)
    void store.batchFirm(ids)
  }, [blocked.length, confirm, ids, store])

  if (!store.selectMode) return null

  return (
    <div className="theme-navy fixed bottom-5 left-1/2 z-50 -translate-x-1/2">
      <div className="flex items-center gap-3 rounded-full border border-rule bg-card px-4 py-2 shadow-[0_8px_28px_-8px_rgba(31,26,19,.4)]">
        {/* Compteur sélection / progression */}
        {counts.total > 0 ? (
          <span className="flex items-center gap-2 font-mono text-[12px] font-bold">
            {store.batchRunning && (
              <span className="material-symbols-outlined animate-spin text-[16px] text-brand">
                progress_activity
              </span>
            )}
            <span className="text-ferme">✓ {counts.ok}</span>
            {counts.err > 0 && (
              <span className="text-destructive">✗ {counts.err}</span>
            )}
            <span className="text-muted-foreground">/ {counts.total}</span>
          </span>
        ) : (
          <span className="font-mono text-[12px] font-bold text-foreground">
            {store.selected.size} OF sélectionné{store.selected.size > 1 ? 's' : ''}
          </span>
        )}

        {/* Warning groupé rupture */}
        {blocked.length > 0 && !store.batchRunning && (
          <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 font-mono text-[10px] font-bold text-destructive">
            <span className="material-symbols-outlined text-[13px]">warning</span>
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
            disabled={store.batchRunning || store.selected.size === 0}
          >
            <span
              className={`material-symbols-outlined text-[15px] ${store.batchRunning ? 'animate-spin' : ''}`}
            >
              {store.batchRunning ? 'progress_activity' : 'check_circle'}
            </span>
            {store.batchRunning ? 'Affermissement…' : 'Affermir la sélection'}
          </Button>

          {/* Popover de confirmation groupée (≥1 OF en rupture) */}
          {confirm && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setConfirm(false)}
                aria-hidden="true"
              />
              <div className="absolute bottom-full left-1/2 z-50 mb-2 w-[22rem] -translate-x-1/2 rounded-lg border border-destructive/40 bg-background p-3 shadow-xl">
                <div className="flex items-start gap-2">
                  <span className="material-symbols-outlined mt-0.5 text-[18px] text-destructive">
                    warning
                  </span>
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
                    <span className="material-symbols-outlined text-[14px]">gpp_maybe</span>
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
          onClick={() => store.exitSelect()}
          disabled={store.batchRunning}
        >
          <span className="material-symbols-outlined text-[15px]">close</span>
          Quitter
        </Button>
      </div>
    </div>
  )
}

export default BatchFirmBar
