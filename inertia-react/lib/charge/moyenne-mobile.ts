/**
 * Fenêtre (en périodes) de la courbe de moyenne mobile du graphe /charge.
 * `null` = courbe éteinte — le cran toolbar `showAvg` gouverne ça. Sans ce
 * garde, HistogrammeCharge traçait la moyenne alors que le cran était off
 * (seule la légende suivait `showAvg`).
 */
export function fenetreMoyenneMobile(showAvg: boolean, gran: 'month' | 'week'): number | null {
  if (!showAvg) return null
  return gran === 'week' ? 8 : 2
}
