/** Champs de `LoadLine` dont la recherche client a besoin. */
export type LoadSearchable = {
  code: string
  name: string
  articles: readonly string[]
  atelier: string
}

/**
 * Rang d'un poste pour la requête déjà normalisée (`trim` + minuscule).
 * Plus petit = plus pertinent. `null` = hors filtre.
 *
 * 0 code exact · 1 code contient · 2 libellé · 3 article.
 * Sans ça, `includes` sur le haystack collé + tri alphabétique du code sort
 * PP_091 (article EFL1830AE) avant PP_830 pour la requête « 830 ».
 */
export function loadSearchRank(
  line: Pick<LoadSearchable, 'code' | 'name' | 'articles'>,
  q: string
): number | null {
  if (!q) return 0
  const code = line.code.toLowerCase()
  if (code === q) return 0
  if (code.includes(q)) return 1
  if (line.name.toLowerCase().includes(q)) return 2
  if (line.articles.some((a) => a.toLowerCase().includes(q))) return 3
  return null
}

/**
 * Filtre atelier + recherche, puis rang de pertinence si la requête n'est pas vide.
 * Sans requête, l'ordre d'entrée est conservé (déjà `localeCompare` du code poste).
 */
export function filterLoadLines<T extends LoadSearchable>(
  lines: readonly T[],
  query: string,
  ateliers: ReadonlySet<string> = new Set()
): T[] {
  const q = query.trim().toLowerCase()
  const scored: { line: T; rank: number }[] = []
  for (const line of lines) {
    if (ateliers.size && !ateliers.has(line.atelier)) continue
    const rank = loadSearchRank(line, q)
    if (rank === null) continue
    scored.push({ line, rank })
  }
  if (q) scored.sort((a, b) => a.rank - b.rank || a.line.code.localeCompare(b.line.code))
  return scored.map((s) => s.line)
}
