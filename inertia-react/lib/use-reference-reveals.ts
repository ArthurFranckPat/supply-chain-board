/**
 * Révélations à l'entrée dans le viewport — une seule fois, sans rejeu.
 *
 * Les éléments à révéler portent `data-reveal="rise|slide|media"` (et, en
 * option, `data-reveal-delay` en ms, plafonné à 240). Le CSS les laisse
 * visibles par défaut : seuls les éléments encore SOUS la ligne de flottaison
 * à l'initialisation reçoivent une animation en pause, jouée quand
 * l'IntersectionObserver (seuil 0, marge basse positive) les voit arriver.
 * Un élément déjà visible, une préférence de mouvement réduit, un onglet caché
 * ou un défilement restauré au-delà : l'état final est posé sans animation.
 */
export function installReferenceReveals(
  root: ParentNode = document,
  selector = '[data-reveal]'
): () => void {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)')
  const animations = new Map<HTMLElement, Animation>()
  const elements = [...root.querySelectorAll<HTMLElement>(selector)]

  const finish = (element: HTMLElement) => {
    element.dataset.revealPlayed = 'true'
    animations.get(element)?.cancel()
    animations.delete(element)
  }

  const observer =
    typeof IntersectionObserver === 'function'
      ? new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              if (!entry.isIntersecting) continue
              const element = entry.target as HTMLElement
              observer?.unobserve(element)
              element.dataset.revealPlayed = 'true'
              if (
                reduced.matches ||
                document.visibilityState === 'hidden' ||
                entry.boundingClientRect.bottom <= 0
              )
                finish(element)
              else animations.get(element)?.play()
            }
          },
          { threshold: 0, rootMargin: '0px 0px 96px 0px' }
        )
      : undefined

  const stop = () => {
    observer?.disconnect()
    elements.forEach(finish)
  }
  const onPreference = () => {
    if (reduced.matches) stop()
  }
  reduced.addEventListener('change', onPreference)

  for (const element of elements) {
    if (element.dataset.revealPlayed === 'true') continue
    const rect = element.getBoundingClientRect()
    // Ne jamais masquer après coup un contenu déjà visible ou un défilement restauré.
    if (
      reduced.matches ||
      !observer ||
      !element.animate ||
      rect.top < innerHeight ||
      document.visibilityState === 'hidden'
    ) {
      finish(element)
      continue
    }
    const transform =
      element.dataset.reveal === 'media'
        ? 'scale(1.025)'
        : element.dataset.reveal === 'slide'
          ? 'translateX(-12px)'
          : 'translateY(12px)'
    const delay = Math.min(Number(element.dataset.revealDelay) || 0, 240)
    const animation = element.animate(
      [
        { opacity: 0, transform },
        { opacity: 1, transform: 'none' },
      ],
      { duration: 600, delay, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'backwards' }
    )
    animation.pause()
    animation.onfinish = () => finish(element)
    animations.set(element, animation)
    observer.observe(element)
  }

  return () => {
    stop()
    reduced.removeEventListener('change', onPreference)
  }
}
