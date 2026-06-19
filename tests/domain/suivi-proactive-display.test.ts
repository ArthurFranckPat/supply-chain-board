import { test } from '@japa/runner'
import { buildProactiveDisplay } from '#controllers/suivi_controller'
import type { OrderImpactResult } from '#app/domain/order-impacts'

/** Construit un OrderImpactResult minimal (1 commande) pour tester buildProactiveDisplay. */
function result(overrides: Partial<OrderImpactResult['orders'][number]>): OrderImpactResult {
  const base: OrderImpactResult['orders'][number] = {
    numCommande: 'AR2602523',
    client: 'CLIENT',
    article: '11016308',
    description: 'PF',
    qteRestante: 1200,
    qteAllouee: 0,
    dateExpedition: '2026-06-18',
    dejaEnRetard: true,
    nature: 'commande',
    typeCommande: 'NOR',
    matchingMethod: 'nor_mto_cumulative',
    reliquat: 0,
    statut: 'bloquee',
    joursRetard: 0,
    ofs: [
      {
        numOf: 'F426-33855',
        article: '11016308',
        qteAllouee: 1200,
        dateFin: '2026-07-06',
        feasible: false,
        missingComponents: { '11016937': 600 },
        modified: false,
        statutNum: 2,
      },
    ],
  }
  return {
    orders: [{ ...base, ...overrides }],
    ofs: [],
    window: { from: '2026-06-19', to: '2026-09-19' },
    stats: { nbCommandes: 1, nbOnTime: 0, nbRetard: 0, nbBloquees: 1, nbSansCouverture: 0 },
  }
}

test.group('buildProactiveDisplay — couverture par allocation ERP', () => {
  test('commande entièrement allouée → « Allouée — prête », goulots masqués (fix AR2602523)', ({ assert }) => {
    // OF couvrant terminé (hors supply flows) → moteur re-peg sur OF futur bloqué (rupture fantôme).
    // Mais l allocation ERP couvre la demande (1200/1200) → la commande EST réalisable.
    const { rows, verdictCounts } = buildProactiveDisplay(result({ qteAllouee: 1200, statut: 'bloquee' }))

    assert.equal(rows[0].verdictKey, 'stock')
    assert.equal(rows[0].verdictLabel, 'Allouée — prête')
    assert.deepEqual(rows[0].composants, []) // goulots masqués (non pertinents)
    assert.deepEqual(rows[0].ofs, []) // OF futur non pertinent
    assert.equal(verdictCounts.stock, 1)
    assert.equal(verdictCounts.blocked, 0)
  })

  test('commande non allouée → verdict moteur conservé + goulots affichés', ({ assert }) => {
    const { rows } = buildProactiveDisplay(result({ qteAllouee: 0, statut: 'bloquee' }))
    assert.equal(rows[0].verdictKey, 'blocked')
    assert.equal(rows[0].verdictLabel, 'Bloquée')
    assert.equal(rows[0].composants.length, 1)
    assert.equal(rows[0].composants[0].art, '11016937')
    assert.equal(rows[0].ofs.length, 1)
  })

  test('allocation partielle (< demande) → verdict moteur conservé', ({ assert }) => {
    const { rows } = buildProactiveDisplay(result({ qteRestante: 1200, qteAllouee: 800, statut: 'bloquee' }))
    assert.equal(rows[0].verdictKey, 'blocked') // 400 non couverts par allocation → verdict moteur
    assert.equal(rows[0].composants.length, 1)
  })
})
