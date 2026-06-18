import { test } from '@japa/runner'
import { assignStatuses, type OrderLine, type StockBreakdown } from '#app/domain/suivi'

/**
 * Ces tests documentaient à l'origine la DIVERGENCE TS vs Python (signal CQ absent).
 * L'issue #19 a porté le signal CQ + la règle d'harmonisation : ils valident désormais
 * l'ALIGNEMENT sur le comportement Python.
 */

function makeLine(overrides: Partial<OrderLine> & { numCommande: string; article: string }): OrderLine {
  return {
    designation: '',
    nomClient: '',
    typeCommande: 'MTO',
    dateExpedition: null,
    dateLivPrevu: null,
    qteCommandee: 100,
    qteAllouee: 0,
    qteRestante: 100,
    isFabrique: false,
    isHardPegged: false,
    ...overrides,
  }
}

test.group('assignStatuses - signal CQ (aligné Python)', () => {
  test('besoin non couvert avec QC consommé → ALLOCATION_A_FAIRE (harmonisation)', ({ assert }) => {
    // Signal CQ indépendant : même si l'allocation virtuelle ne couvre pas tout le besoin,
    // la consommation de stock CQ promeut RAS → ALLOCATION_A_FAIRE.
    const refDate = new Date('2026-06-10')
    const lines: OrderLine[] = [
      makeLine({
        numCommande: 'C1',
        article: 'A',
        qteRestante: 10,
        qteAllouee: 0,
        dateExpedition: new Date('2026-06-20'), // futur → pas retard
      }),
    ]
    const stock = new Map<string, StockBreakdown>([['A', { strict: 0, qc: 5, total: 5 }]])

    const results = assignStatuses(lines, stock, refDate)

    assert.equal(results[0].status, 'ALLOCATION_A_FAIRE')
    assert.isTrue(results[0].alerteCqStatut)
    assert.equal(results[0].qteAlloueeVirtuelleCq, 5)
    assert.equal(results[0].qteAlloueeVirtuelleStricte, 0)
  })

  test('MTS fabriqué partiellement alloué avec QC → signal CQ levé, statut reste RAS', ({ assert }) => {
    // Pour MTS fabriqué : qte_signal = min(qte_restante, qte_allouee), consomme le stock CQ
    // dans le signal indépendant → alerte_cq_statut. L'harmonisation RAS→ALLOCATION ne
    // s'applique PAS au MTS fabriqué (l'allocation n'y est pas le bon levier métier).
    const refDate = new Date('2026-06-10')
    const lines: OrderLine[] = [
      makeLine({
        numCommande: 'C1',
        article: 'A',
        typeCommande: 'MTS',
        isFabrique: true,
        qteRestante: 100,
        qteAllouee: 50,
        dateExpedition: new Date('2026-06-20'),
      }),
    ]
    const stock = new Map<string, StockBreakdown>([['A', { strict: 0, qc: 100, total: 100 }]])

    const results = assignStatuses(lines, stock, refDate)

    // MTS fabriqué → pas d'allocation virtuelle, statut RAS (futur), mais signal CQ levé.
    assert.equal(results[0].status, 'RAS')
    assert.equal(results[0].qteAlloueeVirtuelle, 0)
    assert.equal(results[0].qteAlloueeVirtuelleCq, 0)
    assert.isFalse(results[0].utiliseStockSousCq)
    assert.isTrue(results[0].alerteCqStatut) // qte_signal_cq = 50
  })
})
