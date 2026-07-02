import { test } from '@japa/runner'
import { clusterCamions, groupCamionsByNavette, type StojouLine } from '#repositories/expedition_repository'

// Timestamps de référence (ms) — 2026-07-01, écarts en minutes entre points.
const T0 = Date.UTC(2026, 6, 1, 8, 0, 0)
const MIN = 60_000

const line = (over: Partial<StojouLine>): StojouLine => ({
  bprnum: 'C1',
  client: 'Client 1',
  tsMs: T0,
  qteUc: 1,
  palnum: null,
  lpnnum: null,
  itmref: 'ART1',
  designation: 'Article 1',
  vcrnum: 'BL001',
  vcrlin: 1000,
  sohnum: null,
  ...over,
})

test.group('clusterCamions (issue #44)', () => {
  test('fusionne les timestamps du même client sous le seuil en un seul camion', ({ assert }) => {
    const lines = [
      line({ tsMs: T0, qteUc: 10, palnum: 'PAL1', lpnnum: 'LPN1' }),
      line({ tsMs: T0 + 2 * MIN, qteUc: 5, palnum: 'PAL2', lpnnum: 'LPN2' }),
      line({ tsMs: T0 + 4 * MIN, qteUc: 7, palnum: 'PAL3', lpnnum: 'LPN3' }),
    ]
    const camions = clusterCamions(lines, 5)
    assert.lengthOf(camions, 1)
    assert.equal(camions[0].qteUc, 22)
    assert.equal(camions[0].nbPalettes, 3)
    assert.equal(camions[0].nbLignes, 3)
    assert.equal(camions[0].debut, '08:00')
    assert.equal(camions[0].fin, '08:04')
  })

  test('valeur absolue : une quantité négative (sortie de stock côté X3) ne rend jamais le total négatif', ({ assert }) => {
    const lines = [
      line({ tsMs: T0, qteUc: -12 }),
      line({ tsMs: T0 + MIN, qteUc: -8 }),
    ]
    const camions = clusterCamions(lines, 5)
    assert.lengthOf(camions, 1)
    assert.equal(camions[0].qteUc, 20)
    assert.isAbove(camions[0].qteUc, 0)
  })

  test('une palette répartie sur plusieurs timestamps du même cluster est comptée une seule fois', ({ assert }) => {
    // Bug réel : compter COUNT(DISTINCT PALNUM) par timestamp puis sommer entre
    // timestamps recomptait les palettes vues à plusieurs instants → 68 palettes
    // pour un seul camion. Le comptage doit être dédupliqué sur tout le cluster.
    const lines = [
      line({ tsMs: T0, palnum: 'PAL1' }),
      line({ tsMs: T0, palnum: 'PAL1' }), // 2 lignes (2 articles) sur la même palette au même instant
      line({ tsMs: T0 + MIN, palnum: 'PAL1' }), // même palette, timestamp voisin (< seuil)
      line({ tsMs: T0 + 2 * MIN, palnum: 'PAL2' }),
    ]
    const camions = clusterCamions(lines, 5)
    assert.lengthOf(camions, 1)
    assert.equal(camions[0].nbPalettes, 2)
    assert.equal(camions[0].nbLignes, 4)
  })

  test('sépare en deux camions si le trou dépasse le seuil', ({ assert }) => {
    const lines = [
      line({ tsMs: T0, qteUc: 10 }),
      line({ tsMs: T0 + 10 * MIN, qteUc: 8 }),
    ]
    const camions = clusterCamions(lines, 5)
    assert.lengthOf(camions, 2)
    assert.equal(camions[0].qteUc, 10)
    assert.equal(camions[1].qteUc, 8)
  })

  test('ne fusionne jamais deux clients différents même au même timestamp', ({ assert }) => {
    const lines = [
      line({ bprnum: 'C1', client: 'Client 1', tsMs: T0, qteUc: 10 }),
      line({ bprnum: 'C2', client: 'Client 2', tsMs: T0, qteUc: 8 }),
    ]
    const camions = clusterCamions(lines, 5)
    assert.lengthOf(camions, 2)
  })

  test('clustering en chaîne : le seuil se mesure depuis le dernier point du cluster, pas le premier', ({ assert }) => {
    // Écarts de 4 min entre points consécutifs (< seuil 5) mais 12 min entre le 1er et le dernier (> seuil).
    const lines = [
      line({ tsMs: T0 }),
      line({ tsMs: T0 + 4 * MIN }),
      line({ tsMs: T0 + 8 * MIN }),
      line({ tsMs: T0 + 12 * MIN }),
    ]
    const camions = clusterCamions(lines, 5)
    assert.lengthOf(camions, 1)
    assert.equal(camions[0].nbLignes, 4)
  })

  test('seuil à 0 → aucun regroupement au-delà des timestamps strictement identiques', ({ assert }) => {
    const lines = [line({ tsMs: T0 }), line({ tsMs: T0 + MIN })]
    const camions = clusterCamions(lines, 0)
    assert.lengthOf(camions, 2)
  })

  test('signale une anomalie quand le nombre de palettes dépasse la capacité plausible d’un camion', ({ assert }) => {
    const many = Array.from({ length: 40 }, (_, i) => line({ tsMs: T0 + i * MIN, palnum: `PAL${i}` }))
    const camions = clusterCamions(many, 60, 35)
    assert.lengthOf(camions, 1)
    assert.equal(camions[0].nbPalettes, 40)
    assert.isTrue(camions[0].anomalie)
  })

  test('pas d’anomalie sous la capacité plausible', ({ assert }) => {
    const few = Array.from({ length: 10 }, (_, i) => line({ tsMs: T0 + i * MIN, palnum: `PAL${i}` }))
    const camions = clusterCamions(few, 60, 35)
    assert.isFalse(camions[0].anomalie)
  })

  test('le détail des lignes est porté par chaque camion avec article, BL et heure', ({ assert }) => {
    const lines = [
      line({ tsMs: T0, qteUc: -10, itmref: 'ART1', designation: 'Article 1', vcrnum: 'BL001', vcrlin: 1000, palnum: 'PAL1' }),
      line({ tsMs: T0 + MIN, qteUc: -5, itmref: 'ART2', designation: 'Article 2', vcrnum: 'BL002', vcrlin: 2000, palnum: 'PAL2' }),
    ]
    const camions = clusterCamions(lines, 5)
    assert.lengthOf(camions, 1)
    assert.lengthOf(camions[0].lignes, 2)
    assert.equal(camions[0].lignes[0].itmref, 'ART1')
    assert.equal(camions[0].lignes[0].designation, 'Article 1')
    assert.equal(camions[0].lignes[0].vcrnum, 'BL001')
    assert.equal(camions[0].lignes[0].vcrlin, 1000)
    // qteUc en valeur absolue, même côté détail ligne.
    assert.equal(camions[0].lignes[0].qteUc, 10)
    assert.equal(camions[0].lignes[1].qteUc, 5)
    // ts formaté HH:mm:ss.
    assert.equal(camions[0].lignes[0].ts, '08:00:00')
    assert.equal(camions[0].lignes[1].ts, '08:01:00')
  })

  test('les lignes de détail sont isolées entre deux camions séparés par un trou', ({ assert }) => {
    const lines = [
      line({ tsMs: T0, qteUc: 10, itmref: 'ART1', vcrnum: 'BL001', palnum: 'PAL1' }),
      line({ tsMs: T0 + 10 * MIN, qteUc: 8, itmref: 'ART2', vcrnum: 'BL002', palnum: 'PAL2' }),
    ]
    const camions = clusterCamions(lines, 5)
    assert.lengthOf(camions, 2)
    assert.lengthOf(camions[0].lignes, 1)
    assert.lengthOf(camions[1].lignes, 1)
    assert.equal(camions[0].lignes[0].vcrnum, 'BL001')
    assert.equal(camions[1].lignes[0].vcrnum, 'BL002')
  })

  test('une ligne sans article ni BL expose des valeurs nulles propres (pas d’undefined)', ({ assert }) => {
    const lines = [
      line({ tsMs: T0, itmref: null, designation: null, vcrnum: null, vcrlin: null }),
    ]
    const camions = clusterCamions(lines, 5)
    assert.lengthOf(camions[0].lignes, 1)
    const l = camions[0].lignes[0]
    assert.equal(l.itmref, '')
    assert.equal(l.designation, '')
    assert.equal(l.vcrnum, '')
    assert.equal(l.vcrlin, 0)
  })
})

