import { test } from '@japa/runner'
import {
  detecterAnomaliesPoste,
  SEUIL_PREMIER_POINTAGE_JOURS,
  SEUIL_SILENCE_JOURS,
  type OfEnCoursPoste,
} from '#app/domain/cockpit_anomalies'
import type { PointageTrk } from '#app/domain/production_realisee'

/**
 * Anomalies du cockpit poste (#119, lot 5) — domaine pur.
 *
 * Chaque détecteur est testé sur son cas déclenchant et sur son cas limite :
 * le but est de montrer que les seuils et les frontalités (jour J du lancement,
 * dernier pointage pile au seuil) se comportent comme documenté.
 */

const AUJOURDHUI = '2026-08-03'

function of(over: Partial<OfEnCoursPoste> = {}): OfEnCoursPoste {
  return {
    numOf: 'OF-1',
    article: 'ART-1',
    designation: 'Désignation',
    dateDebutIso: '2026-08-01',
    qtyDeclaree: 0,
    ...over,
  }
}

function pointage(over: Partial<PointageTrk> = {}): PointageTrk {
  return {
    numOf: 'OF-1',
    openum: 10,
    iptdat: '2026-08-02',
    cplwst: 'PP_093',
    cplqty: 10,
    opetim: 1,
    settim: 0,
    rebut: false,
    itmrefOf: 'ART-1',
    ...over,
  }
}

/** Théorique : 1 h par unité déclarée, sauf article sans gamme. */
const heuresTheoriquesPour = (article: string, qty: number) => (article === 'SANS-GAMME' ? 0 : qty)

test.group('détecteur 1 — lancé, jamais pointé', () => {
  test('OF lancé depuis plus que le seuil sans aucun pointage', ({ assert }) => {
    const r = detecterAnomaliesPoste({
      ofs: [of({ dateDebutIso: '2026-07-20' })],
      pointages: [],
      heuresTheoriquesPour,
      aujourdhuiIso: AUJOURDHUI,
    })
    assert.lengthOf(r.jamaisPointes, 1)
    assert.equal(r.jamaisPointes[0].jours, 14)
  })

  test('lancé hier : sous le seuil, rien à signaler', ({ assert }) => {
    const r = detecterAnomaliesPoste({
      ofs: [of({ dateDebutIso: '2026-08-02' })],
      pointages: [],
      heuresTheoriquesPour,
      aujourdhuiIso: AUJOURDHUI,
    })
    assert.lengthOf(r.jamaisPointes, 0)
  })

  test('un pointage même ancien sort l’OF du détecteur 1', ({ assert }) => {
    const r = detecterAnomaliesPoste({
      ofs: [of({ dateDebutIso: '2026-07-01' })],
      pointages: [pointage({ iptdat: '2026-07-02' })],
      heuresTheoriquesPour,
      aujourdhuiIso: AUJOURDHUI,
    })
    assert.lengthOf(r.jamaisPointes, 0)
  })

  test('lancement inconnu : jamais signalé (l’âge est indémontrable)', ({ assert }) => {
    const r = detecterAnomaliesPoste({
      ofs: [of({ dateDebutIso: null })],
      pointages: [],
      heuresTheoriquesPour,
      aujourdhuiIso: AUJOURDHUI,
    })
    assert.lengthOf(r.jamaisPointes, 0)
  })

  test('le seuil est inclusif : pile N jours = signalé', ({ assert }) => {
    const debut = new Date(`${AUJOURDHUI}T00:00:00`)
    debut.setDate(debut.getDate() - SEUIL_PREMIER_POINTAGE_JOURS)
    const r = detecterAnomaliesPoste({
      ofs: [of({ dateDebutIso: debut.toISOString().slice(0, 10) })],
      pointages: [],
      heuresTheoriquesPour,
      aujourdhuiIso: AUJOURDHUI,
    })
    assert.lengthOf(r.jamaisPointes, 1)
  })
})

test.group('détecteur 2 — silence', () => {
  test('dernier pointage au-delà du seuil, OF toujours en cours', ({ assert }) => {
    const r = detecterAnomaliesPoste({
      ofs: [of()],
      pointages: [pointage({ iptdat: '2026-07-10' })],
      heuresTheoriquesPour,
      aujourdhuiIso: AUJOURDHUI,
    })
    assert.lengthOf(r.silences, 1)
    assert.equal(r.silences[0].jours, 24)
    // Jamais pointé et silence sont mutuellement exclusifs.
    assert.lengthOf(r.jamaisPointes, 0)
  })

  test('pointage récent : pas de silence', ({ assert }) => {
    const r = detecterAnomaliesPoste({
      ofs: [of()],
      pointages: [pointage({ iptdat: '2026-08-02' })],
      heuresTheoriquesPour,
      aujourdhuiIso: AUJOURDHUI,
    })
    assert.lengthOf(r.silences, 0)
  })

  test('le plus récent des pointages fait foi', ({ assert }) => {
    const r = detecterAnomaliesPoste({
      ofs: [of()],
      pointages: [pointage({ iptdat: '2026-07-01' }), pointage({ iptdat: '2026-08-01' })],
      heuresTheoriquesPour,
      aujourdhuiIso: AUJOURDHUI,
    })
    assert.lengthOf(r.silences, 0)
  })
})

