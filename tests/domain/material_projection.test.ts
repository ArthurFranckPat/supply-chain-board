import { test } from '@japa/runner'
import {
  projectMaterialPlan,
  type ArticleSupply,
  type ProjectionDemand,
} from '#app/domain/material_projection'
import { collectBom } from '#app/domain/charge_explosion'
import type { NomenclatureEntry } from '#app/domain/models/nomenclature'

/**
 * Contrat de la projection matières time-phased.
 *
 * Ce que ces tests verrouillent, et qui n'existait pas dans `netMaterial` :
 *  - les arrivées entrent dans le bilan et repoussent la rupture ;
 *  - le manque est daté (`ruptureAt`), pas seulement chiffré ;
 *  - le stock d'un sous-ensemble est netté AVANT descente — ses composants ne
 *    sont appelés que pour le reliquat ;
 *  - le solde ne descend jamais sous zéro : le déficit devient un besoin net,
 *    et c'est ce besoin net qui descend.
 */

const entry = (
  parent: string,
  component: string,
  linkQuantity: number,
  type: 'ACHETE' | 'FABRIQUE' = 'FABRIQUE',
  nature: 'PROPORTIONNEL' | 'FORFAIT' = 'PROPORTIONNEL'
): NomenclatureEntry => ({
  parentArticle: parent,
  parentDescription: '',
  level: 1,
  componentArticle: component,
  componentDescription: '',
  linkQuantity,
  componentType: type,
  consumptionNature: nature,
})

const demand = (
  article: string,
  bucket: number,
  qty: number,
  nature: 'ferme' | 'prevision' = 'ferme'
): ProjectionDemand => ({ article, bucket, qty, nature })

// PF → ACH (acheté ×2) + SE (fabriqué ×3) → FEUILLE (achetée ×1)
const ENTRIES = [
  entry('PF', 'ACH', 2, 'ACHETE'),
  entry('PF', 'SE', 3),
  entry('SE', 'FEUILLE', 1, 'ACHETE'),
]
const BOM = collectBom(ENTRIES, { includePurchased: true })
const PURCHASED = new Set(['ACH', 'FEUILLE'])
const isPurchased = (a: string): boolean => PURCHASED.has(a)

const run = (
  demands: ProjectionDemand[],
  buckets: number,
  supply: Record<string, ArticleSupply> = {},
  extra: { isPhantom?: (a: string) => boolean; maxDepth?: number; bom?: typeof BOM } = {}
) =>
  projectMaterialPlan(demands, extra.bom ?? BOM, {
    buckets,
    isPurchased,
    supply: (a) => supply[a],
    isPhantom: extra.isPhantom,
    maxDepth: extra.maxDepth,
  })

test.group('projectMaterialPlan — bilan chronologique', () => {
  test('sans stock ni arrivee : le besoin est le manque, date du premier bucket', ({ assert }) => {
    const { byArticle } = run([demand('PF', 1, 10)], 3)
    const ach = byArticle.get('ACH')!
    assert.deepEqual(ach.besoinFerme, [0, 20, 0])
    assert.deepEqual(ach.manqueFerme, [0, 20, 0])
    assert.deepEqual(ach.solde, [0, 0, 0])
    assert.equal(ach.ruptureAt, 1)
  })

  test('le stock couvre puis le solde se reporte sur les buckets suivants', ({ assert }) => {
    const { byArticle } = run([demand('PF', 0, 10), demand('PF', 2, 10)], 3, { ACH: { stock: 30 } })
    const ach = byArticle.get('ACH')!
    // 30 en stock, 20 consommés au bucket 0, 10 restent, 20 demandés au 2.
    assert.deepEqual(ach.solde, [10, 10, 0])
    assert.deepEqual(ach.manqueFerme, [0, 0, 10])
    assert.equal(ach.ruptureAt, 2)
  })

  test('une arrivee repousse la rupture — le defaut de netMaterial', ({ assert }) => {
    const sansArrivee = run([demand('PF', 1, 10)], 3, { ACH: { stock: 0 } })
    assert.equal(sansArrivee.byArticle.get('ACH')!.ruptureAt, 1)

    const avecArrivee = run([demand('PF', 1, 10)], 3, {
      ACH: { stock: 0, arrivees: [20, 0, 0] },
    })
    const ach = avecArrivee.byArticle.get('ACH')!
    assert.deepEqual(ach.manqueFerme, [0, 0, 0])
    assert.equal(ach.ruptureAt, -1, 'aucune rupture : la reception couvre')
    assert.deepEqual(ach.arrivees, [20, 0, 0])
  })

  test('une arrivee APRES le besoin ne le couvre pas retroactivement', ({ assert }) => {
    const { byArticle } = run([demand('PF', 0, 10)], 3, { ACH: { arrivees: [0, 20, 0] } })
    const ach = byArticle.get('ACH')!
    assert.deepEqual(ach.manqueFerme, [20, 0, 0])
    assert.equal(ach.ruptureAt, 0)
    // Le déficit ne se traîne pas en solde négatif : il est devenu un besoin
    // net, et l'arrivée du bucket 1 reste disponible.
    assert.deepEqual(ach.solde, [0, 20, 20])
  })

  test("l'en-cours non declare est credite au premier bucket", ({ assert }) => {
    const { byArticle } = run([demand('PF', 0, 10)], 2, { SE: { stock: 0, encours: 30 } })
    const se = byArticle.get('SE')!
    assert.deepEqual(se.manqueFerme, [0, 0])
    assert.equal(se.encours, 30)
  })
})

