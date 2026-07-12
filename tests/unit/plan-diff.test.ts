import { test } from '@japa/runner'
import type { Flow } from '#app/domain/models/flow'
import type { Article } from '#app/domain/models/article'
import type { Nomenclature } from '#app/domain/models/nomenclature'
import type { OfOverride } from '#app/domain/planning_board'
import {
  applyMutations,
  diffCharge,
  evaluatePlanDiff,
  mondayOf,
  type OfCharge,
  type PlanDiffInputs,
  type PlanMutation,
} from '#app/domain/plan-diff'
import { evaluateOrderImpacts } from '#app/domain/order-impacts'

const TODAY = new Date()
TODAY.setHours(0, 0, 0, 0)

function daysFromNow(n: number): Date {
  const d = new Date(TODAY)
  d.setDate(d.getDate() + n)
  return d
}

function isoDaysFromNow(n: number): string {
  const d = daysFromNow(n)
  const pad = (x: number) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
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
  customer = 'ACME'
): Flow {
  return {
    article,
    quantity,
    direction: 'demand',
    date,
    origin: {
      type: 'order',
      id,
      orderType: 'NOR',
      customer,
      nature: 'COMMANDE',
      qteCommandee: quantity,
      qteAllouee: 0,
    } as any,
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

function makeInputs(partial: Partial<PlanDiffInputs>): PlanDiffInputs {
  return {
    demands: [],
    supplyFlows: [],
    overrides: new Map<string, OfOverride>(),
    nomenclatures: new Map<string, Nomenclature>(),
    articles: new Map([['PF1', makeArticle('PF1')]]),
    window: { from: daysFromNow(-7), to: daysFromNow(60) },
    ...partial,
  }
}

test.group('evaluatePlanDiff', () => {
  test('0 mutation → diff vide (idempotence)', ({ assert }) => {
    const inputs = makeInputs({
      demands: [makeDemand('CMD-1', 'PF1', 60, daysFromNow(10))],
      supplyFlows: [makeOfFlow('OF-A', 'PF1', 3, 60, daysFromNow(8))],
    })

    const diff = evaluatePlanDiff(inputs, [])

    assert.lengthOf(diff.client, 0)
    assert.lengthOf(diff.appro, 0)
    assert.lengthOf(diff.allocation, 0)
    assert.lengthOf(diff.charge, 0)
    assert.deepEqual(diff.stats, { degradations: 0, ameliorations: 0 })
  })

  test('shift_of : commande on_time → retard, Δ jours signé dégradation', ({ assert }) => {
    const inputs = makeInputs({
      demands: [makeDemand('CMD-1', 'PF1', 60, daysFromNow(10))],
      supplyFlows: [makeOfFlow('OF-A', 'PF1', 3, 60, daysFromNow(8))],
    })

    const diff = evaluatePlanDiff(inputs, [
      { type: 'shift_of', numOf: 'OF-A', dateFin: isoDaysFromNow(20) },
    ])

    assert.lengthOf(diff.client, 1)
    const entry = diff.client[0]
    assert.equal(entry.numCommande, 'CMD-1')
    assert.equal(entry.statutAvant, 'on_time')
    assert.equal(entry.statutApres, 'retard')
    assert.equal(entry.deltaJours, 12)
    assert.equal(entry.sens, 'degradation')
    assert.equal(diff.stats.degradations, 1)
  })

  test('shift_of : commande retard → on_time, signée amélioration', ({ assert }) => {
    const inputs = makeInputs({
      demands: [makeDemand('CMD-1', 'PF1', 60, daysFromNow(10))],
      supplyFlows: [makeOfFlow('OF-A', 'PF1', 3, 60, daysFromNow(20))],
    })

    const diff = evaluatePlanDiff(inputs, [
      { type: 'shift_of', numOf: 'OF-A', dateFin: isoDaysFromNow(8) },
    ])

    assert.lengthOf(diff.client, 1)
    assert.equal(diff.client[0].statutAvant, 'retard')
    assert.equal(diff.client[0].statutApres, 'on_time')
    assert.equal(diff.client[0].deltaJours, -12)
    assert.equal(diff.client[0].sens, 'amelioration')
    assert.equal(diff.stats.ameliorations, 1)
  })

  test('suspend_supply : couverture composant qui casse (axe appro)', ({ assert }) => {
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
    const inputs = makeInputs({
      demands: [makeDemand('CMD-1', 'PF1', 60, daysFromNow(10))],
      supplyFlows: [makeOfFlow('OF-A', 'PF1', 3, 60, daysFromNow(8)), makeStockFlow('C1', 60)],
      nomenclatures,
      articles: new Map([
        ['PF1', makeArticle('PF1')],
        ['C1', makeArticle('C1', 'ACHAT')],
      ]),
    })

    const diff = evaluatePlanDiff(inputs, [{ type: 'suspend_supply', article: 'C1' }])

    assert.lengthOf(diff.appro, 1)
    const appro = diff.appro[0]
    assert.equal(appro.composant, 'C1')
    assert.equal(appro.manquantAvant, 0)
    assert.equal(appro.manquantApres, 60)
    assert.equal(appro.delta, 60)
    assert.deepEqual(appro.ofs, ['OF-A'])
    assert.equal(appro.sens, 'degradation')

    // Côté client : la commande devient bloquée
    assert.lengthOf(diff.client, 1)
    assert.equal(diff.client[0].statutAvant, 'on_time')
    assert.equal(diff.client[0].statutApres, 'bloquee')
  })

  test('suspend_supply avec delay + sourceId : supply retardée, pas retirée', ({ assert }) => {
    const inputs = makeInputs({
      demands: [makeDemand('CMD-1', 'PF1', 60, daysFromNow(10))],
      supplyFlows: [makeOfFlow('OF-A', 'PF1', 3, 60, daysFromNow(8))],
    })

    const diff = evaluatePlanDiff(inputs, [
      { type: 'suspend_supply', article: 'PF1', sourceId: 'OF-A', delay: isoDaysFromNow(20) },
    ])

    assert.lengthOf(diff.client, 1)
    assert.equal(diff.client[0].statutApres, 'retard')
    assert.equal(diff.client[0].deltaJours, 12)
  })

  test('inject_demand : commande virtuelle capte la couverture (axes client + allocation)', ({
    assert,
  }) => {
    const inputs = makeInputs({
      demands: [makeDemand('CMD-1', 'PF1', 60, daysFromNow(10))],
      supplyFlows: [makeOfFlow('OF-A', 'PF1', 3, 60, daysFromNow(8))],
    })

    const diff = evaluatePlanDiff(inputs, [
      {
        type: 'inject_demand',
        id: 'VIRT-1',
        article: 'PF1',
        quantity: 60,
        date: isoDaysFromNow(5),
        client: 'PROSPECT',
      },
    ])

    // La virtuelle apparaît, marquée nouvelle ; CMD-1 perd sa couverture.
    const virt = diff.client.find((e) => e.numCommande === 'VIRT-1')
    assert.exists(virt)
    assert.isTrue(virt!.nouvelle)
    assert.isNull(virt!.statutAvant)
    assert.equal(virt!.statutApres, 'retard') // OF à J+8, besoin à J+5

    const cmd1 = diff.client.find((e) => e.numCommande === 'CMD-1')
    assert.exists(cmd1)
    assert.equal(cmd1!.statutAvant, 'on_time')
    assert.equal(cmd1!.statutApres, 'sans_couverture')
    assert.equal(cmd1!.sens, 'degradation')

    // Allocation : CMD-1 perd OF-A au profit de VIRT-1
    const alloc = diff.allocation.find((e) => e.numCommande === 'CMD-1')
    assert.exists(alloc)
    assert.deepEqual(alloc!.perd, ['OF-A'])
    assert.deepEqual(alloc!.beneficiaires, [{ numOf: 'OF-A', commandes: ['VIRT-1'] }])
    assert.equal(alloc!.sens, 'degradation')
  })

  test("shift_demand : la demande avancée capte l'OF de l'autre (bénéficiaire identifié)", ({
    assert,
  }) => {
    const inputs = makeInputs({
      demands: [
        makeDemand('CMD-A', 'PF1', 60, daysFromNow(10)),
        makeDemand('CMD-B', 'PF1', 60, daysFromNow(20)),
      ],
      supplyFlows: [makeOfFlow('OF-A', 'PF1', 3, 60, daysFromNow(8))],
    })

    const diff = evaluatePlanDiff(inputs, [
      { type: 'shift_demand', numCommande: 'CMD-B', date: isoDaysFromNow(5) },
    ])

    const allocA = diff.allocation.find((e) => e.numCommande === 'CMD-A')
    assert.exists(allocA)
    assert.deepEqual(allocA!.perd, ['OF-A'])
    assert.deepEqual(allocA!.beneficiaires, [{ numOf: 'OF-A', commandes: ['CMD-B'] }])
    assert.equal(allocA!.sens, 'degradation')

    const allocB = diff.allocation.find((e) => e.numCommande === 'CMD-B')
    assert.exists(allocB)
    assert.deepEqual(allocB!.gagne, ['OF-A'])
    assert.equal(allocB!.sens, 'amelioration')
  })

  test('mutations composables : shift_of + inject_demand sur le même plan', ({ assert }) => {
    const inputs = makeInputs({
      demands: [makeDemand('CMD-1', 'PF1', 60, daysFromNow(10))],
      supplyFlows: [
        makeOfFlow('OF-A', 'PF1', 3, 60, daysFromNow(8)),
        makeOfFlow('OF-B', 'PF1', 3, 40, daysFromNow(12)),
      ],
    })

    const diff = evaluatePlanDiff(inputs, [
      { type: 'shift_of', numOf: 'OF-A', dateFin: isoDaysFromNow(25) },
      {
        type: 'inject_demand',
        id: 'VIRT-1',
        article: 'PF1',
        quantity: 40,
        date: isoDaysFromNow(11),
        client: 'X',
      },
    ])

    // Les deux mutations produisent chacune leur effet dans le même diff.
    assert.exists(diff.client.find((e) => e.numCommande === 'CMD-1'))
    assert.exists(diff.client.find((e) => e.numCommande === 'VIRT-1' && e.nouvelle))
  })
})

test.group('applyMutations', () => {
  test('pur : les entrées ne sont pas modifiées', ({ assert }) => {
    const demands = [makeDemand('CMD-1', 'PF1', 60, daysFromNow(10))]
    const supplyFlows = [makeOfFlow('OF-A', 'PF1', 3, 60, daysFromNow(8))]
    const overrides = new Map<string, OfOverride>()
    const originalDate = demands[0].date!.getTime()

    const out = applyMutations({ demands, supplyFlows, overrides }, [
      { type: 'shift_of', numOf: 'OF-A', dateFin: isoDaysFromNow(20) },
      { type: 'shift_demand', numCommande: 'CMD-1', date: isoDaysFromNow(30) },
      { type: 'suspend_supply', article: 'PF1' },
    ])

    assert.equal(demands[0].date!.getTime(), originalDate)
    assert.lengthOf(supplyFlows, 1)
    assert.equal(overrides.size, 0)
    assert.equal(out.overrides.get('OF-A')?.dateFin, isoDaysFromNow(20))
    assert.lengthOf(out.supplyFlows, 0)
  })

  test('shift_of fusionne avec un override existant sans écraser les autres champs', ({
    assert,
  }) => {
    const overrides = new Map<string, OfOverride>([
      [
        'OF-A',
        {
          numOf: 'OF-A',
          dateDebut: '2026-07-01',
          dateFin: '2026-07-03',
          status: 2,
          workstation: 'P1',
          note: 'n',
          updatedAt: 't',
        },
      ],
    ])

    const out = applyMutations({ demands: [], supplyFlows: [], overrides }, [
      { type: 'shift_of', numOf: 'OF-A', dateFin: '2026-07-10' },
    ])

    const ov = out.overrides.get('OF-A')!
    assert.equal(ov.dateFin, '2026-07-10')
    assert.equal(ov.dateDebut, '2026-07-01')
    assert.equal(ov.status, 2)
    assert.equal(ov.workstation, 'P1')
  })

  test('shift_demand cible la ligne quand elle est fournie', ({ assert }) => {
    const d1 = makeDemand('CMD-1', 'PF1', 10, daysFromNow(10))
    ;(d1.origin as any).ligne = '1000'
    const d2 = makeDemand('CMD-1', 'PF1', 20, daysFromNow(10))
    ;(d2.origin as any).ligne = '2000'

    const out = applyMutations({ demands: [d1, d2], supplyFlows: [], overrides: new Map() }, [
      { type: 'shift_demand', numCommande: 'CMD-1', ligne: '2000', date: isoDaysFromNow(30) },
    ])

    assert.equal(out.demands[0].date!.getTime(), daysFromNow(10).getTime())
    assert.notEqual(out.demands[1].date!.getTime(), daysFromNow(10).getTime())
  })
})

test.group('diffCharge', () => {
  // Dates fixes pour des semaines déterministes : 2026-07-06 et 2026-07-13 sont des lundis.
  const charges: OfCharge[] = [
    { numOf: 'OF-A', poste: 'P1', dateFin: '2026-07-08', heures: 5 },
    { numOf: 'OF-B', poste: 'P1', dateFin: '2026-07-08', heures: 3 },
  ]

  test('mondayOf : lundi de la semaine, stable en UTC', ({ assert }) => {
    assert.equal(mondayOf('2026-07-06'), '2026-07-06') // lundi → lui-même
    assert.equal(mondayOf('2026-07-08'), '2026-07-06') // mercredi
    assert.equal(mondayOf('2026-07-12'), '2026-07-06') // dimanche
    assert.equal(mondayOf('2026-07-13'), '2026-07-13') // lundi suivant
  })

  test('shift_of date+poste : heures retirées du bucket source, ajoutées au bucket cible', ({
    assert,
  }) => {
    const mutations: PlanMutation[] = [
      { type: 'shift_of', numOf: 'OF-A', dateFin: '2026-07-15', poste: 'P2' },
    ]

    const entries = diffCharge(charges, mutations)

    assert.lengthOf(entries, 2)
    assert.deepEqual(entries[0], {
      poste: 'P1',
      semaine: '2026-07-06',
      deltaHeures: -5,
      deltaPct: null,
    })
    assert.deepEqual(entries[1], {
      poste: 'P2',
      semaine: '2026-07-13',
      deltaHeures: 5,
      deltaPct: null,
    })
  })

  test('déplacement dans la même semaine et le même poste → pas de delta', ({ assert }) => {
    const entries = diffCharge(charges, [
      { type: 'shift_of', numOf: 'OF-A', dateFin: '2026-07-10' }, // même semaine, même poste
    ])
    assert.lengthOf(entries, 0)
  })

  test('mutations successives sur le même OF : seule la position finale compte', ({ assert }) => {
    const entries = diffCharge(charges, [
      { type: 'shift_of', numOf: 'OF-A', dateFin: '2026-07-15' },
      { type: 'shift_of', numOf: 'OF-A', dateFin: '2026-07-08' }, // retour au point de départ
    ])
    assert.lengthOf(entries, 0)
  })

  test('deltaPct calculé quand la capacité du poste-semaine est connue', ({ assert }) => {
    const capacites = new Map([
      ['P1|2026-07-06', 40],
      ['P1|2026-07-13', 50],
    ])

    const entries = diffCharge(
      charges,
      [{ type: 'shift_of', numOf: 'OF-A', dateFin: '2026-07-15' }],
      capacites
    )

    assert.deepEqual(entries[0], {
      poste: 'P1',
      semaine: '2026-07-06',
      deltaHeures: -5,
      deltaPct: -12.5,
    })
    assert.deepEqual(entries[1], {
      poste: 'P1',
      semaine: '2026-07-13',
      deltaHeures: 5,
      deltaPct: 10,
    })
  })

  test('Axe Appro verdicts : inevitable, recalable, dormant', ({ assert }) => {
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

    const c1Article = makeArticle('C1', 'ACHAT')
    c1Article.reorderDelay = 10

    const inputs = makeInputs({
      demands: [makeDemand('CMD-1', 'PF1', 10, daysFromNow(20))],
      supplyFlows: [
        makeOfFlow('OF-A', 'PF1', 3, 10, daysFromNow(15)),
        makeStockFlow('C1', 10),
      ],
      nomenclatures,
      articles: new Map([
        ['PF1', makeArticle('PF1')],
        ['C1', c1Article],
      ]),
    })

    const diffInevitable = evaluatePlanDiff(inputs, [
      { type: 'shift_of', numOf: 'OF-A', dateFin: isoDaysFromNow(5) },
    ])
    assert.lengthOf(diffInevitable.approVerdicts, 1)
    assert.equal(diffInevitable.approVerdicts[0].verdict, 'inevitable')
    assert.equal(diffInevitable.approVerdicts[0].composant, 'C1')

    const diffRecalable = evaluatePlanDiff(inputs, [
      { type: 'shift_of', numOf: 'OF-A', dateFin: isoDaysFromNow(12) },
    ])
    assert.lengthOf(diffRecalable.approVerdicts, 1)
    assert.equal(diffRecalable.approVerdicts[0].verdict, 'recalable')

    const inputsWithRecep = makeInputs({
      demands: [makeDemand('CMD-1', 'PF1', 10, daysFromNow(20))],
      supplyFlows: [
        makeOfFlow('OF-A', 'PF1', 3, 10, daysFromNow(15)),
        {
          article: 'C1',
          quantity: 10,
          direction: 'supply',
          date: daysFromNow(12),
          origin: { type: 'reception', id: 'R1' } as any,
        },
      ],
      nomenclatures,
      articles: new Map([
        ['PF1', makeArticle('PF1')],
        ['C1', c1Article],
      ]),
    })

    const diffDormant = evaluatePlanDiff(inputsWithRecep, [
      { type: 'shift_of', numOf: 'OF-A', dateFin: isoDaysFromNow(25) },
    ])
    assert.lengthOf(diffDormant.approVerdicts, 1)
    assert.equal(diffDormant.approVerdicts[0].verdict, 'dormant')
  })

  test('Allocation strategies: date_passation prioritizes oldest order date', ({ assert }) => {
    const cmdA = makeDemand('CMD-A', 'PF1', 10, daysFromNow(20))
    ;(cmdA.origin as any).dateCommande = daysFromNow(-10)

    const cmdB = makeDemand('CMD-B', 'PF1', 10, daysFromNow(15))
    ;(cmdB.origin as any).dateCommande = daysFromNow(-1)

    const inputs = makeInputs({
      demands: [cmdA, cmdB],
      supplyFlows: [makeOfFlow('OF-A', 'PF1', 3, 10, daysFromNow(12))],
      articles: new Map([['PF1', makeArticle('PF1')]]),
    })

    const resultDefault = evaluateOrderImpacts(
      inputs.demands,
      inputs.supplyFlows,
      inputs.nomenclatures,
      inputs.articles,
      inputs.overrides,
      inputs.window,
      undefined,
      undefined,
      undefined,
      'date_besoin'
    )
    const rowBDefault = resultDefault.orders.find(o => o.numCommande === 'CMD-B')!
    assert.lengthOf(rowBDefault.ofs, 1)
    assert.equal(rowBDefault.ofs[0].numOf, 'OF-A')

    const rowADefault = resultDefault.orders.find(o => o.numCommande === 'CMD-A')!
    assert.lengthOf(rowADefault.ofs, 0)

    const resultPassation = evaluateOrderImpacts(
      inputs.demands,
      inputs.supplyFlows,
      inputs.nomenclatures,
      inputs.articles,
      inputs.overrides,
      inputs.window,
      undefined,
      undefined,
      undefined,
      'date_passation'
    )
    const rowAPassation = resultPassation.orders.find(o => o.numCommande === 'CMD-A')!
    assert.lengthOf(rowAPassation.ofs, 1)
    assert.equal(rowAPassation.ofs[0].numOf, 'OF-A')

    const rowBPassation = resultPassation.orders.find(o => o.numCommande === 'CMD-B')!
    assert.lengthOf(rowBPassation.ofs, 0)
  })
})
