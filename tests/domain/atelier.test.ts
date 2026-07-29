import { test } from '@japa/runner'
import {
  posteNatureFromCategories,
  buildPosteNatureByWorkstation,
  atelierCategoryFromPosteNature,
} from '#app/domain/atelier'

test.group('posteNatureFromCategories', () => {
  test('majorité PF* → assemblage_pf (PP_153 bouches PF3 inclus)', ({ assert }) => {
    assert.equal(posteNatureFromCategories(['PF3', 'PF3', 'PFAS']), 'assemblage_pf')
  })

  test('majorité SF* → assemble_sous_ensemble', ({ assert }) => {
    assert.equal(posteNatureFromCategories(['SF', 'SFC', 'SF']), 'assemble_sous_ensemble')
  })

  test('égalité PF/SF → PF', ({ assert }) => {
    assert.equal(posteNatureFromCategories(['PF3', 'SF']), 'assemblage_pf')
  })

  test('aucune catégorie exploitable → autre', ({ assert }) => {
    assert.equal(posteNatureFromCategories(['', 'AP', 'ST']), 'autre')
    assert.equal(posteNatureFromCategories([]), 'autre')
  })

  test('ignore la casse et les espaces', ({ assert }) => {
    assert.equal(posteNatureFromCategories([' pf3 ', 'Sf']), 'assemblage_pf')
  })
})

test.group('buildPosteNatureByWorkstation', () => {
  test('classe sur la 1ʳᵉ op gamme uniquement', ({ assert }) => {
    const map = buildPosteNatureByWorkstation(
      [
        { article: 'A', workstation: 'PP_830', workstationLabel: 'Easy', rate: 1 },
        { article: 'A', workstation: 'PP_146', workstationLabel: 'Module', rate: 1 },
        { article: 'B', workstation: 'PP_146', workstationLabel: 'Module', rate: 1 },
      ],
      new Map([
        ['A', 'PFAS'],
        ['B', 'SFC'],
      ])
    )
    // A → 1ʳᵉ op PP_830 (PF) ; B → PP_146 (SF). PP_146 n'a que B.
    assert.equal(map.get('PP_830'), 'assemblage_pf')
    assert.equal(map.get('PP_146'), 'assemble_sous_ensemble')
  })
})

test.group('atelierCategoryFromPosteNature', () => {
  test('mappe PF→montage et S/E→fabrication', ({ assert }) => {
    assert.equal(atelierCategoryFromPosteNature('assemblage_pf'), 'montage')
    assert.equal(atelierCategoryFromPosteNature('assemble_sous_ensemble'), 'fabrication')
    assert.equal(atelierCategoryFromPosteNature('autre'), 'fabrication')
  })
})
