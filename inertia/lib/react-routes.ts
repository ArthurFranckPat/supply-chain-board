/**
 * Liste des routes migrées vers React + Carbon.
 * Sert à orienter la navigation inter-runtimes (SolidJS <-> React).
 */
export const REACT_ROUTES = new Set([
  '/react-lab',
  '/suivi',
])

/**
 * Détermine si une URL (relative ou absolue) pointe vers une page gérée par React.
 */
export function isReactRoute(url: string | undefined): boolean {
  if (!url) return false
  try {
    // Récupère uniquement le chemin (ex. /suivi?mode=proactive -> /suivi)
    const path = url.startsWith('/') ? url.split('?')[0] : new URL(url).pathname
    return REACT_ROUTES.has(path)
  } catch {
    return false
  }
}
