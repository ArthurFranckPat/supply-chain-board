import { test } from '@japa/runner'
import type { OrderImpactRow } from '#app/domain/order_impacts'
import type { Flow } from '#app/domain/models/flow'
import type { VolumeCoef } from '#repositories/expedition_repository'
import {
  buildExpeditionForecast,
  resolveRealisticDate,
  recoverFullyAllocatedDemands,
  shipQty,
  maxOfDateFin,
} from '#app/domain/expedition_forecast'

const TODAY = '2026-07-30'
const CAPA = 66 // 2 × 33

function coef(
  article: string,
  ucParPal: number,
  yfamstat7: string | null = null
): [string, VolumeCoef] {
  return [article, { article, pcuStuCoe: 1, ucParPal, yfamstat7 }]
}

function row(over: Partial<OrderImpactRow> & Pick<OrderImpactRow, 'statut'>): OrderImpactRow {
  return {
    numCommande: 'C1',
    ligne: '1000',
    client: 'Client A',
    article: 'ART1',
    description: 'Article 1',
    qteRestante: 100,
    qteAllouee: 0,
    dateExpedition: '2026-07-31',
    dejaEnRetard: false,
    nature: 'commande',
    typeCommande: 'NOR',
    matchingMethod: 'contremarque',
    reliquat: 0,
    joursRetard: 0,
    ofs: [],
    ...over,
  }
}

test.group('expedition_forecast — resolveRealisticDate', () => {
  test('on_time / stock → dateExpedition (clamp ≥ today)', ({ assert }) => {
    assert.equal(
      resolveRealisticDate({ statut: 'on_time', dateExpedition: '2026-08-01', ofs: [] }, TODAY)
        .date,
      '2026-08-01'
    )
    assert.equal(
      resolveRealisticDate({ statut: 'stock', dateExpedition: '2026-07-20', ofs: [] }, TODAY).date,
      TODAY
    )
  })

  test('retard → max dateFin OF, clamp ≥ today', ({ assert }) => {
    const r = resolveRealisticDate(
      {
        statut: 'retard',
        dateExpedition: '2026-07-28',
        ofs: [
          {
            numOf: 'OF1',
            article: 'ART1',
            qteAllouee: 50,
            dateFin: '2026-08-02',
            feasible: true,
            missingComponents: {},
            modified: false,
            statutNum: 1,
          },
          {
            numOf: 'OF2',
            article: 'ART1',
            qteAllouee: 50,
            dateFin: '2026-08-05',
            feasible: true,
            missingComponents: {},
            modified: false,
            statutNum: 1,
          },
        ],
      },
      TODAY
    )
    assert.equal(r.date, '2026-08-05')
    assert.equal(r.ofNum, 'OF2')
    assert.equal(r.ofDateFin, '2026-08-05')
  })

  test('retard sans dateFin → today', ({ assert }) => {
    assert.equal(
      resolveRealisticDate({ statut: 'retard', dateExpedition: '2026-07-20', ofs: [] }, TODAY).date,
      TODAY
    )
  })

  test('bloquee / sans_couverture → différé (null)', ({ assert }) => {
    assert.isNull(
      resolveRealisticDate({ statut: 'bloquee', dateExpedition: '2026-08-01', ofs: [] }, TODAY).date
    )
    assert.isNull(
      resolveRealisticDate(
        { statut: 'sans_couverture', dateExpedition: '2026-08-01', ofs: [] },
        TODAY
      ).date
    )
  })
})

test.group('expedition_forecast — helpers', () => {
  test('shipQty = qteRestante + qteAllouee', ({ assert }) => {
    assert.equal(shipQty({ qteRestante: 40, qteAllouee: 60 }), 100)
    assert.equal(shipQty({ qteRestante: 40 }), 40)
  })

  test('maxOfDateFin prend le max', ({ assert }) => {
    assert.equal(
      maxOfDateFin([
        {
          numOf: 'A',
          article: 'X',
          qteAllouee: 1,
          dateFin: '2026-08-01',
          feasible: true,
          missingComponents: {},
          modified: false,
          statutNum: 1,
        },
        {
          numOf: 'B',
          article: 'X',
          qteAllouee: 1,
          dateFin: '2026-08-10',
          feasible: true,
          missingComponents: {},
          modified: false,
          statutNum: 1,
        },
      ]),
      '2026-08-10'
    )
    assert.isNull(maxOfDateFin([]))
  })
})

test.group('expedition_forecast — recoverFullyAllocatedDemands', () => {
  test('réinjecte une demande 100 % allouée absente des impacts', ({ assert }) => {
    const demand: Flow = {
      article: 'ART1',
      quantity: 80,
      direction: 'demand',
      date: new Date('2026-08-01T00:00:00'),
      origin: {
        type: 'order',
        id: 'C99',
        customer: 'Client Z',
        pays: null,
        orderType: 'NOR',
        nature: 'COMMANDE',
        contremarque: null,
        qteCommandee: 80,
        qteAllouee: 80,
        ligne: '1000',
        designation: 'Art',
      },
    }
    const recovered = recoverFullyAllocatedDemands([demand], [])
    assert.lengthOf(recovered, 1)
    assert.equal(recovered[0].statut, 'stock')
    assert.equal(recovered[0].qteAllouee, 80)
    assert.equal(recovered[0].numCommande, 'C99')
  })

  test('ignore si déjà présente dans les impacts', ({ assert }) => {
    const demand: Flow = {
      article: 'ART1',
      quantity: 80,
      direction: 'demand',
      date: new Date('2026-08-01T00:00:00'),
      origin: {
        type: 'order',
        id: 'C1',
        customer: 'A',
        pays: null,
        orderType: 'NOR',
        nature: 'COMMANDE',
        contremarque: null,
        qteCommandee: 80,
        qteAllouee: 80,
        ligne: '1000',
        designation: null,
      },
    }
    const impacts = [row({ numCommande: 'C1', ligne: '1000', article: 'ART1', statut: 'on_time' })]
    assert.lengthOf(recoverFullyAllocatedDemands([demand], impacts), 0)
  })

  test('ignore si pas entièrement allouée', ({ assert }) => {
    const demand: Flow = {
      article: 'ART1',
      quantity: 100,
      direction: 'demand',
      date: new Date('2026-08-01T00:00:00'),
      origin: {
        type: 'order',
        id: 'C2',
        customer: 'A',
        pays: null,
        orderType: 'NOR',
        nature: 'COMMANDE',
        contremarque: null,
        qteCommandee: 100,
        qteAllouee: 40,
        ligne: '1000',
        designation: null,
      },
    }
    assert.lengthOf(recoverFullyAllocatedDemands([demand], []), 0)
  })
})

