import { test } from '@japa/runner'

// X3OfRepository uses Lucid ORM (MfgItem.query()) — tested via functional tests
// X3StockRepository uses Lucid ORM (Stock.query()) — tested via functional tests
// X3ReceptionRepository uses Lucid ORM (PurchaseOrderLine.query()) — tested via functional tests

test.group('repositories', () => {
  test('placeholder — all repos tested via functional tests', ({ assert }) => {
    assert.isTrue(true)
  })
})
