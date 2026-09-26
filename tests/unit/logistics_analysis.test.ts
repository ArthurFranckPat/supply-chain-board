import { test } from '@japa/runner'
import {
  abcClasses,
  assembleLogisticsRows,
  type LogisticsBase,
} from '#app/domain/logistics_analysis'

const base = (article: string, overrides: Partial<LogisticsBase> = {}): LogisticsBase => ({
  article,
  designation: article,
  categorie: 'PF',
  famille: null,
  fournisseurCode: null,
  fournisseurNom: null,
  delaiReapproJours: null,
  lotTechnique: null,
  lotEconomique: null,
  stockSecurite: null,
  stockA: 100,
  stockQ: 20,
  stockAlloue: 30,
  pmp: 2,
  ...overrides,
})

test.group('Analyse logistique corrigée', () => {
  test('classe le premier article A même au-delà de 80 %, et laisse les zéros sans classe', ({
    assert,
  }) => {
    const rows = [
      { id: 'a', amount: 90 },
      { id: 'b', amount: 10 },
      { id: 'c', amount: 0 },
    ]
    assert.deepEqual(
      [
        ...abcClasses(
          rows,
          (row) => row.amount,
          (row) => row.id
        ),
      ],
      [
        ['a', 'A'],
        ['b', 'B'],
        ['c', null],
      ]
    )
  })

  test('CMJ calendaire et couverture utilisent les jours réels et le stock A non alloué', ({
    assert,
  }) => {
    const rows = assembleLogisticsRows(
      [base('A')],
      new Map([['A', { consommation: 365, joursMouvement: 5, operations: 8 }]]),
      new Map([['A', { besoin: 120, enRetard: 20 }]]),
      new Map([['A', 110]]),
      365
    )
    assert.lengthOf(rows, 1)
    assert.equal(rows[0].cmjCalendaire, 1)
    assert.equal(rows[0].stockDisponible, 70)
    assert.equal(rows[0].couvertureJours, 70)
    assert.equal(rows[0].moyenneParOperation, 45.63)
    assert.equal(rows[0].rotation, 3.32)
    assert.equal(rows[0].besoinEnRetard, 20)
  })

  test('absence de consommation donne une couverture inconnue, pas zéro jour', ({ assert }) => {
    const rows = assembleLogisticsRows(
      [base('A'), base('B', { stockA: 0, stockQ: 0 })],
      new Map(),
      new Map(),
      new Map(),
      365
    )
    assert.lengthOf(rows, 1)
    assert.isNull(rows[0].cmjCalendaire)
    assert.isNull(rows[0].couvertureJours)
    assert.isNull(rows[0].abcHistoriqueValeur)
  })
})
