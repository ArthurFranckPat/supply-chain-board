/**
 * Repository BesoinClient — materialise des Flows demand depuis les commandes/prevision X3.
 */

import type { Flow, OrderType, NeedNature } from '#app/domain/models/flow'
import type { X3Queryable } from '#app/x3/types'

export class X3BesoinClientRepository {
  constructor(private conn: X3Queryable) {}

  async getDemandFlows(): Promise<Flow[]> {
    const sql = `SELECT NUM_COMMANDE, ARTICLE, TYPE_COMMANDE, NATURE_BESOIN, QTE_RESTANTE,
DATE_EXPEDITION_DEMANDEE, NOM_CLIENT, CODE_PAYS
FROM ZBESOINCLIENT
WHERE QTE_RESTANTE > 0`

    const result = await this.conn.query(sql)
    if (!result.success) return []

    return result.data
      .filter(row => parseFloat(row.QTE_RESTANTE) > 0)
      .map(row => {
        const nature = (row.NATURE_BESOIN?.toUpperCase().trim() ?? '') as NeedNature
        const isOrder = nature === 'COMMANDE'
        const orderType = (row.TYPE_COMMANDE?.toUpperCase().trim() ?? 'NOR') as OrderType

        return {
          article: row.ARTICLE.trim(),
          quantity: parseFloat(row.QTE_RESTANTE),
          direction: 'demand' as const,
          date: row.DATE_EXPEDITION_DEMANDEE ? new Date(row.DATE_EXPEDITION_DEMANDEE) : null,
          origin: isOrder
            ? { type: 'order' as const, id: row.NUM_COMMANDE.trim(), customer: row.NOM_CLIENT?.trim() ?? '', orderType, nature }
            : { type: 'forecast' as const, id: row.NUM_COMMANDE.trim(), orderType },
        }
      })
  }
}
