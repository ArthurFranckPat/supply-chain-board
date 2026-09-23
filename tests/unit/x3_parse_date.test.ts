import { test } from '@japa/runner'
import { consumeX3Date } from '#app/x3/utils/parse_date'

test.group('consumeX3Date', () => {
  test('lit le format X3 dd-MMM-yy renvoyé par SOAP', ({ assert }) => {
    assert.equal(consumeX3Date('22-SEP-26')?.toISODate(), '2026-09-22')
    assert.equal(consumeX3Date(' 18-NOV-25 ')?.toISODate(), '2025-11-18')
  })

  test('garde le format SQL et les Date natives', ({ assert }) => {
    assert.equal(consumeX3Date('2026-05-12')?.toISODate(), '2026-05-12')
    assert.equal(consumeX3Date(new Date(Date.UTC(2026, 4, 12)))?.isValid, true)
  })

  test('null pour une valeur vide', ({ assert }) => {
    assert.isNull(consumeX3Date(''))
    assert.isNull(consumeX3Date(null))
  })
})
