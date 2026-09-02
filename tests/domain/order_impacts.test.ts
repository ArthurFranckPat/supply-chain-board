import { test } from '@japa/runner'
import type { Flow } from '#app/domain/models/flow'
import type { Article } from '#app/domain/models/article'
import type { Nomenclature } from '#app/domain/models/nomenclature'
import type { OfOverride } from '#app/domain/planning_board'
import { evaluateOrderImpacts, netDemandsByAllocation } from '#app/domain/order_impacts'

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

    const mfgMaterialsByOf = new Map([['OF-A', [{ article: 'C1', remaining: 60, allocated: 60 }]]])
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

/**
 * Sous-ensembles couverts par production (issue #94).
 *
 * Cas réel prod, article EAR206PO / OF F126-48960 : le SE EH4276 a un stock net de 0
 * (PHYSTO 1259 entièrement GLOALL) et un besoin net de 1129, couvert par le seul OF
 * producteur non soldé (F126-49049, 1700). Le moteur le déclare disponible (règle
 * « dispo fabriqué = stock + OF producteurs ») — il n'apparaissait donc NULLE PART,
 * alors que la commande dépend entièrement du passage de cet OF.
 */
test.group('evaluateOrderImpacts — SE couverts par production (#94)', () => {
  const bomPfVersSe = (): Map<string, Nomenclature> =>
    new Map<string, Nomenclature>([
      [
        'PF1',
        {
          article: 'PF1',
          description: '',
          components: [
            {
              parentArticle: 'PF1',
              parentDescription: '',
              level: 1,
              componentArticle: 'SE1',
              componentDescription: '',
              linkQuantity: 1,
              componentType: 'FABRIQUE',
              consumptionNature: 'PROPORTIONNEL',
            },
          ],
        },
      ],
      [
        'SE1',
        {
          article: 'SE1',
          description: '',
          components: [
            {
              parentArticle: 'SE1',
              parentDescription: '',
              level: 2,
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

  const articles = () =>
    new Map([
      ['PF1', makeArticle('PF1')],
      ['SE1', makeArticle('SE1')],
      ['C1', makeArticle('C1', 'ACHAT')],
    ])

  const window = { from: daysFromNow(-7), to: daysFromNow(42) }

  test('SE sans stock mais couvert par un OF producteur → seComponents, PAS missingComponents', ({
    assert,
  }) => {
    const supplyFlows: Flow[] = [
      makeOfFlow('OF-PF', 'PF1', 1, 1129, daysFromNow(8)),
      // L'OF producteur du SE couvre le besoin (1700 ≥ 1129).
      makeOfFlow('OF-SE', 'SE1', 1, 1700, daysFromNow(6)),
      makeStockFlow('C1', 99999),
      // Stock SE volontairement absent → net 0, comme EH4276 en prod.
    ]
    const demands: Flow[] = [makeDemand('CMD-1', 'PF1', 1129, daysFromNow(10))]

    const result = evaluateOrderImpacts(
      demands,
      supplyFlows,
      bomPfVersSe(),
      articles(),
      new Map<string, OfOverride>(),
      window
    )

    const of = result.orders[0].ofs.find((o) => o.numOf === 'OF-PF')!
    assert.deepEqual(of.missingComponents, {}, 'le SE est couvert : aucun manque')
    assert.isTrue(of.feasible, 'verdict inchangé')
    assert.deepEqual(
      of.seComponents,
      { SE1: 1129 },
      'la dépendance à la production doit être exposée'
    )
  })

  test('SE réellement manquant (aucun OF producteur) → missingComponents, seComponents vide', ({
    assert,
  }) => {
    const supplyFlows: Flow[] = [
      makeOfFlow('OF-PF', 'PF1', 1, 1129, daysFromNow(8)),
      makeStockFlow('C1', 99999),
    ]
    const demands: Flow[] = [makeDemand('CMD-1', 'PF1', 1129, daysFromNow(10))]

    const result = evaluateOrderImpacts(
      demands,
      supplyFlows,
      bomPfVersSe(),
      articles(),
      new Map<string, OfOverride>(),
      window
    )

    const of = result.orders[0].ofs.find((o) => o.numOf === 'OF-PF')!
    assert.deepEqual(of.missingComponents, { SE1: 1129 }, 'vrai manque, pas une dépendance')
    assert.deepEqual(of.seComponents, {}, 'rien à créditer à la production')
  })

  test('SE couvert par du STOCK → ni manque ni dépendance', ({ assert }) => {
    const supplyFlows: Flow[] = [
      makeOfFlow('OF-PF', 'PF1', 1, 1129, daysFromNow(8)),
      makeStockFlow('SE1', 5000),
      makeStockFlow('C1', 99999),
    ]
    const demands: Flow[] = [makeDemand('CMD-1', 'PF1', 1129, daysFromNow(10))]

    const result = evaluateOrderImpacts(
      demands,
      supplyFlows,
      bomPfVersSe(),
      articles(),
      new Map<string, OfOverride>(),
      window
    )

    const of = result.orders[0].ofs.find((o) => o.numOf === 'OF-PF')!
    assert.deepEqual(of.missingComponents, {})
    assert.deepEqual(of.seComponents, {}, 'le stock physique suffit : aucune dépendance à un OF')
  })
})

/**
 * Décomposition du manque d'un SE entre stock sous contrôle qualité et production.
 *
 * Cas réel prod EBH1257AL / OF F426-42920 (2016 pcs) : le SE EH6139 a 2638 en statut A dont
 * 672 alloués (net strict 1966) + 15 en statut Q. Manque vs stock strict = 50, dont 15
 * couverts par le Q et 35 par le WOS SGAE10654257102. Les deux dépendances se traitent
 * différemment — l'une par le contrôle réception, l'autre par l'atelier — donc les deux
 * doivent remonter séparément.
 */
test.group('evaluateOrderImpacts — SE : part Q vs part production (#94)', () => {
  test('manque de 50 = 15 en statut Q + 35 par OF producteur', ({ assert }) => {
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
              level: 1,
              componentArticle: 'SE1',
              componentDescription: '',
              linkQuantity: 1,
              componentType: 'FABRIQUE',
              consumptionNature: 'PROPORTIONNEL',
            },
          ],
        },
      ],
    ])
    const articles = new Map([
      ['PF1', makeArticle('PF1')],
      ['SE1', makeArticle('SE1')],
    ])

    const qcStock: Flow = {
      article: 'SE1',
      quantity: 15,
      direction: 'supply',
      date: null,
      origin: { type: 'stock', subType: 'qc', pmp: null } as any,
    }

    const supplyFlows: Flow[] = [
      makeOfFlow('OF-PF', 'PF1', 1, 2016, daysFromNow(8)),
      makeOfFlow('WOS-102', 'SE1', 3, 35, daysFromNow(1)),
      makeStockFlow('SE1', 1966),
      qcStock,
    ]
    const demands: Flow[] = [makeDemand('CMD-1', 'PF1', 2016, daysFromNow(10))]

    const result = evaluateOrderImpacts(
      demands,
      supplyFlows,
      nomenclatures,
      articles,
      new Map<string, OfOverride>(),
      { from: daysFromNow(-7), to: daysFromNow(42) }
    )

    const of = result.orders[0].ofs.find((o) => o.numOf === 'OF-PF')!
    assert.deepEqual(of.missingComponents, {}, 'Q + production couvrent tout : aucun manque')
    assert.deepEqual(of.seComponents, { SE1: 35 }, 'part à couvrir par la production')
    assert.deepEqual(of.qcComponents, { SE1: 15 }, 'part qui ne tient que grâce au statut Q')
    // Les deux parts se somment bien au manque vs stock strict (2016 − 1966).
    assert.equal(of.seComponents!.SE1 + of.qcComponents!.SE1, 50)
    // Couverture TENDUE : la production n'absorbe rien, `seQcComponents` retrouve le même 15.
    assert.deepEqual(of.seQcComponents, { SE1: 15 }, 'même mesure quand la production est juste')
  })

  /**
   * Production ABONDANTE : la part CQ ne doit pas s'évaporer.
   *
   * Relevé PROD du 02/09/2026 — EAR1245EX / OF F126-49779, SE EH4276 :
   *   besoin           1440
   *   stock strict        0   (PHYSTO 1712 ENTIÈREMENT alloué : PHYALL 1301 + GLOALL 411)
   *   stock statut Q    865
   *   production OF  23 615   (toutes les suggestions de la fenêtre)
   *
   * `qcComponents` se mesurait sur le verdict rendu, production créditée : 23 615 couvrent
   * tout, les deux passes rendaient 0, la part CQ tombait à 0. L'écran affichait « manque
   * 849 » sans un mot sur les 591 pièces suspendues au contrôle réception — alors que X3
   * annonce MFGMAT.SHTQTY_0 = 1440 sur cet OF.
   *
   * Ici en modèle réduit : besoin 100, stock strict 0, Q 40, production 10 000.
   * Attendu : production 60 + CQ 40 = 100 = besoin vs stock strict.
   */
  test('production abondante : la part CQ d’un SE reste visible', ({ assert }) => {
    const nomenclatures = new Map([
      [
        'PF1',
        {
          article: 'PF1',
          description: '',
          components: [
            {
              parentArticle: 'PF1',
              parentDescription: '',
              level: 1,
              componentArticle: 'SE1',
              componentDescription: '',
              linkQuantity: 1,
              componentType: 'FABRIQUE' as const,
              consumptionNature: 'PROPORTIONNEL' as const,
            },
          ],
        },
      ],
    ])
    const articles = new Map([
      ['PF1', makeArticle('PF1')],
      ['SE1', makeArticle('SE1')],
    ])
    const supplyFlows: Flow[] = [
      makeOfFlow('OF-PF', 'PF1', 1, 100, daysFromNow(8)),
      // Production très supérieure au besoin — c'est elle qui masquait la dépendance CQ.
      makeOfFlow('WOS-BIG', 'SE1', 3, 10_000, daysFromNow(1)),
      {
        article: 'SE1',
        quantity: 40,
        direction: 'supply',
        date: null,
        origin: { type: 'stock', subType: 'qc', pmp: null } as any,
      },
    ]

    const result = evaluateOrderImpacts(
      [makeDemand('CMD-1', 'PF1', 100, daysFromNow(10))],
      supplyFlows,
      nomenclatures,
      articles,
      new Map<string, OfOverride>(),
      { from: daysFromNow(-7), to: daysFromNow(42) }
    )

    const of = result.orders[0].ofs.find((o) => o.numOf === 'OF-PF')!
    assert.deepEqual(of.missingComponents, {}, 'Q + production couvrent : aucun manque')
    assert.deepEqual(of.seComponents, { SE1: 60 }, 'part à couvrir par la production')
    assert.deepEqual(
      of.seQcComponents,
      { SE1: 40 },
      'les 40 en statut Q ne doivent PAS être absorbés par la production'
    )
    assert.equal(
      of.seComponents!.SE1 + of.seQcComponents!.SE1,
      100,
      'production + CQ = besoin vs stock strict'
    )
  })

  test('un OF servant DEUX lignes : chacune consomme sa tranche, la 2e prend le reliquat', ({
    assert,
  }) => {
    // Le défaut du 02/09/2026 (EAR201EX / SGAE10663223977, 1296 pcs réparties en 648 + 648) :
    // l'OF portait son besoin ENTIER sur chacune des deux lignes, avec la même production
    // couvrante — la colonne annonçait deux fois les mêmes pièces de F126-49910.
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
              level: 1,
              componentArticle: 'SE1',
              componentDescription: '',
              linkQuantity: 1,
              componentType: 'FABRIQUE' as const,
              consumptionNature: 'PROPORTIONNEL' as const,
            },
          ],
        },
      ],
    ])
    const articles = new Map([
      ['PF1', makeArticle('PF1')],
      ['SE1', makeArticle('SE1')],
    ])
    // Un seul OF de 1000 PF1 pour deux lignes (600 + 400). Aucun stock de SE1 : les 1000 SE1
    // dépendent entièrement de la production, servie par deux OF producteurs.
    const supplyFlows: Flow[] = [
      makeOfFlow('OF-PF', 'PF1', 1, 1000, daysFromNow(8)),
      makeOfFlow('WOS-A', 'SE1', 3, 700, daysFromNow(5)),
      makeOfFlow('WOS-B', 'SE1', 3, 5000, daysFromNow(6)),
    ]
    const demands: Flow[] = [
      makeDemand('CMD-1', 'PF1', 600, daysFromNow(10)),
      makeDemand('CMD-2', 'PF1', 400, daysFromNow(11)),
    ]

    const result = evaluateOrderImpacts(
      demands,
      supplyFlows,
      nomenclatures,
      articles,
      new Map<string, OfOverride>(),
      { from: daysFromNow(-7), to: daysFromNow(42) },
      // Contention : c'est le mode du suivi proactif, celui où la production se consomme.
      'sequential'
    )

    const ligne = (numCommande: string) =>
      result.orders
        .find((o) => o.numCommande === numCommande)!
        .ofs.find((f) => f.numOf === 'OF-PF')!

    assert.deepEqual(ligne('CMD-1').seComponents, { SE1: 600 }, 'sa tranche, pas les 1000 de l’OF')
    assert.deepEqual(ligne('CMD-2').seComponents, { SE1: 400 })

    assert.deepEqual(
      ligne('CMD-1').seCoveringOfs!.SE1,
      [{ numOf: 'WOS-A', dateFin: daysFromNow(5).toISOString().slice(0, 10), qty: 600 }],
      'la 1re ligne consomme en totalité sur le producteur le plus tôt'
    )
    assert.deepEqual(
      ligne('CMD-2').seCoveringOfs!.SE1,
      [
        { numOf: 'WOS-A', dateFin: daysFromNow(5).toISOString().slice(0, 10), qty: 100 },
        { numOf: 'WOS-B', dateFin: daysFromNow(6).toISOString().slice(0, 10), qty: 300 },
      ],
      'la 2e prend le reliquat de WOS-A puis bascule sur WOS-B'
    )

    // WOS-A produit 700 : jamais plus, quel que soit le nombre de lignes qui le regardent.
    const prisSurA = result.orders
      .flatMap((o) => o.ofs)
      .flatMap((f) => f.seCoveringOfs?.SE1 ?? [])
      .filter((p) => p.numOf === 'WOS-A')
      .reduce((somme, p) => somme + p.qty, 0)
    assert.equal(prisSurA, 700)

    // La vue OF, elle, recolle les tranches : le besoin entier de l'OF.
    const vueOf = result.ofs.find((o) => o.numOf === 'OF-PF')!
    assert.deepEqual(vueOf.seComponents, { SE1: 1000 })
    assert.deepEqual(vueOf.seCoveringOfs!.SE1, [
      { numOf: 'WOS-A', dateFin: daysFromNow(5).toISOString().slice(0, 10), qty: 700 },
      { numOf: 'WOS-B', dateFin: daysFromNow(6).toISOString().slice(0, 10), qty: 300 },
    ])
  })

  test('le stock sous CQ ne sert qu’UNE commande, pas toutes celles qui en dépendent', ({
    assert,
  }) => {
    // Relevé PROD 02/09/2026 : « 15 en statut Q (contrôle réception) » s'affichait sur deux
    // lignes de commande à la fois. Ce n'est pas un bug de mesure — `seQcDelta` dit « sans le
    // Q il te manquerait 15 de PLUS », vrai pour chaque OF pris seul. La raison en est dans
    // `checkOne` : un OF non ferme EN RUPTURE ne consomme rien, donc dans la passe sans
    // production le stock Q n'est jamais entamé et reste dispo pour tous les suivants.
    // L'attribution, elle, doit le décrémenter : 15 pièces = 15 pièces.
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
              level: 1,
              componentArticle: 'SE1',
              componentDescription: '',
              linkQuantity: 1,
              componentType: 'FABRIQUE' as const,
              consumptionNature: 'PROPORTIONNEL' as const,
            },
          ],
        },
      ],
    ])
    const articles = new Map([
      ['PF1', makeArticle('PF1')],
      ['SE1', makeArticle('SE1')],
    ])
    const supplyFlows: Flow[] = [
      makeOfFlow('OF-TOT', 'PF1', 3, 100, daysFromNow(5)),
      makeOfFlow('OF-TARD', 'PF1', 3, 100, daysFromNow(6)),
      makeOfFlow('WOS-SE', 'SE1', 3, 10_000, daysFromNow(4)),
      // 15 pièces en statut Q, et RIEN en stock strict : les deux OF en dépendent autant.
      {
        article: 'SE1',
        quantity: 15,
        direction: 'supply',
        date: null,
        origin: { type: 'stock', subType: 'qc', pmp: null } as any,
      },
    ]
    const demands: Flow[] = [
      makeDemand('CMD-TOT', 'PF1', 100, daysFromNow(10)),
      makeDemand('CMD-TARD', 'PF1', 100, daysFromNow(11)),
    ]

    const result = evaluateOrderImpacts(
      demands,
      supplyFlows,
      nomenclatures,
      articles,
      new Map<string, OfOverride>(),
      { from: daysFromNow(-7), to: daysFromNow(42) },
      'sequential'
    )

    const qcDe = (numCommande: string) =>
      result.orders.find((o) => o.numCommande === numCommande)!.ofs[0].seQcComponents ?? {}

    assert.deepEqual(qcDe('CMD-TOT'), { SE1: 15 }, 'la première servie prend les 15')
    assert.deepEqual(qcDe('CMD-TARD'), {}, 'il n’en reste aucune pour la seconde')

    // Et le besoin total de la 2e bascule intégralement sur la production.
    const tard = result.orders.find((o) => o.numCommande === 'CMD-TARD')!.ofs[0]
    assert.deepEqual(tard.seComponents, { SE1: 100 })
    assert.deepEqual(tard.seCoveringOfs!.SE1, [
      { numOf: 'WOS-SE', dateFin: daysFromNow(4).toISOString().slice(0, 10), qty: 100 },
    ])
  })

  test("#99 : le supply de matching seul alloue la commande sans entrer dans le pool d'OF", ({
    assert,
  }) => {
    // OF ferme démarré avant la fenêtre board (invisible du scope STRDAT) mais qui finit à
    // temps : il doit rafler la commande, à la place de la suggestion, SANS produire de ligne
    // OF (pas de MFGMAT chargé pour lui, pas de rupture à afficher).
    const suggestion = makeOfFlow('SGAE-1', 'PF1', 3, 100, daysFromNow(25))
    const fermeHorsFenetre = makeOfFlow('F126-1', 'PF1', 1, 100, daysFromNow(1))
    const demands: Flow[] = [makeDemand('CMD-1', 'PF1', 100, daysFromNow(3))]
    const nomenclatures = new Map<string, Nomenclature>()
    const articles = new Map([['PF1', makeArticle('PF1')]])
    const window = { from: daysFromNow(-7), to: daysFromNow(42) }

    const sansDelta = evaluateOrderImpacts(
      demands,
      [suggestion],
      nomenclatures,
      articles,
      new Map<string, OfOverride>(),
      window
    )
    assert.equal(sansDelta.orders[0].ofs[0].numOf, 'SGAE-1', 'avant #99 : collée à la suggestion')

    const avecDelta = evaluateOrderImpacts(
      demands,
      [suggestion],
      nomenclatures,
      articles,
      new Map<string, OfOverride>(),
      window,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      [fermeHorsFenetre]
    )

    assert.equal(avecDelta.orders[0].ofs[0].numOf, 'F126-1')
    assert.equal(avecDelta.orders[0].ofs.length, 1)
    // Le delta reste invisible du pool de faisabilité : aucune ligne OF, donc aucune ligne
    // /ruptures et aucun appel MFGMAT/MFGOPE dimensionné dessus.
    assert.deepEqual(
      avecDelta.ofs.map((o) => o.numOf),
      ['SGAE-1']
    )
  })
})
