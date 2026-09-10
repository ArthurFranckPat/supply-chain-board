import { test } from '@japa/runner'
import { buildEncoursByArticle } from '#services/load_payload_loader'
import type { OfAvancement } from '#app/domain/of_avancement'
import type { ManufacturingOrder } from '#repositories/of_repository'

/**
 * Pool d'en-cours de la vue commande — D8 (garde « OF ferme démarré » et
 * `EXTQTY_0 = 0`) et D2 (OF démarrés avant l'horizon via le matching delta).
 */

const mo = (over: Partial<ManufacturingOrder> & { numOf: string }): ManufacturingOrder => ({
  article: 'A',
  designation: null,
  status: 1,
  statutLabel: null,
  typeOfLabel: null,
  quantity: 100,
  quantityLaunched: 100,
  quantityDone: 0,
  unit: null,
  startDate: new Date('2020-01-01'),
  endDate: null,
  ...over,
})

const av = (numOf: string, qtyRealisee: number): OfAvancement => ({
  numOf,
  estDebuté: true,
  derniereOpPointée: 10,
  derniereOpGamme: 20,
  nbOperations: 1,
  nbOperationsPointées: 1,
  qtyRealisee,
  qtyPrevueOp: 100,
})

test.group('buildEncoursByArticle — D8/D2', () => {
  test('OF ferme démarré → pièces pointées non déclarées déduites', ({ assert }) => {
    const out = buildEncoursByArticle({
      mos: [mo({ numOf: 'F1' })],
      avancementByOf: new Map([['F1', av('F1', 40)]]),
    })
    assert.equal(out.get('A'), 40) // 100 − min(100, 100−40)
  })

  test('OF ferme NON démarré (début futur) → pas d’en-cours', ({ assert }) => {
    const out = buildEncoursByArticle({
      mos: [mo({ numOf: 'F1', startDate: new Date('2099-01-01') })],
      avancementByOf: new Map([['F1', av('F1', 40)]]),
    })
    assert.equal(out.get('A'), undefined)
  })

  test('OF planifié/suggéré → pas d’en-cours (pointages non lus)', ({ assert }) => {
    const out = buildEncoursByArticle({
      mos: [mo({ numOf: 'F1', status: 2 })],
      avancementByOf: new Map([['F1', av('F1', 40)]]),
    })
    assert.equal(out.get('A'), undefined)
  })

  test('deltaMos (démarré avant l’horizon) → compté sans filtre de date (D2)', ({ assert }) => {
    const out = buildEncoursByArticle({
      mos: [],
      avancementByOf: new Map([['F9', av('F9', 40)]]),
      deltaMos: [{ numOf: 'F9', article: 'A', quantity: 100, quantityLaunched: 100 }],
    })
    assert.equal(out.get('A'), 40)
  })

  test('EXTQTY_0 = 0 → aucun en-cours fictif (reste = quantité, D8)', ({ assert }) => {
    const out = buildEncoursByArticle({
      mos: [mo({ numOf: 'F1', quantityLaunched: 0 })],
      avancementByOf: new Map(),
    })
    assert.equal(out.get('A'), undefined)
  })
})
