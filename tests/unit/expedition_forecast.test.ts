import { test } from '@japa/runner'
import type { VolumeCoef } from '#repositories/expedition_repository'
import {
  buildExpeditionForecast,
  equivalentPalettes,
  type AvailabilitySegment,
  type ExpeditionOrderLine,
} from '#app/domain/expedition_forecast'

const TODAY = '2026-08-03' // lundi
const CAPACITY = 66

function volume(
  article: string,
  ucParPal: number | null,
  yfamstat7: string | null = null
): VolumeCoef {
  return { article, pcuStuCoe: 1, ucParPal, yfamstat7 }
}

function segment(over: Partial<AvailabilitySegment> = {}): AvailabilitySegment {
  return {
    quantity: 1,
    date: TODAY,
    source: 'of_ferme',
    confidence: 'haute',
    cause: 'fixture',
    ...over,
  }
}

function line(over: Partial<ExpeditionOrderLine> = {}): ExpeditionOrderLine {
  return {
    numCommande: 'C1',
    ligne: '1000',
    client: 'Aldes France',
    article: 'ART1',
    description: 'Article 1',
    orderedOpenQuantity: 100,
    dateLivraison: '2026-08-10',
    dateCommande: '2026-07-01',
    segments: [segment({ quantity: 100 })],
    ...over,
  }
}

function build(over: Partial<Parameters<typeof buildExpeditionForecast>[0]> = {}) {
  return buildExpeditionForecast({
    lines: [line()],
    initialQueue: [],
    volumes: new Map([['ART1', volume('ART1', 10)]]),
    today: TODAY,
    capaciteJour: CAPACITY,
    nbDepartsQuotidiens: 2,
    camionCapacitePalettes: 33,
    dailyHorizonDays: 8,
    weeklyHorizonWeeks: 6,
    ...over,
  })
}

test.group('expedition_forecast — volumes', () => {
  test('réutilise calcVolumes et conserve les articles non chiffrables', ({ assert }) => {
    assert.equal(equivalentPalettes(100, volume('ART1', 10)), 10)
    assert.equal(equivalentPalettes(3, volume('VBART', null, 'VBP')), 3)
    assert.isNull(equivalentPalettes(100, volume('UNKNOWN', null)))
  })
})

