/**
 * Country filtering helpers for demand flows.
 *
 * Mirrors production_planning.models.besoin_client:
 * - estFrance(): true when pays is 'FR'
 * - estExport(): true when pays is set and not 'FR'
 */

const FRANCE_CODE = 'FR'

/** Returns true when pays is 'FR'. */
export function estFrance(pays: string | null): boolean {
  return pays === FRANCE_CODE
}

/** Returns true when pays is set and not 'FR' (i.e. export). */
export function estExport(pays: string | null): boolean {
  return pays !== null && pays !== FRANCE_CODE
}