test.group('groupCamionsByNavette (issue #44 affinage)', () => {
  /** Ligne avec une navette rattachée (propriété transitoire `navetteNum`). */
  const navLine = (over: Partial<StojouLine> & { navetteNum?: string }): StojouLine =>
    line({ ...over }) as StojouLine

  test('regroupe les lignes par NAVETTE_0, multi-commandes mais un seul camion', ({ assert }) => {
    const lines = [
      navLine({ tsMs: T0, palnum: 'PAL1', sohnum: 'CMD1', navetteNum: 'NAV001' }),
      navLine({ tsMs: T0 + MIN, palnum: 'PAL2', sohnum: 'CMD2', navetteNum: 'NAV001' }),
      navLine({ tsMs: T0 + 2 * MIN, palnum: 'PAL3', sohnum: 'CMD1', navetteNum: 'NAV001' }),
    ]
    const camions = groupCamionsByNavette(lines)
    assert.lengthOf(camions, 1)
    assert.equal(camions[0].source, 'navette')
    assert.equal(camions[0].navetteNum, 'NAV001')
    assert.equal(camions[0].nbPalettes, 3)
    assert.lengthOf(camions[0].lignes, 3)
  })

  test('les camions navette ne sont jamais marqués anomalie même > 35 palettes', ({ assert }) => {
    const lines = Array.from({ length: 40 }, (_, i) =>
      navLine({ tsMs: T0 + i * MIN, palnum: `PAL${i}`, navetteNum: 'NAV_BIG' }),
    )
    const camions = groupCamionsByNavette(lines)
    assert.lengthOf(camions, 1)
    assert.equal(camions[0].nbPalettes, 40)
    assert.isFalse(camions[0].anomalie)
  })

  test('sépare deux navettes distinctes en deux camions', ({ assert }) => {
    const lines = [
      navLine({ tsMs: T0, palnum: 'PAL1', navetteNum: 'NAV_A' }),
      navLine({ tsMs: T0, palnum: 'PAL2', navetteNum: 'NAV_B' }),
    ]
    const camions = groupCamionsByNavette(lines)
    assert.lengthOf(camions, 2)
    assert.equal(camions[0].navetteNum, 'NAV_A')
    assert.equal(camions[1].navetteNum, 'NAV_B')
  })

  test('ignore les lignes sans navetteNum (filet heuristique géré à part)', ({ assert }) => {
    const lines = [
      navLine({ tsMs: T0, palnum: 'PAL1', navetteNum: 'NAV001' }),
      navLine({ tsMs: T0, palnum: 'PAL2' }), // sans navetteNum
    ]
    const camions = groupCamionsByNavette(lines)
    assert.lengthOf(camions, 1)
    assert.equal(camions[0].navetteNum, 'NAV001')
    assert.lengthOf(camions[0].lignes, 1)
  })

  test('la commande client (SOHNUM) est portée dans chaque ligne de détail', ({ assert }) => {
    const lines = [
      navLine({ tsMs: T0, palnum: 'PAL1', sohnum: 'AR2503001', navetteNum: 'NAV001' }),
      navLine({ tsMs: T0 + MIN, palnum: 'PAL2', sohnum: 'AR2503002', navetteNum: 'NAV001' }),
    ]
    const camions = groupCamionsByNavette(lines)
    assert.equal(camions[0].lignes[0].sohnum, 'AR2503001')
    assert.equal(camions[0].lignes[1].sohnum, 'AR2503002')
  })

  test('clusterCamions marque bien ses camions comme heuristique (sans navette)', ({ assert }) => {
    const lines = [line({ tsMs: T0, palnum: 'PAL1' })]
    const camions = clusterCamions(lines, 5)
    assert.equal(camions[0].source, 'heuristique')
    assert.isNull(camions[0].navetteNum)
  })
})
