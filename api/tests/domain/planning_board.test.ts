import { test } from '@japa/runner'
import {
  mergeOfWithOverride,
  buildEffectiveFlows,
} from '#app/domain/planning_board'

test.group('mergeOfWithOverride', () => {
  const baseOf = {
    numOf: 'OF001', article: 'ART1', description: 'Test article',
    statutNum: 3, dateDebut: new Date('2026-06-10'), dateFin: new Date('2026-06-15'),
    qteRestante: 50,
  }

  test('returns ERP values when no override', ({ assert }) => {
    const result = mergeOfWithOverride(baseOf, null)
    assert.equal(result.numOf, 'OF001')
    assert.equal(result.statutNum, 3)
    assert.equal(result.dateFin, '2026-06-15')
    assert.isFalse(result.modified)
  })

  test('applies override date and status', ({ assert }) => {
    const result = mergeOfWithOverride(baseOf, {
      numOf: 'OF001', dateDebut: '2026-06-12', dateFin: '2026-06-18',
      status: 1, note: 'Affermi', updatedAt: '2026-06-10T10:00:00Z',
    })
    assert.equal(result.statutNum, 1)
    assert.equal(result.dateDebut, '2026-06-12')
    assert.equal(result.dateFin, '2026-06-18')
    assert.isTrue(result.modified)
    assert.equal(result.note, 'Affermi')
  })

  test('null override fields revert to ERP values', ({ assert }) => {
    const result = mergeOfWithOverride(baseOf, {
      numOf: 'OF001', dateDebut: null, dateFin: null,
      status: null, note: null, updatedAt: '2026-06-10T10:00:00Z',
    })
    assert.equal(result.statutNum, 3) // reverted to ERP
    assert.equal(result.dateDebut, '2026-06-10') // reverted
    assert.isFalse(result.modified)
  })
})

test.group('buildEffectiveFlows', () => {
  test('converts merged OFs into supply flows', ({ assert }) => {
    const merged = [
      { numOf: 'OF001', article: 'ART1', statutNum: 1, dateFin: '2026-06-15', qteRestante: 50, modified: false },
      { numOf: 'OF002', article: 'ART2', statutNum: 3, dateFin: '2026-06-20', qteRestante: 30, modified: true },
    ]
    const flows = buildEffectiveFlows(merged)
    assert.lengthOf(flows, 2)
    assert.equal(flows[0].article, 'ART1')
    assert.equal(flows[0].quantity, 50)
    assert.equal(flows[0].direction, 'supply')
    assert.equal(flows[0].origin.type, 'of')
    assert.deepEqual(flows[0].date, new Date('2026-06-15'))
  })

  test('filters out OFs outside date window', ({ assert }) => {
    const merged = [
      { numOf: 'OF001', article: 'ART1', statutNum: 1, dateFin: '2026-06-01', qteRestante: 50, modified: false },
      { numOf: 'OF002', article: 'ART2', statutNum: 3, dateFin: '2026-06-20', qteRestante: 30, modified: false },
    ]
    const flows = buildEffectiveFlows(merged, new Date('2026-06-10'), new Date('2026-06-25'))
    assert.lengthOf(flows, 1)
    assert.equal(flows[0].article, 'ART2')
  })
})
