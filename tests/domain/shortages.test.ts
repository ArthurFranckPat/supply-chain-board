import { test } from '@japa/runner'
import type { Article } from '#app/domain/models/article'
import type { ReceptionRecord } from '#app/domain/recursive-checker'
import type { OrderImpactResult } from '#app/domain/order-impacts'
import { buildShortageRows, resolveCoveringReception, isoLocalDay } from '#app/domain/shortages'

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
    // Réception couvrante à J+2 ; expédition à J+5 → arrive à temps → couvert.
    const exp = new Date()
    exp.setHours(12, 0, 0, 0)
    exp.setDate(exp.getDate() + 5)
    const expIso = `${exp.getFullYear()}-${String(exp.getMonth() + 1).padStart(2, '0')}-${String(exp.getDate()).padStart(2, '0')}`
    const result = buildResult(
      [{ numOf: 'OF-A', article: 'PF1', feasible: false, statutNum: 3, missingComponents: { C1: 10 } }],
      [{
        numCommande: 'CMD-1', client: 'ACME', article: 'PF1', description: '',
        qteRestante: 100, dateExpedition: expIso, dejaEnRetard: false,
        nature: 'commande', typeCommande: 'NOR', matchingMethod: 'of', reliquat: 0,
        statut: 'bloquee', joursRetard: 0,
        ofs: [{ numOf: 'OF-A', article: 'PF1', qteAllouee: 100, dateFin: expIso, feasible: false, missingComponents: { C1: 10 }, modified: false, statutNum: 3 }],
      }],
    )
    const rows = buildShortageRows(result, new Map([['C1', [reception('PO-1', 'C1', 'FX', 10, 2)]]]), new Map()).rows
    assert.equal(rows[0].verdict, 'couvert')
    assert.equal(rows[0].couverte, true)
    assert.equal(rows[0].overdue, false)
  })

  test('verdict "retard" si la réception couvre mais arrive APRÈS la date d\'expédition', ({ assert }) => {
    // Expédition à J+2 ; réception couvrante à J+9 → arrive trop tard → retard de 7j.
    const exp = new Date()
    exp.setHours(12, 0, 0, 0)
    exp.setDate(exp.getDate() + 2)
    const expIso = `${exp.getFullYear()}-${String(exp.getMonth() + 1).padStart(2, '0')}-${String(exp.getDate()).padStart(2, '0')}`
    const result = buildResult(
      [{ numOf: 'OF-A', article: 'PF1', feasible: false, statutNum: 3, missingComponents: { C1: 10 } }],
      [{
        numCommande: 'CMD-1', client: 'ACME', article: 'PF1', description: '',
        qteRestante: 100, dateExpedition: expIso, dejaEnRetard: false,
        nature: 'commande', typeCommande: 'NOR', matchingMethod: 'of', reliquat: 0,
        statut: 'bloquee', joursRetard: 0, // pas de retard stock — le retard vient de la réception
        ofs: [{ numOf: 'OF-A', article: 'PF1', qteAllouee: 100, dateFin: expIso, feasible: false, missingComponents: { C1: 10 }, modified: false, statutNum: 3 }],
      }],
    )
    const rows = buildShortageRows(result, new Map([['C1', [reception('PO-1', 'C1', 'FX', 10, 9)]]]), new Map()).rows
    assert.equal(rows[0].verdict, 'retard')
    assert.equal(rows[0].couverte, true)
    assert.equal(rows[0].joursRetardReception, 7)
  })

  test('verdict "couvert" si la réception arrive AVANT la date d\'expédition (pas de retard réception)', ({ assert }) => {
    const exp = new Date()
    exp.setHours(12, 0, 0, 0)
    exp.setDate(exp.getDate() + 20)
    const expIso = `${exp.getFullYear()}-${String(exp.getMonth() + 1).padStart(2, '0')}-${String(exp.getDate()).padStart(2, '0')}`
    const result = buildResult(
      [{ numOf: 'OF-A', article: 'PF1', feasible: false, statutNum: 3, missingComponents: { C1: 10 } }],
      [{
        numCommande: 'CMD-1', client: 'ACME', article: 'PF1', description: '',
        qteRestante: 100, dateExpedition: expIso, dejaEnRetard: false,
        nature: 'commande', typeCommande: 'NOR', matchingMethod: 'of', reliquat: 0,
        statut: 'bloquee', joursRetard: 0,
        ofs: [{ numOf: 'OF-A', article: 'PF1', qteAllouee: 100, dateFin: expIso, feasible: false, missingComponents: { C1: 10 }, modified: false, statutNum: 3 }],
      }],
    )
    const rows = buildShortageRows(result, new Map([['C1', [reception('PO-1', 'C1', 'FX', 10, 3)]]]), new Map()).rows
    assert.equal(rows[0].verdict, 'couvert')
    assert.equal(rows[0].joursRetardReception, 0)
  })

  test('verdict "sans_couverture" si pas de réception pour le composant', ({ assert }) => {
    const result = buildResult(
      // OF affermi (statut 1) → reste visible même sans commande.
      [{ numOf: 'OF-A', article: 'PF1', feasible: false, statutNum: 1, missingComponents: { C1: 10 } }],
      [],
    )
    const rows = buildShortageRows(result, new Map(), new Map()).rows
    assert.equal(rows[0].verdict, 'sans_couverture')
    assert.equal(rows[0].reception, null)
  })

  test('fallback contremarque : OF non alloué par le matcher rattaché via ofPegs — régression AR2601963/F426-32355', ({ assert }) => {
    // OF bloqué, AUCUNE commande dans result.orders (commande hors fenêtre d'échéance).
    const result = buildResult(
      [{ numOf: 'F426-32355', article: '11035404', feasible: false, statutNum: 3, missingComponents: { CX: 4 } }],
      [], // matcher n'a rien alloué
    )
    const ofPegs = new Map([
      ['F426-32355', { numCommande: 'AR2601963', client: 'ACME', dateExpedition: '2026-08-15' }],
    ])
    const rows = buildShortageRows(result, new Map(), new Map(), ofPegs).rows
    assert.equal(rows.length, 1)
    assert.equal(rows[0].numCommande, 'AR2601963')
    assert.equal(rows[0].client, 'ACME')
    assert.equal(rows[0].dateExpedition, '2026-08-15')
    assert.isNull(rows[0].statutCommande) // pas de statut moteur pour un peg pur
  })

  test('rollup matcher prioritaire sur ofPegs quand les deux existent', ({ assert }) => {
    const result = buildResult(
      [{ numOf: 'OF-A', article: 'PF1', feasible: false, statutNum: 3, missingComponents: { C1: 10 } }],
      [{
        numCommande: 'CMD-MATCH', client: 'FromMatcher', article: 'PF1', description: '',
        qteRestante: 100, dateExpedition: '2026-07-01', dejaEnRetard: false,
        nature: 'commande', typeCommande: 'NOR', matchingMethod: 'of', reliquat: 0,
        statut: 'bloquee', joursRetard: 0,
        ofs: [{ numOf: 'OF-A', article: 'PF1', qteAllouee: 100, dateFin: '2026-06-30', feasible: false, missingComponents: { C1: 10 }, modified: false, statutNum: 3 }],
      }],
    )
    const ofPegs = new Map([['OF-A', { numCommande: 'CMD-PEG', client: 'FromPeg', dateExpedition: '2026-09-01' }]])
    const rows = buildShortageRows(result, new Map(), new Map(), ofPegs).rows
    assert.equal(rows[0].numCommande, 'CMD-MATCH')
    assert.equal(rows[0].client, 'FromMatcher')
  })

  test('OF bloqué sans commande rattachée → numCommande = null', ({ assert }) => {
    const result = buildResult(
      [{ numOf: 'OF-B', article: 'PF2', feasible: false, statutNum: 1, missingComponents: { CX: 4 } }],
      [], // aucune commande
    )
    const rows = buildShortageRows(result, new Map(), new Map()).rows
    assert.equal(rows.length, 1)
    assert.equal(rows[0].numCommande, null)
    assert.equal(rows[0].client, null)
    assert.equal(rows[0].statutCommande, null)
  })

  test('OF rattaché à une PRÉVISION → pas de commande (une prévision n\'est pas une rupture)', ({ assert }) => {
    const result = buildResult(
      // OF affermi (statut 1) couvrant une prévision → visible mais SANS commande.
      [{ numOf: 'OF-P', article: 'PF1', feasible: false, statutNum: 1, missingComponents: { C1: 5 } }],
      [{
        numCommande: 'PREV-1', client: '', article: 'PF1', description: '',
        qteRestante: 50, dateExpedition: '2026-07-01', dejaEnRetard: false,
        nature: 'prevision', typeCommande: 'NOR', matchingMethod: 'of', reliquat: 0,
        statut: 'bloquee', joursRetard: 0,
        ofs: [{ numOf: 'OF-P', article: 'PF1', qteAllouee: 50, dateFin: '2026-06-30', feasible: false, missingComponents: { C1: 5 }, modified: false, statutNum: 3 }],
      }],
    )
    const rows = buildShortageRows(result, new Map(), new Map()).rows
    assert.equal(rows.length, 1)
    assert.isNull(rows[0].numCommande)
    assert.isNull(rows[0].statutCommande)
  })

  test('suggestion (statut 3) sans commande exclue ; OF affermi (statut 1) sans commande conservé', ({ assert }) => {
    const result = buildResult(
      [
        { numOf: 'SGAE-1', article: 'PF1', feasible: false, statutNum: 3, missingComponents: { C1: 5 } },
        { numOf: 'OF-FERME', article: 'PF2', feasible: false, statutNum: 1, missingComponents: { C2: 5 } },
      ],
      [], // aucun rattachement commande
    )
    const rows = buildShortageRows(result, new Map(), new Map()).rows
    assert.equal(rows.length, 1)
    assert.equal(rows[0].numOf, 'OF-FERME')
  })

  test('suggestion (statut 3) AVEC commande reste visible', ({ assert }) => {
    const result = buildResult(
      [{ numOf: 'SGAE-2', article: 'PF1', feasible: false, statutNum: 3, missingComponents: { C1: 5 } }],
      [{
        numCommande: 'AR123', client: 'ACME', article: 'PF1', description: '',
        qteRestante: 50, dateExpedition: '2026-07-01', dejaEnRetard: false,
        nature: 'commande', typeCommande: 'NOR', matchingMethod: 'of', reliquat: 0,
        statut: 'bloquee', joursRetard: 0,
        ofs: [{ numOf: 'SGAE-2', article: 'PF1', qteAllouee: 50, dateFin: '2026-06-30', feasible: false, missingComponents: { C1: 5 }, modified: false, statutNum: 3 }],
      }],
    )
    const rows = buildShortageRows(result, new Map(), new Map()).rows
    assert.equal(rows.length, 1)
    assert.equal(rows[0].numCommande, 'AR123')
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
        { numOf: 'OF-A', article: 'PF1', feasible: false, statutNum: 1, missingComponents: { C1: 10, C2: 5 } },
        { numOf: 'OF-B', article: 'PF1', feasible: false, statutNum: 1, missingComponents: { C3: 4 } },
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

test.group('resolveCoveringReception — consommation séquentielle & plancher overdue', () => {
  test('alreadyConsumed décale le seuil et rend la qté cumulée NETTE', ({ assert }) => {
    const recs = [reception('PO-1', 'C1', 'F', 10, 1), reception('PO-2', 'C1', 'F', 10, 2)]
    // 1ère ligne (10) couverte par PO-1 ; 2e ligne (10) doit atteindre 20 → PO-2.
    const r = resolveCoveringReception(recs, 10, { alreadyConsumed: 10 })
    assert.equal(r!.id, 'PO-2')
    assert.equal(r!.qteCumulee, 10)
  })

  test('alreadyConsumed : cumul insuffisant au-delà de la part réservée → null', ({ assert }) => {
    const recs = [reception('PO-1', 'C1', 'F', 10, 1)]
    assert.isNull(resolveCoveringReception(recs, 5, { alreadyConsumed: 10 }))
  })

  test('overdueMinQty : une overdue sous le plancher est ignorée', ({ assert }) => {
    const recs = [reception('PO-ghost', 'C1', 'F', 2, -30)]
    assert.isNull(resolveCoveringReception(recs, 2, { overdueMinQty: 5 }))
  })

  test('overdueMinQty : une overdue AU-DESSUS du plancher compte', ({ assert }) => {
    const recs = [reception('PO-late', 'C1', 'F', 8, -10)]
    const r = resolveCoveringReception(recs, 5, { overdueMinQty: 5 })
    assert.equal(r!.id, 'PO-late')
  })

  test('overdueMinQty : les réceptions FUTURES comptent toujours, même petites', ({ assert }) => {
    const recs = [reception('PO-future', 'C1', 'F', 2, 3)]
    const r = resolveCoveringReception(recs, 2, { overdueMinQty: 5 })
    assert.equal(r!.id, 'PO-future')
  })
})

test.group('buildShortageRows — consommation séquentielle entre lignes', () => {
  const order = (num: string, dateExpedition: string, numOf: string): OrderImpactResult['orders'][number] => ({
    numCommande: num, client: 'ACME', article: 'PF1', description: '',
    qteRestante: 100, dateExpedition, dejaEnRetard: false,
    nature: 'commande', typeCommande: 'NOR', matchingMethod: 'of', reliquat: 0,
    statut: 'bloquee', joursRetard: 0,
    ofs: [{ numOf, article: 'PF1', qteAllouee: 100, dateFin: dateExpedition, feasible: false, missingComponents: { C1: 10 }, modified: false, statutNum: 1 }],
  })

  test('deux OF manquant le même composant ne partagent pas la même réception', ({ assert }) => {
    const result = buildResult(
      [
        { numOf: 'OF-A', article: 'PF1', feasible: false, statutNum: 1, missingComponents: { C1: 10 } },
        { numOf: 'OF-B', article: 'PF1', feasible: false, statutNum: 1, missingComponents: { C1: 10 } },
      ],
      [order('CMD-1', '2026-07-01', 'OF-A'), order('CMD-2', '2026-07-15', 'OF-B')],
    )
    // Une seule réception de 10 : couvre l'OF de la commande la plus urgente SEULEMENT.
    const receptions = new Map([['C1', [reception('PO-1', 'C1', 'F', 10, 2)]]])
    const { rows } = buildShortageRows(result, receptions, new Map())

    const rowA = rows.find((r) => r.numOf === 'OF-A')!
    const rowB = rows.find((r) => r.numOf === 'OF-B')!
    assert.equal(rowA.reception?.id, 'PO-1')
    assert.notEqual(rowA.verdict, 'sans_couverture')
    assert.isNull(rowB.reception)
    assert.equal(rowB.verdict, 'sans_couverture')
  })

  test('réception assez grande pour deux lignes → les deux couvertes, cumul net', ({ assert }) => {
    const result = buildResult(
      [
        { numOf: 'OF-A', article: 'PF1', feasible: false, statutNum: 1, missingComponents: { C1: 10 } },
        { numOf: 'OF-B', article: 'PF1', feasible: false, statutNum: 1, missingComponents: { C1: 10 } },
      ],
      [order('CMD-1', '2026-07-01', 'OF-A'), order('CMD-2', '2026-07-15', 'OF-B')],
    )
    const receptions = new Map([['C1', [reception('PO-1', 'C1', 'F', 25, 2)]]])
    const { rows } = buildShortageRows(result, receptions, new Map())

    const rowA = rows.find((r) => r.numOf === 'OF-A')!
    const rowB = rows.find((r) => r.numOf === 'OF-B')!
    assert.equal(rowA.reception?.id, 'PO-1')
    assert.equal(rowA.reception?.qteCumulee, 25)
    assert.equal(rowB.reception?.id, 'PO-1')
    assert.equal(rowB.reception?.qteCumulee, 15)
  })

  test('todayIso injectable : verdict overdue déterministe', ({ assert }) => {
    const result = buildResult(
      [{ numOf: 'OF-A', article: 'PF1', feasible: false, statutNum: 1, missingComponents: { C1: 5 } }],
      [order('CMD-1', '2026-07-01', 'OF-A')],
    )
    const receptions = new Map([['C1', [reception('PO-1', 'C1', 'F', 10, -5)]]])
    const { rows } = buildShortageRows(result, receptions, new Map(), new Map(), {
      todayIso: isoLocalDay(),
    })
    assert.isTrue(rows[0].overdue)
    assert.equal(rows[0].joursRetardReception, 5)
    assert.equal(rows[0].verdict, 'retard')
  })
})

test.group('buildShortageRows — OF multi-commandes', () => {
  test('la plus urgente porte la ligne, les autres dans autresCommandes', ({ assert }) => {
    const mkOrder = (num: string, dateExpedition: string): OrderImpactResult['orders'][number] => ({
      numCommande: num, client: `Client ${num}`, article: 'PF1', description: '',
      qteRestante: 50, dateExpedition, dejaEnRetard: false,
      nature: 'commande', typeCommande: 'NOR', matchingMethod: 'of', reliquat: 0,
      statut: 'bloquee', joursRetard: 0,
      ofs: [{ numOf: 'OF-A', article: 'PF1', qteAllouee: 50, dateFin: dateExpedition, feasible: false, missingComponents: { C1: 10 }, modified: false, statutNum: 1 }],
    })
    const result = buildResult(
      [{ numOf: 'OF-A', article: 'PF1', feasible: false, statutNum: 1, missingComponents: { C1: 10 } }],
      // Volontairement dans le désordre : la plus urgente (07-01) doit gagner.
      [mkOrder('CMD-TARD', '2026-07-20'), mkOrder('CMD-URGENTE', '2026-07-01'), mkOrder('CMD-MI', '2026-07-10')],
    )
    const { rows } = buildShortageRows(result, new Map(), new Map())

    assert.equal(rows.length, 1)
    assert.equal(rows[0].numCommande, 'CMD-URGENTE')
    assert.deepEqual(rows[0].autresCommandes, ['CMD-MI', 'CMD-TARD'])
  })

  test('OF mono-commande → autresCommandes vide', ({ assert }) => {
    const result = buildResult(
      [{ numOf: 'OF-A', article: 'PF1', feasible: false, statutNum: 1, missingComponents: { C1: 10 } }],
      [{
        numCommande: 'CMD-1', client: 'ACME', article: 'PF1', description: '',
        qteRestante: 50, dateExpedition: '2026-07-01', dejaEnRetard: false,
        nature: 'commande', typeCommande: 'NOR', matchingMethod: 'of', reliquat: 0,
        statut: 'bloquee', joursRetard: 0,
        ofs: [{ numOf: 'OF-A', article: 'PF1', qteAllouee: 50, dateFin: '2026-07-01', feasible: false, missingComponents: { C1: 10 }, modified: false, statutNum: 1 }],
      }],
    )
    const { rows } = buildShortageRows(result, new Map(), new Map())
    assert.deepEqual(rows[0].autresCommandes, [])
  })
})
