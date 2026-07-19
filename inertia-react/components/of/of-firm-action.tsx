/**
 * Action « Affermir » du détail OF — port React de
 * inertia/components/of/of-firm-action.tsx (issue #52) : bouton fixe +
 * popover de confirmation (absolu → aucun décalage du header).
 */
import { Button } from '@r/components/ui/button'
import type { BomRow } from '@/lib/of/types'

export interface OfFirmActionProps {
  firming: boolean
  confirmRupture: boolean
  /** OF en suggestion (libellé « Affermir ») vs planifié (« Passer en ferme »). */
  isSuggestion: boolean
  /** Composants en rupture — alimente le popover d'avertissement. */
  rupturedComponents: BomRow[]
  /** Gate : demande d'affermissement (interdite → ouvre le popover, sinon exécute). */
  onFirm: () => void
  /** Affermissement effectif (POST, déjà confirmé ou sans rupture). */
  onDoFirm: () => void
  /** Ferme le popover de confirmation sans affermir. */
  onCancelConfirm: () => void
}

export function OfFirmAction(props: OfFirmActionProps) {
  return (
    <div className="relative">
      <Button
        size="sm"
        variant="default"
        className="gap-1.5"
        onClick={props.onFirm}
        disabled={props.firming || props.confirmRupture}
      >
        <span
          className={`material-symbols-outlined text-[15px] ${props.firming ? 'animate-spin' : ''}`}
        >
          {props.firming ? 'progress_activity' : 'check_circle'}
        </span>
        {props.firming ? 'Affermissement…' : props.isSuggestion ? 'Affermir' : 'Passer en ferme'}
      </Button>
      {props.confirmRupture && (
        <>
          {/* Backdrop plein écran : bloque toute interaction (dont le
              bouton Affermir) et annule au clic dehors. */}
          <div className="fixed inset-0 z-40" onClick={props.onCancelConfirm} aria-hidden="true" />
          <div className="absolute bottom-full right-0 z-50 mb-2 w-[20rem] rounded-lg border border-destructive/40 bg-background p-3 shadow-xl">
            <div className="flex items-start gap-2">
              <span className="material-symbols-outlined mt-0.5 text-[18px] text-destructive">
                warning
              </span>
              <div className="min-w-0 flex-1">
                <div className="font-mono text-[12px] font-bold text-destructive">
                  {props.rupturedComponents.length} composant
                  {props.rupturedComponents.length > 1 ? 's' : ''} en rupture
                </div>
                <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                  L'OF créé ne pourrait pas être produit immédiatement. Affermir malgré tout ?
                </div>
                {props.rupturedComponents.slice(0, 3).map((r) => (
                  <div key={r.id} className="mt-1 flex items-center gap-1.5 font-mono text-[10px]">
                    <span className="font-bold text-foreground">{r.id}</span>
                    <span className="text-destructive">{r.shortage}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-2.5 flex justify-end gap-2">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-[11px]"
                onClick={props.onCancelConfirm}
                disabled={props.firming}
              >
                Annuler
              </Button>
              <Button
                size="sm"
                variant="destructive"
                className="h-7 gap-1 text-[11px]"
                onClick={props.onDoFirm}
                disabled={props.firming}
              >
                <span
                  className={`material-symbols-outlined text-[14px] ${props.firming ? 'animate-spin' : ''}`}
                >
                  {props.firming ? 'progress_activity' : 'gpp_maybe'}
                </span>
                Affermir malgré les ruptures
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default OfFirmAction
