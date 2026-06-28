import { onCleanup, onMount } from 'solid-js'

/**
 * Ajuste le board à la largeur imprimable A3 paysage à l'impression.
 *
 * Les navigateurs ne paginent qu'à la verticale : un board plus large que la
 * page serait rogné à droite (les colonnes de droite disparaissent). On mesure
 * donc sa largeur naturelle (toutes colonnes déroulées) au moment d'imprimer,
 * puis on applique un `zoom` CSS pour qu'il tienne dans la page. Ne grossit
 * jamais (scale ≤ 1) et est remis à 1 après l'impression.
 *
 * `zoom` (plutôt que `transform: scale`) car il reflow la mise en page au lieu
 * de peindre par-dessus — la pagination verticale reste propre sur plusieurs pages.
 */
export function usePrintFit(getEl: () => HTMLElement | undefined) {
  const before = () => {
    const el = getEl()
    if (!el || el.scrollWidth === 0) return
    // A3 paysage imprimable = 420mm − marges 24mm (@page) → px @96dpi.
    const printablePx = ((420 - 24) * 96) / 25.4
    const scale = Math.min(1, printablePx / el.scrollWidth)
    el.style.zoom = String(scale)
  }
  const after = () => {
    const el = getEl()
    if (el) el.style.zoom = ''
  }
  onMount(() => {
    window.addEventListener('beforeprint', before)
    window.addEventListener('afterprint', after)
  })
  onCleanup(() => {
    window.removeEventListener('beforeprint', before)
    window.removeEventListener('afterprint', after)
    after()
  })
}
