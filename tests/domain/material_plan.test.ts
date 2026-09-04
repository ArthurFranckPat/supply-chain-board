import { test } from '@japa/runner'
import { explodeMaterialNeeds, netMaterial } from '#app/domain/material_plan'
import type { ChargeOrderLine } from '#app/domain/charge_explosion'
import type { NomenclatureEntry } from '#app/domain/models/nomenclature'

/**
 * Contrat plan matières : arrêt sur acheté (feuille émise, pas descendue),
 * descente des fabriqués, netting à priorité ferme (netFerme == calcul
 * ferme-seul), trois crans brut/net/reste.
 */

const D1 = new Date('2026-09-01T00:00:00')
const D2 = new Date('2026-10-01T00:00:00')

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

const line = (
  article: string,
  quantite: number,
  date: Date,
  nature: 'ferme' | 'prevision' = 'ferme'
): ChargeOrderLine => ({
  article,
  quantite,
  date,
  nature,
})

// PF1 → ACH (acheté ×2) + SE (fabriqué ×3) → FEUILLE (achetée ×1).
const ENTRIES = [
  entry('PF1', 'ACH', 2, 'ACHETE'),
  entry('PF1', 'SE', 3),
  entry('SE', 'FEUILLE', 1, 'ACHETE'),
]
const PURCHASED = new Set(['ACH', 'FEUILLE'])

test.group('explodeMaterialNeeds', () => {
  test('arrete sur achete, descend le fabrique', ({ assert }) => {
    const raws = explodeMaterialNeeds([line('PF1', 10, D1)], ENTRIES, {
      isPurchased: (a) => PURCHASED.has(a),
    })
    const byArt = new Map(raws.map((r) => [r.article, r]))
    assert.equal(raws.length, 4) // PF1 + ACH + SE + FEUILLE
    assert.equal(byArt.get('ACH')!.qty, 20)
    assert.equal(byArt.get('ACH')!.depth, 1)
    assert.equal(byArt.get('SE')!.qty, 30)
    assert.equal(byArt.get('FEUILLE')!.qty, 30)
    assert.equal(byArt.get('FEUILLE')!.depth, 2)
  })

  test('pas de descente depuis un parent achete', ({ assert }) => {
    const entries = [...ENTRIES, entry('ACH', 'SOUS_ACH', 5, 'ACHETE')]
    const raws = explodeMaterialNeeds([line('PF1', 10, D1)], entries, {
      isPurchased: (a) => PURCHASED.has(a) || a === 'SOUS_ACH',
    })
    assert.isUndefined(raws.find((r) => r.article === 'SOUS_ACH'))
  })

  test('FORFAIT vs PROPORTIONNEL', ({ assert }) => {
    const entries = [
      entry('PF1', 'PROP', 2, 'ACHETE'),
      entry('PF1', 'FORF', 7, 'ACHETE', 'FORFAIT'),
    ]
    const raws = explodeMaterialNeeds([line('PF1', 10, D1)], entries, {
      isPurchased: (a) => a !== 'PF1',
    })
    const byArt = new Map(raws.map((r) => [r.article, r]))
    assert.equal(byArt.get('PROP')!.qty, 20)
    assert.equal(byArt.get('FORF')!.qty, 7)
  })

  test('fantome aplati : traverse sans emettre', ({ assert }) => {
    const entries = [entry('PF1', 'FANT', 1), entry('FANT', 'ACH', 4, 'ACHETE')]
    const raws = explodeMaterialNeeds([line('PF1', 10, D1)], entries, {
      isPhantom: (a) => a === 'FANT',
      isPurchased: (a) => a === 'ACH',
    })
    assert.isUndefined(raws.find((r) => r.article === 'FANT'))
    assert.equal(raws.find((r) => r.article === 'ACH')!.qty, 40)
  })

  test('troncature remontee (compteur + parents)', ({ assert }) => {
    // PF1 → SE (fab) → SSE (fab) : à maxDepth 1, SSE est coupé ; ACH (feuille) ne compte pas.
    const entries = [entry('PF1', 'SE', 1), entry('PF1', 'ACH', 1, 'ACHETE'), entry('SE', 'SSE', 1)]
    const stats: { truncated: number; cutParents?: string[] } = { truncated: 0, cutParents: [] }
    explodeMaterialNeeds([line('PF1', 10, D1)], entries, {
      maxDepth: 1,
      isPurchased: (a) => a === 'ACH',
      stats,
    })
    assert.equal(stats.truncated, 1)
    assert.deepEqual(stats.cutParents, ['SE']) // ligne à marquer « descendance incomplète »
  })
})

