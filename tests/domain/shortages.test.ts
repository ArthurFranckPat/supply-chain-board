import { test } from '@japa/runner'
import type { Article } from '#app/domain/models/article'
import type { ReceptionRecord } from '#app/domain/recursive-checker'
import type { OrderImpactResult } from '#app/domain/order-impacts'
import { buildShortageRows, resolveCoveringReception } from '#app/domain/shortages'

function article(code: string, desc: string): Article {
  return {
    code, description: desc, category: '', supplyType: 'ACHAT',
    reorderDelay: 0, productFamily: null, pmp: null, economicLot: null,
    unitStock: null, unitPurchase: null, purchaseToStockRatio: 1, packagings: [],
  }
}

function reception(id: string, article: string, supplier: string, qty: number, dayOffset: number): ReceptionRecord {
  // Construit une date à midi local (12:00) → toISOString() slice(0,10) renvoie le bon
  // jour calendaire quel que soit le décalage horaire (cf. production : parseX3Date
  // renvoie un Date en local).
  const d = new Date()
  d.setHours(12, 0, 0, 0)
  d.setDate(d.getDate() + dayOffset)
  return { id, article, supplier, quantity: qty, date: d }
}

function buildResult(ofs: OrderImpactResult['ofs'], orders: OrderImpactResult['orders'] = []): OrderImpactResult {
  return {
    orders,
    ofs,
    window: { from: '2026-01-01', to: '2026-12-31' },
    stats: { nbCommandes: 0, nbOnTime: 0, nbRetard: 0, nbBloquees: 0, nbSansCouverture: 0 },
  }
}

