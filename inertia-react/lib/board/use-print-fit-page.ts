import { useEffect } from 'react'

/**
 * Ajuste un contenu pour tenir sur UNE SEULE page A3 paysage à l'impression.
 * Port React de usePrintFitPage Solid (inertia/lib/board/use-print-fit.ts).
 *
 * Contrairement à `usePrintFit` (fit en largeur seul ; le board s'autorise à
 * s'étendre sur plusieurs pages verticales), ici l'exigence est « tout le
 * tableau de bord sur une page ». On mesure donc largeur ET hauteur naturelles
 * du contenu, puis on applique un `zoom` ≤ 1 suffisant pour rentrer dans la
 * zone imprimable A3 paysage (420×297 mm − marges @page). Ne grossit jamais ;
 * remis à 1 après l'impression.
 *
 * La mesure doit refléter la mise en page d'impression (cartes déroulées,
 * en-tête imprimable visible) — pas l'état écran où les zones scrollables sont
 * clippées. On active donc transitoirement la classe `print-fit-measure` sur
 * `<html>` (règle CSS associée dans app.css) qui déroule tout sous `.theme-papier`
 * et affiche `[data-print-header]`, on mesure, puis on la retire (la mise en
 * page d'impression réelle sera, elle, portée par les utilitaires Tailwind
 * `print:*` au moment d'imprimer).
 *
 * Comme pour `usePrintFit`, `zoom` (et non `transform: scale`) est utilisé car
 * il reflow la mise en page : la pagination verticale est recalculée sur la
 * taille réduite, donc le contenu tient bien sur une page.
 */
export function usePrintFitPage(getEl: () => HTMLElement | null) {
  useEffect(() => {
    const before = () => {
      const el = getEl()
      if (!el || el.scrollWidth === 0) return
      const root = document.documentElement
      // Bascule en mise en page « impression » le temps de la mesure.
      root.classList.add('print-fit-measure')
      // A3 paysage imprimable = 420×297 mm − marges @page (12 mm h / 10 mm v) → px @96dpi.
      const printW = ((420 - 24) * 96) / 25.4
      const printH = ((297 - 20) * 96) / 25.4
      // Force la largeur imprimable A3 pendant la mesure : la mise en page est
      // responsive (grille 3 colonnes dès `lg`), il faut donc mesurer à la largeur
      // qu'aura réellement le contenu à l'impression, pas celle de la fenêtre.
      const prevWidth = el.style.width
      el.style.width = `${printW}px`
      const raw = Math.min(printW / el.scrollWidth, printH / el.scrollHeight)
      el.style.width = prevWidth
      root.classList.remove('print-fit-measure')
      // Ne grossit jamais (raw ≥ 1 → 1). En dessous, ×0,98 absorbe les arrondis
      // du zoom décimal pour éviter une 2ᵉ page fantôme (1 px de débordement).
      el.style.zoom = String(raw >= 1 ? 1 : raw * 0.98)
    }
    const after = () => {
      const el = getEl()
      if (el) el.style.zoom = ''
    }

    window.addEventListener('beforeprint', before)
    window.addEventListener('afterprint', after)
    return () => {
      window.removeEventListener('beforeprint', before)
      window.removeEventListener('afterprint', after)
      after()
    }
  }, [getEl])
}
