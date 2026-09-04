/**
 * Chrome partagé de la toolbar /approvisionnement — grammaire BoardUI.
 *
 * Les déclencheurs de menu (Filtres, Ligne de production) ne sont PAS des
 * `<Button>` : `DropdownTrigger` rend son propre `AriaButton` et n'accepte
 * qu'une className. Plutôt que de redessiner un bouton secondaire à la main
 * — le sosie que les règles BoardUI interdisent — on recompose la recette
 * officielle exportée par le composant (`buttonStyles`), taille `small`.
 * Un changement du bouton BoardUI suit donc ici tout seul.
 *
 * ─── Densité ───────────────────────────────────────────────────────────────
 * BoardUI cale ses contrôles sur `text-body-*` (14 px). Cette page est en
 * mode `dense` : sa toolbar porte 15 contrôles sur une seule rangée et, à
 * 14 px, elle déborde — la recherche et le ⟳ sortent de l'écran. On
 * redescend donc d'un cran de l'ÉCHELLE BOARDUI (`caption-1`, 12 px), pas
 * en `text-xs` brut : on reste dans le système, on n'en sort pas.
 */
import { buttonStyles } from '@r/components/base/buttons/button'
import { cx } from '@r/utils/cx'

/** Bouton secondaire BoardUI, taille `small`, densifié, en déclencheur de menu. */
export const TRIGGER_SECONDARY = cx(
  buttonStyles.base,
  buttonStyles.size.small,
  buttonStyles.variant.secondary,
  'gap-1 px-2 text-caption-1-semibold'
)

/**
 * Item de `SegmentedControl` à la densité du board. Passé en fonction : le
 * composant distingue sélectionné/non par le POIDS typographique, distinction
 * qu'une className fixe écraserait (le `cx` de BoardUI sait résoudre les
 * conflits entre utilitaires typographiques composites, donc le dernier gagne).
 */
export const segmentItemDense = (state: { isSelected: boolean }): string =>
  state.isSelected ? 'px-2 text-caption-1-semibold' : 'px-2 text-caption-1-medium'
