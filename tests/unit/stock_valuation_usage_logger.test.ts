import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { logStockValuationCall } from '#services/stock_valuation_usage_logger'

/**
 * Instrumentation temporaire d'usage de `getStockValuation()`.
 *
 * `stock_valuation_calls` accumule aussi du trafic RÉEL en dev (dashboard servi
 * par le même `db.sqlite3` que les tests) — c'est le but de la table. Donc
 * ni assertion sur le COUNT total ni `DELETE` sans filtre : les lignes de test
 * portent un `from_date` en 1900 (hors de toute plage réelle possible) et le
 * teardown ne supprime QUE ces lignes-là.
 */
const SENTINEL_YEAR = '1900-'

test.group('logStockValuationCall', (group) => {
  group.each.teardown(async () => {
    await db.from('stock_valuation_calls').where('from_date', 'like', `${SENTINEL_YEAR}%`).delete()
  })

  test('enregistre grain, pinned et la plage', async ({ assert }) => {
    await logStockValuationCall(
      'semaine',
      true,
      new Date('1900-07-01T00:00:00'),
      new Date('1900-07-15T00:00:00')
    )

    const rows = await db
      .from('stock_valuation_calls')
      .where('from_date', 'like', `${SENTINEL_YEAR}%`)
      .select('*')
    assert.lengthOf(rows, 1)
    assert.equal(rows[0].grain, 'semaine')
    assert.equal(!!rows[0].pinned, true)
    assert.equal(rows[0].from_date, '1900-07-01')
    assert.equal(rows[0].to_date, '1900-07-15')
  })

  test('accepte from > to sans lever (l’appelant ne filtre pas ce cas)', async ({ assert }) => {
    await logStockValuationCall(
      'mois',
      false,
      new Date('1900-08-01T00:00:00'),
      new Date('1900-07-01T00:00:00')
    )
    const rows = await db
      .from('stock_valuation_calls')
      .where('from_date', 'like', `${SENTINEL_YEAR}%`)
      .select('*')
    assert.lengthOf(rows, 1)
  })
})
