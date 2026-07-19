import { test } from '@japa/runner'
import { scoreCase } from '#services/agent/eval/scorer'
import type { GoldenCase } from '#services/agent/eval/golden_cases'

const base: GoldenCase = {
  id: 'T',
  question: 'q',
  mocks: {},
  mustCall: ['getVerdict'],
  expected: {
    articles: ['ACH-VIS-M6'],
    ofs: ['MFG-1001'],
    keywords: ['rupture'],
  },
}

test.group('agent golden scorer', () => {
  test('pass si racine + tool', ({ assert }) => {
    const r = scoreCase(
      base,
      'OF MFG-1001 en rupture sur ACH-VIS-M6 [getVerdict: rupture]',
      ['getVerdict']
    )
    assert.isTrue(r.pass)
  })

  test('fail si article racine inventé / absent', ({ assert }) => {
    const r = scoreCase(
      base,
      'Je pense que c’est le stock global qui bloque',
      ['getVerdict']
    )
    assert.isFalse(r.pass)
    assert.isTrue(r.details.some((d) => d.includes('ACH-VIS-M6')))
  })

  test('fail si tool must manquant', ({ assert }) => {
    const r = scoreCase(
      base,
      'OF MFG-1001 rupture ACH-VIS-M6',
      [] // n'a pas appelé getVerdict
    )
    assert.isFalse(r.pass)
  })
})
