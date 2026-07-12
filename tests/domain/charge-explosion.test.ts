import { test } from '@japa/runner'
import { explodeCharge, netCharge } from '#app/domain/charge-explosion'
import type { GammeOperation } from '#app/domain/models/gamme'
import type { NomenclatureEntry } from '#app/domain/models/nomenclature'

/**
 * Contrat charge-explosion : explosion depth-N (PF + composants fabriqués, garde
 * anti-cycle, cap profondeur) et netting FIFO par article (stock strict+CQ consommé
 * depuis la date la plus tôt). Verrouille la suite issue #42 (brut → net, depth-4).
 */

const D1 = new Date('2026-07-01T00:00:00')
const D2 = new Date('2026-07-15T00:00:00')

const entry = (
  parent: string,
  component: string,
  linkQuantity: number,
  type: 'ACHETE' | 'FABRIQUE' = 'FABRIQUE'
): NomenclatureEntry => ({
  parentArticle: parent,
  parentDescription: '',
  level: 1,
  componentArticle: component,
  componentDescription: '',
  linkQuantity,
  componentType: type,
  consumptionNature: 'PROPORTIONNEL',
})

const op = (article: string, wst: string, rate: number): [string, GammeOperation] => [
  article,
  { article, workstation: wst, workstationLabel: wst, rate },
]

// PF1 → C1 (×2) → S1 (×1). PF1 sur WST_A, C1 sur WST_B, S1 sur WST_C.
const gammeMap = new Map([op('PF1', 'WST_A', 10), op('C1', 'WST_B', 5), op('S1', 'WST_C', 2)])
const bomByParent = new Map<string, NomenclatureEntry[]>([
  ['PF1', [entry('PF1', 'C1', 2)]],
  ['C1', [entry('C1', 'S1', 1)]],
])

test('explose PF + composants avec qty propagées et profondeurs correctes', ({ assert }) => {
  const raws = explodeCharge(
    [{ article: 'PF1', quantite: 10, date: D1, nature: 'ferme' }],
    bomByParent,
    gammeMap
  )
  const byArt = new Map(raws.map((r) => [r.article, r]))
  assert.equal(raws.length, 3)
  assert.equal(byArt.get('PF1')!.depth, 0)
  assert.equal(byArt.get('PF1')!.qty, 10)
  assert.equal(byArt.get('C1')!.depth, 1)
  assert.equal(byArt.get('C1')!.qty, 20)
  assert.equal(byArt.get('S1')!.depth, 2)
  assert.equal(byArt.get('S1')!.qty, 20)
})

test('maxDepth coupe la descente', ({ assert }) => {
  const raws = explodeCharge(
    [{ article: 'PF1', quantite: 10, date: D1, nature: 'ferme' }],
    bomByParent,
    gammeMap,
    1 // PF (0) + C1 (1) seulement, S1 (2) exclu.
  )
  assert.equal(raws.length, 2)
  assert.isUndefined(raws.find((r) => r.article === 'S1'))
})

test('garde anti-cycle : A→B→A ne boucle pas', ({ assert }) => {
  const cycBom = new Map<string, NomenclatureEntry[]>([
    ['A', [entry('A', 'B', 1)]],
    ['B', [entry('B', 'A', 1)]],
  ])
  const cycGamme = new Map([op('A', 'W', 1), op('B', 'W', 1)])
  const raws = explodeCharge(
    [{ article: 'A', quantite: 1, date: D1, nature: 'ferme' }],
    cycBom,
    cycGamme,
    10
  )
  assert.equal(raws.filter((r) => r.article === 'A').length, 1)
  assert.equal(raws.filter((r) => r.article === 'B').length, 1)
})

test('netting FIFO : stock consommé depuis la date la plus tôt', ({ assert }) => {
  // 2 commandes PF1 qty 10 : C1 besoin 20 à D1 + 20 à D2 = 40. Stock C1 = 5.
  const raws = explodeCharge(
    [
      { article: 'PF1', quantite: 10, date: D1, nature: 'ferme' },
      { article: 'PF1', quantite: 10, date: D2, nature: 'ferme' },
    ],
    bomByParent,
    gammeMap
  )
  const needs = netCharge(raws, new Map([['C1', 5]]))
  const c1 = needs
    .filter((n) => n.article === 'C1')
    .sort((a, b) => a.date.getTime() - b.date.getTime())
  // D1 : brut 20, stock 5 consommés → net 15 → 3h (rate 5).
  assert.equal(c1[0].brutHours, 4)
  assert.equal(c1[0].netHours, 3)
  // D2 : brut 20, stock épuisé → net 20 → 4h.
  assert.equal(c1[1].brutHours, 4)
  assert.equal(c1[1].netHours, 4)
})

test('stock couvrant totalement → net nul', ({ assert }) => {
  const raws = explodeCharge(
    [{ article: 'PF1', quantite: 10, date: D1, nature: 'ferme' }],
    bomByParent,
    gammeMap
  )
  const needs = netCharge(raws, new Map([['C1', 999]]))
  const c1 = needs.find((n) => n.article === 'C1')!
  assert.equal(c1.brutHours, 4)
  assert.equal(c1.netHours, 0)
})
