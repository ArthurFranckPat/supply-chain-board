import { test } from '@japa/runner'
import {
  buildLigneByArticle,
  buildLigneLabelByWst,
  collectLigneOptions,
  explodeMaterialNeeds,
} from '#app/domain/material_plan'
import type { ChargeOrderLine } from '#app/domain/charge_explosion'
import type { GammeOperation } from '#app/domain/models/gamme'
import type { NomenclatureEntry } from '#app/domain/models/nomenclature'

/**
 * Contrat de l'explosion matières BRUTE (drill-down « appelé par ») : arrêt sur
 * acheté (feuille émise, pas descendue), descente des fabriqués, fantômes
 * aplatis dont le stock couvre avant descente du reliquat.
 *
 * Le NETTING ne vit plus ici : le bilan projeté est calculé par
 * `material_projection` et verrouillé par `material_projection.test.ts`.
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

test.group('explodeMaterialNeeds — stock fantome (revue lots 0-1, constat 1)', () => {
  // PF1 → FANT (×1) → ACH (acheté ×2). Règle 2 de `rupture_engine` : le stock
  // du fantôme couvre d'abord, seul le reliquat descend — jamais de ligne FANT.
  const phantomEntries = [entry('PF1', 'FANT', 1), entry('FANT', 'ACH', 2, 'ACHETE')]
  const phantomOpts = {
    isPhantom: (a: string) => a === 'FANT',
    isPurchased: (a: string) => a === 'ACH',
  }

  test('le stock du fantome couvre avant descente du reliquat', ({ assert }) => {
    const raws = explodeMaterialNeeds([line('PF1', 100, D1)], phantomEntries, {
      ...phantomOpts,
      phantomStock: new Map([['FANT', 60]]),
    })
    assert.isUndefined(raws.find((r) => r.article === 'FANT')) // jamais une ligne
    assert.equal(raws.find((r) => r.article === 'ACH')!.qty, 80) // (100 − 60) × 2
  })

  test('stock fantome nul : descente pleine (comportement historique)', ({ assert }) => {
    const raws = explodeMaterialNeeds([line('PF1', 100, D1)], phantomEntries, {
      ...phantomOpts,
      phantomStock: new Map(),
    })
    assert.equal(raws.find((r) => r.article === 'ACH')!.qty, 200)
  })

  test('couverture totale : rien ne descend', ({ assert }) => {
    const raws = explodeMaterialNeeds([line('PF1', 100, D1)], phantomEntries, {
      ...phantomOpts,
      phantomStock: new Map([['FANT', 1000]]),
    })
    assert.isUndefined(raws.find((r) => r.article === 'ACH'))
  })

  test('le ferme consomme le stock fantome avant la prevision', ({ assert }) => {
    const raws = explodeMaterialNeeds(
      // Ordre d'appel inversé volontairement : le ferme (D1) passe quand même d'abord.
      [line('PF1', 100, D2, 'prevision'), line('PF1', 100, D1, 'ferme')],
      phantomEntries,
      { ...phantomOpts, phantomStock: new Map([['FANT', 60]]) }
    )
    const ach = (n: { article: string }) => n.article === 'ACH'
    const ferme = raws.find((r) => ach(r) && r.nature === 'ferme')!
    const previ = raws.find((r) => ach(r) && r.nature !== 'ferme')!
    assert.equal(ferme.qty, 80) // (100 − 60) × 2
    assert.equal(previ.qty, 200) // reliquat nul pour la prévision
  })
})

test.group('troncature — feuille par regle (revue lots 0-1, constat 6)', () => {
  test('un enfant achete coupe ne compte pas, parent quand meme marque', ({ assert }) => {
    // SE → SSE : lien FABRIQUE mais article ACHAT — feuille par règle, pas troncature.
    const entries = [entry('PF1', 'SE', 1), entry('SE', 'SSE', 1)]
    const stats: { truncated: number; cutParents?: string[] } = { truncated: 0, cutParents: [] }
    explodeMaterialNeeds([line('PF1', 10, D1)], entries, {
      maxDepth: 1,
      isPurchased: (a) => a === 'SSE',
      stats,
    })
    assert.equal(stats.truncated, 0)
    assert.deepEqual(stats.cutParents, ['SE'])
  })

  test('sans isPurchased : repli historique sur le type de lien', ({ assert }) => {
    const entries = [entry('PF1', 'SE', 1), entry('SE', 'SSE', 1)]
    const stats: { truncated: number; cutParents?: string[] } = { truncated: 0, cutParents: [] }
    explodeMaterialNeeds([line('PF1', 10, D1)], entries, { maxDepth: 1, stats })
    assert.equal(stats.truncated, 1)
  })
})

test.group('ligne de production', () => {
  const op = (
    article: string,
    workstation: string,
    workstationLabel = '',
    rate = 1
  ): GammeOperation => ({ article, workstation, workstationLabel, rate })

  test('ligne = poste de la premiere operation seulement', ({ assert }) => {
    const map = buildLigneByArticle([
      op('PF1', 'PP_830'),
      op('PF1', 'PP_153'), // 2ᵉ opération : jamais la ligne du PF
      op('PF2', 'PP_153'),
    ])
    assert.deepEqual(map, { PF1: 'PP_830', PF2: 'PP_153' })
  })

  test('article sans poste de charge : pas de ligne', ({ assert }) => {
    const map = buildLigneByArticle([op('PF1', ''), op('PF2', '  ')])
    assert.deepEqual(map, {})
  })

  test('libelle du poste, repli sur le code, premiere occurrence gagne', ({ assert }) => {
    const labels = buildLigneLabelByWst([
      op('PF1', 'PP_830', 'Ligne bouches'),
      op('PF2', 'PP_830', 'Autre libellé'), // doublon : le premier reste
      op('PF3', 'PP_153'),
    ])
    assert.deepEqual(labels, { PP_830: 'Ligne bouches', PP_153: 'PP_153' })
  })

  test('options : comptage par ligne de demande, tri par code, PF sans route exclu', ({
    assert,
  }) => {
    const ligneByArticle = { PF1: 'PP_830', PF2: 'PP_153' }
    const labelByWst = { PP_830: 'Ligne bouches', PP_153: 'PP_153' }
    const options = collectLigneOptions(
      [line('PF1', 10, D1), line('PF1', 5, D2), line('PF2', 7, D1), line('PFX', 3, D1)],
      ligneByArticle,
      labelByWst
    )
    assert.deepEqual(options, [
      { code: 'PP_153', label: 'PP_153', count: 1 },
      { code: 'PP_830', label: 'Ligne bouches', count: 2 },
    ])
  })

  test('options : aucune demande, aucune option', ({ assert }) => {
    assert.deepEqual(collectLigneOptions([], { PF1: 'PP_830' }, { PP_830: 'Ligne' }), [])
  })
})