test.group('buildShortageRows', () => {
  test('une ligne par couple (composant × OF bloqué) avec rollup commande', ({ assert }) => {
    const result = buildResult(
      [{ numOf: 'OF-A', article: 'PF1', feasible: false, statutNum: 3, missingComponents: { C1: 10, C2: 5 } }],
      [{
        numCommande: 'CMD-1', client: 'ACME', article: 'PF1', description: 'desc',
        qteRestante: 100, dateExpedition: '2026-07-01', dejaEnRetard: false,
        nature: 'commande', typeCommande: 'NOR', matchingMethod: 'of', reliquat: 0,
        statut: 'bloquee', joursRetard: 0,
        ofs: [{ numOf: 'OF-A', article: 'PF1', qteAllouee: 100, dateFin: '2026-06-30', feasible: false, missingComponents: { C1: 10, C2: 5 }, modified: false, statutNum: 3 }],
      }],
    )
    const rows = buildShortageRows(result, new Map(), new Map([
      ['C1', article('C1', 'Composant 1')],
      ['C2', article('C2', 'Composant 2')],
      ['PF1', article('PF1', 'Produit fini 1')],
    ])).rows

    assert.equal(rows.length, 2)
    assert.deepEqual(rows.map((r) => r.component).sort(), ['C1', 'C2'])
    for (const r of rows) {
      assert.equal(r.numOf, 'OF-A')
      assert.equal(r.articleParent, 'PF1')
      assert.equal(r.numCommande, 'CMD-1')
      assert.equal(r.client, 'ACME')
      assert.equal(r.dateExpedition, '2026-07-01')
      assert.equal(r.reception, null)
      assert.equal(r.verdict, 'sans_couverture')
    }
  })

  test('verdict "retard" si OF rattaché à une commande avec joursRetard > 0', ({ assert }) => {
    const result = buildResult(
      [{ numOf: 'OF-A', article: 'PF1', feasible: false, statutNum: 3, missingComponents: { C1: 10 } }],
      [{
        numCommande: 'CMD-1', client: 'ACME', article: 'PF1', description: '',
        qteRestante: 100, dateExpedition: '2026-07-01', dejaEnRetard: false,
        nature: 'commande', typeCommande: 'NOR', matchingMethod: 'of', reliquat: 0,
        statut: 'bloquee', joursRetard: 3,
        ofs: [{ numOf: 'OF-A', article: 'PF1', qteAllouee: 100, dateFin: '2026-07-04', feasible: false, missingComponents: { C1: 10 }, modified: false, statutNum: 3 }],
      }],
    )
    const receptions = new Map([['C1', [reception('PO-1', 'C1', 'FournisseurX', 10, 1)]]])
    const rows = buildShortageRows(result, receptions, new Map([['C1', article('C1', 'C1')]])).rows

    assert.equal(rows.length, 1)
    assert.equal(rows[0].verdict, 'retard')
    assert.equal(rows[0].joursRetard, 3)
    assert.equal(rows[0].couverte, true)
    // On recrée la date d'arrivée attendue en local, à partir d'une "reception()" équivalente.
    const rec = reception('PO-X', 'C1', 'F', 10, 1)
    const expectedIso = `${rec.date.getFullYear()}-${String(rec.date.getMonth() + 1).padStart(2, '0')}-${String(rec.date.getDate()).padStart(2, '0')}`
    assert.equal(rows[0].reception?.dateArrivee, expectedIso)
  })

  test('verdict "couvert" si réception disponible et pas de retard sur commande', ({ assert }) => {
    const result = buildResult(
      [{ numOf: 'OF-A', article: 'PF1', feasible: false, statutNum: 3, missingComponents: { C1: 10 } }],
      [{
        numCommande: 'CMD-1', client: 'ACME', article: 'PF1', description: '',
        qteRestante: 100, dateExpedition: '2026-07-01', dejaEnRetard: false,
        nature: 'commande', typeCommande: 'NOR', matchingMethod: 'of', reliquat: 0,
        statut: 'bloquee', joursRetard: 0,
        ofs: [{ numOf: 'OF-A', article: 'PF1', qteAllouee: 100, dateFin: '2026-06-30', feasible: false, missingComponents: { C1: 10 }, modified: false, statutNum: 3 }],
      }],
    )
    const rows = buildShortageRows(result, new Map([['C1', [reception('PO-1', 'C1', 'FX', 10, 2)]]]), new Map()).rows
    assert.equal(rows[0].verdict, 'couvert')
    assert.equal(rows[0].couverte, true)
  })

  test('verdict "sans_couverture" si pas de réception pour le composant', ({ assert }) => {
    const result = buildResult(
      [{ numOf: 'OF-A', article: 'PF1', feasible: false, statutNum: 3, missingComponents: { C1: 10 } }],
      [],
    )
    const rows = buildShortageRows(result, new Map(), new Map()).rows
    assert.equal(rows[0].verdict, 'sans_couverture')
    assert.equal(rows[0].reception, null)
  })

  test('OF bloqué sans commande rattachée → numCommande = null', ({ assert }) => {
    const result = buildResult(
      [{ numOf: 'OF-B', article: 'PF2', feasible: false, statutNum: 3, missingComponents: { CX: 4 } }],
      [], // aucune commande
    )
    const rows = buildShortageRows(result, new Map(), new Map()).rows
    assert.equal(rows.length, 1)
    assert.equal(rows[0].numCommande, null)
    assert.equal(rows[0].client, null)
    assert.equal(rows[0].statutCommande, null)
  })

  test('OF non bloqué (feasible !== false) n\'apparaît pas', ({ assert }) => {
    const result = buildResult([
      { numOf: 'OF-A', article: 'PF1', feasible: true, statutNum: 3, missingComponents: {} },
      { numOf: 'OF-B', article: 'PF1', feasible: null, statutNum: 3, missingComponents: {} },
    ], [])
    const rows = buildShortageRows(result, new Map(), new Map()).rows
    assert.equal(rows.length, 0)
  })

  test('tri par date d\'expédition asc, nulls en fin, puis commande, puis composant', ({ assert }) => {
    const ofs: OrderImpactResult['ofs'] = [
      { numOf: 'OF-X', article: 'PF1', feasible: false, statutNum: 3, missingComponents: { C1: 1 } },
      { numOf: 'OF-Y', article: 'PF1', feasible: false, statutNum: 3, missingComponents: { C1: 1, C2: 1 } },
    ]
    const orders: OrderImpactResult['orders'] = [
      {
        numCommande: 'CMD-Y', client: 'B', article: 'PF1', description: '',
        qteRestante: 100, dateExpedition: '2026-08-01', dejaEnRetard: false,
        nature: 'commande', typeCommande: 'NOR', matchingMethod: 'of', reliquat: 0,
        statut: 'bloquee', joursRetard: 0,
        ofs: [{ numOf: 'OF-Y', article: 'PF1', qteAllouee: 100, dateFin: '2026-08-01', feasible: false, missingComponents: { C1: 1, C2: 1 }, modified: false, statutNum: 3 }],
      },
      {
        numCommande: 'CMD-X', client: 'A', article: 'PF1', description: '',
        qteRestante: 100, dateExpedition: '2026-07-01', dejaEnRetard: false,
        nature: 'commande', typeCommande: 'NOR', matchingMethod: 'of', reliquat: 0,
        statut: 'bloquee', joursRetard: 0,
        ofs: [{ numOf: 'OF-X', article: 'PF1', qteAllouee: 100, dateFin: '2026-07-01', feasible: false, missingComponents: { C1: 1 }, modified: false, statutNum: 3 }],
      },
    ]
    const rows = buildShortageRows(buildResult(ofs, orders), new Map(), new Map()).rows
    // OF-Y/CMD-Y (2026-08-01) avant OF-X/CMD-X (2026-07-01) ? non — 2026-07-01 d'abord.
    assert.equal(rows[0].numCommande, 'CMD-X')
    assert.equal(rows[0].component, 'C1')
    assert.equal(rows[1].numCommande, 'CMD-Y')
    // C1 avant C2
    assert.equal(rows[1].component, 'C1')
    assert.equal(rows[2].component, 'C2')
  })

  test('qteManquante ≤ 0 filtrée', ({ assert }) => {
    const result = buildResult(
      [{ numOf: 'OF-A', article: 'PF1', feasible: false, statutNum: 3, missingComponents: { C1: 0, C2: -3 } }],
      [],
    )
    const rows = buildShortageRows(result, new Map(), new Map()).rows
    assert.equal(rows.length, 0)
  })

  test('stats: nbRuptures, nbCouvertes, nbSansCouverture', ({ assert }) => {
    const result = buildResult(
      [
        { numOf: 'OF-A', article: 'PF1', feasible: false, statutNum: 3, missingComponents: { C1: 10, C2: 5 } },
        { numOf: 'OF-B', article: 'PF1', feasible: false, statutNum: 3, missingComponents: { C3: 4 } },
      ],
      [],
    )
    const receptions = new Map<string, ReceptionRecord[]>([
      // C1 couvert, C2 sans couverture, C3 sans couverture
      ['C1', [reception('PO-1', 'C1', 'F', 10, 5)]],
    ])
    const { stats } = buildShortageRows(result, receptions, new Map())
    assert.equal(stats.nbRuptures, 3)
    assert.equal(stats.nbCouvertes, 1)
    assert.equal(stats.nbSansCouverture, 2)
  })
})

