import { test } from '@japa/runner'
import { clusterCamions, decompose, type StojouLine } from '#repositories/expedition_repository'

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
  vcrnum: null,
  vcrlin: null,
  sohnum: null,
  pcu: 'CAR',
  pcuStuCoe: 1,
  ucParPal: 16,
  yfamstat7: null,
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

  test('valeur absolue : une quantité négative (sortie de stock côté X3) ne rend jamais le total négatif', ({
    assert,
  }) => {
    const lines = [line({ tsMs: T0, qteUc: -12 }), line({ tsMs: T0 + MIN, qteUc: -8 })]
    const camions = clusterCamions(lines, 5)
    assert.lengthOf(camions, 1)
    assert.equal(camions[0].qteUc, 20)
    assert.isAbove(camions[0].qteUc, 0)
  })

  test('une palette répartie sur plusieurs timestamps du même cluster est comptée une seule fois', ({
    assert,
  }) => {
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
    const lines = [line({ tsMs: T0, qteUc: 10 }), line({ tsMs: T0 + 10 * MIN, qteUc: 8 })]
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

  test('clustering en chaîne : le seuil se mesure depuis le dernier point du cluster, pas le premier', ({
    assert,
  }) => {
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

  test('seuil à 0 → aucun regroupement au-delà des timestamps strictement identiques', ({
    assert,
  }) => {
    const lines = [line({ tsMs: T0 }), line({ tsMs: T0 + MIN })]
    const camions = clusterCamions(lines, 0)
    assert.lengthOf(camions, 2)
  })

  test('signale une anomalie quand le nombre de palettes dépasse la capacité plausible d’un camion', ({
    assert,
  }) => {
    const many = Array.from({ length: 40 }, (_, i) =>
      line({ tsMs: T0 + i * MIN, palnum: `PAL${i}` })
    )
    const camions = clusterCamions(many, 60, 35)
    assert.lengthOf(camions, 1)
    assert.equal(camions[0].nbPalettes, 40)
    assert.isTrue(camions[0].anomalie)
  })

  test('pas d’anomalie sous la capacité plausible', ({ assert }) => {
    const few = Array.from({ length: 10 }, (_, i) =>
      line({ tsMs: T0 + i * MIN, palnum: `PAL${i}` })
    )
    const camions = clusterCamions(few, 60, 35)
    assert.isFalse(camions[0].anomalie)
  })

  test('le détail des lignes est porté par chaque camion avec article, BL et heure', ({
    assert,
  }) => {
    const lines = [
      line({
        tsMs: T0,
        qteUc: -10,
        itmref: 'ART1',
        designation: 'Article 1',
        vcrnum: 'BL001',
        vcrlin: 1000,
        palnum: 'PAL1',
      }),
      line({
        tsMs: T0 + MIN,
        qteUc: -5,
        itmref: 'ART2',
        designation: 'Article 2',
        vcrnum: 'BL002',
        vcrlin: 2000,
        palnum: 'PAL2',
      }),
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

  test('une ligne sans article ni BL expose des valeurs nulles propres (pas d’undefined)', ({
    assert,
  }) => {
    const lines = [line({ tsMs: T0, itmref: null, designation: null, vcrnum: null, vcrlin: null })]
    const camions = clusterCamions(lines, 5)
    assert.lengthOf(camions[0].lignes, 1)
    const l = camions[0].lignes[0]
    assert.equal(l.itmref, '')
    assert.equal(l.designation, '')
    assert.equal(l.vcrnum, '')
    assert.equal(l.vcrlin, 0)
  })
})

test.group('Navettes & rattrapage orpheline (pipeline unifié, issue #44)', () => {
  /** Pose la propriété transitoire navetteNum sur une StojouLine (comme getExpeditions). */
  const withNav = (l: StojouLine, navetteNum: string): StojouLine => {
    ;(l as StojouLine & { navetteNum?: string }).navetteNum = navetteNum
    return l
  }

  test("les lignes d'une même navette → 1 camion source=navette", ({ assert }) => {
    const lines = [
      withNav(line({ tsMs: T0, palnum: 'PAL1', sohnum: 'CMD1' }), 'NAV001'),
      withNav(line({ tsMs: T0 + MIN, palnum: 'PAL2', sohnum: 'CMD2' }), 'NAV001'),
      withNav(line({ tsMs: T0 + 2 * MIN, palnum: 'PAL3', sohnum: 'CMD1' }), 'NAV001'),
    ]
    const camions = clusterCamions(lines, 5)
    assert.lengthOf(camions, 1)
    assert.equal(camions[0].source, 'navette')
    assert.equal(camions[0].navetteNum, 'NAV001')
    assert.equal(camions[0].nbPalettes, 3)
    assert.lengthOf(camions[0].lignes, 3)
  })

  test('les camions navette ne sont jamais marqués anomalie même > 35 palettes', ({ assert }) => {
    const lines = Array.from({ length: 40 }, (_, i) =>
      withNav(line({ tsMs: T0 + i * MIN, palnum: `PAL${i}` }), 'NAV_BIG')
    )
    const camions = clusterCamions(lines, 5)
    assert.lengthOf(camions, 1)
    assert.equal(camions[0].nbPalettes, 40)
    assert.isFalse(camions[0].anomalie)
  })

  test('deux navettes distinctes (clients différents) → 2 camions', ({ assert }) => {
    const lines = [
      withNav(line({ bprnum: 'CA', client: 'Client A', tsMs: T0, palnum: 'PAL1' }), 'NAV_A'),
      withNav(line({ bprnum: 'CB', client: 'Client B', tsMs: T0, palnum: 'PAL2' }), 'NAV_B'),
    ]
    const camions = clusterCamions(lines, 5)
    assert.lengthOf(camions, 2)
    assert.equal(camions[0].navetteNum, 'NAV_A')
    assert.equal(camions[1].navetteNum, 'NAV_B')
  })

  test('palette orpheline (sans navette) rattrapée si même client + créneau', ({ assert }) => {
    // PAL1 a une navette, PAL2 n'en a pas mais même client + créneau contigu.
    // Le walk gap les met dans le même cluster → fusion navette → camion source=navette.
    const lines = [
      withNav(line({ tsMs: T0, palnum: 'PAL1' }), 'NAV001'),
      line({ tsMs: T0 + MIN, palnum: 'PAL2' }), // orpheline
    ]
    const camions = clusterCamions(lines, 5)
    assert.lengthOf(camions, 1)
    assert.equal(camions[0].source, 'navette')
    assert.equal(camions[0].navetteNum, 'NAV001')
    assert.equal(camions[0].nbPalettes, 2)
    assert.lengthOf(camions[0].lignes, 2)
  })

  test('orpheline éloignée (hors gap) → camion heuristique séparé', ({ assert }) => {
    // L'orpheline est trop éloignée temporellement → walk gap la sépare → heuristique.
    const lines = [
      withNav(line({ tsMs: T0, palnum: 'PAL1' }), 'NAV001'),
      line({ tsMs: T0 + 60 * MIN, palnum: 'PAL2' }), // orpheline éloignée
    ]
    const camions = clusterCamions(lines, 5)
    assert.lengthOf(camions, 2)
    assert.equal(camions[0].source, 'navette')
    assert.equal(camions[1].source, 'heuristique')
  })

  test('deux navettes distinctes validées dans la foulée → 2 camions (frontière navette)', ({
    assert,
  }) => {
    // Même client, créneaux contigus (1 min) : le walk gap sur-fusionnerait sans frontière.
    // Cas réel : deux camions validés l'un après l'autre par l'opérateur (ex. 61 palettes).
    const lines = [
      withNav(line({ tsMs: T0, palnum: 'PAL1' }), 'NAV_A'),
      withNav(line({ tsMs: T0 + MIN, palnum: 'PAL2' }), 'NAV_B'),
    ]
    const camions = clusterCamions(lines, 5)
    assert.lengthOf(camions, 2)
    assert.equal(camions[0].source, 'navette')
    assert.equal(camions[0].navetteNum, 'NAV_A')
    assert.equal(camions[1].source, 'navette')
    assert.equal(camions[1].navetteNum, 'NAV_B')
  })

  test('orpheline entre deux navettes distinctes → absorbée par la navette la plus proche', ({
    assert,
  }) => {
    // NAV_A à T0, orpheline à T0+MIN, NAV_B à T0+2*MIN. L'orpheline va avec NAV_A (cluster contigu).
    const lines = [
      withNav(line({ tsMs: T0, palnum: 'PAL1' }), 'NAV_A'),
      line({ tsMs: T0 + MIN, palnum: 'PAL2' }), // orpheline
      withNav(line({ tsMs: T0 + 2 * MIN, palnum: 'PAL3' }), 'NAV_B'),
    ]
    const camions = clusterCamions(lines, 5)
    assert.lengthOf(camions, 2)
    // Camion NAV_A contient PAL1 + l'orpheline PAL2.
    const navA = camions.find((c) => c.navetteNum === 'NAV_A')!
    assert.equal(navA.nbPalettes, 2)
    assert.lengthOf(navA.lignes, 2)
    // Camion NAV_B contient PAL3 seul.
    const navB = camions.find((c) => c.navetteNum === 'NAV_B')!
    assert.equal(navB.nbPalettes, 1)
  })

  test('la commande client (SOHNUM) est portée dans chaque ligne de détail', ({ assert }) => {
    const lines = [
      withNav(line({ tsMs: T0, palnum: 'PAL1', sohnum: 'AR2503001' }), 'NAV001'),
      withNav(line({ tsMs: T0 + MIN, palnum: 'PAL2', sohnum: 'AR2503002' }), 'NAV001'),
    ]
    const camions = clusterCamions(lines, 5)
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

test.group('Équivalent-palettes & taux de remplissage (issue #44 affinage volumes)', () => {
  test('palTheo est calculé depuis UC / ucParPal (PCUSTUCOE_1)', ({ assert }) => {
    // 16 UC / 16 UC-par-palette = 1 palette théorique.
    const lines = [line({ tsMs: T0, qteUc: 16, ucParPal: 16, palnum: 'PAL1' })]
    const camions = clusterCamions(lines, 5)
    assert.isAtLeast(camions[0].palTheo, 0.99)
    assert.isAtMost(camions[0].palTheo, 1.01)
  })

  test('palTheo agrège plusieurs lignes avec des palettisations différentes', ({ assert }) => {
    // Ligne 1 : 16 UC / 16 = 1 pal. Ligne 2 : 40 UC / 20 = 2 pal. Total = 3 pal.
    const lines = [
      line({ tsMs: T0, qteUc: 16, ucParPal: 16, palnum: 'PAL1' }),
      line({ tsMs: T0 + MIN, qteUc: 40, ucParPal: 20, palnum: 'PAL2' }),
    ]
    const camions = clusterCamions(lines, 5)
    assert.isAtLeast(camions[0].palTheo, 2.99)
    assert.isAtMost(camions[0].palTheo, 3.01)
  })

  test('palTheo = -1 (N/A) quand aucun ucParPal exploitable', ({ assert }) => {
    const lines = [
      line({ tsMs: T0, qteUc: 100, ucParPal: 0, palnum: 'PAL1' }),
      line({ tsMs: T0 + MIN, qteUc: 50, ucParPal: null, palnum: 'PAL2' }),
    ]
    const camions = clusterCamions(lines, 5)
    assert.equal(camions[0].palTheo, -1)
    assert.equal(camions[0].tauxRemplissage, -1)
    assert.equal(camions[0].ecartPalettes, -1)
  })

  test('tauxRemplissage = palTheo / capacité (33 pal)', ({ assert }) => {
    // 33 palettes théoriques = 100% de remplissage. 33 × 16 UC = 528 UC.
    const lines = [line({ tsMs: T0, qteUc: 33 * 16, ucParPal: 16, palnum: 'PAL1' })]
    const camions = clusterCamions(lines, 5)
    assert.isAtLeast(camions[0].tauxRemplissage, 0.99)
    assert.isAtMost(camions[0].tauxRemplissage, 1.01)
  })

  test('ecartPalettes = 0 quand palettes comptées = palettes théoriques', ({ assert }) => {
    // 1 palette scannée (PAL1), volume = 1 palette théorique (16 UC / 16).
    const lines = [line({ tsMs: T0, qteUc: 16, ucParPal: 16, palnum: 'PAL1' })]
    const camions = clusterCamions(lines, 5)
    assert.equal(camions[0].nbPalettes, 1)
    assert.isAtMost(camions[0].ecartPalettes, 0.01)
  })

  test('ecartPalettes détecte une divergence (scan incomplet)', ({ assert }) => {
    // 1 palette scannée mais volume = 10 palettes théoriques → écart ~90%.
    const lines = [line({ tsMs: T0, qteUc: 160, ucParPal: 16, palnum: 'PAL1' })]
    const camions = clusterCamions(lines, 5)
    assert.equal(camions[0].nbPalettes, 1)
    assert.isAbove(camions[0].ecartPalettes, 0.8)
  })

  test('palTheo est aussi calculé pour les camions navette', ({ assert }) => {
    const lines = [line({ tsMs: T0, qteUc: 16, ucParPal: 16, palnum: 'PAL1' })]
    // Pose la propriété transitoire navetteNum comme le ferait getExpeditions.
    ;(lines[0] as StojouLine & { navetteNum?: string }).navetteNum = 'NAV001'
    const camions = clusterCamions(lines, 5)
    assert.equal(camions[0].source, 'navette')
    assert.isAtLeast(camions[0].palTheo, 0.99)
    assert.isAtMost(camions[0].palTheo, 1.01)
  })

  test('une palette ESH (YFAMSTAT7=ESH) pèse 1,25 équivalent-standard', ({ assert }) => {
    // 16 UC / 16 = 1 palette. Famille ESH → facteur 1,25 → palTheo = 1,25.
    const lines = [line({ tsMs: T0, qteUc: 16, ucParPal: 16, palnum: 'PAL1', yfamstat7: 'ESH' })]
    const camions = clusterCamions(lines, 5)
    assert.isAtLeast(camions[0].palTheo, 1.24)
    assert.isAtMost(camions[0].palTheo, 1.26)
  })

  test('mélange standard + ESH dans un camion : somme pondérée correcte', ({ assert }) => {
    // 1 palette standard (1,0) + 1 palette ESH (1,25) = 2,25 éq. standard.
    const lines = [
      line({ tsMs: T0, qteUc: 16, ucParPal: 16, palnum: 'PAL1', yfamstat7: 'BDC' }),
      line({ tsMs: T0 + MIN, qteUc: 16, ucParPal: 16, palnum: 'PAL2', yfamstat7: 'ESH' }),
    ]
    const camions = clusterCamions(lines, 5)
    assert.isAtLeast(camions[0].palTheo, 2.24)
    assert.isAtMost(camions[0].palTheo, 2.26)
  })

  test('article non-ESH = facteur de surface 1 (inchangé vs sans yfamstat7)', ({ assert }) => {
    const lines = [line({ tsMs: T0, qteUc: 16, ucParPal: 16, palnum: 'PAL1', yfamstat7: 'VAM' })]
    const camions = clusterCamions(lines, 5)
    assert.isAtLeast(camions[0].palTheo, 0.99)
    assert.isAtMost(camions[0].palTheo, 1.01)
  })
})

test.group('Fusion BL — non-éclatement des bons de livraison (VCRNUM_0)', () => {
  test('deux lignes même BL mais timestamps éloignés → 1 camion fusionné', ({ assert }) => {
    // Sans la règle BL : trou > seuil → 2 camions. Avec : même BL → fusion.
    const lines = [
      line({ tsMs: T0, vcrnum: 'BL999', palnum: 'PAL1' }),
      line({ tsMs: T0 + 60 * MIN, vcrnum: 'BL999', palnum: 'PAL2' }),
    ]
    const camions = clusterCamions(lines, 5)
    assert.lengthOf(camions, 1)
    assert.lengthOf(camions[0].lignes, 2)
  })

  test('deux BL distincts non reliés → 2 camions séparés', ({ assert }) => {
    const lines = [
      line({ tsMs: T0, vcrnum: 'BL-A', palnum: 'PAL1' }),
      line({ tsMs: T0 + 60 * MIN, vcrnum: 'BL-B', palnum: 'PAL2' }),
    ]
    const camions = clusterCamions(lines, 5)
    assert.lengthOf(camions, 2)
  })

  test('fusion transitive (camion1↔BL-x↔camion2↔BL-y↔camion3) → 1 camion', ({ assert }) => {
    // C1 a BL-x, C2 a BL-x ET BL-y, C3 a BL-y. Transitivité → tous fusionnés.
    const lines = [
      line({ bprnum: 'C1', tsMs: T0, vcrnum: 'BL-x', palnum: 'PAL1' }),
      line({ bprnum: 'C2', tsMs: T0 + 60 * MIN, vcrnum: 'BL-x', palnum: 'PAL2' }),
      line({ bprnum: 'C2', tsMs: T0 + 61 * MIN, vcrnum: 'BL-y', palnum: 'PAL3' }),
      line({ bprnum: 'C3', tsMs: T0 + 120 * MIN, vcrnum: 'BL-y', palnum: 'PAL4' }),
    ]
    const camions = clusterCamions(lines, 5)
    assert.lengthOf(camions, 1)
    assert.lengthOf(camions[0].lignes, 4)
  })

  test('lignes sans VCRNUM ne sont jamais fusionnées', ({ assert }) => {
    // Lignes sans BL, timestamps éloignés → comportement heuristique normal (2 camions).
    const lines = [
      line({ tsMs: T0, vcrnum: null, palnum: 'PAL1' }),
      line({ tsMs: T0 + 60 * MIN, vcrnum: null, palnum: 'PAL2' }),
    ]
    const camions = clusterCamions(lines, 5)
    assert.lengthOf(camions, 2)
  })

  test('volumes (palTheo/anomalie) recalculés après fusion', ({ assert }) => {
    // 2 lignes même BL, chacune 16 UC / 16 ucParPal = 1 palette théo.
    // Fusion → 32 UC → 2 palettes théo. Compté : 2 palettes (PAL1+PAL2).
    const lines = [
      line({ tsMs: T0, qteUc: 16, ucParPal: 16, vcrnum: 'BL1', palnum: 'PAL1' }),
      line({ tsMs: T0 + 60 * MIN, qteUc: 16, ucParPal: 16, vcrnum: 'BL1', palnum: 'PAL2' }),
    ]
    const camions = clusterCamions(lines, 5)
    assert.lengthOf(camions, 1)
    assert.equal(camions[0].nbPalettes, 2)
    assert.isAtLeast(camions[0].palTheo, 1.99)
    assert.isAtMost(camions[0].palTheo, 2.01)
  })

  test('client du camion fusionné = celui au début le plus précoce', ({ assert }) => {
    const lines = [
      line({ bprnum: 'C2', client: 'Client 2', tsMs: T0 + 60 * MIN, vcrnum: 'BL1' }),
      line({ bprnum: 'C1', client: 'Client 1', tsMs: T0, vcrnum: 'BL1' }),
    ]
    const camions = clusterCamions(lines, 5)
    assert.lengthOf(camions, 1)
    assert.equal(camions[0].client, 'Client 1')
    assert.equal(camions[0].bprnum, 'C1')
  })
})

test.group('Décomposition contenants (palette → carton → unités)', () => {
  test('exemple canonique : 1200 UC, 100/boîte, 1000/palette → 1 pal + 2 cart', ({ assert }) => {
    const c = decompose(1200, 100, 1000)
    assert.equal(c.pal, 1)
    assert.equal(c.cart, 2)
    assert.equal(c.unites, 0)
  })

  test('quantité < 1 palette → que des cartons', ({ assert }) => {
    const c = decompose(250, 100, 1000)
    assert.equal(c.pal, 0)
    assert.equal(c.cart, 2)
    assert.equal(c.unites, 50)
  })

  test('reste volant non conditionné', ({ assert }) => {
    // 1205 UC → 1 pal (1000), reste 205 → 2 cart (200), reste 5 unités.
    const c = decompose(1205, 100, 1000)
    assert.equal(c.pal, 1)
    assert.equal(c.cart, 2)
    assert.equal(c.unites, 5)
  })

  test('sans coef palette (0) → tout en cartons', ({ assert }) => {
    const c = decompose(350, 100, 0)
    assert.equal(c.pal, 0)
    assert.equal(c.cart, 3)
    assert.equal(c.unites, 50)
  })

  test('sans aucun coef → tout en unités volantes', ({ assert }) => {
    const c = decompose(350, 0, 0)
    assert.equal(c.pal, 0)
    assert.equal(c.cart, 0)
    assert.equal(c.unites, 350)
  })

  test('quantité négative (sortie de stock) → valeur absolue', ({ assert }) => {
    const c = decompose(-1200, 100, 1000)
    assert.equal(c.pal, 1)
    assert.equal(c.cart, 2)
  })

  test('la décomposition est agrégée sur le camion', ({ assert }) => {
    // 2 lignes même cluster : 1200 UC (1 pal + 2 cart) + 1200 UC (1 pal + 2 cart).
    const lines = [
      line({ tsMs: T0, qteUc: 1200, pcuStuCoe: 100, ucParPal: 1000, palnum: 'PAL1' }),
      line({ tsMs: T0 + MIN, qteUc: 1200, pcuStuCoe: 100, ucParPal: 1000, palnum: 'PAL2' }),
    ]
    const camions = clusterCamions(lines, 5)
    assert.lengthOf(camions, 1)
    assert.equal(camions[0].contenants.pal, 2)
    assert.equal(camions[0].contenants.cart, 4)
    assert.equal(camions[0].contenants.unites, 0)
  })

  test('la décomposition est portée par chaque ligne de détail', ({ assert }) => {
    const lines = [line({ tsMs: T0, qteUc: 1200, pcuStuCoe: 100, ucParPal: 1000, palnum: 'PAL1' })]
    const camions = clusterCamions(lines, 5)
    assert.equal(camions[0].lignes[0].pal, 1)
    assert.equal(camions[0].lignes[0].cart, 2)
    assert.equal(camions[0].lignes[0].unites, 0)
  })

  test('VB (non conditionné) : 1 UC = 1 palette, pas de carton', ({ assert }) => {
    // 3 UC livrées d'un article VBP → 3 palettes, 0 carton, 0 unité volante.
    const c = decompose(3, 0, 0, 'VBP')
    assert.equal(c.pal, 3)
    assert.equal(c.cart, 0)
    assert.equal(c.unites, 0)
  })

  test('VB2 : même règle (préfixe VB)', ({ assert }) => {
    const c = decompose(5, 0, 0, 'VB2')
    assert.equal(c.pal, 5)
    assert.equal(c.cart, 0)
  })

  test('VB : les coefs éventuels sont ignorés (règle métier prioritaire)', ({ assert }) => {
    // Même si l'article avait des coefs saisis par erreur, VB force 1 UC = 1 palette.
    const c = decompose(3, 100, 1000, 'VBP')
    assert.equal(c.pal, 3)
    assert.equal(c.cart, 0)
    assert.equal(c.unites, 0)
  })
})

test.group('palTheo & taux remplissage — articles non conditionnés VB', () => {
  test('palTheo compte 1 palette par UC pour les articles VB', ({ assert }) => {
    // 3 UC VBP → 3 palettes théoriques (sans coef palettisation).
    const lines = [line({ tsMs: T0, qteUc: 3, ucParPal: 0, yfamstat7: 'VBP', palnum: 'PAL1' })]
    const camions = clusterCamions(lines, 5)
    assert.isAtLeast(camions[0].palTheo, 2.99)
    assert.isAtMost(camions[0].palTheo, 3.01)
  })

  test('VB seul (sans coef) → palTheo calculable (plus de N/A)', ({ assert }) => {
    // Avant la règle VB : palTheo = -1 (aucun coef). Maintenant : calculé.
    const lines = [
      line({ tsMs: T0, qteUc: 2, ucParPal: 0, pcuStuCoe: 0, yfamstat7: 'VB2', palnum: 'PAL1' }),
    ]
    const camions = clusterCamions(lines, 5)
    assert.isAtLeast(camions[0].palTheo, 1.99)
  })

  test('mélange VB + article conditionné normal → palTheo somme correcte', ({ assert }) => {
    // 2 UC VBP (2 pal) + 16 UC d'un article à 16 UC/pal (1 pal) = 3 pal théo.
    const lines = [
      line({ tsMs: T0, qteUc: 2, ucParPal: 0, yfamstat7: 'VBP', palnum: 'PAL1' }),
      line({ tsMs: T0 + MIN, qteUc: 16, ucParPal: 16, yfamstat7: 'BDC', palnum: 'PAL2' }),
    ]
    const camions = clusterCamions(lines, 5)
    assert.isAtLeast(camions[0].palTheo, 2.99)
    assert.isAtMost(camions[0].palTheo, 3.01)
  })
})
