/**
 * Action « Affermir » du détail OF (issue #52 — extrait de
 * components/of/of-detail-sheet.tsx) : bouton fixe + popover de confirmation
 * (absolu → aucun décalage du header).
 *
 * Par défaut l'affermissement d'un OF en rupture est interdit ; l'utilisateur
 * doit confirmer explicitement via le popover (backdrop plein écran qui
 * bloque toute interaction et annule au clic dehors). La visibilité du bouton
 * (canFirm) est décidée par le shell ; ce composant ne rend que le bouton +
 * son popover, pilotés par l'état passé en props.
 */
import { For, Show, type Accessor, type Component } from 'solid-js'
import { Button } from '@/components/ui/button'
import type { BomRow } from '@/lib/of/types'

export interface OfFirmActionProps {
  firming: Accessor<boolean>
  confirmRupture: Accessor<boolean>
  /** OF en suggestion (libellé « Affermir ») vs planifié (« Passer en ferme »). */
  isSuggestion: Accessor<boolean>
  /** Composants en rupture — alimente le popover d'avertissement. */
  rupturedComponents: Accessor<BomRow[]>
  /** Gate : demande d'affermissement (interdite → ouvre le popover, sinon exécute). */
  onFirm: () => void
  /** Affermissement effectif (POST, déjà confirmé ou sans rupture). */
  onDoFirm: () => void
  /** Ferme le popover de confirmation sans affermir. */
  onCancelConfirm: () => void
}

export const OfFirmAction: Component<OfFirmActionProps> = (props) => (
  <div class="relative">
    <Button
      size="sm"
      variant="default"
      class="gap-1.5"
      onClick={() => props.onFirm()}
      disabled={props.firming() || props.confirmRupture()}
    >
      <span
        class={`material-symbols-outlined text-[15px] ${props.firming() ? 'animate-spin' : ''}`}
      >
        {props.firming() ? 'progress_activity' : 'check_circle'}
      </span>
      {props.firming() ? 'Affermissement…' : props.isSuggestion() ? 'Affermir' : 'Passer en ferme'}
    </Button>
    <Show when={props.confirmRupture()}>
      {/* Backdrop plein écran : bloque toute interaction (dont le
          bouton Affermir) et annule au clic dehors. */}
      <div class="fixed inset-0 z-40" onClick={() => props.onCancelConfirm()} aria-hidden="true" />
      <div class="absolute bottom-full right-0 z-50 mb-2 w-[20rem] rounded-lg border border-destructive/40 bg-background p-3 shadow-xl">
        <div class="flex items-start gap-2">
          <span class="material-symbols-outlined mt-0.5 text-[18px] text-destructive">warning</span>
          <div class="min-w-0 flex-1">
            <div class="font-mono text-[12px] font-bold text-destructive">
              {props.rupturedComponents().length} composant
              {props.rupturedComponents().length > 1 ? 's' : ''} en rupture
            </div>
            <div class="mt-0.5 text-[11px] leading-snug text-muted-foreground">
              L'OF créé ne pourrait pas être produit immédiatement. Affermir malgré tout ?
            </div>
            <For each={props.rupturedComponents().slice(0, 3)}>
              {(r) => (
                <div class="mt-1 flex items-center gap-1.5 font-mono text-[10px]">
                  <span class="font-bold text-foreground">{r.id}</span>
                  <span class="text-destructive">{r.shortage}</span>
                </div>
              )}
            </For>
          </div>
        </div>
        <div class="mt-2.5 flex justify-end gap-2">
          <Button
            size="sm"
            variant="ghost"
            class="h-7 px-2 text-[11px]"
            onClick={() => props.onCancelConfirm()}
            disabled={props.firming()}
          >
            Annuler
          </Button>
          <Button
            size="sm"
            variant="destructive"
            class="h-7 gap-1 text-[11px]"
            onClick={() => props.onDoFirm()}
            disabled={props.firming()}
          >
            <span
              class={`material-symbols-outlined text-[14px] ${props.firming() ? 'animate-spin' : ''}`}
            >
              {props.firming() ? 'progress_activity' : 'gpp_maybe'}
            </span>
            Affermir malgré les ruptures
          </Button>
        </div>
      </div>
    </Show>
  </div>
)

export default OfFirmAction
