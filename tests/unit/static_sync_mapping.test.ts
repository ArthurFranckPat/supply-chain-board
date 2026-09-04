import { test } from '@japa/runner'
import { parseReorderDelay } from '#services/static_sync_service'

/**
 * Le sync conserve le délai X3 tel quel : NULL = non renseigné.
 * Les replis (14 j achat / 10 j fabrication) appartiennent aux consommateurs.
 */
test.group('parseReorderDelay', () => {
  test('valeur X3 conservee telle quelle (meme 14 explicite)', ({ assert }) => {
    assert.equal(parseReorderDelay('14'), 14)
    assert.equal(parseReorderDelay(20), 20)
    assert.equal(parseReorderDelay('7.5'), 7.5)
  })

  test('vide / nul / zero / non numerique → NULL', ({ assert }) => {
    assert.isNull(parseReorderDelay(null))
    assert.isNull(parseReorderDelay(undefined))
    assert.isNull(parseReorderDelay(''))
    assert.isNull(parseReorderDelay(0))
    assert.isNull(parseReorderDelay('0'))
    assert.isNull(parseReorderDelay(-3))
    assert.isNull(parseReorderDelay('abc'))
  })
})
