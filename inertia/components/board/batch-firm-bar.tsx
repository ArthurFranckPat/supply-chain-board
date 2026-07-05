import { Show, createSignal, type Component } from 'solid-js'
import type { BoardStore } from '@/lib/board/store'
import { Button } from '@/components/ui/button'

/**
 * Barre d'actions flottante — affermissement en batch (issue #34).
 *
 * Visible dès qu'on entre en mode sélection (store.selectMode). Affermit la
 * sélection en série (file côté store, ZSOAPFIRM non thread-safe), feedback par
 * OF via badges sur les cartes + récap de progression ici. Un OF en rupture
 * (faisabilité bloquée) déclenche un seul warning groupé avant exécution.
 */
export const BatchFirmBar: Component<{ store: BoardStore }> = (props) => {
  const { store } = props
  const [confirm, setConfirm] = createSignal(false)

  const ids = () => store.selectedIds()
  /** OF sélectionnés en rupture (faisabilité connue uniquement après « Faisabilité »). */
  const blocked = () => ids().filter((id) => store.feasOf(id)?.st === 'blocked')

  const run = () => {
    if (blocked().length > 0 && !confirm()) {
      setConfirm(true)
      return
    }
    setConfirm(false)
    void store.batchFirm(ids())
  }

  return (
    <Show when={store.selectMode()}>
      <div class="theme-navy fixed bottom-5 left-1/2 z-50 -translate-x-1/2">
        <div class="flex items-center gap-3 rounded-full border border-rule bg-card px-4 py-2 shadow-[0_8px_28px_-8px_rgba(31,26,19,.4)]">
          {/* Compteur sélection / progression */}
          <Show
            when={store.batchCounts().total > 0}
            fallback={
              <span class="font-mono text-[12px] font-bold text-foreground">
                {store.selectedCount()} OF sélectionné{store.selectedCount() > 1 ? 's' : ''}
              </span>
            }
          >
            <span class="flex items-center gap-2 font-mono text-[12px] font-bold">
              <Show when={store.batchRunning()}>
                <span class="material-symbols-outlined animate-spin text-[16px] text-terra">progress_activity</span>
              </Show>
              <span class="text-ferme">✓ {store.batchCounts().ok}</span>
              <Show when={store.batchCounts().err > 0}>
                <span class="text-destructive">✗ {store.batchCounts().err}</span>
              </Show>
              <span class="text-muted-foreground">/ {store.batchCounts().total}</span>
            </span>
          </Show>

          {/* Warning groupé rupture */}
          <Show when={blocked().length > 0 && !store.batchRunning()}>
            <span class="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 font-mono text-[10px] font-bold text-destructive">
              <span class="material-symbols-outlined text-[13px]">warning</span>
              {blocked().length} en rupture
            </span>
          </Show>

          <span class="h-5 w-px bg-rule" />

          <div class="relative">
            <Button
              size="sm"
              variant="default"
              class="gap-1.5"
              onClick={run}
              disabled={store.batchRunning() || store.selectedCount() === 0}
            >
              <span class={`material-symbols-outlined text-[15px] ${store.batchRunning() ? 'animate-spin' : ''}`}>
                {store.batchRunning() ? 'progress_activity' : 'check_circle'}
              </span>
              {store.batchRunning() ? 'Affermissement…' : 'Affermir la sélection'}
            </Button>

            {/* Popover de confirmation groupée (≥1 OF en rupture) */}
            <Show when={confirm()}>
              <div class="fixed inset-0 z-40" onClick={() => setConfirm(false)} aria-hidden="true" />
              <div class="absolute bottom-full left-1/2 z-50 mb-2 w-[22rem] -translate-x-1/2 rounded-lg border border-destructive/40 bg-background p-3 shadow-xl">
                <div class="flex items-start gap-2">
                  <span class="material-symbols-outlined mt-0.5 text-[18px] text-destructive">warning</span>
                  <div class="min-w-0 flex-1">
                    <div class="font-mono text-[12px] font-bold text-destructive">
                      {blocked().length} OF en rupture dans la sélection
                    </div>
                    <div class="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                      Ces OF ne pourraient pas être produits immédiatement. Affermir toute la
                      sélection malgré tout ?
                    </div>
                  </div>
                </div>
                <div class="mt-2.5 flex justify-end gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    class="h-7 px-2 text-[11px]"
                    onClick={() => setConfirm(false)}
                  >
                    Annuler
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    class="h-7 gap-1 text-[11px]"
                    onClick={run}
                  >
                    <span class="material-symbols-outlined text-[14px]">gpp_maybe</span>
                    Affermir malgré les ruptures
                  </Button>
                </div>
              </div>
            </Show>
          </div>

          <Button
            size="sm"
            variant="ghost"
            class="gap-1.5"
            onClick={() => store.exitSelect()}
            disabled={store.batchRunning()}
          >
            <span class="material-symbols-outlined text-[15px]">close</span>
            Quitter
          </Button>
        </div>
      </div>
    </Show>
  )
}

export default BatchFirmBar
