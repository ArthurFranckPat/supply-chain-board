import { test } from '@japa/runner'
import type { Flow } from '#app/domain/models/flow'
import { evaluateMfgFeasibility, buildStrictQcStock, type MfgMaterialInput } from '#app/domain/of-feasibility'

function stockFlow(article: string, quantity: number, subType: 'strict' | 'qc' | 'rejected'): Flow {
  return { article, quantity, direction: 'supply', date: null, origin: { type: 'stock', subType, pmp: null } }
}

const mat = (article: string, remaining: number, allocated = 0): MfgMaterialInput => ({
  article, description: `Desc ${article}`, unit: 'U', remaining, allocated,
})

test.group('buildStrictQcStock', () => {
  test('sums strict + qc, excludes rejected', ({ assert }) => {
    const flows: Flow[] = [
      stockFlow('C1', 30, 'strict'),
      stockFlow('C1', 10, 'qc'),
      stockFlow('C1', 100, 'rejected'),
    ]
    const stock = buildStrictQcStock(flows)
    assert.equal(stock.get('C1'), 40)
  })

  test('article without strict/qc flow is absent from the map', ({ assert }) => {
    const stock = buildStrictQcStock([stockFlow('C1', 5, 'rejected')])
    assert.isFalse(stock.has('C1'))
  })
})

test.group('evaluateMfgFeasibility', () => {
  test('feasible when stock covers remaining', ({ assert }) => {
    const stock = new Map([['C1', 100]])
    const v = evaluateMfgFeasibility([mat('C1', 60)], stock, false)
    assert.isTrue(v.feasible)
    assert.equal(v.blockedCount, 0)
    assert.deepEqual(v.missingComponents, {})
  })

  test('blocked with missing quantity when stock short', ({ assert }) => {
    const stock = new Map([['C1', 20]])
    const v = evaluateMfgFeasibility([mat('C1', 60)], stock, false)
    assert.isFalse(v.feasible)
    assert.equal(v.materials[0].feasible, false)
    assert.equal(v.missingComponents['C1'], 40)
  })

  test('ERP allocation counts toward availability', ({ assert }) => {
    const stock = new Map([['C1', 20]])
    // 20 stock + 40 alloué >= 60 besoin → faisable
    const v = evaluateMfgFeasibility([mat('C1', 60, 40)], stock, false)
    assert.isTrue(v.feasible)
  })

  test('firm OF is always feasible regardless of stock', ({ assert }) => {
    const stock = new Map([['C1', 0]])
    const v = evaluateMfgFeasibility([mat('C1', 60)], stock, true)
    assert.isTrue(v.feasible)
  })

  test('unknown stock → feasible null (not a rupture)', ({ assert }) => {
    const v = evaluateMfgFeasibility([mat('C1', 60)], new Map(), false)
    assert.isNull(v.materials[0].feasible)
    assert.equal(v.blockedCount, 0)
    assert.isTrue(v.feasible)
  })
})
