import { useSyncExternalStore } from 'react'

/**
 * Abonnement à une media query. `false` côté serveur / premier rendu SSR :
 * le desktop reste le rendu de référence, le mobile s'applique à l'hydratation.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query)
      mql.addEventListener('change', onChange)
      return () => mql.removeEventListener('change', onChange)
    },
    () => window.matchMedia(query).matches,
    () => false
  )
}

/** Sous le breakpoint `md` de Tailwind (768 px). */
export function useIsMobile(): boolean {
  return useMediaQuery('(max-width: 767px)')
}
