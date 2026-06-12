import { test } from '@japa/runner'
import { X3StockRepository } from '#app/repositories/stock_repository'
import { X3ReceptionRepository } from '#app/repositories/reception_repository'
import { X3BesoinClientRepository } from '#app/repositories/besoin_client_repository'

function mockQuery(rows: Record<string, string>[]): { success: true; count: number; data: Record<string, string>[] } {
  return { success: true as const, count: rows.length, data: rows }
}

// X3OfRepository uses Lucid ORM (MfgItem.query()) — tested via functional tests

test.group('X3StockRepository', () => {
  test('returns supply flows from stock rows', async ({ assert }) => {
    const mockResult = mockQuery([
      { ARTICLE: 'ART1', STOCK_PHYSIQUE: '100', STOCK_ALLOUE: '20', STOCK_SOUS_CQ: '10' },
      { ARTICLE: 'ART2', STOCK_PHYSIQUE: '50', STOCK_ALLOUE: '10', STOCK_SOUS_CQ: '0' },
    ])
    const repo = new X3StockRepository({ query: async () => mockResult } as any)
    const flows = await repo.getStockFlows()
    // ART1: strict=80 + qc=10, ART2: strict=40
    const art1 = flows.filter((f) => f.article === 'ART1')
    const art2 = flows.filter((f) => f.article === 'ART2')
    assert.equal(art1.length, 2)
    assert.equal(art1.find((f) => (f.origin as any).subType === 'strict')!.quantity, 80)
    assert.equal(art1.find((f) => (f.origin as any).subType === 'qc')!.quantity, 10)
    assert.equal(art2.length, 1)
    assert.equal(art2[0].quantity, 40)
  })
})

test.group('X3ReceptionRepository', () => {
  test('returns supply flows from reception rows', async ({ assert }) => {
    const mockResult = mockQuery([
      { ARTICLE: 'COMP1', QTE_RESTANTE: '200', DATE_RECEPTION_PREVUE: '2026-06-15', NUM_COMMANDE: 'RC001', CODE_FOURNISSEUR: 'SUP01' },
    ])
    const repo = new X3ReceptionRepository({ query: async () => mockResult } as any)
    const flows = await repo.getReceptionFlows()
    assert.lengthOf(flows, 1)
    assert.equal(flows[0].article, 'COMP1')
    assert.equal(flows[0].quantity, 200)
    assert.equal(flows[0].direction, 'supply')
    assert.equal(flows[0].origin.type, 'reception')
    assert.deepEqual(flows[0].date, new Date('2026-06-15'))
  })
})

test.group('X3BesoinClientRepository', () => {
  test('returns demand flows from order rows', async ({ assert }) => {
    const mockResult = mockQuery([
      { NUM_COMMANDE: 'C001', ARTICLE: 'ART1', TYPE_COMMANDE: 'MTS', NATURE_BESOIN: 'COMMANDE', QTE_RESTANTE: '50', DATE_EXPEDITION_DEMANDEE: '2026-06-20', NOM_CLIENT: 'Client A' },
      { NUM_COMMANDE: 'C002', ARTICLE: 'ART2', TYPE_COMMANDE: 'NOR', NATURE_BESOIN: 'PREVISION', QTE_RESTANTE: '30', DATE_EXPEDITION_DEMANDEE: '2026-06-25', NOM_CLIENT: 'Client B' },
    ])
    const repo = new X3BesoinClientRepository({ query: async () => mockResult } as any)
    const flows = await repo.getDemandFlows()
    assert.lengthOf(flows, 2)
    assert.equal(flows[0].direction, 'demand')
    assert.equal(flows[0].origin.type, 'order')
    assert.equal((flows[0].origin as any).orderType, 'MTS')
    assert.equal(flows[1].origin.type, 'forecast')
    assert.equal((flows[1].origin as any).orderType, 'NOR')
  })
})
