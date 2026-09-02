import { test } from '@japa/runner'
import { allocateSeCoveringOfs } from '#app/domain/order_impacts'

/**
 * Cas réel prod EBH1257AL / OF F426-42920 (2016 pcs) : le SE EH6139 a 1966 pcs de stock net
 * (PHYSTO 2638 − GLOALL 672) pour un besoin de 2016 → manque 50. Seuls les WOS cumulant
 * jusqu'à 50 couvrent CE manque ; les suivants concernent d'autres besoins.
 */
const PROD_EH6139 = [
  { numOf: 'SGAE10654257102', article: 'EH6139', dateFin: '2026-07-27', qteRestante: 35 },
  { numOf: 'SGAE10654257103', article: 'EH6139', dateFin: '2026-07-30', qteRestante: 3744 },
  { numOf: 'SGAE10654257104', article: 'EH6139', dateFin: '2026-08-17', qteRestante: 2464 },
  { numOf: 'SGAE10654257105', article: 'EH6139', dateFin: '2026-08-31', qteRestante: 896 },
]

/**
 * Relevé PROD du 02/09/2026 (SE EH4276) : trois OF producteurs dont un OF ferme auquel il ne
 * reste qu'UNE pièce.
 */
const PROD_EH4276 = [
  { numOf: 'F126-49633', article: 'EH4276', dateFin: '2026-08-29', qteRestante: 1 },
  { numOf: 'F126-49910', article: 'EH4276', dateFin: '2026-09-03', qteRestante: 1700 },
  { numOf: 'SGAE10663280358', article: 'EH4276', dateFin: '2026-09-03', qteRestante: 2289 },
  { numOf: 'SGAE10663280359', article: 'EH4276', dateFin: '2026-09-05', qteRestante: 2304 },
]

/** Un consommateur unique : lit les parts attribuées à son besoin de `art`. */
function partsFor(
  producers: Array<{ numOf: string; article: string; qteRestante: number; dateFin: string | null }>,
  art: string,
  besoin: number,
  consume = true
): { numOf: string; dateFin: string | null; qty: number }[] {
  const out = allocateSeCoveringOfs(
    producers,
    [{ numOf: 'OF-CONSO', seComponents: { [art]: besoin } }],
    { consume }
  )
  return out.get('OF-CONSO')?.[art] ?? []
}

