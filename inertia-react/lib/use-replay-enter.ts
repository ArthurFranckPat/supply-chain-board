import { useEffect, useRef, type RefObject } from 'react'

/**
 * Rejoue une courte entrée (fondu montant) quand `signature` change.
 *
 * Pourquoi pas une classe CSS sur un élément remonté par une `key` : remonter
 * coûte l'état DOM de l'élément — la position de défilement d'un slider, la
 * mesure de la boîte d'un graphe — et React ne sait pas « remonter un peu ». Ici
 * l'élément reste en place ; seule la Web Animations API rejoue l'animation sur
 * sa couche (opacité + translation : rien à recalculer, rien à repeindre).
 *
 * `signature` doit décrire les DONNÉES TRACÉES, jamais la taille : un
 * redimensionnement de fenêtre ne doit pas faire clignoter le contenu.
 *
 * Pas d'animation au premier rendu : elle sert à rendre lisible un CHANGEMENT,
 * et à l'ouverture il n'y a rien à comparer. `prefers-reduced-motion` la coupe —
 * le contenu est déjà à sa place, il n'y a rien à révéler.
 */
export function useReplayEnter(
  ref: RefObject<HTMLElement | null>,
  signature: string,
  durationMs = 260
) {
  /** Première signature vue — le rendu d'ouverture n'anime pas. */
  const seen = useRef<string | null>(null)

  useEffect(() => {
    if (seen.current === null) {
      seen.current = signature
      return
    }
    if (seen.current === signature) return
    seen.current = signature

    const el = ref.current
    if (!el || typeof el.animate !== 'function') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const anim = el.animate(
      [
        { opacity: 0, transform: 'translateY(6px)' },
        { opacity: 1, transform: 'translateY(0)' },
      ],
      { duration: durationMs, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
    )
    // Changement pendant qu'une entrée joue : la précédente est annulée plutôt
    // que superposée (deux opacités concurrentes se multiplieraient).
    return () => anim.cancel()
  }, [ref, signature, durationMs])
}
