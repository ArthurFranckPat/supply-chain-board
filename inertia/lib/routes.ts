/**
 * Helper typé de construction d'URL à partir du nom d'une route Adonis.
 *
 *   route('planning_board.show', { numOf: 'OF0001' })
 *   // → '/api/v1/planning/ofs/OF0001'
 *
 * Pourquoi (issue #18) : avant ce helper, toutes les URLs étaient des template
 * literals éparpillés (`\`${API}/ofs/${numOf}\``), donc tout renommage de route
 * se faisait à la main sans garde-fou. Désormais :
 *  - source de vérité unique : `start/routes.ts` ;
 *  - le build échoue si une route nommée disparaît (le type `RouteName` est
 *    resynchronisé via `npm run routes:gen`, lui-même dérivé de `ace list:routes`) ;
 *  - les params de path sont vérifiés au runtime (throw si manquant).
 *
 * Convention : les query strings (état de vue : ?start&days&refresh) restent à
 * l'appelant — seuls les params d'identité (path) sont typés.
 *   route('scheduler.shortage_tracker') + '?start=2026-01-01&days=14'
 */
import { MANIFEST, type RouteName, type RouteParams } from '@/lib/routes-manifest'

const PARAM_RE = /:([A-Za-z_]\w*)/g

function paramNames(pattern: string): string[] {
  return (pattern.match(PARAM_RE) ?? []).map((p) => p.slice(1))
}

export function route<N extends RouteName>(
  name: N,
  ...rest: RouteParams[N] extends void ? [] : [params: RouteParams[N]]
): string {
  const def = MANIFEST[name]
  // `def` est toujours défini (RouteName = keyof MANIFEST), mais on garde un
  // garde-fou runtime pour le code non-typechecké (JS pur, erreurs dynamiques).
  if (!def) throw new Error(`[route] route inconnue : "${String(name)}"`)

  const names = paramNames(def.pattern)
  const provided = (rest[0] ?? {}) as Record<string, string | number | null | undefined>

  // `def.pattern` est un type littéral (MANIFEST est `as const`) → on l'élargit à string
  // pour pouvoir le réécrire via replace().
  let url: string = def.pattern
  for (const p of names) {
    const v = provided[p]
    if (v === undefined || v === null) {
      throw new Error(`[route('${String(name)}')] paramètre de path manquant : "${p}"`)
    }
    url = url.replace(`:${p}`, encodeURIComponent(String(v)))
  }
  return url
}

export type { RouteName, RouteParams }