test.group('projectMaterialPlan — netting niveau par niveau', () => {
  test('le stock du sous-ensemble evite d appeler ses composants', ({ assert }) => {
    // 10 PF → 30 SE. Avec 30 SE en stock, FEUILLE ne doit RIEN voir.
    const { byArticle } = run([demand('PF', 0, 10)], 2, { SE: { stock: 30 } })
    assert.deepEqual(byArticle.get('SE')!.manqueFerme, [0, 0])
    assert.deepEqual(byArticle.get('FEUILLE')!.besoinFerme, [0, 0])
  })

  test('couverture partielle : seul le reliquat descend', ({ assert }) => {
    const { byArticle } = run([demand('PF', 0, 10)], 2, { SE: { stock: 12 } })
    assert.deepEqual(byArticle.get('SE')!.manqueFerme, [18, 0])
    assert.deepEqual(byArticle.get('FEUILLE')!.besoinFerme, [18, 0])
  })

  test('le stock du PF evite d appeler toute la nomenclature', ({ assert }) => {
    const { byArticle } = run([demand('PF', 0, 10)], 2, { PF: { stock: 10 } })
    assert.deepEqual(byArticle.get('ACH')!.besoinFerme, [0, 0])
    assert.deepEqual(byArticle.get('SE')!.besoinFerme, [0, 0])
  })

  test('profondeur : PF depth 0, composants 1, feuille 2', ({ assert }) => {
    const { byArticle } = run([demand('PF', 0, 10)], 1)
    assert.equal(byArticle.get('PF')!.depth, 0)
    assert.equal(byArticle.get('ACH')!.depth, 1)
    assert.equal(byArticle.get('SE')!.depth, 1)
    assert.equal(byArticle.get('FEUILLE')!.depth, 2)
  })
})

test.group('projectMaterialPlan — nature ferme / prevision', () => {
  test('le ferme est servi avant la prevision AU SEIN du bucket', ({ assert }) => {
    const { byArticle } = run([demand('PF', 0, 5), demand('PF', 0, 5, 'prevision')], 2, {
      ACH: { stock: 10 },
    })
    const ach = byArticle.get('ACH')!
    assert.deepEqual(ach.besoinFerme, [10, 0])
    assert.deepEqual(ach.besoinPrevi, [10, 0])
    assert.deepEqual(ach.manqueFerme, [0, 0], 'le ferme passe en entier')
    assert.deepEqual(ach.manquePrevi, [10, 0], 'la prevision encaisse le manque')
  })

  test('la chronologie prime : une prevision tot mange le stock d un ferme tard', ({ assert }) => {
    const { byArticle } = run([demand('PF', 0, 5, 'prevision'), demand('PF', 1, 5)], 2, {
      ACH: { stock: 10 },
    })
    const ach = byArticle.get('ACH')!
    assert.deepEqual(ach.manquePrevi, [0, 0])
    assert.deepEqual(
      ach.manqueFerme,
      [0, 10],
      'le ferme du bucket 1 manque : le stock est parti au bucket 0'
    )
  })

  test('lecture ferme seul = second passage sans les previsions', ({ assert }) => {
    const fermeSeul = run([demand('PF', 1, 5)], 2, { ACH: { stock: 10 } })
    assert.deepEqual(fermeSeul.byArticle.get('ACH')!.manqueFerme, [0, 0])
  })

  test('la nature se propage aux composants', ({ assert }) => {
    const { byArticle } = run([demand('PF', 0, 10, 'prevision')], 1)
    const ach = byArticle.get('ACH')!
    assert.deepEqual(ach.besoinFerme, [0])
    assert.deepEqual(ach.besoinPrevi, [20])
  })
})

