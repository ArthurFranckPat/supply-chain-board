import { test } from '@japa/runner'
import { coveringOfs } from '#controllers/suivi_controller'

/**
 * Cas réel prod EBH1257AL / OF F426-42920 (2016 pcs) : le SE EH6139 a 1966 pcs de stock net
 * (PHYSTO 2638 − GLOALL 672) pour un besoin de 2016 → manque 50. Seuls les WOS cumulant
 * jusqu'à 50 couvrent CE manque ; les suivants concernent d'autres besoins.
 */
const EH6139 = [
  { numOf: 'SGAE10654257102', dateFin: '2026-07-27', qty: 35 },
  { numOf: 'SGAE10654257103', dateFin: '2026-07-30', qty: 3744 },
  { numOf: 'SGAE10654257104', dateFin: '2026-08-17', qty: 2464 },
  { numOf: 'SGAE10654257105', dateFin: '2026-08-31', qty: 896 },
]

test.group('coveringOfs — OF couvrant réellement le manque (#94)', () => {
  test('cumule par date et s’arrête dès le manque couvert', ({ assert }) => {
    assert.deepEqual(
      coveringOfs(EH6139, 50).map((o) => o.numOf),
      ['SGAE10654257102', 'SGAE10654257103'],
      'SGAE…104 ne couvre pas ce manque : ne pas l’afficher'
    )
  })

  test('un seul OF suffit quand il couvre à lui seul', ({ assert }) => {
    assert.deepEqual(
      coveringOfs(EH6139, 20).map((o) => o.numOf),
      ['SGAE10654257102']
    )
  })

  test('remonte autant d’OF que nécessaire pour un gros manque', ({ assert }) => {
    assert.deepEqual(
      coveringOfs(EH6139, 6000).map((o) => o.numOf),
      ['SGAE10654257102', 'SGAE10654257103', 'SGAE10654257104']
    )
  })

  test('couverture insuffisante → tous les OF, sans invention', ({ assert }) => {
    assert.lengthOf(coveringOfs(EH6139, 999999), 4)
  })

  test('aucun OF producteur → liste vide', ({ assert }) => {
    assert.deepEqual(coveringOfs([], 50), [])
  })
})