test.group('expedition_forecast — file FIFO', () => {
  test('déduit les palettes déjà en navette, vide la file par 66 et annonce un camion entier', ({
    assert,
  }) => {
    const forecast = build({
      lines: [line({ orderedOpenQuantity: 1000, segments: [] })],
      initialQueue: [{ article: 'ART1', location: 'QUAI3', quantityUs: 800, source: 'quai' }],
      loadedShuttle: [{ palettes: 10 }],
    })

    const monday = forecast.days[0]!
    assert.equal(forecast.loadedTodayPalettes, 10)
    assert.equal(forecast.initialQueuePalettes, 70)
    assert.equal(monday.available, 70)
    assert.equal(monday.loaded, 66)
    assert.equal(monday.fileAfter, 4)
    assert.isTrue(monday.spot)
    assert.equal(monday.nbCamionsSpot, 1)
    assert.equal(forecast.days[1]!.available, 4)
  })

  test('le drill-down du jour spot liste chargé + overflow, pas seulement le chargé', ({
    assert,
  }) => {
    const forecast = build({
      lines: [line({ orderedOpenQuantity: 1000, segments: [] })],
      initialQueue: [{ article: 'ART1', location: 'QUAI3', quantityUs: 800, source: 'quai' }],
      loadedShuttle: [{ palettes: 10 }],
      dailyHorizonDays: 1,
    })
    const monday = forecast.days[0]!
    const loaded = monday.lignes.filter((row) => row.chargeStatus === 'loaded')
    const overflow = monday.lignes.filter((row) => row.chargeStatus === 'overflow')
    const loadedPal = loaded.reduce((sum, row) => sum + (row.palTheo ?? 0), 0)
    const overflowPal = overflow.reduce((sum, row) => sum + (row.palTheo ?? 0), 0)

    assert.isAbove(overflow.length, 0)
    assert.equal(loadedPal, 66)
    assert.equal(overflowPal, 4)
    assert.equal(loadedPal + overflowPal, monday.available)
  })

  test('le KPI file quai ne compte que le stock matché à une commande ouverte', ({ assert }) => {
    const forecast = build({
      lines: [line({ orderedOpenQuantity: 50, segments: [] })],
      initialQueue: [{ article: 'ART1', location: 'QUAI3', quantityUs: 800, source: 'quai' }],
      dailyHorizonDays: 1,
    })
    // 50 US / 10 = 5 pal matchées ; les 75 pal orphelines restent hors modèle.
    assert.equal(forecast.initialQueuePalettes, 5)
    assert.equal(forecast.days[0]!.available, 5)
  })

  test('saute samedi et dimanche : la file ne consomme que des jours ouvrés', ({ assert }) => {
    const forecast = build({
      lines: [
        line({
          orderedOpenQuantity: 10,
          segments: [segment({ quantity: 10, date: '2026-08-07' })],
        }),
      ],
      dailyHorizonDays: 8,
    })
    assert.deepEqual(
      forecast.days.map((day) => day.date),
      ['2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06', '2026-08-07', '2026-08-10']
    )
  })

  test('cappe chaque ligne au reliquat commandé, même si une source annonce davantage', ({
    assert,
  }) => {
    const forecast = build({
      lines: [line({ orderedOpenQuantity: 10, segments: [segment({ quantity: 1000 })] })],
      dailyHorizonDays: 1,
    })
    assert.equal(forecast.days[0]!.entries, 1)
    assert.equal(forecast.days[0]!.lignes[0]!.qte, 10)
    assert.equal(forecast.days[0]!.lignes[0]!.qteCommandee, 10)
  })

  test('un OF non daté ne bloque pas les autres et reste visible hors file jour', ({ assert }) => {
    const forecast = build({
      lines: [
        line({
          numCommande: 'BLOQUEE',
          segments: [
            segment({
              quantity: 100,
              date: null,
              source: 'ctp',
              confidence: 'faible',
              weeklyOnly: true,
            }),
          ],
        }),
        line({ numCommande: 'SUIVANTE', segments: [segment({ quantity: 10 })] }),
      ],
      dailyHorizonDays: 1,
    })
    assert.equal(forecast.days[0]!.lignes[0]!.numCommande, 'SUIVANTE')
    assert.equal(forecast.deferred[0]!.numCommande, 'BLOQUEE')
  })
})

test.group('expedition_forecast — bandes hebdomadaires', () => {
  test('compare le carnet à 330 palettes et au plafond de production', ({ assert }) => {
    const forecast = build({
      lines: [
        line({
          orderedOpenQuantity: 4000,
          dateLivraison: '2026-08-10',
          segments: [segment({ quantity: 4000, weeklyOnly: true, date: null, source: 'ctp' })],
        }),
      ],
      productionWeeklyCapacity: 250,
      dailyHorizonDays: 4,
    })
    const week = forecast.weeks[0]!
    assert.equal(week.carnetPalettes, 400)
    assert.equal(week.capaciteTransport, 330)
    assert.equal(week.capacite, 250)
    assert.equal(week.chargePlafonnee, 250)
    assert.equal(week.nbCamionsSpot, 5)
  })

  test('signale les lignes sans coef sans les transformer en zéro silencieux', ({ assert }) => {
    const forecast = build({
      lines: [line({ article: 'SANS_COEF', segments: [segment({ quantity: 100 })] })],
      volumes: new Map(),
      dailyHorizonDays: 1,
    })
    assert.equal(forecast.nonQuantifiableLines, 1)
    assert.isTrue(forecast.deferred[0]!.nonChiffrable)
    assert.isNull(forecast.deferred[0]!.palTheo)
    assert.equal(forecast.days[0]!.loaded, 0)
  })
})
