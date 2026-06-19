import { test } from '@japa/runner'
import { buildProactiveDisplay } from '#controllers/suivi_controller'
import type { OrderImpactResult } from '#app/domain/order-impacts'

/**
 * Tests de la projection buildProactiveDisplay (vue proactive).
 *
 * NB : le nettoyage de la demande par l'allocation ERP (qteAllouee) se fait côté loader
 * (loadOrderImpacts, gated preferEngineFeasibility) — donc OrderImpactResult reçu ici a
 * déjà sa demande nette. Ces tests valident la projection (statut→verdict, goulots agrégés),
 * pas le netting (validé via X3 sur 11033025/AR2602608).
 */
function result(overrides: Partial<OrderImpactResult['orders'][number]>): OrderImpactResult {
  const base: OrderImpactResult['orders'][number] = {
    numCommande: 'AR2602608',
    client: 'CLIENT',
    article: '11033025',
    description: 'PF',
    qteRestante: 28,
    qteAllouee: 28,
    dateExpedition: '2026-06-23',
    dejaEnRetard: false,
    nature: 'commande',
    typeCommande: 'NOR',
    matchingMethod: 'mts_hard_pegging',
    reliquat: 0,
    statut: 'on_time',
    joursRetard: 0,
    ofs: [
      {
        numOf: 'F426-33313',
        article: '11033025',
        qteAllouee: 28,
        dateFin: '2026-06-22',
        feasible: true,
        missingComponents: {},
        modified: false,
        statutNum: 1,
      },
    ],
  }
  return {
    orders: [{ ...base, ...overrides }],
    ofs: [],
    window: { from: '2026-06-19', to: '2026-09-19' },
    stats: { nbCommandes: 1, nbOnTime: 1, nbRetard: 0, nbBloquees: 0, nbSansCouverture: 0 },
  }
}

test.group('buildProactiveDisplay — projection du verdict', () => {
  test('statut on_time → verdict « À temps »', ({ assert }) => {
    const { rows, verdictCounts } = buildProactiveDisplay(result({ statut: 'on_time' }))
    assert.equal(rows[0].verdictKey, 'time')
    assert.equal(rows[0].verdictLabel, 'À temps')
    assert.deepEqual(rows[0].composants, [])
    assert.equal(verdictCounts.time, 1)
  })

  test('statut bloquee → « Bloquée » + goulots agrégés', ({ assert }) => {
    const { rows } = buildProactiveDisplay(
      result({
        statut: 'bloquee',
        ofs: [
          { numOf: 'OF1', article: '11033025', qteAllouee: 28, dateFin: '2026-06-22', feasible: false, missingComponents: { C1: 10, C2: 5 }, modified: false, statutNum: 2 },
        ],
      }),
    )
    assert.equal(rows[0].verdictKey, 'blocked')
    assert.equal(rows[0].verdictLabel, 'Bloquée')
    assert.equal(rows[0].composants.length, 2)
    assert.equal(rows[0].ofs[0].missingComponents.length, 2)
  })

  test('statut sans_couverture → « Sans couverture »', ({ assert }) => {
    const { rows, verdictCounts } = buildProactiveDisplay(result({ statut: 'sans_couverture', reliquat: 28, ofs: [] }))
    assert.equal(rows[0].verdictKey, 'uncov')
    assert.equal(rows[0].verdictLabel, 'Sans couverture')
    assert.equal(verdictCounts.uncov, 1)
  })
})
