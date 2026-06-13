/**
 * Consommation des prévisions par les commandes fermes.
 *
 * Par article : prev_net = max(0, total_prev - total_cmd)
 * Évite la surévaluation de la charge.
 */

import type { Flow } from './models/flow.js'

export interface ConsumptionStats {
  article: string
  forecastGross: number
  orders: number
  forecastNet: number
}

/**
 * Sépare commandes et prévisions, déduit les commandes des prévisions par article.
 *
 * Les commandes (origin.type === 'order') sont conservées intactes.
 * Les prévisions (origin.type === 'forecast') sont ajustées ou éliminées.
 */
export function consumeForecasts(demands: Flow[]): {
  adjusted: Flow[]
  stats: ConsumptionStats[]
} {
  const commandes: Flow[] = []
  const previsions: Flow[] = []

  for (const d of demands) {
    if (d.direction !== 'demand') continue
    if (d.origin.type === 'order') {
      commandes.push(d)
    } else if (d.origin.type === 'forecast') {
      previsions.push(d)
    }
  }

  const cmdByArticle = new Map<string, number>()
  for (const cmd of commandes) {
    cmdByArticle.set(cmd.article, (cmdByArticle.get(cmd.article) ?? 0) + cmd.quantity)
  }

  const prevByArticle = new Map<string, Flow[]>()
  for (const prev of previsions) {
    const list = prevByArticle.get(prev.article) ?? []
    list.push(prev)
    prevByArticle.set(prev.article, list)
  }

  const stats: ConsumptionStats[] = []
  const adjusted: Flow[] = [...commandes]

  for (const [article, prevList] of prevByArticle) {
    const totalPrev = prevList.reduce((sum, p) => sum + p.quantity, 0)
    const totalCmd = cmdByArticle.get(article) ?? 0
    const prevNet = Math.max(0, totalPrev - totalCmd)

    stats.push({ article, forecastGross: totalPrev, orders: totalCmd, forecastNet: prevNet })

    if (prevNet > 0) {
      const template = prevList[0]
      adjusted.push({ ...template, quantity: prevNet })
    }
  }

  return { adjusted, stats }
}
