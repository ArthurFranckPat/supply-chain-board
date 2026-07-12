import { test } from '@japa/runner'
import { StockState } from '#app/domain/stock-state'

test.group('StockState', () => {
  test('getAvailable returns initial stock when nothing allocated', ({ assert }) => {
    const state = new StockState(new Map([['ART1', 100]]))
    assert.equal(state.getAvailable('ART1'), 100)
  })

  test('getAvailable returns 0 for unknown article', ({ assert }) => {
    const state = new StockState(new Map())
    assert.equal(state.getAvailable('UNKNOWN'), 0)
  })

  test('allocate decrements available stock', ({ assert }) => {
    const state = new StockState(new Map([['ART1', 100]]))
    state.allocate('OF1', { ART1: 30 })
    assert.equal(state.getAvailable('ART1'), 70)
  })

  test('allocate multiple times accumulates', ({ assert }) => {
    const state = new StockState(new Map([['ART1', 100]]))
    state.allocate('OF1', { ART1: 30 })
    state.allocate('OF2', { ART1: 20 })
    assert.equal(state.getAvailable('ART1'), 50)
  })

  test('allocate different articles independently', ({ assert }) => {
    const state = new StockState(new Map([['ART1', 100], ['ART2', 50]]))
    state.allocate('OF1', { ART1: 30, ART2: 10 })
    assert.equal(state.getAvailable('ART1'), 70)
    assert.equal(state.getAvailable('ART2'), 40)
  })

  test('addSupply increases initial stock', ({ assert }) => {
    const state = new StockState(new Map([['ART1', 100]]))
    state.addSupply('ART1', 50)
    assert.equal(state.getAvailable('ART1'), 150)
  })

  test('addSupply creates entry for unknown article', ({ assert }) => {
    const state = new StockState(new Map())
    state.addSupply('NEW_ART', 75)
    assert.equal(state.getAvailable('NEW_ART'), 75)
  })

  test('constructor accepts Record', ({ assert }) => {
    const state = new StockState({ ART1: 100, ART2: 50 })
    assert.equal(state.getAvailable('ART1'), 100)
    assert.equal(state.getAvailable('ART2'), 50)
  })

  test('getInitialStock and getAllocated track correctly', ({ assert }) => {
    const state = new StockState(new Map([['ART1', 100]]))
    state.allocate('OF1', { ART1: 40 })
    assert.equal(state.getInitialStock('ART1'), 100)
    assert.equal(state.getAllocated('ART1'), 40)
  })
})
