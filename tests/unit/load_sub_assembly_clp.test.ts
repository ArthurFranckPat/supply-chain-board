import { test } from '@japa/runner'
import { buildSubAssemblyClpGroups, type ChargeInputs } from '#services/load_payload_loader'
import type { ChargeNeed } from '#app/domain/charge_explosion'
import type { Workstation } from '#app/domain/models/workstation'
import type { NomenclatureEntry } from '#app/domain/models/nomenclature'

const createWst = (code: string, stoloc: string, eff = 100): Workstation => ({
  code,
  description: `Poste ${code}`,
  type: 1,
  parallelUnits: 1,
  efficiency: eff,
  utilization: 100,
  scrap: 0,
  scheduleCode: '1/8',
  dailyCapacity: [7, 7, 7, 7, 7, 0, 0],
  stockLocation: stoloc,
  workCenter: 'WC1',
  facility: 'AE1',
})

test.group('buildSubAssemblyClpGroups', () => {
  const D1 = new Date('2026-07-06T00:00:00') // Lundi S28
  const D2 = new Date('2026-07-13T00:00:00') // Lundi S29

  const wstByCode = new Map<string, Workstation>([
    ['PP_CLP1', createWst('PP_CLP1', 'CLP')],
    ['PP_CLP2', createWst('PP_CLP2', 'CLP', 50)], // 50% efficience -> heures doublées
    ['PP_AUTRE', createWst('PP_AUTRE', 'S3P')],
  ])

  const bomEntries: NomenclatureEntry[] = [
    {
      parentArticle: 'PF1',
      parentDescription: 'Produit Fini 1',
      level: 1,
      componentArticle: 'SE1',
      componentDescription: 'Sous Ensemble 1',
      linkQuantity: 2,
      componentType: 'FABRIQUE',
      consumptionNature: 'PROPORTIONNEL',
    },
    {
      parentArticle: 'PF2',
      parentDescription: 'Produit Fini 2',
      level: 1,
      componentArticle: 'SE1',
      componentDescription: 'Sous Ensemble 1',
      linkQuantity: 1,
      componentType: 'FABRIQUE',
      consumptionNature: 'PROPORTIONNEL',
    },
  ]

  const bomByParent = new Map<string, NomenclatureEntry[]>([
    ['PF1', bomEntries.filter((b) => b.parentArticle === 'PF1')],
    ['PF2', bomEntries.filter((b) => b.parentArticle === 'PF2')],
  ])

  const descriptions = new Map<string, string>([
    ['PF1', 'Produit Fini 1'],
    ['PF2', 'Produit Fini 2'],
    ['SE1', 'Sous Ensemble 1'],
  ])

  const mockInputs: ChargeInputs = {
    mos: [],
    deltaMos: [],
    orderLines: [],
    gammeMap: new Map(),
    workstations: [...wstByCode.values()],
    wstLabels: new Map([
      ['PP_CLP1', 'Ligne Assemblage CLP 1'],
      ['PP_CLP2', 'Poste Réglage CLP 2'],
    ]),
    bomByParent,
    avancementByOf: new Map(),
    categoryByArticle: new Map(),
    descriptions,
    demandHorizonByArticle: new Map(),
    lineDateOverrides: new Map(),
    x3Error: null,
  }

  const monthStart = new Date('2026-07-01T00:00:00')
  const horizonEnd = new Date('2026-12-31T23:59:59')

  const monthIdxByKey = new Map([
    ['2026-7', 0],
    ['2026-8', 1],
  ])

  const weekIdxByKey = new Map([
    ['2026-07-06', 0],
    ['2026-07-13', 1],
  ])

  test('ne retient que les besoins à depth === 1 rattachés aux postes CLP', ({ assert }) => {
    const needs: ChargeNeed[] = [
      // depth 0 (PF) -> ignoré
      {
        wst: 'PP_CLP1',
        date: D1,
        article: 'PF1',
        nature: 'ferme',
        depth: 0,
        brutHours: 5,
        netHours: 5,
        resteHours: 5,
        brutQty: 10,
        netQty: 10,
        resteQty: 10,
        encoursQty: 0,
        path: [],
        source: { numCommande: 'C1', ligne: '1', client: 'CLI1', pfArticle: 'PF1' },
      },
      // depth 2 (niveau 2) -> ignoré
      {
        wst: 'PP_CLP1',
        date: D1,
        article: 'COMP2',
        nature: 'ferme',
        depth: 2,
        brutHours: 2,
        netHours: 2,
        resteHours: 2,
        brutQty: 20,
        netQty: 20,
        resteQty: 20,
        encoursQty: 0,
        path: ['PF1', 'SE1'],
        source: { numCommande: 'C1', ligne: '1', client: 'CLI1', pfArticle: 'PF1' },
      },
      // depth 1 mais poste hors CLP -> ignoré
      {
        wst: 'PP_AUTRE',
        date: D1,
        article: 'SE_AUTRE',
        nature: 'ferme',
        depth: 1,
        brutHours: 4,
        netHours: 4,
        resteHours: 4,
        brutQty: 8,
        netQty: 8,
        resteQty: 8,
        encoursQty: 0,
        path: ['PF1'],
        source: { numCommande: 'C1', ligne: '1', client: 'CLI1', pfArticle: 'PF1' },
      },
      // depth 1 sur CLP -> RETENU
      {
        wst: 'PP_CLP1',
        date: D1,
        article: 'SE1',
        nature: 'ferme',
        depth: 1,
        brutHours: 10,
        netHours: 8,
        resteHours: 6,
        brutQty: 20,
        netQty: 16,
        resteQty: 12,
        encoursQty: 4,
        path: ['PF1'],
        source: { numCommande: 'C1', ligne: '1', client: 'CLI1', pfArticle: 'PF1' },
      },
    ]

    const groups = buildSubAssemblyClpGroups({
      needs,
      inputs: mockInputs,
      wstByCode,
      pinnedStock: new Map([['SE1', 4]]),
      encoursByArticle: new Map([['SE1', 4]]),
      monthStart,
      horizonEnd,
      calendar: null,
      monthIdxByKey,
      weekIdxByKey,
      nbMonths: 2,
      nbWeeks: 2,
      cutWeekNumbers: (nums) => nums,
    })

    assert.lengthOf(groups, 1)
    assert.strictEqual(groups[0].wst, 'PP_CLP1')
    assert.strictEqual(groups[0].wstLabel, 'Ligne Assemblage CLP 1')
    assert.lengthOf(groups[0].items, 1)

    const item = groups[0].items[0]
    assert.strictEqual(item.article, 'SE1')
    assert.strictEqual(item.description, 'Sous Ensemble 1')
    assert.strictEqual(item.stock, 4)
    assert.strictEqual(item.encours, 4)
    assert.deepEqual(item.monthlyQty.brut, [20, 0])
    assert.deepEqual(item.monthlyQty.net, [16, 0])
    assert.deepEqual(item.monthlyQty.reste, [12, 0])
    assert.deepEqual(item.monthlyHours.brut, [10, 0])
    assert.deepEqual(item.monthlyHours.net, [8, 0])
    assert.deepEqual(item.monthlyHours.reste, [6, 0])

    assert.lengthOf(item.parents, 1)
    assert.strictEqual(item.parents[0].pfArticle, 'PF1')
    assert.strictEqual(item.parents[0].pfDescription, 'Produit Fini 1')
    assert.strictEqual(item.parents[0].linkQuantity, 2)
    assert.deepEqual(item.parents[0].monthlyQty, [20, 0])
    assert.deepEqual(item.parents[0].weeklyQty, [20, 0])
  })

  test('regroupe plusieurs PF parents pour le même sous-ensemble', ({ assert }) => {
    const needs: ChargeNeed[] = [
      {
        wst: 'PP_CLP1',
        date: D1,
        article: 'SE1',
        nature: 'ferme',
        depth: 1,
        brutHours: 10,
        netHours: 10,
        resteHours: 10,
        brutQty: 20,
        netQty: 20,
        resteQty: 20,
        encoursQty: 0,
        path: ['PF1'],
        source: { numCommande: 'C1', ligne: '1', client: 'CLI1', pfArticle: 'PF1' },
      },
      {
        wst: 'PP_CLP1',
        date: D2,
        article: 'SE1',
        nature: 'ferme',
        depth: 1,
        brutHours: 5,
        netHours: 5,
        resteHours: 5,
        brutQty: 10,
        netQty: 10,
        resteQty: 10,
        encoursQty: 0,
        path: ['PF2'],
        source: { numCommande: 'C2', ligne: '1', client: 'CLI2', pfArticle: 'PF2' },
      },
    ]

    const groups = buildSubAssemblyClpGroups({
      needs,
      inputs: mockInputs,
      wstByCode,
      pinnedStock: new Map(),
      encoursByArticle: new Map(),
      monthStart,
      horizonEnd,
      calendar: null,
      monthIdxByKey,
      weekIdxByKey,
      nbMonths: 2,
      nbWeeks: 2,
      cutWeekNumbers: (nums) => nums,
    })

    const item = groups[0].items[0]
    assert.lengthOf(item.parents, 2)

    // Triés par volume décroissant : PF1 (20) avant PF2 (10)
    assert.strictEqual(item.parents[0].pfArticle, 'PF1')
    assert.strictEqual(item.parents[0].linkQuantity, 2)
    assert.deepEqual(item.parents[0].weeklyQty, [20, 0])

    assert.strictEqual(item.parents[1].pfArticle, 'PF2')
    assert.strictEqual(item.parents[1].linkQuantity, 1)
    assert.deepEqual(item.parents[1].weeklyQty, [0, 10])

    // Total de l'article sur les semaines
    assert.deepEqual(item.weeklyQty.brut, [20, 10])
  })

  test('prend en compte l efficience du poste sur les heures', ({ assert }) => {
    // PP_CLP2 a une efficience de 50% -> les heures sont doublées
    const needs: ChargeNeed[] = [
      {
        wst: 'PP_CLP2',
        date: D1,
        article: 'SE1',
        nature: 'ferme',
        depth: 1,
        brutHours: 5,
        netHours: 5,
        resteHours: 5,
        brutQty: 10,
        netQty: 10,
        resteQty: 10,
        encoursQty: 0,
        path: ['PF1'],
        source: { numCommande: 'C1', ligne: '1', client: 'CLI1', pfArticle: 'PF1' },
      },
    ]

    const groups = buildSubAssemblyClpGroups({
      needs,
      inputs: mockInputs,
      wstByCode,
      pinnedStock: new Map(),
      encoursByArticle: new Map(),
      monthStart,
      horizonEnd,
      calendar: null,
      monthIdxByKey,
      weekIdxByKey,
      nbMonths: 2,
      nbWeeks: 2,
      cutWeekNumbers: (nums) => nums,
    })

    const item = groups[0].items[0]
    // 5h / 0.5 = 10h
    assert.deepEqual(item.monthlyHours.brut, [10, 0])
    // La quantité de pièces n'est pas modifiée par l'efficience
    assert.deepEqual(item.monthlyQty.brut, [10, 0])
  })
})
