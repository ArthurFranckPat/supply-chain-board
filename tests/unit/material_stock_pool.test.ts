import { test } from '@japa/runner'
import { sumAvailableStock } from '#services/material_plan_loader'
import type { Flow } from '#app/domain/models/flow'

/**
 * Règle de comptage du stock du plan d'approvisionnement : PHYSIQUE + CQ,
 * allocations ERP RÉINTÉGRÉES.
 *
 * Une allocation réserve du composant à un OF, et cet OF sert une commande que
 * la page compte déjà dans son besoin. La retirer du stock sans retirer le
 * besoin correspondant facture la même réservation deux fois.
 */

const stockFlow = (
  article: string,
  quantity: number,
  subType: 'strict' | 'qc' | 'rejected',
  extra: { pmp?: number | null; allocated?: number } = {}
): Flow => ({
  article,
  quantity,
  direction: 'supply',
  date: null,
  origin: { type: 'stock', subType, pmp: extra.pmp ?? null, allocated: extra.allocated },
})

test.group('sumAvailableStock', () => {
  test('cas réel 11022900 : les allocations reviennent au pool', ({ assert }) => {
    // X3 prod, 04/09/2026 : PHYSTO 7446, GLOALL 1162 → strict 6284.
    const { stock } = sumAvailableStock([
      stockFlow('11022900', 6284, 'strict', { pmp: 10.100018, allocated: 1162 }),
    ])
    assert.equal(stock.get('11022900'), 7446)
  })

  test('le CQ s’ajoute, le rebut est exclu', ({ assert }) => {
    const { stock } = sumAvailableStock([
      stockFlow('A', 100, 'strict', { allocated: 40 }),
      stockFlow('A', 25, 'qc'),
      stockFlow('A', 999, 'rejected'),
    ])
    assert.equal(stock.get('A'), 165) // 100 + 40 + 25
  })

  test('sans allocation, le pool est inchangé', ({ assert }) => {
    const { stock } = sumAvailableStock([stockFlow('B', 500, 'strict')])
    assert.equal(stock.get('B'), 500)
  })

  test('le CQ ne porte jamais de réintégration', ({ assert }) => {
    // `allocated` n'est renseigné que sur le flux strict ; un flux qc qui en
    // porterait un ne doit pas le compter (l'allocation serait comptée 2 fois).
    const { stock } = sumAvailableStock([
      stockFlow('C', 10, 'strict', { allocated: 5 }),
      stockFlow('C', 7, 'qc', { allocated: 5 }),
    ])
    assert.equal(stock.get('C'), 22) // 10 + 5 + 7
  })

  test('PMP : première valeur non nulle, articles indépendants', ({ assert }) => {
    const { pmp } = sumAvailableStock([
      stockFlow('D', 1, 'strict', { pmp: 0 }),
      stockFlow('D', 1, 'qc', { pmp: 3.5 }),
      stockFlow('E', 1, 'strict', { pmp: 2 }),
    ])
    assert.equal(pmp.get('D'), 3.5)
    assert.equal(pmp.get('E'), 2)
  })

  test('aucun flux stock : pools vides', ({ assert }) => {
    const { stock, pmp } = sumAvailableStock([])
    assert.equal(stock.size, 0)
    assert.equal(pmp.size, 0)
  })
})
