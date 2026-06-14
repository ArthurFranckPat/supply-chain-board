import { test } from '@japa/runner'
import { isFrance, isExport } from '#app/domain/rules'
import type { FlowOrigin } from '#app/domain/models/flow'

function makeOrderOrigin(pays: string): Extract<FlowOrigin, { type: 'order' }> {
  return {
    type: 'order',
    id: 'CMD001',
    customer: `Client ${pays}`,
    pays,
    orderType: 'NOR',
    nature: 'COMMANDE',
    contremarque: '',
    qteCommandee: 100,
    qteAllouee: 0,
  }
}

test.group('Country filtering', () => {
  test('France order is identified correctly', ({ assert }) => {
    const origin = makeOrderOrigin('FR')
    assert.isTrue(isFrance(origin))
    assert.isFalse(isExport(origin))
  })

  test('Export order is identified correctly', ({ assert }) => {
    const origin = makeOrderOrigin('DE')
    assert.isFalse(isFrance(origin))
    assert.isTrue(isExport(origin))
  })

  test('multiple export countries are detected', ({ assert }) => {
    const countries = ['DE', 'ES', 'IT', 'PL', 'PT', 'UK', 'US']
    for (const country of countries) {
      const origin = makeOrderOrigin(country)
      assert.isFalse(isFrance(origin))
      assert.isTrue(isExport(origin))
    }
  })
})
