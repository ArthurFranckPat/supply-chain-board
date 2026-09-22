import { test } from '@japa/runner'
import { buildChargeDetailRows, type ChargeMatchingSources } from '#services/charge_detail_loader'
import type { ChargeInputs } from '#services/load_payload_loader'
import type { Workstation } from '#app/domain/models/workstation'
import type { Flow, OrderType } from '#app/domain/models/flow'
import type { ManufacturingOrder } from '#repositories/of_repository'
import type { OrderLineForLoad } from '#repositories/order_line_repository'
import type { OfAvancement } from '#app/domain/of_avancement'

test.group('buildChargeDetailRows — matching commande en vue OF', () => {
  const monthStart = new Date('2026-07-01T00:00:00')
  const horizonEnd = new Date('2026-12-31T23:59:59')

  const workstation: Workstation = {
    code: 'POSTE_1',
    description: 'Poste Assemblage 1',
    type: 1,
    parallelUnits: 1,
    efficiency: 100,
    utilization: 100,
    scrap: 0,
    scheduleCode: 'STD',
    dailyCapacity: [7, 7, 7, 7, 7, 0, 0],
    stockLocation: 'ATELIER_1',
    workCenter: 'PP',
    facility: 'AE1',
  }
  const wstByCode = new Map<string, Workstation>([['POSTE_1', workstation]])

  const baseMo = (overrides: Partial<ManufacturingOrder>): ManufacturingOrder => ({
    numOf: 'OF001',
    article: 'ART_A',
    designation: 'Article A',
    status: 1,
    statutLabel: 'Ferme',
    typeOfLabel: null,
    quantity: 10,
    quantityLaunched: 10,
    quantityDone: 0,
    unit: 'UN',
    startDate: new Date('2026-07-05T00:00:00'),
    endDate: new Date('2026-07-10T00:00:00'),
    ...overrides,
  })

  const orderLine = (o: Partial<OrderLineForLoad>): OrderLineForLoad => ({
    article: 'ART_A',
    designation: null,
    quantite: 20,
    dateLivraison: new Date('2026-07-15T00:00:00'),
    nature: 'COMMANDE',
    numCommande: 'CMD100',
    ligne: '1',
    clientCode: 'CLI_ALDES',
    ...o,
  })

  /** Demande telle que `getDemandAndReception` la rend au suivi. */
  const demand = (
    l: OrderLineForLoad,
    extra: { orderType?: OrderType | null; contremarque?: string | null; qteAllouee?: number } = {}
  ): Flow => ({
    article: l.article,
    quantity: l.quantite,
    direction: 'demand',
    date: l.dateLivraison,
    origin: {
      type: 'order',
      id: l.numCommande ?? '',
      customer: 'Aldes Aéraulique',
      pays: 'FR',
      orderType: extra.orderType ?? 'NOR',
      nature: 'COMMANDE',
      contremarque: extra.contremarque ?? null,
      qteCommandee: l.quantite,
      qteAllouee: extra.qteAllouee ?? 0,
      ligne: l.ligne,
    },
  })

  const inputsFor = (
    mos: ManufacturingOrder[],
    orderLines: OrderLineForLoad[],
    avancementByOf = new Map<string, OfAvancement>()
  ): ChargeInputs => ({
    mos,
    deltaMos: [],
    orderLines,
    gammeMap: new Map(
      [...new Set(mos.map((m) => m.article))].map((article) => [
        article,
        [{ article, workstation: 'POSTE_1', workstationLabel: 'Poste Assemblage 1', rate: 10 }],
      ])
    ),
    workstations: [workstation],
    wstLabels: new Map([['POSTE_1', 'Poste Assemblage 1']]),
    bomByParent: new Map(),
    avancementByOf,
    categoryByArticle: new Map(),
    descriptions: new Map(),
    demandHorizonByArticle: new Map(),
    lineDateOverrides: new Map(),
    x3Error: null,
  })

  const sources = (d: Flow[], extra: Partial<ChargeMatchingSources> = {}) => ({
    demand: d,
    reception: [],
    deltaOfs: [],
    articles: new Map(),
    ...extra,
  })

  const noIoRepo = {
    resolveClientNames: async () => new Map<string, string>(),
    resolveOrderDates: async () => new Map(),
  }

  const build = (
    inputs: ChargeInputs,
    matching: ChargeMatchingSources,
    orderLineRepo: typeof noIoRepo = noIoRepo,
    opts: { view?: 'of' | 'commande'; ofSuivi?: Map<string, number> } = {}
  ) =>
    buildChargeDetailRows({
      inputs,
      matching,
      ofSuivi: opts.ofSuivi ?? new Map(),
      view: opts.view ?? 'of',
      ofDate: 'start',
      applyDemandHorizon: true,
      calendar: null,
      wstByCode,
      monthStart,
      horizonEnd,
      stock: new Map(),
      orderLineRepo,
    })

  const byOf = <T extends { numOf: string }>(rows: T[]) => new Map(rows.map((r) => [r.numOf, r]))

  test('en vue OF, chaque ligne porte les commandes clientes matchées', async ({ assert }) => {
    const l = orderLine({})
    const res = await build(
      inputsFor([baseMo({ numOf: 'OF001', quantity: 20 })], [l]),
      sources([demand(l)]),
      {
        resolveClientNames: async () => new Map([['CLI_ALDES', 'Aldes Aéraulique']]),
        resolveOrderDates: async () =>
          new Map([
            [
              'CMD100#1',
              {
                dateCommandeIso: '2026-06-01',
                dateDemandeeIso: '2026-07-15',
                dateAccepteeIso: '2026-07-20',
              },
            ],
          ]),
      }
    )

    assert.equal(res.ofRows.length, 1)
    const row = res.ofRows[0]
    assert.equal(row.numOf, 'OF001')
    assert.equal(row.commandes.length, 1)
    assert.equal(row.commandes[0].numCommande, 'CMD100')
    assert.equal(row.commandes[0].ligne, '1')
    assert.equal(row.commandes[0].quantite, 20)
    assert.equal(row.commandes[0].type, 'order')
    assert.equal(row.commandes[0].clientCode, 'CLI_ALDES')
    assert.equal(row.commandes[0].client, 'Aldes Aéraulique')
    assert.equal(row.commandes[0].dateCommandeIso, '2026-06-01')
    assert.equal(row.commandes[0].dateDemandeeIso, '2026-07-15')
    assert.equal(row.commandes[0].dateAccepteeIso, '2026-07-20')
  })

  test('en vue OF, un OF contremarqué (reservePour) porte la commande même sans matching CBN', async ({
    assert,
  }) => {
    const mo = baseMo({ numOf: 'OF002', article: 'ART_B', reservePour: 'CMD_CONTREMARQUE' })
    const res = await build(inputsFor([mo], []), sources([]))

    assert.equal(res.ofRows.length, 1)
    const row = res.ofRows[0]
    assert.equal(row.commandes.length, 1)
    assert.equal(row.commandes[0].numCommande, 'CMD_CONTREMARQUE')
    assert.include(row.commandes[0].raison, 'contremarque')
  })

  test('en vue OF, un OF sans demande porte un tableau commandes vide', async ({ assert }) => {
    const res = await build(
      inputsFor([baseMo({ numOf: 'OF003', article: 'ART_C' })], []),
      sources([])
    )
    assert.equal(res.ofRows.length, 1)
    assert.deepEqual(res.ofRows[0].commandes, [])
  })

  // Régression AR2604426/1000 : le détail construisait ses demandes sans type de
  // commande ni contremarque — une commande MTS contremarquée passait en
  // couverture cumulative NOR/MTO et raflait les OF des autres commandes.
  const mts = orderLine({ article: 'ART_M', numCommande: 'AR_MTS', ligne: '1000' })

  test('commande MTS contremarquée sur un OF clos : aucun autre OF ne la porte', async ({
    assert,
  }) => {
    const res = await build(
      inputsFor(
        [
          baseMo({ numOf: 'OF_M1', article: 'ART_M', quantity: 24 }),
          baseMo({ numOf: 'OF_M2', article: 'ART_M', quantity: 24 }),
        ],
        [mts]
      ),
      sources([demand(mts, { orderType: 'MTS', contremarque: 'OF_CLOS' })])
    )
    assert.lengthOf(res.ofRows, 2)
    for (const row of res.ofRows) assert.deepEqual(row.commandes, [])
  })

  test('commande MTS contremarquée : seul SON OF la porte', async ({ assert }) => {
    const res = await build(
      inputsFor(
        [
          baseMo({ numOf: 'OF_M1', article: 'ART_M', quantity: 24 }),
          baseMo({
            numOf: 'OF_M2',
            article: 'ART_M',
            quantity: 24,
            endDate: new Date('2026-07-12T00:00:00'),
          }),
        ],
        [mts]
      ),
      sources([demand(mts, { orderType: 'MTS', contremarque: 'OF_M2' })])
    )
    const rows = byOf(res.ofRows)
    assert.deepEqual(rows.get('OF_M1')!.commandes, [])
    assert.equal(rows.get('OF_M2')!.commandes[0]?.numCommande, 'AR_MTS')
  })

  test('commande entièrement allouée en ERP : aucun OF ne la porte (nettage du suivi)', async ({
    assert,
  }) => {
    const l = orderLine({})
    const res = await build(
      inputsFor([baseMo({ quantity: 20 })], [l]),
      sources([demand(l, { qteAllouee: 20 })])
    )
    assert.deepEqual(res.ofRows[0].commandes, [])
  })

  test('OF fantôme (gamme soldée) écarté : la commande passe sur l’OF vivant', async ({
    assert,
  }) => {
    const l = orderLine({})
    const fantome: OfAvancement = {
      numOf: 'OF_F',
      estDebuté: true,
      derniereOpPointée: 5,
      derniereOpGamme: 10,
      nbOperations: 1,
      nbOperationsPointées: 1,
      qtyRealisee: 84,
      qtyPrevueOp: 84,
    }
    const res = await build(
      inputsFor(
        [
          baseMo({ numOf: 'OF_F', quantity: 7 }),
          baseMo({ numOf: 'OF_V', quantity: 30, endDate: new Date('2026-07-12T00:00:00') }),
        ],
        [l],
        new Map([['OF_F', fantome]])
      ),
      sources([demand(l)])
    )
    const vivant = byOf(res.ofRows).get('OF_V')!
    assert.equal(vivant.commandes[0]?.quantite, 20)
  })

  test('OF démarré avant l’horizon (#99) : consomme la commande avant un OF plus tardif', async ({
    assert,
  }) => {
    const l = orderLine({})
    const delta: Flow = {
      article: 'ART_A',
      quantity: 20,
      direction: 'supply',
      date: new Date('2026-06-28T00:00:00'),
      origin: {
        type: 'of',
        id: 'OF_DELTA',
        status: 1,
        statutLabel: 'Ferme',
        typeOf: null,
        typeOfLabel: null,
        designation: null,
        launched: 20,
      },
    }
    const res = await build(
      inputsFor([baseMo({ numOf: 'OF_TARD', quantity: 20 })], [l]),
      sources([demand(l)], { deltaOfs: [delta] })
    )
    assert.deepEqual(byOf(res.ofRows).get('OF_TARD')!.commandes, [])
  })

  // Statut de l'OF + lancement (MFGHEAD.MFGTRKFLG) : mêmes champs dans les deux vues.
  const etatInputs = () => {
    const l = orderLine({})
    return {
      l,
      inputs: inputsFor(
        [
          baseMo({ numOf: 'OF_ED', quantity: 10 }),
          baseMo({
            numOf: 'OF_PL',
            status: 2,
            statutLabel: 'Planifié',
            quantity: 10,
            endDate: new Date('2026-07-12T00:00:00'),
          }),
        ],
        [l]
      ),
    }
  }
  const ofSuivi = new Map([['OF_ED', 3]])

  test('vue OF : statut, état de suivi et lancement de chaque OF', async ({ assert }) => {
    const { l, inputs } = etatInputs()
    const res = await build(inputs, sources([demand(l)]), noIoRepo, { ofSuivi })
    const rows = byOf(res.ofRows)
    assert.include(rows.get('OF_ED')!, { statut: 1, suiviLabel: 'Édité', lance: true })
    assert.include(rows.get('OF_PL')!, { statut: 2, suiviLabel: null, lance: false })
  })

  test('vue commande : les OF alloués portent les mêmes statut et lancement', async ({
    assert,
  }) => {
    const { l, inputs } = etatInputs()
    const res = await build(inputs, sources([demand(l)]), noIoRepo, {
      view: 'commande',
      ofSuivi,
    })
    const ofs = res.cmdRows[0].ofs
    assert.deepEqual(
      ofs.map((o) => [o.numOf, o.statut, o.suiviLabel, o.lance]),
      [
        ['OF_ED', 1, 'Édité', true],
        ['OF_PL', 2, null, false],
      ]
    )
  })
})
