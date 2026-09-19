import { test } from '@japa/runner'
import { demandHorizonEnd, isForecastInsideDemandHorizon } from '#app/domain/demand_horizon'

const TODAY = new Date('2026-09-19T12:00:00')

test.group('horizon demande X3', () => {
  test('convertit les unités X3 en date de fin incluse', ({ assert }) => {
    assert.equal(demandHorizonEnd({ value: 2, unit: 1 }, TODAY)?.getDate(), 21)
    assert.equal(demandHorizonEnd({ value: 1, unit: 2 }, TODAY)?.getDate(), 21)
    assert.equal(demandHorizonEnd({ value: 2, unit: 3 }, TODAY)?.getDate(), 3)
  })

  test('ignore les prévisions à l’intérieur et conserve celles au-delà', ({ assert }) => {
    const article = { demandHorizon: { value: 2, unit: 1 } }
    assert.isTrue(isForecastInsideDemandHorizon(article, new Date('2026-09-21T10:00:00'), TODAY))
    assert.isFalse(isForecastInsideDemandHorizon(article, new Date('2026-09-22T00:00:00'), TODAY))
  })

  test('un horizon vide ne filtre rien', ({ assert }) => {
    assert.isFalse(isForecastInsideDemandHorizon({ demandHorizon: undefined }, new Date(), TODAY))
  })
})
