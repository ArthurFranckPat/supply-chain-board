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

  /**
   * La PART prise sur chaque OF, pas sa quantité d'ordre ni le manque total.
   *
   * Relevé PROD du 02/09/2026 (EAR1245EX / OF F126-49779, SE EH4276, manque 849) :
   *   F126-49633       fin 29/08  reste    1   → fournit   1
   *   SGAE10663280357  fin 02/09  reste  431   → fournit 431
   *   SGAE10663280358  fin 02/09  reste 2289   → fournit 417  (le solde, pas ses 2289)
   * L'écran affichait « 849 par … » sur les TROIS lignes — dont sur un OF ferme auquel il ne
   * reste qu'une pièce.
   */
  const EH4276 = [
    { numOf: 'F126-49633', dateFin: '2026-08-29', qty: 1 },
    { numOf: 'SGAE10663280357', dateFin: '2026-09-02', qty: 431 },
    { numOf: 'SGAE10663280358', dateFin: '2026-09-03', qty: 2289 },
    { numOf: 'SGAE10663280359', dateFin: '2026-09-05', qty: 2304 },
  ]

  test('chaque OF porte SA part, jamais le manque total', ({ assert }) => {
    assert.deepEqual(coveringOfs(EH4276, 849), [
      { numOf: 'F126-49633', dateFin: '2026-08-29', qty: 1 },
      { numOf: 'SGAE10663280357', dateFin: '2026-09-02', qty: 431 },
      { numOf: 'SGAE10663280358', dateFin: '2026-09-03', qty: 417 },
    ])
  })

  test('la somme des parts vaut le manque', ({ assert }) => {
    for (const manque of [1, 50, 432, 849, 3000]) {
      const somme = coveringOfs(EH4276, manque).reduce((s, o) => s + o.qty, 0)
      assert.equal(somme, manque, `manque ${manque}`)
    }
  })

  test('couverture insuffisante → parts plafonnées à la capacité, sans invention', ({ assert }) => {
    const parts = coveringOfs(EH4276, 999999)
    assert.deepEqual(
      parts.map((o) => o.qty),
      [1, 431, 2289, 2304]
    )
    assert.equal(
      parts.reduce((s, o) => s + o.qty, 0),
      5025
    )
  })

  test('un seul OF qui couvre tout ne rend que la part utile', ({ assert }) => {
    assert.deepEqual(coveringOfs(EH6139, 20), [
      { numOf: 'SGAE10654257102', dateFin: '2026-07-27', qty: 20 },
    ])
  })
})
