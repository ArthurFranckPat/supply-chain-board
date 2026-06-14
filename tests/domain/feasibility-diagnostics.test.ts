import { test } from '@japa/runner'
import { alertNoFeasibleDate, alertOrderLineNotFound, alertPurchaseSupplyInsufficient } from '#app/domain/feasibility-diagnostics'

test.group('feasibility diagnostics', () => {
  test('alertNoFeasibleDate formats message with horizon days', ({ assert }) => {
    assert.equal(alertNoFeasibleDate(60), 'Aucune date faisable trouvee dans 60 jours')
  })

  test('alertOrderLineNotFound formats command/article message', ({ assert }) => {
    assert.equal(
      alertOrderLineNotFound('CMD-1', 'ART-42'),
      'Commande CMD-1 / article ART-42 non trouvee',
    )
  })

  test('alertPurchaseSupplyInsufficient returns expected message', ({ assert }) => {
    assert.equal(alertPurchaseSupplyInsufficient(), 'Stock et receptions insuffisants meme a horizon max')
  })
})
