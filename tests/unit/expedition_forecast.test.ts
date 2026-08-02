import { test } from '@japa/runner'
import type { VolumeCoef } from '#repositories/expedition_repository'
import {
  buildExpeditionForecast,
  emplacementsPalette,
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
    assert.equal(emplacementsPalette(100, volume('ART1', 10)), 10)
    assert.equal(emplacementsPalette(3, volume('VBART', null, 'VBP')), 3)
    assert.isNull(emplacementsPalette(100, volume('UNKNOWN', null)))
  })

  test('rend des emplacements entiers — la ligne ne sort que des palettes pleines', ({
    assert,
  }) => {
    // 16,2 UC pour 27 UC/palette : « 0,6 pal » ne décrit rien de chargeable, une
    // palette entamée occupe un emplacement plein dans la navette.
    assert.equal(emplacementsPalette(16.2, volume('ART1', 27)), 1)
    assert.equal(emplacementsPalette(168, volume('ART1', 19)), 9)
    assert.equal(emplacementsPalette(480, volume('ART1', 480)), 1)
    // Un compte déjà juste n'est pas gonflé d'une palette fantôme.
    assert.equal(emplacementsPalette(176, volume('ART1', 12.571_428_571_428_571)), 14)
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
    // Le camion spot annoncé vide aussi la file — sinon J+1 recomptabilise le même reste.
    assert.equal(monday.fileAfter, 0)
    assert.isTrue(monday.spot)
    assert.equal(monday.nbCamionsSpot, 1)
    assert.equal(forecast.days[1]!.available, 0)
  })

  test('le drill-down du jour spot liste navette + portion spot, pas seulement le chargé', ({
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
    assert.equal(monday.fileAfter, 0)
  })

  test('le besoin au-delà du plafond est un arriéré, pas une flotte de camions', ({ assert }) => {
    const forecast = build({
      lines: [line({ orderedOpenQuantity: 10_000, segments: [] })],
      initialQueue: [{ article: 'ART1', location: 'QUAI3', quantityUs: 8980, source: 'quai' }],
      maxSpotTrucks: 3,
      dailyHorizonDays: 2,
    })
    const jour1 = forecast.days[0]!
    // 898 pal au quai → il en «faudrait» 26 : ce chiffre décrit l'arriéré, il ne
    // s'affrète pas. On commande 3 camions et on assume la file restante.
    assert.equal(jour1.available, 898)
    assert.equal(jour1.nbCamionsSpotTheorique, 26)
    assert.equal(jour1.nbCamionsSpot, 3)
    assert.isTrue(jour1.spotSature)
    assert.equal(jour1.loaded, 66)
    assert.equal(jour1.loadedSpot, 99)
    assert.equal(jour1.fileAfter, 733)
    // L'arriéré ne s'évapore pas d'un jour à l'autre.
    assert.equal(forecast.days[1]!.fileBefore, 733)
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

  test('saute samedi, dimanche et compte N jours ouvrés', ({ assert }) => {
    const forecast = build({
      lines: [
        line({
          orderedOpenQuantity: 10,
          segments: [segment({ quantity: 10, date: '2026-08-07' })],
        }),
      ],
      dailyHorizonDays: 6,
    })
    assert.deepEqual(
      forecast.days.map((day) => day.date),
      ['2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06', '2026-08-07', '2026-08-10']
    )
  })

  test('saute une fermeture usine et pose la décision sur la reprise', ({ assert }) => {
    const closed = new Set<string>()
    for (let i = 0; i < 14; i++) {
      const d = new Date('2026-08-03T00:00:00Z')
      d.setUTCDate(d.getUTCDate() + i)
      closed.add(d.toISOString().slice(0, 10))
    }
    const forecast = build({
      today: '2026-08-02',
      closedDays: closed,
      dailyHorizonDays: 6,
      decisionDays: 4,
      plantClosures: [{ from: '2026-08-03', to: '2026-08-16', motif: 'conges' }],
      lines: [line({ orderedOpenQuantity: 100, segments: [] })],
      initialQueue: [{ article: 'ART1', location: 'QUAI3', quantityUs: 100, source: 'quai' }],
    })
    assert.equal(forecast.firstWorkingDay, '2026-08-17')
    assert.deepEqual(
      forecast.days.slice(0, 4).map((day) => day.date),
      ['2026-08-17', '2026-08-18', '2026-08-19', '2026-08-20']
    )
    assert.isTrue(forecast.days.slice(0, 4).every((day) => day.band === 'decision'))
    assert.equal(forecast.days[4]!.band, 'prealert')
    assert.equal(forecast.plantClosures[0]!.motif, 'conges')
    assert.isTrue(forecast.weeks.some((week) => week.usineFermee))
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

  test('somme le stock détail avant de convertir, sans inventer une palette par ligne', ({
    assert,
  }) => {
    const forecast = build({
      lines: [line({ orderedOpenQuantity: 100, segments: [] })],
      initialQueue: [
        { article: 'ART1', location: 'QUAI3', quantityUs: 5, source: 'quai' },
        { article: 'ART1', location: 'QUAI4', quantityUs: 5, source: 'quai' },
      ],
      dailyHorizonDays: 1,
    })
    // 5 + 5 US pour 10 US/palette : 1 emplacement, pas 2 (un arrondi par ligne).
    assert.equal(forecast.initialQueuePalettes, 1)
  })

  test('toute la charge du jour tient en emplacements entiers', ({ assert }) => {
    const forecast = build({
      lines: [
        line({
          numCommande: 'A',
          orderedOpenQuantity: 162,
          segments: [segment({ quantity: 162 })],
        }),
        line({
          numCommande: 'B',
          orderedOpenQuantity: 168,
          segments: [segment({ quantity: 168 })],
        }),
      ],
      volumes: new Map([['ART1', volume('ART1', 19)]]),
      maxSpotTrucks: 0,
      dailyHorizonDays: 1,
    })
    const jour = forecast.days[0]!
    for (const value of [jour.entries, jour.available, jour.loaded, jour.fileAfter]) {
      assert.isTrue(Number.isInteger(value), `valeur fractionnaire : ${value}`)
    }
    assert.isTrue(jour.lignes.every((row) => Number.isInteger(row.palTheo ?? 0)))
  })

  test("l'allocation ERP ne se cumule pas avec le stock quai du même article", ({ assert }) => {
    const forecast = build({
      lines: [
        line({
          numCommande: 'ALLOUEE',
          orderedOpenQuantity: 500,
          segments: [segment({ quantity: 500, source: 'stock', confidence: 'constatee' })],
        }),
        line({ numCommande: 'AUTRE', orderedOpenQuantity: 500, segments: [] }),
      ],
      initialQueue: [{ article: 'ART1', location: 'QUAI3', quantityUs: 800, source: 'quai' }],
      maxSpotTrucks: 0,
      dailyHorizonDays: 1,
    })
    // 80 pal au quai dont 50 déjà allouées : seules 30 sont redistribuables.
    assert.equal(forecast.initialQueuePalettes, 30)
    assert.equal(forecast.days[0]!.available, 80)
  })
})

test.group('expedition_forecast — portillon de production', () => {
  test('étale les OF fermes à la cadence atelier au lieu de tout poser le jour 1', ({ assert }) => {
    const forecast = build({
      lines: [line({ orderedOpenQuantity: 3000, segments: [segment({ quantity: 3000 })] })],
      productionDailyCapacity: 66,
      dailyHorizonDays: 4,
    })
    // 300 pal à fabriquer : l'atelier n'en sort que 66 par jour ouvré.
    assert.equal(forecast.days[0]!.entries, 66)
    assert.equal(forecast.days[0]!.entriesProduites, 66)
    assert.equal(forecast.days[0]!.available, 66)
    assert.isFalse(forecast.days[0]!.spot)
    assert.equal(forecast.days[3]!.entries, 66)
    // 300 − 4 × 66 : ce qui déborde de l'horizon reste visible, pas absorbé.
    assert.equal(Math.round(forecast.deferredPalettes), 36)
  })

  test('une palette déjà au quai ne repasse pas par le portillon', ({ assert }) => {
    const forecast = build({
      lines: [line({ orderedOpenQuantity: 3000, segments: [] })],
      initialQueue: [{ article: 'ART1', location: 'QUAI3', quantityUs: 2000, source: 'quai' }],
      productionDailyCapacity: 66,
      maxSpotTrucks: 0,
      dailyHorizonDays: 2,
    })
    assert.equal(forecast.days[0]!.entries, 200)
    assert.equal(forecast.days[0]!.entriesProduites, 0)
  })

  test('la reprise après congès ne concentre plus tout le carnet sur un jour', ({ assert }) => {
    const closed = new Set<string>()
    for (let i = 0; i < 14; i++) {
      const d = new Date('2026-08-03T00:00:00Z')
      d.setUTCDate(d.getUTCDate() + i)
      closed.add(d.toISOString().slice(0, 10))
    }
    const forecast = build({
      today: '2026-08-02',
      closedDays: closed,
      dailyHorizonDays: 4,
      productionDailyCapacity: 66,
      maxSpotTrucks: 3,
      lines: [line({ orderedOpenQuantity: 8980, segments: [segment({ quantity: 8980 })] })],
    })
    const reprise = forecast.days[0]!
    assert.equal(reprise.date, '2026-08-17')
    // 898 pal de carnet, mais l'atelier redémarre à 66/j : plus de 26 camions.
    assert.equal(reprise.available, 66)
    assert.equal(reprise.nbCamionsSpot, 0)
    assert.isFalse(reprise.spotSature)
    assert.equal(forecast.days[3]!.available, 66)
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

  test('le carnet à échéance dépassée sort en retard au lieu de disparaître', ({ assert }) => {
    const forecast = build({
      lines: [
        line({
          numCommande: 'RETARD',
          dateLivraison: '2026-07-20',
          segments: [segment({ quantity: 100, weeklyOnly: true, date: null, source: 'ctp' })],
        }),
      ],
      dailyHorizonDays: 1,
    })
    // Antérieure à la première semaine de l'horizon : sans seau dédié, cette
    // ligne n'appartenait à aucune semaine et le retard quittait l'écran.
    assert.equal(forecast.retardPalettes, 10)
    assert.equal(forecast.retardLines[0]!.numCommande, 'RETARD')
    assert.isTrue(forecast.weeks.every((week) => week.carnetPalettes === 0))
  })

  test('la semaine ne recompte pas ce que la bande jour a déjà chargé', ({ assert }) => {
    const forecast = build({
      lines: [
        line({
          orderedOpenQuantity: 1000,
          dateLivraison: '2026-08-12',
          segments: [segment({ quantity: 1000 })],
        }),
      ],
      maxSpotTrucks: 0,
      dailyHorizonDays: 2,
    })
    // 100 pal entièrement emportées par les navettes sur 2 jours : la semaine de
    // livraison n'a plus rien à annoncer.
    assert.equal(forecast.days[0]!.loaded + forecast.days[1]!.loaded, 100)
    assert.equal(forecast.weeks[0]!.carnetPalettes, 0)
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
