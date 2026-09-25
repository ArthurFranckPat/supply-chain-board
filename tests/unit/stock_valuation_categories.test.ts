import { test } from '@japa/runner'
import { toCategoriesEvolution } from '#repositories/stock_valuation_repository'

/**
 * Fonction pure extraite de `getStockValuationKpi()` — testable sans X3. C'est
 * elle qui rend `categoriesEvolution` exploitable en courbes : séries alignées
 * sur toutes les périodes, ordre stable, catégories vides écartées.
 */
test.group('toCategoriesEvolution', () => {
  test('aligne chaque catégorie sur toutes les périodes', ({ assert }) => {
    const acc = new Map<string, number[]>([
      ['A', [10, 20, 30]],
      ['B', [5, 0, 0]],
    ])

    assert.deepEqual(toCategoriesEvolution(acc), [
      { categorie: 'A', valeurs: [10, 20, 30] },
      { categorie: 'B', valeurs: [5, 0, 0] },
    ])
  })

  test('trie par valeur courante décroissante, puis par nom', ({ assert }) => {
    const acc = new Map<string, number[]>([
      ['B', [0, 0, 100]],
      ['A', [0, 0, 100]],
      ['C', [0, 0, 50]],
    ])

    assert.deepEqual(
      toCategoriesEvolution(acc).map((s) => s.categorie),
      ['A', 'B', 'C']
    )
  })

  test('écarte les catégories entièrement nulles', ({ assert }) => {
    const acc = new Map<string, number[]>([
      ['A', [0, 0, 0]],
      ['B', [1, 2, 3]],
    ])

    assert.deepEqual(
      toCategoriesEvolution(acc).map((s) => s.categorie),
      ['B']
    )
  })

  test('arrondit à deux décimales avant le tri et le filtre', ({ assert }) => {
    const acc = new Map<string, number[]>([
      ['A', [1.23456, 2.5]],
      // 0,004 € arrondi à 0,00 : la série devient vide, donc écartée.
      ['B', [0, 0.004]],
    ])

    const out = toCategoriesEvolution(acc)
    assert.deepEqual(out, [{ categorie: 'A', valeurs: [1.23, 2.5] }])
  })
})
