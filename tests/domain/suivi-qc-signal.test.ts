import { test } from '@japa/runner'
import { assignStatuses, type OrderLine, type StockBreakdown } from '#app/domain/suivi'

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

test.group('assignStatuses - QC signal divergence vs Python', () => {
  test('uncovered demand with only QC stock is RAS in TS, ALLOCATION_A_FAIRE in Python', ({ assert }) => {
    // Python has an independent QC signal: even if the virtual allocation does not
    // cover the whole need, consuming QC stock promotes RAS -> ALLOCATION_A_FAIRE.
    // TypeScript lacks this signal.
    const refDate = new Date('2026-06-10')
    const lines: OrderLine[] = [
      makeLine({
        numCommande: 'C1',
        article: 'A',
        qteRestante: 10,
        qteAllouee: 0,
        dateExpedition: new Date('2026-06-20'), // future -> not retard
      }),
    ]
    const stock = new Map<string, StockBreakdown>([['A', { strict: 0, qc: 5, total: 5 }]])

    const results = assignStatuses(lines, stock, refDate)

    // Current TS behavior: need 10, covered 5, date future -> RAS
    // Python behavior: QC signal consumed -> ALLOCATION_A_FAIRE
    assert.equal(results[0].status, 'RAS')
    assert.equal(results[0].qteAlloueeVirtuelleCq, 5)
    assert.equal(results[0].qteAlloueeVirtuelleStricte, 0)
  })

  test('MTS fabrique partially allocated with QC has no QC signal in TS', ({ assert }) => {
    // Python status_assigner: for MTS fabrique, qte_signal = min(qte_restante, qte_allouee)
    // and consumes QC stock in an independent signal, setting alerte_cq_statut.
    // TS does not track this signal.
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

    // TS: MTS fabrique -> no virtual allocation
    assert.equal(results[0].status, 'RAS')
    assert.equal(results[0].qteAlloueeVirtuelle, 0)
    assert.equal(results[0].qteAlloueeVirtuelleCq, 0)
    assert.isFalse(results[0].utiliseStockSousCq)

    // Python would have qte_signal_cq = 50 and alerte_cq_statut = true.
    // There is no equivalent field in the TS implementation.
  })
})
