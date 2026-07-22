import { test } from '@japa/runner'
import { buildProactiveDisplay } from '#controllers/suivi_controller'
import type { OrderImpactResult } from '#app/domain/order-impacts'

/**
 * Tests de la projection buildProactiveDisplay (vue proactive).
 *
 * NB : le nettoyage de la demande par l'allocation ERP (qteAllouee) se fait côté loader
 * (loadOrderImpacts, gated preferEngineFeasibility) — donc OrderImpactResult reçu ici a
 * déjà sa demande nette. Ces tests valident la projection (statut→verdict, goulots agrégés),
 * pas le netting (validé via X3 sur 11033025/AR2602608).
 */
function result(overrides: Partial<OrderImpactResult['orders'][number]>): OrderImpactResult {
  const futureDate = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10)
  const base: OrderImpactResult['orders'][number] = {
    numCommande: 'AR2602608',
    client: 'CLIENT',
    article: '11033025',
    description: 'PF',
    qteRestante: 28,
    qteAllouee: 28,
    dateExpedition: '2026-06-23',
    dejaEnRetard: false,
    nature: 'commande',
    typeCommande: 'NOR',
    matchingMethod: 'mts_hard_pegging',
    reliquat: 0,
    statut: 'on_time',
    joursRetard: 0,
    ofs: [
      {
        numOf: 'F426-33313',
        article: '11033025',
        qteAllouee: 28,
        dateFin: futureDate,
        feasible: true,
        missingComponents: {},
        modified: false,
        statutNum: 1,
      },
    ],
  }
  return {
    orders: [{ ...base, ...overrides }],
    ofs: [],
    window: { from: '2026-06-19', to: '2026-09-19' },
    stats: { nbCommandes: 1, nbOnTime: 1, nbRetard: 0, nbBloquees: 0, nbSansCouverture: 0 },
  }
}

test.group('buildProactiveDisplay — projection du verdict', () => {
  test('statut on_time → verdict « À temps »', ({ assert }) => {
    const { rows, verdictCounts } = buildProactiveDisplay(result({ statut: 'on_time' }))
    assert.equal(rows[0].verdictKey, 'time')
    assert.equal(rows[0].verdictLabel, 'À temps')
    assert.deepEqual(rows[0].composants, [])
    assert.equal(verdictCounts.time, 1)
  })

  test('statut bloquee → « Bloquée » + goulots agrégés', ({ assert }) => {
    const { rows } = buildProactiveDisplay(
      result({
        statut: 'bloquee',
        ofs: [
          {
            numOf: 'OF1',
            article: '11033025',
            qteAllouee: 28,
            dateFin: '2026-06-22',
            feasible: false,
            missingComponents: { C1: 10, C2: 5 },
            modified: false,
            statutNum: 2,
          },
        ],
      })
    )
    assert.equal(rows[0].verdictKey, 'blocked')
    assert.equal(rows[0].verdictLabel, 'Bloquée')
    assert.equal(rows[0].composants.length, 2)
    assert.equal(rows[0].ofs[0].missingComponents.length, 2)
  })

  test('statut sans_couverture → « Sans couverture »', ({ assert }) => {
    const { rows, verdictCounts } = buildProactiveDisplay(
      result({ statut: 'sans_couverture', reliquat: 28, ofs: [] })
    )
    assert.equal(rows[0].verdictKey, 'uncov')
    assert.equal(rows[0].verdictLabel, 'Sans couverture')
    assert.equal(verdictCounts.uncov, 1)
  })

  test('goulot enrichi de sa réception couvrante (lentille appro)', ({ assert }) => {
    const blocked = result({
      statut: 'bloquee',
      ofs: [
        {
          numOf: 'OF1',
          article: '11033025',
          qteAllouee: 28,
          dateFin: '2026-06-22',
          feasible: false,
          missingComponents: { C1: 10 },
          modified: false,
          statutNum: 2,
        },
      ],
    })
    // Réception couvrant les 10 manquants (cumul 12 ≥ 10) → ETA + n° commande d'achat.
    const receptions = new Map([
      [
        'C1',
        [
          {
            id: 'PO123',
            article: 'C1',
            supplier: 'ACME',
            quantity: 12,
            date: new Date('2026-06-25T00:00:00Z'),
          },
        ],
      ],
    ])
    const { rows } = buildProactiveDisplay(blocked, new Map(), receptions)
    assert.equal(rows[0].composants[0].art, 'C1')
    assert.equal(rows[0].composants[0].reception?.po, 'PO123')
    assert.equal(rows[0].composants[0].reception?.supplier, 'ACME')
    assert.isString(rows[0].composants[0].reception?.eta)
  })

  test('goulot sans réception → reception null', ({ assert }) => {
    const blocked = result({
      statut: 'bloquee',
      ofs: [
        {
          numOf: 'OF1',
          article: '11033025',
          qteAllouee: 28,
          dateFin: '2026-06-22',
          feasible: false,
          missingComponents: { C1: 10 },
          modified: false,
          statutNum: 2,
        },
      ],
    })
    const { rows } = buildProactiveDisplay(blocked) // pas de receptionsByArticle
    assert.isNull(rows[0].composants[0].reception)
  })
})

