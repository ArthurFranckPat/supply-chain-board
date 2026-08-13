/**
 * Action « Affermir » du détail OF.
 *
 * Le bouton dit l'action, toujours la même — pas « malgré N ruptures ».
 * La rupture vit dans le tableau ; le dialog est le cran d'arrêt
 * (focus piégé, Échap = annuler le dialog, pas le sheet).
 */
import { Button } from '@r/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@r/components/ui/alert-dialog'
import { TriangleAlert } from 'lucide-react'
import { DynamicIcon } from '../ui/dynamic-icon'
import type { BomRow } from '@r/lib/of/types'

export interface OfFirmActionProps {
  firming: boolean
  confirmRupture: boolean
  /** OF en suggestion (libellé « Affermir ») vs planifié (« Passer en ferme »). */
  isSuggestion: boolean
  /** Composants en rupture — alimente le dialog d'avertissement. */
  rupturedComponents: BomRow[]
  /** Gate : demande d'affermissement (interdite → ouvre le dialog, sinon exécute). */
  onFirm: () => void
  /** Affermissement effectif (POST, déjà confirmé ou sans rupture). */
  onDoFirm: () => void
  /** Ferme le dialog de confirmation sans affermir. */
  onCancelConfirm: () => void
}

function shortageQty(row: BomRow): string {
  return (row.shortage ?? '').replace(/^[−\-–—]+/, '')
}

export function OfFirmAction(props: OfFirmActionProps) {
  const n = props.rupturedComponents.length
  const label = props.isSuggestion ? 'Affermir' : 'Passer en ferme'

  return (
    <>
      <Button size="lg" variant="default" onClick={props.onFirm} disabled={props.firming}>
        <DynamicIcon
          name={props.firming ? 'progress_activity' : 'check_circle'}
          size={15}
          strokeWidth={1.75}
          className={props.firming ? 'animate-spin' : undefined}
        />
        {props.firming ? 'Affermissement…' : label}
      </Button>
      <AlertDialog
        open={props.confirmRupture}
        onOpenChange={(open) => {
          if (!open) props.onCancelConfirm()
        }}
      >
        <AlertDialogContent size="default">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <TriangleAlert size={18} strokeWidth={1.75} className="text-destructive" />
              {n} composant{n > 1 ? 's' : ''} en rupture
            </AlertDialogTitle>
            <AlertDialogDescription>
              Cet OF ne pourra pas être lancé tant que{' '}
              {n > 1 ? 'ces pièces manquent' : 'cette pièce manque'}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="max-h-32 overflow-auto font-mono text-xs">
            {props.rupturedComponents.map((row) => (
              <li key={row.id} className="flex items-baseline justify-between gap-3 py-0.5">
                <span className="font-medium text-foreground">{row.id}</span>
                <span className="text-destructive">manque {shortageQty(row)}</span>
              </li>
            ))}
          </ul>
          <AlertDialogFooter>
            <AlertDialogCancel size="sm">Annuler</AlertDialogCancel>
            <AlertDialogAction
              size="sm"
              variant="destructive"
              onClick={props.onDoFirm}
              disabled={props.firming}
            >
              {props.firming ? 'Affermissement…' : label}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

export default OfFirmAction
