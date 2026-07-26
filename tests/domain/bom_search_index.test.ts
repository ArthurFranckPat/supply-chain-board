import { test } from '@japa/runner'
import { explodeBomForSearch } from '#controllers/suivi_controller'
import type { Nomenclature } from '#app/domain/models/nomenclature'

function bom(article: string, components: string[]): [string, Nomenclature] {
  return [
    article,
    {
      article,
      description: '',
      components: components.map((c) => ({
        parentArticle: article,
        parentDescription: '',
        level: 1,
        componentArticle: c,
        componentDescription: '',
        linkQuantity: 1,
        componentType: 'ACHETE' as const,
        consumptionNature: 'PROPORTIONNEL' as const,
      })),
    },
  ]
}

test.group('explodeBomForSearch — index de recherche nomenclature', () => {
  test('descend tous les niveaux, pas seulement le premier', ({ assert }) => {
    const nomenclatures = new Map<string, Nomenclature>([
      bom('PF', ['SE1', 'A1']),
      bom('SE1', ['SE2', 'A2']),
      bom('SE2', ['A3']),
    ])
    assert.deepEqual(explodeBomForSearch('PF', nomenclatures).sort(), [
      'A1',
      'A2',
      'A3',
      'SE1',
      'SE2',
    ])
  })

  test('article sans nomenclature → vide', ({ assert }) => {
    assert.deepEqual(explodeBomForSearch('ACHAT', new Map()), [])
  })

  test('un cycle ne boucle pas à l’infini', ({ assert }) => {
    const nomenclatures = new Map<string, Nomenclature>([
      bom('A', ['B']),
      bom('B', ['C']),
      bom('C', ['A']),
    ])
    assert.deepEqual(explodeBomForSearch('A', nomenclatures).sort(), ['A', 'B', 'C'])
  })

  test('un composant partagé n’est compté qu’une fois', ({ assert }) => {
    const nomenclatures = new Map<string, Nomenclature>([
      bom('PF', ['SE1', 'SE2']),
      bom('SE1', ['VIS']),
      bom('SE2', ['VIS']),
    ])
    const out = explodeBomForSearch('PF', nomenclatures)
    assert.lengthOf(out.filter((c) => c === 'VIS'), 1)
  })
})