test.group('resolveCoveringReception', () => {
  test('retourne null si aucune réception', ({ assert }) => {
    assert.isNull(resolveCoveringReception([], 10))
  })

  test('retourne null si le cumul est insuffisant', ({ assert }) => {
    const recs = [reception('PO-1', 'C1', 'F', 5, 1), reception('PO-2', 'C1', 'F', 3, 2)]
    assert.isNull(resolveCoveringReception(recs, 10))
  })

  test('cumul multi-réceptions : date déterminante = celle qui couvre', ({ assert }) => {
    const recs = [reception('PO-1', 'C1', 'F', 5, 1), reception('PO-2', 'C1', 'F', 6, 2)]
    const r = resolveCoveringReception(recs, 10)
    assert.isNotNull(r)
    assert.equal(r!.id, 'PO-2')
    assert.equal(r!.qteCumulee, 11)
  })

  test('première réception couvre seule → déterminante = la première', ({ assert }) => {
    const recs = [reception('PO-1', 'C1', 'F', 20, 3)]
    const r = resolveCoveringReception(recs, 10)
    assert.equal(r!.id, 'PO-1')
    assert.equal(r!.qteCumulee, 20)
  })

  test('tri par date croissante (ordre d\'entrée inversé)', ({ assert }) => {
    const recs = [reception('PO-late', 'C1', 'F', 10, 5), reception('PO-early', 'C1', 'F', 2, 1), reception('PO-mid', 'C1', 'F', 5, 3)]
    const r = resolveCoveringReception(recs, 6)
    // early (2) + mid (5) = 7 >= 6 → déterminante = mid
    assert.equal(r!.id, 'PO-mid')
    assert.equal(r!.qteCumulee, 7)
  })
})