test.group('netMaterial — priorite ferme', () => {
  // NB : les racines PF (depth 0) sont dans `needs` mais hors table composant
  // (le loader les exclut sauf PF acheté) — les `find` filtrent par article.
  const ach = (n: { article: string }) => n.article === 'ACH'
  const se = (n: { article: string }) => n.article === 'SE'

  test('le stock couvre le ferme avant la prevision', ({ assert }) => {
    const raws = explodeMaterialNeeds(
      [line('PF1', 10, D2, 'ferme'), line('PF1', 10, D1, 'prevision')],
      [entry('PF1', 'ACH', 1, 'ACHETE')],
      { isPurchased: (a) => a !== 'PF1' }
    )
    // Stock 15 : le ferme (10, plus tardif) est servi en premier → net 0 ;
    // la prévision (10, plus précoce) ne voit que le reliquat → net 5.
    // En FIFO global ce serait l'inverse : c'est ce que la priorité corrige.
    const needs = netMaterial(raws, new Map([['ACH', 15]]))
    const ferme = needs.find((n) => n.nature === 'ferme' && ach(n))!
    const previ = needs.find((n) => n.nature !== 'ferme' && ach(n))!
    assert.equal(ferme.brutQty, 10)
    assert.equal(ferme.netQty, 0)
    assert.equal(previ.brutQty, 10)
    assert.equal(previ.netQty, 5)
  })

  test('netFerme == calcul ferme-seul (pas de second calcul)', ({ assert }) => {
    const link = [entry('PF1', 'ACH', 1, 'ACHETE')]
    const notPf = (a: string) => a !== 'PF1'
    const full = explodeMaterialNeeds(
      [line('PF1', 10, D1, 'ferme'), line('PF1', 10, D1, 'prevision')],
      link,
      { isPurchased: notPf }
    )
    const seul = explodeMaterialNeeds([line('PF1', 10, D1, 'ferme')], link, {
      isPurchased: notPf,
    })
    const netFull = netMaterial(full, new Map([['ACH', 6]])).find(
      (n) => n.nature === 'ferme' && ach(n)
    )!
    const netSeul = netMaterial(seul, new Map([['ACH', 6]])).find((n) => ach(n))!
    assert.equal(netFull.netQty, netSeul.netQty)
    assert.equal(netFull.netQty, 4)
  })

  test('FIFO par date au sein du ferme', ({ assert }) => {
    const raws = explodeMaterialNeeds(
      [line('PF1', 10, D2, 'ferme'), line('PF1', 10, D1, 'ferme')],
      [entry('PF1', 'ACH', 1, 'ACHETE')],
      { isPurchased: (a) => a !== 'PF1' }
    )
    const needs = netMaterial(raws, new Map([['ACH', 12]]))
      .filter(ach)
      .sort((a, b) => a.date.getTime() - b.date.getTime())
    assert.equal(needs[0].netQty, 0) // D1 couvert
    assert.equal(needs[1].netQty, 8) // D2 : 10 - (12-10)
  })

  test('trois crans : en-cours priorise le ferme lui aussi', ({ assert }) => {
    const raws = explodeMaterialNeeds(
      [line('PF1', 10, D1, 'ferme'), line('PF1', 10, D1, 'prevision')],
      [entry('PF1', 'SE', 1)],
      { isPurchased: (a) => a !== 'PF1' }
    )
    // Pas de stock, en-cours 6 : le ferme (10) absorbe 6 → reste 4 ; prévision intacte.
    const needs = netMaterial(raws, new Map(), new Map([['SE', 6]]))
    const ferme = needs.find((n) => n.nature === 'ferme' && se(n))!
    const previ = needs.find((n) => n.nature !== 'ferme' && se(n))!
    assert.equal(ferme.netQty, 10)
    assert.equal(ferme.resteQty, 4)
    assert.equal(ferme.encoursQty, 6)
    assert.equal(previ.resteQty, 10)
    assert.equal(previ.encoursQty, 0)
  })
})
