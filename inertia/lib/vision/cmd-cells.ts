/**
 * Regroupement des commandes par poste × colonne d'expédition (issue #52 —
 * extrait de scheduler/programme.tsx). Une même ligne peut figurer sur
 * plusieurs postes (alimentée par des OF de postes différents) → dédoublonnage
 * par posteCode:lineId.
 */
import type { VisionCommande, VisionLink } from '@/lib/vision/types'

export function buildCmdCells(
  commandes: VisionCommande[],
  links: VisionLink[],
  cmdCol: (l: VisionLink) => number,
): Map<string, VisionCommande[][]> {
  const cmdById = new Map(commandes.map((c) => [c.id, c]))
  const grids = new Map<string, VisionCommande[][]>()
  const seen = new Set<string>()
  for (const l of links) {
    const cmd = cmdById.get(l.commandeId)
    if (!cmd) continue
    const key = `${l.posteCode}:${l.commandeId}`
    if (seen.has(key)) continue
    seen.add(key)
    if (!grids.has(l.posteCode)) grids.set(l.posteCode, [])
    const grid = grids.get(l.posteCode)!
    const col = cmdCol(l)
    ;(grid[col] ||= []).push(cmd)
  }
  return grids
}
