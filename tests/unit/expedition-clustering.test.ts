import { test } from '@japa/runner'
import { clusterCamions } from '#repositories/expedition_repository'

// Timestamps de référence (ms) — 2026-07-01, écarts en minutes entre points.
const T0 = Date.UTC(2026, 6, 1, 8, 0, 0)
const MIN = 60_000

test.group('clusterCamions (issue #44)', () => {
  test('fusionne les timestamps du même client sous le seuil en un seul camion', ({ assert }) => {
    const groups = [
      { bprnum: 'C1', client: 'Client 1', tsMs: T0, qteUc: 10, nbPalettes: 2, nbContenants: 2 },
      { bprnum: 'C1', client: 'Client 1', tsMs: T0 + 2 * MIN, qteUc: 5, nbPalettes: 1, nbContenants: 1 },
      { bprnum: 'C1', client: 'Client 1', tsMs: T0 + 4 * MIN, qteUc: 7, nbPalettes: 1, nbContenants: 1 },
    ]
    const camions = clusterCamions(groups, 5)
    assert.lengthOf(camions, 1)
    assert.equal(camions[0].qteUc, 22)
    assert.equal(camions[0].nbPalettes, 4)
    assert.equal(camions[0].nbLignes, 3)
    assert.equal(camions[0].debut, '08:00')
    assert.equal(camions[0].fin, '08:04')
  })

  test('sépare en deux camions si le trou dépasse le seuil', ({ assert }) => {
    const groups = [
      { bprnum: 'C1', client: 'Client 1', tsMs: T0, qteUc: 10, nbPalettes: 1, nbContenants: 1 },
      { bprnum: 'C1', client: 'Client 1', tsMs: T0 + 10 * MIN, qteUc: 8, nbPalettes: 1, nbContenants: 1 },
    ]
    const camions = clusterCamions(groups, 5)
    assert.lengthOf(camions, 2)
    assert.equal(camions[0].qteUc, 10)
    assert.equal(camions[1].qteUc, 8)
  })

  test('ne fusionne jamais deux clients différents même au même timestamp', ({ assert }) => {
    const groups = [
      { bprnum: 'C1', client: 'Client 1', tsMs: T0, qteUc: 10, nbPalettes: 1, nbContenants: 1 },
      { bprnum: 'C2', client: 'Client 2', tsMs: T0, qteUc: 8, nbPalettes: 1, nbContenants: 1 },
    ]
    const camions = clusterCamions(groups, 5)
    assert.lengthOf(camions, 2)
  })

  test('clustering en chaîne : le seuil se mesure depuis le dernier point du cluster, pas le premier', ({ assert }) => {
    // Écarts de 4 min entre points consécutifs (< seuil 5) mais 12 min entre le 1er et le dernier (> seuil).
    const groups = [
      { bprnum: 'C1', client: 'Client 1', tsMs: T0, qteUc: 1, nbPalettes: 1, nbContenants: 1 },
      { bprnum: 'C1', client: 'Client 1', tsMs: T0 + 4 * MIN, qteUc: 1, nbPalettes: 1, nbContenants: 1 },
      { bprnum: 'C1', client: 'Client 1', tsMs: T0 + 8 * MIN, qteUc: 1, nbPalettes: 1, nbContenants: 1 },
      { bprnum: 'C1', client: 'Client 1', tsMs: T0 + 12 * MIN, qteUc: 1, nbPalettes: 1, nbContenants: 1 },
    ]
    const camions = clusterCamions(groups, 5)
    assert.lengthOf(camions, 1)
    assert.equal(camions[0].nbLignes, 4)
  })

  test('seuil à 0 → aucun regroupement au-delà des timestamps strictement identiques', ({ assert }) => {
    const groups = [
      { bprnum: 'C1', client: 'Client 1', tsMs: T0, qteUc: 1, nbPalettes: 1, nbContenants: 1 },
      { bprnum: 'C1', client: 'Client 1', tsMs: T0 + MIN, qteUc: 1, nbPalettes: 1, nbContenants: 1 },
    ]
    const camions = clusterCamions(groups, 0)
    assert.lengthOf(camions, 2)
  })
})
