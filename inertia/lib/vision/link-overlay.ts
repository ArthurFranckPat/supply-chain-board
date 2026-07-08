/**
 * Géométrie pure de l'overlay OF↔commande (issue #52 — extrait de
 * scheduler/programme.tsx). Le repérage DOM (querySelector, getBoundingClientRect)
 * reste côté page ; ce module ne fait que le calcul de la courbe une fois les
 * rectangles mesurés — testable sans DOM réel.
 */

export interface PathSpec {
  d: string
  suggere: boolean
  ofId: string
  commandeId: string
}

export interface RectLike {
  left: number
  top: number
  width: number
  height: number
}

const r1 = (n: number) => Math.round(n)

/**
 * Courbe de Bézier reliant le rectangle OF au rectangle commande, dans le
 * référentiel du conteneur (`cRect`). Part toujours du bord le plus proche de
 * la cible (gauche/droite) pour éviter que le lien traverse la carte.
 * `null` si l'un des deux rectangles est masqué (rangée filtrée → width 0).
 */
export function buildLinkPath(cRect: RectLike, or: RectLike, cr: RectLike): string | null {
  if (or.width === 0 || cr.width === 0) return null
  const ofMidX = or.left - cRect.left + or.width / 2
  const cmdMidX = cr.left - cRect.left + cr.width / 2
  const ofFromLeft = ofMidX <= cmdMidX
  const sx = ofFromLeft ? or.left - cRect.left + or.width : or.left - cRect.left
  const sy = or.top - cRect.top + or.height / 2
  const tx = ofFromLeft ? cr.left - cRect.left : cr.left - cRect.left + cr.width
  const ty = cr.top - cRect.top + cr.height / 2
  const mx = (sx + tx) / 2
  return `M${r1(sx)},${r1(sy)} C${r1(mx)},${r1(sy)} ${r1(mx)},${r1(ty)} ${r1(tx)},${r1(ty)}`
}
