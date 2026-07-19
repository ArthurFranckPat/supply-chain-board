/**
 * Registre des routes migrées vers React (shadcn/Base UI).
 * Partagé entre `config/inertia.ts` (rootView) et les mastheads des deux
 * runtimes : la navigation inter-runtimes DOIT passer par un <a> natif
 * (visite XHR cross-runtime = composant introuvable dans le bundle).
 */
export const REACT_ROUTES = new Set([
  '/react-lab',
  '/react-board',
  '/suivi',
  '/receptions',
  '/expeditions',
  '/ruptures',
  '/conditionnements',
  '/charge',
  '/login',
  '/configuration/calendrier',
  '/programme/scenarios/comparer',
  '/',
])

/**
 * Détermine si une URL (relative ou absolue) pointe vers une page React.
 */
export function isReactRoute(url: string | undefined): boolean {
  if (!url) return false
  try {
    const path = url.startsWith('/') ? url.split('?')[0] : new URL(url).pathname
    return REACT_ROUTES.has(path)
  } catch {
    return false
  }
}
