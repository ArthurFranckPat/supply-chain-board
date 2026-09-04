/**
 * Chrome partagé de la toolbar /approvisionnement — grammaire BoardUI.
 *
 * Les déclencheurs de menu (Filtres, Ligne de production) ne sont PAS des
 * `<Button>` : `DropdownTrigger` rend son propre `AriaButton` et n'accepte
 * qu'une className. Plutôt que de redessiner un bouton secondaire à la main
 * — le sosie que les règles BoardUI interdisent — on recompose la recette
 * officielle exportée par le composant (`buttonStyles`), taille `small`.
 * Un changement du bouton BoardUI suit donc ici tout seul.
 */
import { buttonStyles } from '@r/components/base/buttons/button'
import { cx } from '@r/utils/cx'

/** Bouton secondaire BoardUI, taille `small`, en déclencheur de menu. */
export const TRIGGER_SECONDARY = cx(
  buttonStyles.base,
  buttonStyles.size.small,
  buttonStyles.variant.secondary,
  'gap-1'
)
