import { test } from '@japa/runner'
import { assignStatuses, type OrderLine, type StockBreakdown } from '#app/domain/suivi'

/**
 * Ces tests documentaient à l'origine la DIVERGENCE TS vs Python (signal CQ absent).
 * L'issue #19 a porté le signal CQ + la règle d'harmonisation : ils valident désormais
 * l'ALIGNEMENT sur le comportement Python.
 */

function makeLine(
  overrides: Partial<OrderLine> & { numCommande: string; article: string }
): OrderLine {
  return {
    ligne: '1000',
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

  /**
   * Ces deux cas remplacent un test qui affirmait « MTS fabriqué partiellement alloué
   * → statut RAS + signal CQ levé ». Ses deux assertions ont été invalidées par des
   * changements délibérés, et personne ne l'a vu (la suite complète ne tourne pas en
   * local) :
   *  - `c90f76a` : une allocation X3 > 0 rend la ligne expédiable, même partielle.
   *  - `2f0a0b7` : les lignes MTS sont exclues du signal CQ calculé (`suivi.ts`), qui
   *    ne vient plus que de `allocationQc` transmis par l'ERP.
   */
  function mtsFabrique(qteAllouee: number): OrderLine[] {
    return [
      makeLine({
        numCommande: 'C1',
        article: 'A',
        typeCommande: 'MTS',
        isFabrique: true,
        qteRestante: 100,
        qteAllouee,
        dateExpedition: new Date('2026-06-20'), // futur → pas retard
      }),
    ]
  }

  const stockQc = new Map<string, StockBreakdown>([['A', { strict: 0, qc: 100, total: 100 }]])

  test('MTS fabriqué avec allocation X3 partielle → A_EXPEDIER', ({ assert }) => {
    // Expéditions partielles autorisées : ce qui est alloué peut partir.
    const results = assignStatuses(mtsFabrique(50), stockQc, new Date('2026-06-10'))

    assert.equal(results[0].status, 'A_EXPEDIER')
    // Pas d'allocation VIRTUELLE pour le MTS fabriqué : le stock CQ présent n'est pas
    // consommé, l'allocation ERP reste le seul levier.
    assert.equal(results[0].qteAlloueeVirtuelle, 0)
    assert.equal(results[0].qteAlloueeVirtuelleCq, 0)
    assert.isFalse(results[0].utiliseStockSousCq)
    assert.isFalse(results[0].alerteCqStatut)
  })

  test('MTS fabriqué sans allocation X3 → RAS', ({ assert }) => {
    const results = assignStatuses(mtsFabrique(0), stockQc, new Date('2026-06-10'))

    assert.equal(results[0].status, 'RAS')
    assert.equal(results[0].qteAlloueeVirtuelle, 0)
    assert.isFalse(results[0].alerteCqStatut)
  })
})
