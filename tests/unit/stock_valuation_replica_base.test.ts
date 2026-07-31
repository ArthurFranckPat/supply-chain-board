import { test } from '@japa/runner'
import {
  selectValuationBase,
  type ValuationIdentity,
} from '#repositories/stock_valuation_repository'

/**
 * La base du KPI valorisation lit désormais trois tables locales
 * (`static_articles`, `stock_replica`, `stock_flux_replica`) au lieu du join X3
 * de `buildBaseSql` (#98, #105 — l'endpoint coûtait 11 768 ms).
 *
 * Ces tests verrouillent la correspondance terme à terme avec le `WHERE` du SQL.
 * C'est le seul endroit où les deux voies peuvent diverger en silence : une
 * population différente ne lève aucune erreur, elle décale simplement le total
 * en euros affiché sur le dashboard.
 */

function ident(over: Partial<ValuationIdentity> = {}): ValuationIdentity {
  return { code: 'ART1', description: 'Article 1', category: 'PF', ...over }
}

const stock = (entries: Array<[string, number, number]>) =>
  new Map(entries.map(([code, s, pmp]) => [code, { stock: s, pmp }]))

test.group('base valorisation depuis la réplique', () => {
  test("un article de catégorie Z est exclu, comme `TCLCOD_0 NOT LIKE 'Z%'`", ({ assert }) => {
    const rows = selectValuationBase(
      [ident({ code: 'ZED', category: 'ZDIV' }), ident({ code: 'OK', category: 'PF' })],
      stock([
        ['ZED', 100, 2],
        ['OK', 100, 2],
      ]),
      new Set()
    )

    assert.deepEqual(
      rows.map((r) => r.article),
      ['OK']
    )
  })

  test('un article sans ligne de stock est exclu, comme le `INNER JOIN ITMMVT`', ({ assert }) => {
    const rows = selectValuationBase(
      [ident({ code: 'ORPHELIN' })],
      stock([]),
      new Set(['ORPHELIN'])
    )

    assert.isEmpty(rows)
  })

  test('stock nul SANS mouvement sur la fenêtre → exclu', ({ assert }) => {
    const rows = selectValuationBase(
      [ident({ code: 'DORMANT' })],
      stock([['DORMANT', 0, 5]]),
      new Set()
    )

    assert.isEmpty(rows)
  })

  test('stock nul AVEC mouvement sur la fenêtre → conservé', ({ assert }) => {
    // C'est la seconde branche du `OR` : un article vidé pendant la plage doit
    // descendre à zéro dans la série, pas en disparaître.
    const rows = selectValuationBase(
      [ident({ code: 'VIDE' })],
      stock([['VIDE', 0, 5]]),
      new Set(['VIDE'])
    )

    assert.lengthOf(rows, 1)
    assert.equal(rows[0].stock, 0)
  })

  test('un stock NÉGATIF est conservé — `<> 0`, pas `> 0`', ({ assert }) => {
    // Régularisation en cours : c'est un signal, pas une absence. Le SQL le garde.
    const rows = selectValuationBase([ident({ code: 'NEG' })], stock([['NEG', -3, 5]]), new Set())

    assert.lengthOf(rows, 1)
    assert.equal(rows[0].stock, -3)
  })

  test('catégorie vide → `(SANS CAT.)`, même libellé que la voie directe', ({ assert }) => {
    const rows = selectValuationBase(
      [ident({ code: 'NOCAT', category: '  ' })],
      stock([['NOCAT', 10, 1]]),
      new Set()
    )

    assert.equal(rows[0].categorie, '(SANS CAT.)')
  })

  test('catégorie et code sont normalisés (trim, majuscules)', ({ assert }) => {
    const rows = selectValuationBase(
      [ident({ code: ' ART9 ', category: ' pf ', description: ' Truc ' })],
      stock([['ART9', 10, 1]]),
      new Set()
    )

    assert.equal(rows[0].article, 'ART9')
    assert.equal(rows[0].categorie, 'PF')
    assert.equal(rows[0].designation, 'Truc')
  })
})
