import { test } from '@japa/runner'
import type { Flow, FlowOrigin } from '#app/domain/models/flow'
import { consumeForecasts } from '#app/domain/forecast-consumption'

function makeDemand(article: string, quantity: number, date: Date, type: 'order' | 'forecast'): Flow {
  const origin: Extract<FlowOrigin, { type: 'order' }> | Extract<FlowOrigin, { type: 'forecast' }> =
    type === 'order'
      ? { type: 'order', id: `CMD-${article}`, orderType: 'NOR', client: 'Test', pays: null, nature: 'COMMANDE', contremarque: null, qteCommandee: quantity, qteAllouee: 0 }
      : { type: 'forecast', id: `FC-${article}`, customer: null, pays: null, orderType: null, contremarque: null, qteCommandee: quantity, qteAllouee: 0 }
  return { article, quantity, direction: 'demand', date, origin }
}

test.group('consumeForecasts', () => {
  test('orders consume forecasts completely', ({ assert }) => {
    const demands: Flow[] = [
      makeDemand('ART1', 720, new Date('2026-04-10'), 'forecast'),
      makeDemand('ART1', 1200, new Date('2026-04-10'), 'order'),
    ]

    const { adjusted, stats } = consumeForecasts(demands)

    assert.equal(stats.length, 1)
    assert.equal(stats[0].forecastGross, 720)
    assert.equal(stats[0].orders, 1200)
    assert.equal(stats[0].forecastNet, 0)
    assert.equal(adjusted.length, 1)
    assert.equal(adjusted[0].origin.type, 'order')
  })

  test('orders consume forecasts partially', ({ assert }) => {
    const demands: Flow[] = [
      makeDemand('ART1', 1000, new Date('2026-04-10'), 'forecast'),
      makeDemand('ART1', 300, new Date('2026-04-10'), 'order'),
    ]

    const { adjusted, stats } = consumeForecasts(demands)

    assert.equal(stats[0].forecastNet, 700)
    assert.equal(adjusted.length, 2)
    const forecast = adjusted.find((f) => f.origin.type === 'forecast')
    assert.equal(forecast!.quantity, 700)
  })

  test('multiple articles handled independently', ({ assert }) => {
    const demands: Flow[] = [
      makeDemand('ART1', 500, new Date('2026-04-10'), 'forecast'),
      makeDemand('ART1', 200, new Date('2026-04-10'), 'order'),
      makeDemand('ART2', 300, new Date('2026-04-10'), 'forecast'),
      makeDemand('ART2', 400, new Date('2026-04-10'), 'order'),
    ]

    const { stats } = consumeForecasts(demands)

    const s1 = stats.find((s) => s.article === 'ART1')!
    const s2 = stats.find((s) => s.article === 'ART2')!

    assert.equal(s1.forecastNet, 300)
    assert.equal(s2.forecastNet, 0)
  })

  test('no forecasts returns orders only', ({ assert }) => {
    const demands: Flow[] = [
      makeDemand('ART1', 100, new Date('2026-04-10'), 'order'),
    ]

    const { adjusted, stats } = consumeForecasts(demands)

    assert.equal(adjusted.length, 1)
    assert.equal(stats.length, 0)
  })

  test('no orders keeps forecasts unchanged', ({ assert }) => {
    const demands: Flow[] = [
      makeDemand('ART1', 500, new Date('2026-04-10'), 'forecast'),
    ]

    const { adjusted, stats } = consumeForecasts(demands)

    assert.equal(adjusted.length, 1)
    assert.equal(adjusted[0].quantity, 500)
    assert.equal(stats[0].forecastNet, 500)
  })

  test('empty demand list returns empty result', ({ assert }) => {
    const { adjusted, stats } = consumeForecasts([])
    assert.equal(adjusted.length, 0)
    assert.equal(stats.length, 0)
  })
})