test.group('allocateSeCoveringOfs — OF couvrant réellement le manque (#94)', () => {
  test('cumule par date et s’arrête dès le manque couvert', ({ assert }) => {
    assert.deepEqual(
      partsFor(PROD_EH6139, 'EH6139', 50).map((o) => o.numOf),
      ['SGAE10654257102', 'SGAE10654257103'],
      'SGAE…104 ne couvre pas ce manque : ne pas l’afficher'
    )
  })

  test('un seul OF suffit quand il couvre à lui seul', ({ assert }) => {
    assert.deepEqual(partsFor(PROD_EH6139, 'EH6139', 20), [
      { numOf: 'SGAE10654257102', dateFin: '2026-07-27', qty: 20 },
    ])
  })

  test('remonte autant d’OF que nécessaire pour un gros manque', ({ assert }) => {
    assert.deepEqual(
      partsFor(PROD_EH6139, 'EH6139', 6000).map((o) => o.numOf),
      ['SGAE10654257102', 'SGAE10654257103', 'SGAE10654257104']
    )
  })

  test('couverture insuffisante → tous les OF, parts plafonnées, sans invention', ({ assert }) => {
    const parts = partsFor(PROD_EH4276, 'EH4276', 999999)
    assert.deepEqual(
      parts.map((o) => o.qty),
      [1, 1700, 2289, 2304]
    )
    assert.equal(
      parts.reduce((s, o) => s + o.qty, 0),
      6294
    )
  })

  test('aucun OF producteur → aucune part', ({ assert }) => {
    assert.deepEqual(partsFor([], 'EH6139', 50), [])
  })

  test('chaque OF porte SA part, jamais le manque total', ({ assert }) => {
    assert.deepEqual(partsFor(PROD_EH4276, 'EH4276', 849), [
      { numOf: 'F126-49633', dateFin: '2026-08-29', qty: 1 },
      { numOf: 'F126-49910', dateFin: '2026-09-03', qty: 848 },
    ])
  })

  test('la somme des parts vaut le manque', ({ assert }) => {
    for (const manque of [1, 50, 432, 849, 3000]) {
      const somme = partsFor(PROD_EH4276, 'EH4276', manque).reduce((s, o) => s + o.qty, 0)
      assert.equal(somme, manque, `manque ${manque}`)
    }
  })

  /**
   * LE DÉFAUT du 02/09/2026 : la capacité d'un OF producteur doit être décrémentée d'un
   * consommateur au suivant. Sans ça chaque ligne repartait de F126-49910 et l'écran annonçait
   * ses 1700 pièces sur 7 lignes (> 4000 pcs promises), pendant que SGAE10663280358 — celui que
   * la grille X3 fait bien apparaître sur les besoins du 03/09 — n'était nommé nulle part.
   */
  test('un producteur épuisé ne peut plus être nommé sur le consommateur suivant', ({ assert }) => {
    const out = allocateSeCoveringOfs(
      PROD_EH4276,
      [
        { numOf: 'SGAE10663223977', seComponents: { EH4276: 1296 } },
        { numOf: 'F126-49781', seComponents: { EH4276: 576 } },
        { numOf: 'F126-49146', seComponents: { EH4276: 1944 } },
      ],
      { consume: true }
    )
    assert.deepEqual(out.get('SGAE10663223977')!.EH4276, [
      { numOf: 'F126-49633', dateFin: '2026-08-29', qty: 1 },
      { numOf: 'F126-49910', dateFin: '2026-09-03', qty: 1295 },
    ])
    assert.deepEqual(
      out.get('F126-49781')!.EH4276,
      [
        { numOf: 'F126-49910', dateFin: '2026-09-03', qty: 405 },
        { numOf: 'SGAE10663280358', dateFin: '2026-09-03', qty: 171 },
      ],
      'F126-49910 n’a plus que 405 pièces : le solde bascule sur l’OF suivant'
    )
    assert.deepEqual(out.get('F126-49146')!.EH4276, [
      { numOf: 'SGAE10663280358', dateFin: '2026-09-03', qty: 1944 },
    ])
  })

  test('total attribué ≤ capacité du pool, quel que soit le nombre de consommateurs', ({
    assert,
  }) => {
    const out = allocateSeCoveringOfs(
      PROD_EH4276,
      Array.from({ length: 20 }, (_, i) => ({
        numOf: `OF-${i}`,
        seComponents: { EH4276: 1000 },
      })),
      { consume: true }
    )
    let total = 0
    for (const parts of out.values()) for (const p of parts.EH4276 ?? []) total += p.qty
    assert.equal(total, 6294, 'la capacité totale du pool, jamais plus')
  })

  /**
   * Mode PHOTO : chaque OF est évalué SEUL contre la production entière (règle #73). Décrémenter
   * y contredirait le verdict rendu — le premier consommateur mangerait la production que le
   * moteur a créditée au second.
   */
  test('mode photo : la capacité n’est pas décrémentée', ({ assert }) => {
    const out = allocateSeCoveringOfs(
      PROD_EH4276,
      [
        { numOf: 'OF-A', seComponents: { EH4276: 1296 } },
        { numOf: 'OF-B', seComponents: { EH4276: 1296 } },
      ],
      { consume: false }
    )
    assert.deepEqual(out.get('OF-A')!.EH4276, out.get('OF-B')!.EH4276)
  })

  test('besoin nul ou article sans producteur → aucune entrée', ({ assert }) => {
    const out = allocateSeCoveringOfs(
      PROD_EH4276,
      [{ numOf: 'OF-A', seComponents: { EH4276: 0, EH9999: 500 } }],
      { consume: true }
    )
    assert.isUndefined(out.get('OF-A'))
  })

  test('un producteur sans date passe en dernier', ({ assert }) => {
    const parts = partsFor(
      [
        { numOf: 'SANS-DATE', article: 'EH1', dateFin: null, qteRestante: 100 },
        { numOf: 'AVEC-DATE', article: 'EH1', dateFin: '2026-09-30', qteRestante: 10 },
      ],
      'EH1',
      50
    )
    assert.deepEqual(
      parts.map((o) => o.numOf),
      ['AVEC-DATE', 'SANS-DATE']
    )
  })
})
