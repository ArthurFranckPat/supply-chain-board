import type { JSX } from 'solid-js'

/**
 * Gestionnaire d'activation clavier pour les éléments non-`<button>` munis de
 * `role="button"` (cards, marqueurs, etc.). Active le handler sur Enter ou
 * Espace — les deux touches qu'un `<button>` natif active — et empêche le
 * scroll involontaire lié à Espace.
 *
 * Issue #62 (lot 1) : un élément focusable avec `role="button"` doit pouvoir
 * être activé au clavier exactement comme un bouton natif (WCAG 2.1.1).
 */
export function onActivation<T extends HTMLElement>(
  handler: (el: T) => void
): (e: KeyboardEvent & { currentTarget: T }) => void {
  return (e) => {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
      e.preventDefault()
      handler(e.currentTarget)
    }
  }
}

/**
 * Listener Échap pour fermeture de popover/menu hand-rolled (le calendrier de
 * fenêtre n'est pas un Dialog Kobalte — il n'hérite donc pas du focus-trap +
 * Échap gratuits). Retourne le handler à poser sur le wrapper et la fonction
 * de fermeture à appeler.
 */
export function onEscapeClose(close: () => void): (e: KeyboardEvent) => void {
  return (e) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      close()
    }
  }
}
