import { test } from '@japa/runner'
import { computeFingerprint, cleLogiqueMessage, estOverride } from '#app/domain/appro_decision'

/**
 * Clés logiques du ledger (#134, décision #112) : le fingerprint doit SURVIVRE
 * à la recréation nocturne du CBN (mêmes données → même empreinte), et changer
 * dès que l'échéance sort de ±7 j ou la quantité de ±20 %.
 */

test.group('computeFingerprint — stabilité et sensibilité (#112)', () => {
  test('les mêmes données rendent la même empreinte (survit au run CBN)', ({ assert }) => {
    const a = computeFingerprint('40025', '11028891', '2026-09-01', 3024)
    const b = computeFingerprint('40025', '11028891', '2026-09-01', 3024)
    assert.equal(a, b)
    assert.equal(a.length, 64)
  })

  test('deux dates de la même semaine ISO partagent le bucket', ({ assert }) => {
    const a = computeFingerprint('F', 'A', '2026-09-01', 100)
    const b = computeFingerprint('F', 'A', '2026-09-02', 100)
    assert.equal(a, b)
  })

  test('deux dates à plus de 7 j ne partagent jamais le bucket', ({ assert }) => {
    const a = computeFingerprint('F', 'A', '2026-09-01', 100)
    const b = computeFingerprint('F', 'A', '2026-09-20', 100)
    assert.notEqual(a, b)
  })

  test('une quantité +10 % reste dans le même bucket (±20 %)', ({ assert }) => {
    const a = computeFingerprint('F', 'A', '2026-09-01', 100)
    const b = computeFingerprint('F', 'A', '2026-09-01', 110)
    assert.equal(a, b)
  })

  test('une quantité +50 % change l’empreinte', ({ assert }) => {
    const a = computeFingerprint('F', 'A', '2026-09-01', 100)
    const b = computeFingerprint('F', 'A', '2026-09-01', 150)
    assert.notEqual(a, b)
  })

  test('le fournisseur fait partie de la signature', ({ assert }) => {
    const a = computeFingerprint('F1', 'A', '2026-09-01', 100)
    const b = computeFingerprint('F2', 'A', '2026-09-01', 100)
    assert.notEqual(a, b)
  })

  test('une échéance absente a son propre bucket', ({ assert }) => {
    const a = computeFingerprint('F', 'A', null, 100)
    const b = computeFingerprint('F', 'A', '2026-09-01', 100)
    assert.notEqual(a, b)
  })

  test('une quantité nulle a son propre bucket', ({ assert }) => {
    const a = computeFingerprint('F', 'A', '2026-09-01', 0)
    const b = computeFingerprint('F', 'A', '2026-09-01', 1)
    assert.notEqual(a, b)
    assert.equal(a, computeFingerprint('F', 'A', '2026-09-01', 0))
  })
})

test.group('estOverride — la décision contredit le verdict (#134)', () => {
  test('« ignorer » sur un verdict d’action → override', ({ assert }) => {
    assert.isTrue(estOverride('passer', 'ignorer'))
    assert.isTrue(estOverride('replanifier', 'ignorer'))
    assert.isTrue(estOverride('regrouper', 'ignorer'))
  })

  test('« à passer » sur « surveiller » → override', ({ assert }) => {
    assert.isTrue(estOverride('surveiller', 'a_passer'))
  })

  test('pas d’override quand la décision suit le verdict', ({ assert }) => {
    assert.isFalse(estOverride('passer', 'a_passer'))
    assert.isFalse(estOverride('surveiller', 'vu'))
    assert.isFalse(estOverride('investiguer', 'ignorer'))
    assert.isFalse(estOverride(undefined, 'vu'))
  })
})

test.group('cleLogiqueMessage', () => {
  test('clé stable VCRNUM:VCRLIN (#107)', ({ assert }) => {
    assert.equal(cleLogiqueMessage('CG2601534', 6000), 'M:CG2601534:6000')
    assert.equal(cleLogiqueMessage('CG2601534', 6000), cleLogiqueMessage('CG2601534', 6000))
  })
})