test.group('détecteur 3 — déclaré sans heures / heures faibles', () => {
  test('déclaré, aucun pointage en heures', ({ assert }) => {
    const r = detecterAnomaliesPoste({
      ofs: [of({ qtyDeclaree: 100 })],
      pointages: [],
      heuresTheoriquesPour,
      aujourdhuiIso: AUJOURDHUI,
    })
    assert.lengthOf(r.heures, 1)
    assert.equal(r.heures[0].kind, 'sans_heures')
    assert.equal(r.heures[0].heuresTheoriques, 100)
  })

  test('heures anormalement faibles face au théorique', ({ assert }) => {
    const r = detecterAnomaliesPoste({
      ofs: [of({ qtyDeclaree: 100 })],
      pointages: [pointage({ opetim: 10, settim: 0 })], // 10 h pour 100 h théoriques
      heuresTheoriquesPour,
      aujourdhuiIso: AUJOURDHUI,
    })
    assert.lengthOf(r.heures, 1)
    assert.equal(r.heures[0].kind, 'heures_faibles')
  })

  test('heures au niveau du théorique : rien à signaler', ({ assert }) => {
    const r = detecterAnomaliesPoste({
      ofs: [of({ qtyDeclaree: 100 })],
      pointages: [pointage({ opetim: 80, settim: 20 })],
      heuresTheoriquesPour,
      aujourdhuiIso: AUJOURDHUI,
    })
    assert.lengthOf(r.heures, 0)
  })

  test('sans gamme exploitable, pas de comparaison possible → pas d’anomalie', ({ assert }) => {
    const r = detecterAnomaliesPoste({
      ofs: [of({ article: 'SANS-GAMME', qtyDeclaree: 100 })],
      pointages: [pointage({ opetim: 1 })],
      heuresTheoriquesPour,
      aujourdhuiIso: AUJOURDHUI,
    })
    assert.lengthOf(r.heures, 0)
  })

  test('rien de déclaré : le détecteur ne s’applique pas', ({ assert }) => {
    const r = detecterAnomaliesPoste({
      ofs: [of({ qtyDeclaree: 0 })],
      pointages: [],
      heuresTheoriquesPour,
      aujourdhuiIso: AUJOURDHUI,
    })
    assert.lengthOf(r.heures, 0)
  })
})

test.group('détecteur 4 — déclarations en double (clé stricte)', () => {
  test('mêmes (OF, op, jour, qté, temps) en deux exemplaires', ({ assert }) => {
    const r = detecterAnomaliesPoste({
      ofs: [],
      pointages: [
        pointage({ iptdat: '2026-08-01', cplqty: 40, opetim: 1 }),
        pointage({ iptdat: '2026-08-01', cplqty: 40, opetim: 1 }),
      ],
      heuresTheoriquesPour,
      aujourdhuiIso: AUJOURDHUI,
    })
    assert.lengthOf(r.doublons, 1)
    assert.deepEqual(r.doublons[0], {
      numOf: 'OF-1',
      openum: 10,
      iptdat: '2026-08-01',
      nombre: 2,
    })
  })

  test('déclarations partielles même jour : légitimes, pas un doublon', ({ assert }) => {
    const r = detecterAnomaliesPoste({
      ofs: [],
      pointages: [
        pointage({ iptdat: '2026-08-01', cplqty: 40, opetim: 1 }),
        pointage({ iptdat: '2026-08-01', cplqty: 60, opetim: 2 }),
      ],
      heuresTheoriquesPour,
      aujourdhuiIso: AUJOURDHUI,
    })
    assert.lengthOf(r.doublons, 0)
  })

  test('déclarations partielles sur deux jours : légitimes, pas un doublon', ({ assert }) => {
    const r = detecterAnomaliesPoste({
      ofs: [],
      pointages: [
        pointage({ iptdat: '2026-08-01', cplqty: 40 }),
        pointage({ iptdat: '2026-08-02', cplqty: 60 }),
      ],
      heuresTheoriquesPour,
      aujourdhuiIso: AUJOURDHUI,
    })
    assert.lengthOf(r.doublons, 0)
  })

  test('même jour mais opérations différentes : pas un doublon', ({ assert }) => {
    const r = detecterAnomaliesPoste({
      ofs: [],
      pointages: [
        pointage({ openum: 10, iptdat: '2026-08-01', cplqty: 50, opetim: 1 }),
        pointage({ openum: 20, iptdat: '2026-08-01', cplqty: 50, opetim: 1 }),
      ],
      heuresTheoriquesPour,
      aujourdhuiIso: AUJOURDHUI,
    })
    assert.lengthOf(r.doublons, 0)
  })

  test('réglage pur le même jour qu’une déclaration : pas un doublon', ({ assert }) => {
    const r = detecterAnomaliesPoste({
      ofs: [],
      pointages: [
        pointage({ iptdat: '2026-08-01', cplqty: 0, opetim: 0, settim: 1 }),
        pointage({ iptdat: '2026-08-01', cplqty: 50, opetim: 2 }),
      ],
      heuresTheoriquesPour,
      aujourdhuiIso: AUJOURDHUI,
    })
    assert.lengthOf(r.doublons, 0)
  })
})

test.group('frontalités communes', () => {
  test('le silence au seuil près est inclusif', ({ assert }) => {
    const dernier = new Date(`${AUJOURDHUI}T00:00:00`)
    dernier.setDate(dernier.getDate() - SEUIL_SILENCE_JOURS)
    const r = detecterAnomaliesPoste({
      ofs: [of()],
      pointages: [pointage({ iptdat: dernier.toISOString().slice(0, 10) })],
      heuresTheoriquesPour,
      aujourdhuiIso: AUJOURDHUI,
    })
    assert.lengthOf(r.silences, 1)
  })

  test('entrée vide : quatre familles vides', ({ assert }) => {
    const r = detecterAnomaliesPoste({
      ofs: [],
      pointages: [],
      heuresTheoriquesPour,
      aujourdhuiIso: AUJOURDHUI,
    })
    assert.lengthOf(r.jamaisPointes, 0)
    assert.lengthOf(r.silences, 0)
    assert.lengthOf(r.heures, 0)
    assert.lengthOf(r.doublons, 0)
  })
})
