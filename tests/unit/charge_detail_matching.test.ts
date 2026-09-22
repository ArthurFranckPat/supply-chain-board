import { test } from '@japa/runner'
import { buildChargeDetailRows } from '#services/charge_detail_loader'
import type { ChargeInputs } from '#services/load_payload_loader'
import type { Workstation } from '#app/domain/models/workstation'
import type { ManufacturingOrder } from '#repositories/of_repository'
import type { OrderLineForLoad } from '#repositories/order_line_repository'

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

  test('en vue OF, chaque ligne porte les commandes clientes matchées', async ({ assert }) => {
    const mo = baseMo({ numOf: 'OF001', article: 'ART_A', quantity: 20 })
    const orderLine: OrderLineForLoad = {
      article: 'ART_A',
      designation: 'Article A',
      quantite: 20,
      dateLivraison: new Date('2026-07-15T00:00:00'),
      nature: 'COMMANDE',
      numCommande: 'CMD100',
      ligne: '1',
      clientCode: 'CLI_ALDES',
    }

    const inputs: ChargeInputs = {
      mos: [mo],
      deltaMos: [],
      orderLines: [orderLine],
      gammeMap: new Map([
        [
          'ART_A',
          [
            {
              article: 'ART_A',
              workstation: 'POSTE_1',
              workstationLabel: 'Poste Assemblage 1',
              rate: 10, // 10 pièces/h -> 2h
            },
          ],
        ],
      ]),
      workstations: [workstation],
      wstLabels: new Map([['POSTE_1', 'Poste Assemblage 1']]),
      bomByParent: new Map(),
      avancementByOf: new Map(),
      categoryByArticle: new Map(),
      descriptions: new Map([['ART_A', 'Article A']]),
      demandHorizonByArticle: new Map(),
      lineDateOverrides: new Map(),
      x3Error: null,
    }

    const res = await buildChargeDetailRows({
      inputs,
      view: 'of',
      ofDate: 'start',
      applyDemandHorizon: true,
      calendar: null,
      wstByCode,
      monthStart,
      horizonEnd,
    })

    assert.equal(res.ofRows.length, 1)
    const row = res.ofRows[0]
    assert.equal(row.numOf, 'OF001')
    assert.equal(row.article, 'ART_A')
    assert.equal(row.commandes.length, 1)
    assert.equal(row.commandes[0].numCommande, 'CMD100')
    assert.equal(row.commandes[0].ligne, '1')
    assert.equal(row.commandes[0].quantite, 20)
    assert.equal(row.commandes[0].type, 'order')
  })

  test('en vue OF, un OF contremarqué (reservePour) porte la commande même sans matching CBN', async ({
    assert,
  }) => {
    const mo = baseMo({
      numOf: 'OF002',
      article: 'ART_B',
      quantity: 5,
      reservePour: 'CMD_CONTREMARQUE',
    })

    const inputs: ChargeInputs = {
      mos: [mo],
      deltaMos: [],
      orderLines: [],
      gammeMap: new Map([
        [
          'ART_B',
          [
            {
              article: 'ART_B',
              workstation: 'POSTE_1',
              workstationLabel: 'Poste Assemblage 1',
              rate: 5,
            },
          ],
        ],
      ]),
      workstations: [workstation],
      wstLabels: new Map([['POSTE_1', 'Poste Assemblage 1']]),
      bomByParent: new Map(),
      avancementByOf: new Map(),
      categoryByArticle: new Map(),
      descriptions: new Map([['ART_B', 'Article B']]),
      demandHorizonByArticle: new Map(),
      lineDateOverrides: new Map(),
      x3Error: null,
    }

    const res = await buildChargeDetailRows({
      inputs,
      view: 'of',
      ofDate: 'start',
      applyDemandHorizon: true,
      calendar: null,
      wstByCode,
      monthStart,
      horizonEnd,
    })

    assert.equal(res.ofRows.length, 1)
    const row = res.ofRows[0]
    assert.equal(row.commandes.length, 1)
    assert.equal(row.commandes[0].numCommande, 'CMD_CONTREMARQUE')
    assert.include(row.commandes[0].raison, 'contremarque')
  })

  test('en vue OF, un OF sans demande porte un tableau commandes vide', async ({ assert }) => {
    const mo = baseMo({ numOf: 'OF003', article: 'ART_C', quantity: 15 })

    const inputs: ChargeInputs = {
      mos: [mo],
      deltaMos: [],
      orderLines: [],
      gammeMap: new Map([
        [
          'ART_C',
          [
            {
              article: 'ART_C',
              workstation: 'POSTE_1',
              workstationLabel: 'Poste Assemblage 1',
              rate: 15,
            },
          ],
        ],
      ]),
      workstations: [workstation],
      wstLabels: new Map([['POSTE_1', 'Poste Assemblage 1']]),
      bomByParent: new Map(),
      avancementByOf: new Map(),
      categoryByArticle: new Map(),
      descriptions: new Map(),
      demandHorizonByArticle: new Map(),
      lineDateOverrides: new Map(),
      x3Error: null,
    }

    const res = await buildChargeDetailRows({
      inputs,
      view: 'of',
      ofDate: 'start',
      applyDemandHorizon: true,
      calendar: null,
      wstByCode,
      monthStart,
      horizonEnd,
    })

    assert.equal(res.ofRows.length, 1)
    assert.deepEqual(res.ofRows[0].commandes, [])
  })
})
