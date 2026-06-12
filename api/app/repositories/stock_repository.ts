import type { Flow } from '#app/domain/models/flow'
import ItemMovement from '#models/x3/itmmvt'

export class X3StockRepository {
  async getStockFlows(): Promise<Flow[]> {
    const rows = await ItemMovement.query()
      .select(
        'ITMMVT.ITMREF_0',
        'ITMMVT.PHYSTO_0',
        'ITMMVT.CTLSTO_0',
        'ITMMVT.REJSTO_0',
        'ITMMVT.PHYALL_0',
        'ITMMVT.GLOALL_0',
        'ITMMVT.AVC_0',
      )
      .innerJoin('ITMMASTER', 'ITMMASTER.ITMREF_0', 'ITMMVT.ITMREF_0')
      .where('ITMMASTER.ITMSTA_0', '1')

    const flows: Flow[] = []
    for (const row of rows) {
      const article = row.article?.trim() ?? ''
      if (!article) continue

      const physique = parseFloat(row.stockInterneA ?? '0') || 0
      const cq = parseFloat(row.stockInterneQ ?? '0') || 0
      const rejected = parseFloat(row.stockInterneR ?? '0') || 0
      const allouePhys = parseFloat(row.alloueInterneA ?? '0') || 0
      const alloueGlob = parseFloat(row.alloueGlobal ?? '0') || 0
      const pmp = parseFloat(row.prixMoyenPondere ?? '0') || null
      const strict = physique - allouePhys - alloueGlob

      if (strict > 0) {
        flows.push({ article, quantity: strict, direction: 'supply', date: null, origin: { type: 'stock', subType: 'strict', pmp } })
      }
      if (cq > 0) {
        flows.push({ article, quantity: cq, direction: 'supply', date: null, origin: { type: 'stock', subType: 'qc', pmp } })
      }
      if (rejected > 0) {
        flows.push({ article, quantity: rejected, direction: 'supply', date: null, origin: { type: 'stock', subType: 'rejected', pmp } })
      }
    }
    return flows
  }
}
