import { test } from '@japa/runner'
import type { Flow } from '#app/domain/models/flow'
import type { Article } from '#app/domain/models/article'
import type { Nomenclature } from '#app/domain/models/nomenclature'
import type { OfOverride } from '#app/domain/planning_board'
import { evaluateOrderImpacts, netDemandsByAllocation } from '#app/domain/order-impacts'

const TODAY = new Date()
TODAY.setHours(0, 0, 0, 0)

function daysFromNow(n: number): Date {
  const d = new Date(TODAY)
  d.setDate(d.getDate() + n)
  return d
}

function isoDaysFromNow(n: number): string {
  return daysFromNow(n).toISOString().slice(0, 10)
}

function makeOfFlow(
  id: string,
  article: string,
  status: number,
  quantity: number,
  date: Date
): Flow {
  return {
    article,
    quantity,
    direction: 'supply',
    date,
    origin: { type: 'of', id, status, designation: '', typeOfLabel: '', statutLabel: '' } as any,
  }
}

function makeStockFlow(article: string, quantity: number): Flow {
  return {
    article,
    quantity,
    direction: 'supply',
    date: null,
    origin: { type: 'stock', pmp: null },
  }
}

function makeDemand(
  id: string,
  article: string,
  quantity: number,
  date: Date,
  orderType: string = 'NOR',
  client: string = 'ACME'
): Flow {
  return {
    article,
    quantity,
    direction: 'demand',
    date,
    origin: { type: 'order', id, orderType, client, description: '' } as any,
  }
}

function makeArticle(code: string, supplyType: 'ACHAT' | 'FABRICATION' = 'FABRICATION'): Article {
  return {
    code,
    description: `Desc ${code}`,
    category: 'PF3',
    supplyType,
    reorderDelay: 0,
    productFamily: null,
    pmp: null,
    economicLot: null,
    unitStock: null,
    unitPurchase: null,
    purchaseToStockRatio: 1,
    packagings: [],
  }
}