// ---------------------------------------------------------------------------
// Descente BOM d'un SE manquant (lentille d'explication, photo stock strict) :
// 'se_a_lancer' si les composants internes sont dispo, 'bloque' + feuilles sinon.
// ---------------------------------------------------------------------------

test.group('buildProactiveDisplay — descente SE', () => {
  const seFixtures = (leafStock: number) => {
    const nomenclatures = new Map([
      [
        'SE1',
        {
          article: 'SE1',
          description: 'SOUS-ENSEMBLE',
          components: [
            {
              parentArticle: 'SE1',
              parentDescription: '',
              level: 5,
              componentArticle: 'E1',
              componentDescription: 'FEUILLE',
              linkQuantity: 1,
              componentType: 'ACHETE' as const,
              consumptionNature: 'PROPORTIONNEL' as const,
            },
          ],
        },
      ],
    ])
    const supplyFlows =
      leafStock > 0
        ? [
            {
              article: 'E1',
              quantity: leafStock,
              direction: 'supply' as const,
              date: null,
              origin: { type: 'stock' as const, pmp: null },
            },
          ]
        : []
    const articles = new Map([
      [
        'SE1',
        {
          code: 'SE1',
          description: 'SOUS-ENSEMBLE',
          category: 'SFA',
          supplyType: 'FABRICATION' as const,
          reorderDelay: 0,
          productFamily: null,
          pmp: null,
          economicLot: null,
          unitStock: null,
          unitPurchase: null,
          purchaseToStockRatio: 1,
          packagings: [],
        },
      ],
      [
        'E1',
        {
          code: 'E1',
          description: 'FEUILLE',
          category: 'AP',
          supplyType: 'ACHAT' as const,
          reorderDelay: 0,
          productFamily: null,
          pmp: null,
          economicLot: null,
          unitStock: null,
          unitPurchase: null,
          purchaseToStockRatio: 1,
          packagings: [],
        },
      ],
    ])
    return { nomenclatures, supplyFlows, articles }
  }

  const blockedResult = () =>
    result({
      statut: 'bloquee',
      ofs: [
        {
          numOf: 'F426-1',
          article: '11033025',
          qteAllouee: 28,
          dateFin: '2026-06-22',
          feasible: false,
          missingComponents: { SE1: 10 },
          modified: false,
          statutNum: 2,
        },
      ],
    })

  test('composants internes dispo → se_a_lancer', ({ assert }) => {
    const { nomenclatures, supplyFlows, articles } = seFixtures(50)
    const { rows } = buildProactiveDisplay(blockedResult(), articles, new Map(), new Map(), {
      nomenclatures,
      supplyFlows,
    })
    assert.equal(rows[0].composants[0].art, 'SE1')
    assert.equal(rows[0].composants[0].descente?.statut, 'se_a_lancer')
  })

  test('feuille manquante → bloque + composant interne avec manque', ({ assert }) => {
    const { nomenclatures, supplyFlows, articles } = seFixtures(4)
    const { rows } = buildProactiveDisplay(blockedResult(), articles, new Map(), new Map(), {
      nomenclatures,
      supplyFlows,
    })
    const d = rows[0].composants[0].descente
    assert.equal(d?.statut, 'bloque')
    assert.equal(d?.par[0].art, 'E1')
    assert.equal(d?.par[0].manque, 6)
  })

  test('composant acheté (pas de BOM) → descente null', ({ assert }) => {
    const { nomenclatures, supplyFlows, articles } = seFixtures(50)
    const res = result({
      statut: 'bloquee',
      ofs: [
        {
          numOf: 'F426-1',
          article: '11033025',
          qteAllouee: 28,
          dateFin: '2026-06-22',
          feasible: false,
          missingComponents: { E1: 10 },
          modified: false,
          statutNum: 2,
        },
      ],
    })
    const { rows } = buildProactiveDisplay(res, articles, new Map(), new Map(), {
      nomenclatures,
      supplyFlows,
    })
    assert.isNull(rows[0].composants[0].descente)
  })

  test('sans bomContext → descente null (compat)', ({ assert }) => {
    const { rows } = buildProactiveDisplay(blockedResult())
    assert.isNull(rows[0].composants[0].descente)
  })
})

test.group('buildProactiveDisplay — rattachement poste de charge', () => {
  test('propage code + libellé du poste de gamme dans la ligne et le filtre', ({ assert }) => {
    const { rows } = buildProactiveDisplay(
      result({ statut: 'on_time' }),
      new Map(),
      new Map(),
      new Map([
        ['11033025', { code: 'M1', label: 'Montage 1', poste: 'PP_830', posteLabel: 'Presse 830' }],
      ])
    )
    assert.equal(rows[0].poste, 'PP_830')
    assert.equal(rows[0].posteLabel, 'Presse 830')
    assert.include(rows[0].filter, 'pp_830')
  })

  test("poste vide si l'article est hors référentiel gamme", ({ assert }) => {
    const { rows } = buildProactiveDisplay(result({ statut: 'on_time' }))
    assert.equal(rows[0].poste, '')
    assert.equal(rows[0].posteLabel, '')
  })
})