test.group('projectMaterialPlan — fantomes, forfait, troncature', () => {
  test('un fantome couvre puis se traverse, sans etre une ligne', ({ assert }) => {
    // PF → FANT (fantôme ×1) → REEL (acheté ×2)
    const bom = collectBom([entry('PF', 'FANT', 1), entry('FANT', 'REEL', 2, 'ACHETE')], {
      includePurchased: true,
    })
    const { byArticle } = projectMaterialPlan([demand('PF', 0, 10)], bom, {
      buckets: 1,
      isPurchased: (a) => a === 'REEL',
      isPhantom: (a) => a === 'FANT',
      supply: (a) => (a === 'FANT' ? { stock: 4 } : undefined),
    })
    assert.isUndefined(byArticle.get('FANT'), 'un fantome n est jamais une ligne')
    // 10 appelés, 4 couverts par le stock fantôme, 6 descendent ×2 = 12.
    assert.deepEqual(byArticle.get('REEL')!.besoinFerme, [12])
  })

  test('le fantome ne consomme pas de profondeur', ({ assert }) => {
    const bom = collectBom([entry('PF', 'FANT', 1), entry('FANT', 'REEL', 2, 'ACHETE')], {
      includePurchased: true,
    })
    const { byArticle } = projectMaterialPlan([demand('PF', 0, 1)], bom, {
      buckets: 1,
      isPurchased: (a) => a === 'REEL',
      isPhantom: (a) => a === 'FANT',
    })
    assert.equal(byArticle.get('REEL')!.depth, 1)
  })

  test('FORFAIT : quantite fixe, sans prorata', ({ assert }) => {
    const bom = collectBom([entry('PF', 'VIS', 5, 'ACHETE', 'FORFAIT')], {
      includePurchased: true,
    })
    const { byArticle } = projectMaterialPlan([demand('PF', 0, 100)], bom, {
      buckets: 1,
      isPurchased: (a) => a === 'VIS',
    })
    assert.deepEqual(byArticle.get('VIS')!.besoinFerme, [5])
  })

  test('plafond de profondeur : branche coupee comptee et parent marque', ({ assert }) => {
    // PF → N1 → N2 → N3 → N4 (tous fabriqués) avec maxDepth 2.
    const bom = collectBom(
      [entry('PF', 'N1', 1), entry('N1', 'N2', 1), entry('N2', 'N3', 1), entry('N3', 'N4', 1)],
      { includePurchased: true }
    )
    const res = projectMaterialPlan([demand('PF', 0, 1)], bom, {
      buckets: 1,
      maxDepth: 2,
      isPurchased: () => false,
    })
    assert.isDefined(res.byArticle.get('N2'))
    assert.isUndefined(res.byArticle.get('N3'), 'coupe au plafond')
    assert.equal(res.truncated, 1)
    assert.isTrue(res.byArticle.get('N2')!.tronque)
    assert.isFalse(res.byArticle.get('N1')!.tronque)
  })

  test('une feuille achetee au plafond n est pas une troncature', ({ assert }) => {
    const bom = collectBom([entry('PF', 'N1', 1), entry('N1', 'ACH', 1, 'ACHETE')], {
      includePurchased: true,
    })
    const res = projectMaterialPlan([demand('PF', 0, 1)], bom, {
      buckets: 1,
      maxDepth: 1,
      isPurchased: (a) => a === 'ACH',
    })
    assert.equal(res.truncated, 0)
  })

  test('nomenclature cyclique : le calcul termine', ({ assert }) => {
    const bom = collectBom([entry('A', 'B', 1), entry('B', 'A', 1)], { includePurchased: true })
    const res = projectMaterialPlan([demand('A', 0, 1)], bom, {
      buckets: 1,
      maxDepth: 4,
      isPurchased: () => false,
    })
    assert.isDefined(res.byArticle.get('B'))
  })
})
