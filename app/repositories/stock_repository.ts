import type { Flow } from '#app/domain/models/flow'
import ItemMovement from '#models/x3/itmmvt'

export class X3StockRepository {
  /**
   * Stock courant. Si `articles` fourni → scope (WHERE ITMREF IN ...), batché
   * par 1000 (limite Oracle). Sans `articles` → toute la base (lourd).
   */
  async getStockFlows(articles?: string[]): Promise<Flow[]> {
    const base = () =>
      ItemMovement.query()
        .select(
          'ITMMVT.ITMREF_0',
          'ITMMVT.PHYSTO_0',
          'ITMMVT.CTLSTO_0',
          'ITMMVT.REJSTO_0',
          'ITMMVT.PHYALL_0',
          'ITMMVT.GLOALL_0',
          'ITMMVT.AVC_0'
        )
        .innerJoin('ITMMASTER', 'ITMMASTER.ITMREF_0', 'ITMMVT.ITMREF_0')
        .where('ITMMASTER.ITMSTA_0', '1')

    let rows: ItemMovement[]
    if (articles && articles.length > 0) {
      const uniq = [...new Set(articles.filter(Boolean))]
      rows = []
      for (let i = 0; i < uniq.length; i += 1000) {
        const part = await base().whereIn('ITMMVT.ITMREF_0', uniq.slice(i, i + 1000))
        rows.push(...part)
      }
    } else {
      rows = await base()
    }

    const flows: Flow[] = []
    for (const row of rows) {
      const article = row.article?.trim() ?? ''
      if (!article) continue

      const physique = Number.parseFloat(row.stockInterneA ?? '0') || 0
      const cq = Number.parseFloat(row.stockInterneQ ?? '0') || 0
      const rejected = Number.parseFloat(row.stockInterneR ?? '0') || 0
      const allouePhys = Number.parseFloat(row.alloueInterneA ?? '0') || 0
      const alloueGlob = Number.parseFloat(row.alloueGlobal ?? '0') || 0
      const pmp = Number.parseFloat(row.prixMoyenPondere ?? '0') || null
      const strict = physique - allouePhys - alloueGlob

      if (strict > 0) {
        flows.push({
          article,
          quantity: strict,
          direction: 'supply',
          date: null,
          origin: { type: 'stock', subType: 'strict', pmp },
        })
      }
      if (cq > 0) {
        flows.push({
          article,
          quantity: cq,
          direction: 'supply',
          date: null,
          origin: { type: 'stock', subType: 'qc', pmp },
        })
      }
      if (rejected > 0) {
        flows.push({
          article,
          quantity: rejected,
          direction: 'supply',
          date: null,
          origin: { type: 'stock', subType: 'rejected', pmp },
        })
      }
    }
    return flows
  }
}