test.group('evaluateOrderImpacts', () => {
  test('on_time when OF covers demand before due date', ({ assert }) => {
    const supplyFlows: Flow[] = [makeOfFlow('OF-A', 'PF1', 3, 60, daysFromNow(8))]
    const demands: Flow[] = [makeDemand('CMD-1', 'PF1', 60, daysFromNow(10))]
    const nomenclatures = new Map<string, Nomenclature>()
    const articles = new Map([['PF1', makeArticle('PF1')]])
    const overrides = new Map<string, OfOverride>()

    const result = evaluateOrderImpacts(demands, supplyFlows, nomenclatures, articles, overrides, {
      from: daysFromNow(-7),
      to: daysFromNow(42),
    })

    assert.equal(result.stats.nbCommandes, 1)
    assert.equal(result.orders[0].statut, 'on_time')
    assert.equal(result.orders[0].ofs[0].numOf, 'OF-A')
    assert.equal(result.orders[0].joursRetard, 0)
  })

  test('retard when OF date is after demand date', ({ assert }) => {
    const supplyFlows: Flow[] = [makeOfFlow('OF-A', 'PF1', 3, 60, daysFromNow(20))]
    const demands: Flow[] = [makeDemand('CMD-1', 'PF1', 60, daysFromNow(10))]
    const nomenclatures = new Map<string, Nomenclature>()
    const articles = new Map([['PF1', makeArticle('PF1')]])
    const overrides = new Map<string, OfOverride>()

    const result = evaluateOrderImpacts(demands, supplyFlows, nomenclatures, articles, overrides, {
      from: daysFromNow(-7),
      to: daysFromNow(42),
    })

    assert.equal(result.orders[0].statut, 'retard')
    // Buffer J-2 (issue #41) : retard = (fin OF) - (expé - 2j) = 20 - 8 = 12
    assert.equal(result.orders[0].joursRetard, 12)
  })

  test('fabricationDaysByOf : la charge réelle prime sur le jalonnement CBN (ENDDAT) quand fournie', ({
    assert,
  }) => {
    const nomenclatures = new Map<string, Nomenclature>()
    const articles = new Map([['PF1', makeArticle('PF1')]])
    const overrides = new Map<string, OfOverride>()
    const window = { from: daysFromNow(-7), to: daysFromNow(42) }

    // ENDDAT très tardif (J+20), demande à J+10 → 'retard' en repli (comme le test précédent,
    // sans fabricationDaysByOf). Avec une charge réelle minuscule (1j), le CBN ment : la
    // fabrication tient largement dans le délai → verdict corrigé en on_time.
    const lateEnddat: Flow[] = [makeOfFlow('OF-A', 'PF1', 1, 60, daysFromNow(20))]
    const demand: Flow[] = [makeDemand('CMD-1', 'PF1', 60, daysFromNow(10))]
    const lightCharge = evaluateOrderImpacts(
      demand,
      lateEnddat,
      nomenclatures,
      articles,
      overrides,
      window,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      new Map([['OF-A', 1]])
    )
    assert.equal(lightCharge.orders[0].statut, 'on_time')
    assert.equal(lightCharge.orders[0].joursRetard, 0)

    // ENDDAT confortable (J+3, avant même le buffer) mais charge réelle énorme (15j) : le CBN
    // ment dans l'autre sens — la fab ne peut pas tenir → verdict corrigé en retard.
    const earlyEnddat: Flow[] = [makeOfFlow('OF-B', 'PF1', 1, 60, daysFromNow(3))]
    const heavyCharge = evaluateOrderImpacts(
      demand,
      earlyEnddat,
      nomenclatures,
      articles,
      overrides,
      window,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      new Map([['OF-B', 15]])
    )
    assert.equal(heavyCharge.orders[0].statut, 'retard')
    // requiredStart = expedBornee(J8) - 15j = J-7 ; aujourd'hui = J0 → retard = 7
    assert.equal(heavyCharge.orders[0].joursRetard, 7)
  })

  test('bloquee when OF component has no stock', ({ assert }) => {
    const supplyFlows: Flow[] = [
      makeOfFlow('OF-A', 'PF1', 3, 60, daysFromNow(8)),
      makeStockFlow('C1', 10), // not enough for BOM requirement
    ]
    const demands: Flow[] = [makeDemand('CMD-1', 'PF1', 60, daysFromNow(10))]
    const nomenclatures = new Map<string, Nomenclature>([
      [
        'PF1',
        {
          article: 'PF1',
          description: '',
          components: [
            {
              parentArticle: 'PF1',
              parentDescription: '',
              level: 5,
              componentArticle: 'C1',
              componentDescription: '',
              linkQuantity: 1,
              componentType: 'ACHETE',
              consumptionNature: 'PROPORTIONNEL',
            },
          ],
        },
      ],
    ])
    const articles = new Map([
      ['PF1', makeArticle('PF1')],
      ['C1', makeArticle('C1', 'ACHAT')],
    ])
    const overrides = new Map<string, OfOverride>()

    const result = evaluateOrderImpacts(demands, supplyFlows, nomenclatures, articles, overrides, {
      from: daysFromNow(-7),
      to: daysFromNow(42),
    })

    assert.equal(result.orders[0].statut, 'bloquee')
    assert.equal(result.orders[0].ofs[0].feasible, false)
  })

  test('stock when demand covered entirely by stock', ({ assert }) => {
    const supplyFlows: Flow[] = [
      makeOfFlow('OF-A', 'PF1', 3, 60, daysFromNow(8)),
      makeStockFlow('PF1', 100),
    ]
    const demands: Flow[] = [makeDemand('CMD-1', 'PF1', 60, daysFromNow(10))]
    const nomenclatures = new Map<string, Nomenclature>()
    const articles = new Map([['PF1', makeArticle('PF1')]])
    const overrides = new Map<string, OfOverride>()

    const result = evaluateOrderImpacts(demands, supplyFlows, nomenclatures, articles, overrides, {
      from: daysFromNow(-7),
      to: daysFromNow(42),
    })

    assert.equal(result.orders[0].statut, 'stock')
  })

  test('sans_couverture when no OF and no stock', ({ assert }) => {
    const supplyFlows: Flow[] = []
    const demands: Flow[] = [makeDemand('CMD-1', 'PF1', 60, daysFromNow(10))]
    const nomenclatures = new Map<string, Nomenclature>()
    const articles = new Map([['PF1', makeArticle('PF1')]])
    const overrides = new Map<string, OfOverride>()

    const result = evaluateOrderImpacts(demands, supplyFlows, nomenclatures, articles, overrides, {
      from: daysFromNow(-7),
      to: daysFromNow(42),
    })

    assert.equal(result.orders[0].statut, 'sans_couverture')
    assert.equal(result.orders[0].reliquat, 60)
  })

  test('override changes OF date and creates retard', ({ assert }) => {
    const supplyFlows: Flow[] = [makeOfFlow('OF-A', 'PF1', 3, 60, daysFromNow(8))]
    const demands: Flow[] = [makeDemand('CMD-1', 'PF1', 60, daysFromNow(10))]
    const nomenclatures = new Map<string, Nomenclature>()
    const articles = new Map([['PF1', makeArticle('PF1')]])
    const overrides = new Map<string, OfOverride>([
      [
        'OF-A',
        {
          numOf: 'OF-A',
          dateDebut: null,
          dateFin: isoDaysFromNow(20),
          status: null,
          workstation: null,
          note: null,
          updatedAt: '',
        },
      ],
    ])

    const result = evaluateOrderImpacts(demands, supplyFlows, nomenclatures, articles, overrides, {
      from: daysFromNow(-7),
      to: daysFromNow(42),
    })

    assert.equal(result.orders[0].statut, 'retard')
    // Buffer J-2 (issue #41) : retard mesuré depuis (expé - 2j)
    assert.isAtLeast(result.orders[0].joursRetard, 11)
    assert.isTrue(result.orders[0].ofs[0].modified)
  })

  test('stats counts are correct', ({ assert }) => {
    const supplyFlows: Flow[] = [
      makeOfFlow('OF-A', 'PF1', 1, 60, daysFromNow(5)),
      makeStockFlow('PF2', 100),
    ]
    const demands: Flow[] = [
      makeDemand('CMD-1', 'PF1', 60, daysFromNow(10)),
      makeDemand('CMD-2', 'PF2', 30, daysFromNow(10)),
      makeDemand('CMD-3', 'PF3', 50, daysFromNow(10)),
    ]
    const nomenclatures = new Map<string, Nomenclature>()
    const articles = new Map([
      ['PF1', makeArticle('PF1')],
      ['PF2', makeArticle('PF2')],
      ['PF3', makeArticle('PF3')],
    ])
    const overrides = new Map<string, OfOverride>()

    const result = evaluateOrderImpacts(demands, supplyFlows, nomenclatures, articles, overrides, {
      from: daysFromNow(-7),
      to: daysFromNow(42),
    })

    assert.equal(result.stats.nbCommandes, 3)
    assert.equal(result.stats.nbOnTime, 2) // PF1 (OF) + PF2 (stock)
    assert.equal(result.stats.nbSansCouverture, 1) // PF3
  })

  // Régression issue #11 : la faisabilité MFGMAT (matières réelles) surcharge le verdict
  // théorique du moteur. Le moteur (BOM théorique vide) verrait l'OF faisable, mais MFGMAT
  // signale un composant en rupture → le badge doit refléter MFGMAT (== détail OF).
  test('precomputed MFGMAT feasibility overrides theoretical engine (issue #11)', ({ assert }) => {
    const supplyFlows: Flow[] = [makeOfFlow('OF-A', 'PF1', 3, 60, daysFromNow(8))]
    const demands: Flow[] = [makeDemand('CMD-1', 'PF1', 60, daysFromNow(10))]
    // Pas de BOM théorique → le moteur seul dirait "faisable".
    const nomenclatures = new Map<string, Nomenclature>()
    const articles = new Map([['PF1', makeArticle('PF1')]])
    const overrides = new Map<string, OfOverride>()

    // Sans précalcul : faisable.
    const baseline = evaluateOrderImpacts(
      demands,
      supplyFlows,
      nomenclatures,
      articles,
      overrides,
      {
        from: daysFromNow(-7),
        to: daysFromNow(42),
      }
    )
    assert.notEqual(baseline.orders[0].statut, 'bloquee')

    // Avec verdict MFGMAT en rupture : surcharge → bloquée.
    const precomputed = new Map([
      ['OF-A', { feasible: false, missingComponents: { BDH2231AL: 40 } }],
    ])
    const result = evaluateOrderImpacts(
      demands,
      supplyFlows,
      nomenclatures,
      articles,
      overrides,
      {
        from: daysFromNow(-7),
        to: daysFromNow(42),
      },
      undefined,
      precomputed
    )

    assert.equal(result.orders[0].statut, 'bloquee')
    assert.equal(result.orders[0].ofs[0].feasible, false)
    assert.equal(result.orders[0].ofs[0].missingComponents['BDH2231AL'], 40)
    const ofEntry = result.ofs.find((o) => o.numOf === 'OF-A')
    assert.equal(ofEntry?.feasible, false)
  })

  // ── Buffer J-2 (issue #41, problème 1) ──────────────────────────────────

  test("buffer J-2 : OF finissant le jour J de l'expé → retard (pas on_time)", ({ assert }) => {
    const supplyFlows: Flow[] = [makeOfFlow('OF-A', 'PF1', 3, 60, daysFromNow(10))]
    const demands: Flow[] = [makeDemand('CMD-1', 'PF1', 60, daysFromNow(10))]
    const result = evaluateOrderImpacts(
      demands,
      supplyFlows,
      new Map(),
      new Map([['PF1', makeArticle('PF1')]]),
      new Map(),
      {
        from: daysFromNow(-7),
        to: daysFromNow(42),
      }
    )
    assert.equal(result.orders[0].statut, 'retard')
    assert.isAtLeast(result.orders[0].joursRetard, 2) // au moins le buffer
  })

  test('buffer J-2 : OF finissant J-2 → on_time (dans le buffer)', ({ assert }) => {
    const supplyFlows: Flow[] = [makeOfFlow('OF-A', 'PF1', 3, 60, daysFromNow(8))]
    const demands: Flow[] = [makeDemand('CMD-1', 'PF1', 60, daysFromNow(10))]
    const result = evaluateOrderImpacts(
      demands,
      supplyFlows,
      new Map(),
      new Map([['PF1', makeArticle('PF1')]]),
      new Map(),
      {
        from: daysFromNow(-7),
        to: daysFromNow(42),
      }
    )
    assert.equal(result.orders[0].statut, 'on_time')
  })

  test('buffer J-2 : commande en stock expédiant demain → stock (PAS retard)', ({ assert }) => {
    // Régression signalée par la revue Claude Opus : expedBornee ne doit pas
    // fuiter dans le fallback calendaire ni le gate de statut.
    const supplyFlows: Flow[] = [makeStockFlow('PF1', 100)]
    const demands: Flow[] = [makeDemand('CMD-1', 'PF1', 60, daysFromNow(1))]
    const result = evaluateOrderImpacts(
      demands,
      supplyFlows,
      new Map(),
      new Map([['PF1', makeArticle('PF1')]]),
      new Map(),
      {
        from: daysFromNow(-7),
        to: daysFromNow(42),
      }
    )
    assert.equal(result.orders[0].statut, 'stock')
    assert.equal(result.orders[0].joursRetard, 0)
  })

  test("buffer J-2 : commande en stock expédiant aujourd'hui → stock (PAS retard)", ({
    assert,
  }) => {
    const supplyFlows: Flow[] = [makeStockFlow('PF1', 100)]
    const demands: Flow[] = [makeDemand('CMD-1', 'PF1', 60, daysFromNow(0))]
    const result = evaluateOrderImpacts(
      demands,
      supplyFlows,
      new Map(),
      new Map([['PF1', makeArticle('PF1')]]),
      new Map(),
      {
        from: daysFromNow(-7),
        to: daysFromNow(42),
      }
    )
    assert.equal(result.orders[0].statut, 'stock')
  })

  // ── estDebuté (issue #41, problème 2) ───────────────────────────────────

  test('estDebuté propagé sur les OFs de commande et le tableau ofs', ({ assert }) => {
    const supplyFlows: Flow[] = [makeOfFlow('OF-A', 'PF1', 3, 60, daysFromNow(8))]
    const demands: Flow[] = [makeDemand('CMD-1', 'PF1', 60, daysFromNow(10))]
    const avancementByOf = new Map([['OF-A', { estDebuté: true }]])

    const result = evaluateOrderImpacts(
      demands,
      supplyFlows,
      new Map(),
      new Map([['PF1', makeArticle('PF1')]]),
      new Map(),
      { from: daysFromNow(-7), to: daysFromNow(42) },
      undefined,
      undefined,
      avancementByOf
    )

    assert.isTrue(result.orders[0].ofs[0].estDebuté)
    const ofEntry = result.ofs.find((o) => o.numOf === 'OF-A')
    assert.isTrue(ofEntry?.estDebuté)
  })

  test('estDebuté absent quand avancementByOf non fourni', ({ assert }) => {
    const supplyFlows: Flow[] = [makeOfFlow('OF-A', 'PF1', 3, 60, daysFromNow(8))]
    const demands: Flow[] = [makeDemand('CMD-1', 'PF1', 60, daysFromNow(10))]
    const result = evaluateOrderImpacts(
      demands,
      supplyFlows,
      new Map(),
      new Map([['PF1', makeArticle('PF1')]]),
      new Map(),
      { from: daysFromNow(-7), to: daysFromNow(42) }
    )
    assert.isUndefined(result.orders[0].ofs[0].estDebuté)
  })
})

