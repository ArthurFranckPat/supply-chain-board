import { test } from '@japa/runner'
import { mapEngineCause } from '#app/domain/suivi'
import type { OrderCauseInfo } from '#app/domain/suivi'

function info(overrides: Partial<OrderCauseInfo> & { statut: OrderCauseInfo['statut'] }): OrderCauseInfo {
  return {
    joursRetard: 0,
    components: [],
    reception: null,
    ...overrides,
  }
}

test.group('mapEngineCause (statut moteur → cause suivi)', () => {
  test('bloquee → RUPTURE_COMPOSANTS avec composants + ETA réception', ({ assert }) => {
    const cause = mapEngineCause(
      info({
        statut: 'bloquee',
        components: [
          { art: 'COMP1', qty: 4 },
          { art: 'COMP2', qty: 1.5 },
        ],
        reception: { eta: '2026-06-25', po: 'AF12345', supplier: 'FOURN' },
      }),
      true,
    )
    assert.isNotNull(cause)
    assert.equal(cause!.typeCause, 'RUPTURE_COMPOSANTS')
    assert.deepEqual(cause!.composants, { COMP1: 4, COMP2: 1.5 })
    assert.deepEqual(cause!.reception, { eta: '2026-06-25', po: 'AF12345', supplier: 'FOURN' })
  })

  test('sans_couverture + fabriqué → AUCUN_OF_PLANIFIE', ({ assert }) => {
    const cause = mapEngineCause(info({ statut: 'sans_couverture' }), true)
    assert.equal(cause!.typeCause, 'AUCUN_OF_PLANIFIE')
    assert.deepEqual(cause!.composants, {})
  })

  test('sans_couverture + acheté → ATTENTE_RECEPTION_FOURNISSEUR', ({ assert }) => {
    const cause = mapEngineCause(info({ statut: 'sans_couverture' }), false)
    assert.equal(cause!.typeCause, 'ATTENTE_RECEPTION_FOURNISSEUR')
  })

  test('retard (OF faisable mais planifié après expé) → RETARD_ORDONNANCEMENT avec joursRetard', ({ assert }) => {
    const cause = mapEngineCause(info({ statut: 'retard', joursRetard: 6 }), true)
    assert.equal(cause!.typeCause, 'RETARD_ORDONNANCEMENT')
    assert.equal(cause!.joursRetard, 6)
    assert.deepEqual(cause!.composants, {})
  })

  test('stock → STOCK_DISPONIBLE_NON_ALLOUE', ({ assert }) => {
    const cause = mapEngineCause(info({ statut: 'stock' }), false)
    assert.equal(cause!.typeCause, 'STOCK_DISPONIBLE_NON_ALLOUE')
  })

  test('on_time → STOCK_DISPONIBLE_NON_ALLOUE (retard d allocation/expé, pas de prod)', ({ assert }) => {
    const cause = mapEngineCause(info({ statut: 'on_time' }), true)
    assert.equal(cause!.typeCause, 'STOCK_DISPONIBLE_NON_ALLOUE')
  })
})