test.group('expedition_forecast — buildExpeditionForecast', () => {
  test('agrège nominale / réaliste / différé et signale le spot', ({ assert }) => {
    const coefs = new Map([coef('ART1', 10), coef('ART2', 10), coef('ART3', 10)])
    // 800 US / 10 = 80 pal → spot vs 66
    const impacts: OrderImpactRow[] = [
      row({
        numCommande: 'A',
        article: 'ART1',
        qteRestante: 200,
        dateExpedition: '2026-07-30',
        statut: 'on_time',
      }),
      row({
        numCommande: 'B',
        article: 'ART2',
        qteRestante: 600,
        dateExpedition: '2026-07-28',
        statut: 'retard',
        ofs: [
          {
            numOf: 'OF-B',
            article: 'ART2',
            qteAllouee: 600,
            dateFin: '2026-07-30',
            feasible: true,
            missingComponents: {},
            modified: false,
            statutNum: 1,
          },
        ],
      }),
      row({
        numCommande: 'C',
        article: 'ART3',
        qteRestante: 50,
        dateExpedition: '2026-07-31',
        statut: 'bloquee',
      }),
    ]

    const forecast = buildExpeditionForecast({
      impacts,
      coefs,
      today: TODAY,
      horizonDays: 3,
      capaciteJour: CAPA,
      nbDepartsQuotidiens: 2,
      camionCapacitePalettes: 33,
    })

    assert.equal(forecast.days.length, 3)
    assert.equal(forecast.from, TODAY)
    assert.equal(forecast.to, '2026-08-01')

    const j0 = forecast.days[0]!
    assert.equal(j0.date, TODAY)
    // Nominale J : seulement A (200/10=20). B a dateExpedition passée.
    assert.equal(j0.chargeNominale, 20)
    // Réaliste J : A (20) + B glissé (60) = 80
    assert.equal(j0.chargeRealiste, 80)
    assert.equal(j0.partGlisse, 60)
    assert.isTrue(j0.spot)
    assert.equal(j0.deltaVsCapacite, 80 - CAPA)

    assert.lengthOf(forecast.deferred, 1)
    assert.equal(forecast.deferred[0]!.numCommande, 'C')
    assert.equal(forecast.deferredPalTheo, 5) // 50/10
  })

  test('récupère les alloués 100 % dans la charge stock', ({ assert }) => {
    const coefs = new Map([coef('ART1', 20)])
    const demand: Flow = {
      article: 'ART1',
      quantity: 40,
      direction: 'demand',
      date: new Date('2026-07-31T00:00:00'),
      origin: {
        type: 'order',
        id: 'FULL',
        customer: 'X',
        pays: null,
        orderType: 'NOR',
        nature: 'COMMANDE',
        contremarque: null,
        qteCommandee: 40,
        qteAllouee: 40,
        ligne: '1000',
        designation: null,
      },
    }
    const forecast = buildExpeditionForecast({
      impacts: [],
      rawDemands: [demand],
      coefs,
      today: TODAY,
      horizonDays: 3,
      capaciteJour: CAPA,
      nbDepartsQuotidiens: 2,
      camionCapacitePalettes: 33,
    })
    const j1 = forecast.days.find((d) => d.date === '2026-07-31')!
    assert.equal(j1.chargeRealiste, 2) // 40/20
    assert.equal(j1.lignesRealistes[0]!.statut, 'stock')
  })

  test('ignore les prévisions CBN si commandesOnly', ({ assert }) => {
    const coefs = new Map([coef('ART1', 10)])
    const forecast = buildExpeditionForecast({
      impacts: [
        row({
          nature: 'prevision',
          qteRestante: 500,
          dateExpedition: TODAY,
          statut: 'on_time',
        }),
      ],
      coefs,
      today: TODAY,
      horizonDays: 1,
      capaciteJour: CAPA,
      nbDepartsQuotidiens: 2,
      camionCapacitePalettes: 33,
      commandesOnly: true,
    })
    assert.equal(forecast.days[0]!.chargeRealiste, 0)
  })

  test('VB non conditionné : 1 US = 1 palette', ({ assert }) => {
    const coefs = new Map([coef('VBART', 0, 'VBP')])
    const forecast = buildExpeditionForecast({
      impacts: [
        row({
          article: 'VBART',
          qteRestante: 3,
          dateExpedition: TODAY,
          statut: 'on_time',
        }),
      ],
      coefs,
      today: TODAY,
      horizonDays: 1,
      capaciteJour: CAPA,
      nbDepartsQuotidiens: 2,
      camionCapacitePalettes: 33,
    })
    assert.equal(forecast.days[0]!.chargeRealiste, 3)
  })
})