test.group('netDemandsByAllocation', () => {
  const withAlloc = (flow: Flow, qteAllouee: number): Flow => ({
    ...flow,
    origin: { ...flow.origin, qteAllouee } as any,
  })

  test('commande entièrement allouée disparaît de la demande', ({ assert }) => {
    const demands = [withAlloc(makeDemand('AR2602595', 'AEA833XX', 104, daysFromNow(1)), 104)]
    assert.lengthOf(netDemandsByAllocation(demands), 0)
  })

  test('allocation partielle réduit la quantité à couvrir', ({ assert }) => {
    const demands = [withAlloc(makeDemand('AR2602608', '11033025', 56, daysFromNow(3)), 28)]
    const net = netDemandsByAllocation(demands)
    assert.lengthOf(net, 1)
    assert.equal(net[0].quantity, 28)
  })

  test('demande sans allocation inchangée', ({ assert }) => {
    const demands = [makeDemand('CMD-1', 'PF1', 60, daysFromNow(10))]
    const net = netDemandsByAllocation(demands)
    assert.lengthOf(net, 1)
    assert.equal(net[0].quantity, 60)
  })

  test('régression AR2602595 : commande allouée ne capture plus la suggestion d’un autre besoin', ({
    assert,
  }) => {
    // Suggestion CBN (statut 3) créée pour la demande future — infaisable (composant manquant).
    const suggestion = makeOfFlow('SGAE10649392338', 'AEA833XX', 3, 2880, daysFromNow(11))
    const demands = [withAlloc(makeDemand('AR2602595', 'AEA833XX', 104, daysFromNow(1)), 104)]
    const nomenclatures = new Map<string, Nomenclature>()
    const articles = new Map([['AEA833XX', makeArticle('AEA833XX')]])
    const overrides = new Map<string, OfOverride>()
    const precomputed = new Map([
      ['SGAE10649392338', { feasible: false, missingComponents: { COMP1: 500 } }],
    ])
    const window = { from: daysFromNow(-7), to: daysFromNow(42) }

    // Demande brute (comportement d'avant) : la commande accroche la suggestion → bloquée.
    const brute = evaluateOrderImpacts(
      demands,
      [suggestion],
      nomenclatures,
      articles,
      overrides,
      window,
      undefined,
      precomputed
    )
    assert.equal(brute.orders[0]?.statut, 'bloquee')

    // Demande nette (pipeline actuel) : plus de demande → suggestion orpheline, zéro commande impactée.
    const net = evaluateOrderImpacts(
      netDemandsByAllocation(demands),
      [suggestion],
      nomenclatures,
      articles,
      overrides,
      window,
      undefined,
      precomputed
    )
    assert.lengthOf(net.orders, 0)
  })

  test('MFGMAT credits own ALLQTY before sequential contention (firm OF not falsely blocked)', ({
    assert,
  }) => {
    // OF-B (suggéré, besoin plus tôt) consomme TOUT le stock théorique de C1 en premier
    // dans la contention. OF-A (ferme, besoin plus tard) a pourtant déjà 60 C1 alloués
    // (MFGMAT ALLQTY) pour son besoin de 60 (RETQTY-USEQTY) — reste net = 0, rien à
    // vérifier contre le stock partagé. Sans matières MFGMAT injectées, le moteur ne le
    // sait pas et redemande le besoin BOM théorique complet (60), que la contention a
    // déjà donné à OF-B → faux blocage sur un OF ferme déjà couvert (cf conversation
    // F426-39011 : X3 MFGMAT.SHTQTY_0 = 0, l'app affichait pourtant -17/-79).
    const supplyFlows: Flow[] = [
      makeStockFlow('C1', 60),
      makeOfFlow('OF-B', 'PF1', 3, 60, daysFromNow(5)),
      makeOfFlow('OF-A', 'PF1', 1, 60, daysFromNow(8)),
    ]
    const demands: Flow[] = [makeDemand('CMD-1', 'PF1', 60, daysFromNow(10))]
    const nomenclatures = new Map<string, Nomenclature>([
      [
        'PF1',
        {
          article: 'PF1',
          description: '',
          components: [
            {
              parentArticle: 'PF1',
              parentDescription: '',
              level: 5,
              componentArticle: 'C1',
              componentDescription: '',
              linkQuantity: 1,
              componentType: 'ACHETE',
              consumptionNature: 'PROPORTIONNEL',
            },
          ],
        },
      ],
    ])
    const articles = new Map([
      ['PF1', makeArticle('PF1')],
      ['C1', makeArticle('C1', 'ACHAT')],
    ])
    const overrides = new Map<string, OfOverride>()
    const window = { from: daysFromNow(-7), to: daysFromNow(42) }

    const withoutMfgmat = evaluateOrderImpacts(
      demands,
      supplyFlows,
      nomenclatures,
      articles,
      overrides,
      window,
      'sequential'
    )
    // Rule 3 (rupture-engine.ts) : OF ferme → `feasible` reste true quoi qu'il arrive (il est
    // lancé). Le faux signal remonte via `missingComponents` (colonne « Goulots » côté vue
    // proactive) : sans MFGMAT injecté, le moteur redemande le besoin BOM théorique déjà
    // consommé par OF-B dans la contention → C1 ressort manquant sur un OF pourtant couvert.
    const ofA = withoutMfgmat.orders[0].ofs.find((o) => o.numOf === 'OF-A')
    assert.isTrue(
      Object.keys(ofA?.missingComponents ?? {}).length > 0,
      'sans MFGMAT : OF-A affiche un composant manquant fantôme (contention théorique)'
    )

    const mfgMaterialsByOf = new Map([
      ['OF-A', [{ article: 'C1', remaining: 60, allocated: 60 }]],
    ])
    const withMfgmat = evaluateOrderImpacts(
      demands,
      supplyFlows,
      nomenclatures,
      articles,
      overrides,
      window,
      'sequential',
      undefined,
      undefined,
      undefined,
      mfgMaterialsByOf
    )
    const ofAFixed = withMfgmat.orders[0].ofs.find((o) => o.numOf === 'OF-A')
    assert.equal(ofAFixed?.feasible, true)
    assert.deepEqual(
      ofAFixed?.missingComponents,
      {},
      'ALLQTY déjà posée (net=0) doit effacer le composant fantôme'
    )
  })
})
