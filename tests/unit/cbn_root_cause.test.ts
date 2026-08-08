import { test } from '@japa/runner'
import {
  findRootCause,
  ecartsBrutsPour,
  estCoherentAvancement,
  amplitudeEcart,
  MAX_NIVEAUX,
  type EcartBrut,
  type RootCauseLoader,
} from '#app/domain/cbn_root_cause'
import type { DriverDiffEntry } from '#app/domain/cbn_driver_diff'
import type { DemandSnapshotRow } from '#app/domain/snapshot_rows'
import type { NomenclatureEntry } from '#app/domain/models/nomenclature'

// ─── Fabriques ───────────────────────────────────────────────────────────

const row = (over: Partial<DemandSnapshotRow> = {}): DemandSnapshotRow => ({
  snapshot_date: '2026-08-06',
  source: 'stock',
  itmref: 'A7370',
  vcrnum: null,
  vcrlin: null,
  quantity: 0,
  date_echeance: null,
  fournisseur: null,
  ...over,
})

const ecart = (over: Partial<EcartBrut> = {}): EcartBrut => ({
  source: 'of_suggestion',
  nature: 'quantite',
  quantiteAvant: 100,
  quantiteApres: 200,
  echeanceAvant: null,
  echeanceApres: null,
  detail: '',
  ...over,
})

const avancement = (over: Partial<DriverDiffEntry> = {}): DriverDiffEntry => ({
  article: 'A7370',
  source: 'appro_suggestion',
  nature: 'date',
  quantiteAvant: 14400,
  quantiteApres: 14400,
  echeanceAvant: '2027-06-14',
  echeanceApres: '2027-05-31',
  detail: 'appro_suggestion 14/06/2027 → 31/05/2027 (-14 j).',
  designation: null,
  famille: null,
  approvisionnement: 'ACHAT',
  fournisseur: '16012',
  vcrnum: null,
  vcrlin: null,
  vcrnumApres: null,
  vcrlinApres: null,
  ...over,
})

const nom = (
  parentArticle: string,
  componentArticle: string,
  over: Partial<NomenclatureEntry> = {}
): NomenclatureEntry => ({
  parentArticle,
  parentDescription: '',
  level: 1,
  componentArticle,
  componentDescription: '',
  linkQuantity: 1,
  componentType: 'FABRIQUE',
  consumptionNature: 'PROPORTIONNEL',
  ...over,
})

function mockLoader(
  parents: Record<string, NomenclatureEntry[]>,
  ecarts: Record<string, EcartBrut[]>
): RootCauseLoader {
  return {
    parentsDe: (article: string) => parents[article] ?? [],
    ecartsBruts: (article: string) => ecarts[article] ?? [],
  }
}

// ─── ecartsBrutsPour — ligne à ligne (point 2) ──────────────────────────

test.group('ecartsBrutsPour — ligne à ligne sans seuil', () => {
  test('quantité changée même sous le seuil de 20 %', ({ assert }) => {
    const ecarts = ecartsBrutsPour(
      [row({ source: 'of_suggestion', quantity: 1000 })],
      [row({ source: 'of_suggestion', quantity: 1050 })]
    )
    assert.isTrue(ecarts.some((e) => e.nature === 'quantite'))
  })

  test('date changée même sous le seuil de 7 j', ({ assert }) => {
    const ecarts = ecartsBrutsPour(
      [row({ source: 'appro', quantity: 500, date_echeance: '2026-09-10' })],
      [row({ source: 'appro', quantity: 500, date_echeance: '2026-09-12' })]
    )
    assert.isTrue(ecarts.some((e) => e.nature === 'date'))
  })

  test('multi-lignes : une ligne sur deux bouge — pas perdu par agrégat', ({ assert }) => {
    const ecarts = ecartsBrutsPour(
      [
        row({ source: 'of_suggestion', quantity: 500, date_echeance: '2026-09-01' }),
        row({ source: 'of_suggestion', quantity: 14400, date_echeance: '2027-06-14' }),
      ],
      [
        row({ source: 'of_suggestion', quantity: 500, date_echeance: '2026-09-01' }),
        row({ source: 'of_suggestion', quantity: 14400, date_echeance: '2027-05-01' }),
      ]
    )
    // L'agrégat SUM/MIN n'aurait rien détecté (total identique, echeanceMin
    // identique). La ligne à ligne détecte le déplacement d'échéance.
    assert.isTrue(ecarts.some((e) => e.nature === 'date'))
  })

  test('transition échéance null → date est émise (point 11)', ({ assert }) => {
    const ecarts = ecartsBrutsPour(
      [row({ source: 'appro', quantity: 500, date_echeance: null })],
      [row({ source: 'appro', quantity: 500, date_echeance: '2026-09-01' })]
    )
    assert.isTrue(ecarts.some((e) => e.nature === 'date'))
  })

  test('transition échéance date → null est émise', ({ assert }) => {
    const ecarts = ecartsBrutsPour(
      [row({ source: 'appro', quantity: 500, date_echeance: '2026-09-01' })],
      [row({ source: 'appro', quantity: 500, date_echeance: null })]
    )
    assert.isTrue(ecarts.some((e) => e.nature === 'date'))
  })

  test('source apparue', ({ assert }) => {
    const ecarts = ecartsBrutsPour(
      [],
      [row({ source: 'of_suggestion', quantity: 320, date_echeance: '2026-08-25' })]
    )
    assert.lengthOf(ecarts, 1)
    assert.equal(ecarts[0]!.nature, 'apparue')
    assert.equal(ecarts[0]!.quantiteApres, 320)
  })

  test('source disparue', ({ assert }) => {
    const ecarts = ecartsBrutsPour([row({ source: 'demande_ferme', quantity: 800 })], [])
    assert.lengthOf(ecarts, 1)
    assert.equal(ecarts[0]!.nature, 'disparue')
  })

  test('rien ne bouge → vide', ({ assert }) => {
    assert.lengthOf(
      ecartsBrutsPour(
        [row({ source: 'stock', quantity: 1200 })],
        [row({ source: 'stock', quantity: 1200 })]
      ),
      0
    )
  })

  test('quantités négatives (stock strict sous zéro)', ({ assert }) => {
    const ecarts = ecartsBrutsPour(
      [row({ source: 'stock', quantity: -100 })],
      [row({ source: 'stock', quantity: -500 })]
    )
    assert.lengthOf(ecarts, 1)
    assert.equal(ecarts[0]!.quantiteAvant, -100)
    assert.equal(ecarts[0]!.quantiteApres, -500)
  })
})

// ─── estCoherentAvancement — cohérence de sens ─────────────────────────

test.group('estCoherentAvancement — cohérence de sens', () => {
  test('of_suggestion quantité hausse → cohérent', ({ assert }) => {
    assert.isTrue(
      estCoherentAvancement(
        ecart({ source: 'of_suggestion', quantiteAvant: 853, quantiteApres: 1233 })
      )
    )
  })

  test('of_suggestion quantité baisse → incohérent', ({ assert }) => {
    assert.isFalse(
      estCoherentAvancement(
        ecart({ source: 'of_suggestion', quantiteAvant: 1233, quantiteApres: 853 })
      )
    )
  })

  test('of_suggestion apparue → cohérent', ({ assert }) => {
    assert.isTrue(estCoherentAvancement(ecart({ source: 'of_suggestion', nature: 'apparue' })))
  })

  test('demande_ferme apparue → cohérent', ({ assert }) => {
    assert.isTrue(estCoherentAvancement(ecart({ source: 'demande_ferme', nature: 'apparue' })))
  })

  test('stock baisse → cohérent', ({ assert }) => {
    assert.isTrue(
      estCoherentAvancement(ecart({ source: 'stock', quantiteAvant: 1200, quantiteApres: 740 }))
    )
  })

  test('stock hausse → incohérent', ({ assert }) => {
    assert.isFalse(
      estCoherentAvancement(ecart({ source: 'stock', quantiteAvant: 740, quantiteApres: 1200 }))
    )
  })

  test('appro quantité baisse → cohérent', ({ assert }) => {
    assert.isTrue(
      estCoherentAvancement(ecart({ source: 'appro', quantiteAvant: 500, quantiteApres: 300 }))
    )
  })

  test('appro apparue → incohérent', ({ assert }) => {
    assert.isFalse(estCoherentAvancement(ecart({ source: 'appro', nature: 'apparue' })))
  })

  test('appro date recul → cohérent', ({ assert }) => {
    assert.isTrue(
      estCoherentAvancement(
        ecart({
          source: 'appro',
          nature: 'date',
          echeanceAvant: '2026-09-01',
          echeanceApres: '2026-09-20',
        })
      )
    )
  })

  test('appro_suggestion hausse → incohérent (point 3 : achat = moins de fabrication)', ({
    assert,
  }) => {
    assert.isFalse(
      estCoherentAvancement(
        ecart({ source: 'appro_suggestion', quantiteAvant: 0, quantiteApres: 5000 })
      )
    )
  })

  test('appro_suggestion baisse → cohérent', ({ assert }) => {
    assert.isTrue(
      estCoherentAvancement(
        ecart({ source: 'appro_suggestion', quantiteAvant: 5000, quantiteApres: 0 })
      )
    )
  })

  test('appro_suggestion apparue → incohérent', ({ assert }) => {
    assert.isFalse(estCoherentAvancement(ecart({ source: 'appro_suggestion', nature: 'apparue' })))
  })

  test('of_suggestion date avance → cohérent', ({ assert }) => {
    assert.isTrue(
      estCoherentAvancement(
        ecart({
          source: 'of_suggestion',
          nature: 'date',
          echeanceAvant: '2026-09-15',
          echeanceApres: '2026-09-01',
        })
      )
    )
  })

  test('renumerotation → incohérent', ({ assert }) => {
    assert.isFalse(estCoherentAvancement(ecart({ nature: 'renumerotation' })))
  })
})

// ─── amplitudeEcart — normalisation (point 1) ──────────────────────────

test.group('amplitudeEcart — normalisation', () => {
  test('un mouvement de date bat un petit bruit de quantité', ({ assert }) => {
    const ampDate = amplitudeEcart(
      ecart({ nature: 'date', echeanceAvant: '2027-06-14', echeanceApres: '2027-05-01' })
    )
    const ampBruit = amplitudeEcart(
      ecart({ nature: 'quantite', quantiteAvant: 10000, quantiteApres: 10060 })
    )
    // Avant : ampBruit = 60 (brut) > ampDate = 44 (brut). Maintenant :
    // ampDate = 44/7 ≈ 6,3 ; ampBruit = 60/10000 = 0,006.
    assert.isAbove(ampDate, ampBruit)
  })

  test('apparue a une amplitude > 1000', ({ assert }) => {
    const amp = amplitudeEcart(
      ecart({ nature: 'apparue', quantiteAvant: null, quantiteApres: 320 })
    )
    assert.isAbove(amp, 1000)
  })

  test('transition null↔date a une amplitude de 1', ({ assert }) => {
    const amp = amplitudeEcart(
      ecart({ nature: 'date', echeanceAvant: null, echeanceApres: '2026-09-01' })
    )
    assert.equal(amp, 1)
  })

  test('renumerotation → 0', ({ assert }) => {
    assert.equal(amplitudeEcart(ecart({ nature: 'renumerotation' })), 0)
  })
})

// ─── Cas réel A7370 (−14 j) ─────────────────────────────────────────────

test.group('findRootCause — cas réel A7370 (−14 j)', () => {
  const e = avancement()

  const loader = mockLoader(
    {
      A7370: [nom('SE7630', 'A7370')],
      SE7630: [nom('MM7586', 'SE7630')],
      MM7586: [nom('BDH*AL', 'MM7586'), nom('11033436', 'MM7586'), nom('11033532', 'MM7586')],
    },
    {
      'A7370': [
        ecart({
          source: 'appro_suggestion',
          nature: 'date',
          quantiteAvant: 14400,
          quantiteApres: 14400,
          echeanceAvant: '2027-06-14',
          echeanceApres: '2027-05-31',
          detail: 'appro_suggestion 14/06/2027 → 31/05/2027 (-14 j).',
        }),
      ],
      'SE7630': [
        ecart({
          source: 'of_suggestion',
          nature: 'quantite',
          quantiteAvant: 853,
          quantiteApres: 1233,
          echeanceAvant: '2026-09-15',
          echeanceApres: '2026-09-15',
          detail: 'of_suggestion 853 → 1 233 (+45 %).',
        }),
      ],
      'MM7586': [
        ecart({
          source: 'of_suggestion',
          nature: 'apparue',
          quantiteAvant: null,
          quantiteApres: 320,
          echeanceAvant: null,
          echeanceApres: '2026-08-25',
          detail: 'of_suggestion apparue : 320 unités.',
        }),
      ],
      'BDH*AL': [],
      '11033436': [],
      '11033532': [],
    }
  )

  test('chaîne A7370 → SE7630 → MM7586', ({ assert }) => {
    const r = findRootCause(e, loader)
    assert.lengthOf(r.chaine, 3)
    assert.equal(r.chaine[0]!.article, 'A7370')
    assert.equal(r.chaine[1]!.article, 'SE7630')
    assert.equal(r.chaine[2]!.article, 'MM7586')
  })

  test('niveaux 0, 1, 2', ({ assert }) => {
    const r = findRootCause(e, loader)
    assert.equal(r.chaine[0]!.niveau, 0)
    assert.equal(r.chaine[1]!.niveau, 1)
    assert.equal(r.chaine[2]!.niveau, 2)
  })

  test('SE7630 porte of_suggestion quantité 853 → 1233', ({ assert }) => {
    const r = findRootCause(e, loader)
    assert.equal(r.chaine[1]!.source, 'of_suggestion')
    assert.equal(r.chaine[1]!.quantiteAvant, 853)
    assert.equal(r.chaine[1]!.quantiteApres, 1233)
  })

  test('MM7586 porte of_suggestion apparue 320', ({ assert }) => {
    const r = findRootCause(e, loader)
    assert.equal(r.chaine[2]!.source, 'of_suggestion')
    assert.equal(r.chaine[2]!.nature, 'apparue')
    assert.equal(r.chaine[2]!.quantiteApres, 320)
  })

  test("point d'arrêt : cause_inconnue / aucun_parent_coherent sur MM7586", ({ assert }) => {
    const r = findRootCause(e, loader)
    assert.equal(r.pointDArret.type, 'cause_inconnue')
    if (r.pointDArret.type === 'cause_inconnue') {
      assert.equal(r.pointDArret.article, 'MM7586')
      assert.equal(r.pointDArret.motif, 'aucun_parent_coherent')
      assert.include(r.pointDArret.parentsVerifies, 'BDH*AL')
      assert.equal(r.pointDArret.profondeur, 2)
    }
  })
})

// ─── Point d'arrêt : demande indépendante ───────────────────────────────

test.group('findRootCause — demande indépendante', () => {
  test("remonte jusqu'à une demande_ferme sur le parent", ({ assert }) => {
    const loader = mockLoader(
      { COMP: [nom('PARENT', 'COMP')], PARENT: [nom('TOP', 'PARENT')] },
      {
        COMP: [
          ecart({
            source: 'appro_suggestion',
            nature: 'date',
            echeanceAvant: '2027-01-01',
            echeanceApres: '2026-12-15',
          }),
        ],
        PARENT: [
          ecart({ source: 'of_suggestion', quantiteAvant: 100, quantiteApres: 200 }),
          ecart({
            source: 'demande_ferme',
            nature: 'apparue',
            quantiteAvant: null,
            quantiteApres: 500,
            detail: 'demande_ferme apparue.',
          }),
        ],
      }
    )
    const r = findRootCause(avancement({ article: 'COMP' }), loader)
    assert.equal(r.pointDArret.type, 'demande_independante')
    if (r.pointDArret.type === 'demande_independante') {
      assert.equal(r.pointDArret.article, 'PARENT')
      assert.equal(r.pointDArret.source, 'demande_ferme')
    }
  })

  test('chaine et pointDArret ne se contredisent pas (point 5)', ({ assert }) => {
    // of_suggestion 100→2000 (amplitude forte) + demande_ferme apparue 500.
    // Le point 5 exige que le maillon de PARENT porte la demande, pas l'OF.
    const loader = mockLoader(
      { COMP: [nom('PARENT', 'COMP')] },
      {
        COMP: [
          ecart({
            source: 'appro_suggestion',
            nature: 'date',
            echeanceAvant: '2027-01-01',
            echeanceApres: '2026-12-15',
          }),
        ],
        PARENT: [
          ecart({ source: 'of_suggestion', quantiteAvant: 100, quantiteApres: 2000 }),
          ecart({
            source: 'demande_ferme',
            nature: 'apparue',
            quantiteAvant: null,
            quantiteApres: 500,
            detail: 'demande_ferme apparue.',
          }),
        ],
      }
    )
    const r = findRootCause(avancement({ article: 'COMP' }), loader)
    assert.lengthOf(r.chaine, 2)
    assert.equal(r.chaine[1]!.source, 'demande_ferme')
    assert.equal(r.pointDArret.type, 'demande_independante')
  })

  test("demande sur l'article de départ → chaîne longueur 1", ({ assert }) => {
    const loader = mockLoader(
      { START: [nom('P', 'START')] },
      {
        START: [
          ecart({
            source: 'appro_suggestion',
            nature: 'date',
            echeanceAvant: '2027-01-01',
            echeanceApres: '2026-12-15',
          }),
          ecart({ source: 'demande_prevision', quantiteAvant: 100, quantiteApres: 300 }),
        ],
      }
    )
    const r = findRootCause(avancement({ article: 'START' }), loader)
    assert.lengthOf(r.chaine, 1)
    assert.equal(r.pointDArret.type, 'demande_independante')
  })
})

// ─── Point d'arrêt : cause inconnue ─────────────────────────────────────

test.group('findRootCause — cause inconnue', () => {
  test('aucun parent ne bouge → motif aucun_parent_coherent, parents listés', ({ assert }) => {
    const loader = mockLoader(
      { LEAF: [nom('P1', 'LEAF'), nom('P2', 'LEAF')] },
      {
        LEAF: [
          ecart({
            source: 'appro_suggestion',
            nature: 'date',
            echeanceAvant: '2027-01-01',
            echeanceApres: '2026-12-15',
          }),
        ],
        P1: [],
        P2: [],
      }
    )
    const r = findRootCause(avancement({ article: 'LEAF' }), loader)
    assert.lengthOf(r.chaine, 1)
    assert.equal(r.pointDArret.type, 'cause_inconnue')
    if (r.pointDArret.type === 'cause_inconnue') {
      assert.equal(r.pointDArret.motif, 'aucun_parent_coherent')
      assert.lengthOf(r.pointDArret.parentsVerifies, 2)
    }
  })

  test("parent incohérent (recul) n'est pas suivi", ({ assert }) => {
    const loader = mockLoader(
      { CHILD: [nom('PARENT', 'CHILD')] },
      {
        CHILD: [
          ecart({
            source: 'appro_suggestion',
            nature: 'date',
            echeanceAvant: '2027-01-01',
            echeanceApres: '2026-12-15',
          }),
        ],
        PARENT: [ecart({ source: 'of_suggestion', quantiteAvant: 500, quantiteApres: 200 })],
      }
    )
    const r = findRootCause(avancement({ article: 'CHILD' }), loader)
    assert.lengthOf(r.chaine, 1)
    assert.equal(r.pointDArret.type, 'cause_inconnue')
  })

  test('aucun parent dans la nomenclature', ({ assert }) => {
    const loader = mockLoader(
      {},
      {
        ORPHAN: [
          ecart({
            source: 'appro_suggestion',
            nature: 'date',
            echeanceAvant: '2027-01-01',
            echeanceApres: '2026-12-15',
          }),
        ],
      }
    )
    const r = findRootCause(avancement({ article: 'ORPHAN' }), loader)
    assert.equal(r.pointDArret.type, 'cause_inconnue')
    if (r.pointDArret.type === 'cause_inconnue') assert.lengthOf(r.pointDArret.parentsVerifies, 0)
  })
})

// ─── Anti-cycle B→C→B (point 4) ────────────────────────────────────────

test.group('findRootCause — anti-cycle', () => {
  test("cycle B→C→B (racine exclue) s'arrête net", ({ assert }) => {
    const loader = mockLoader(
      {
        ROOT: [nom('B', 'ROOT')],
        B: [nom('C', 'B')],
        C: [nom('B', 'C')], // cycle : C → B → C → ...
      },
      {
        ROOT: [
          ecart({
            source: 'appro_suggestion',
            nature: 'date',
            echeanceAvant: '2027-01-01',
            echeanceApres: '2026-12-15',
          }),
        ],
        B: [ecart({ source: 'of_suggestion', quantiteAvant: 100, quantiteApres: 200 })],
        C: [ecart({ source: 'of_suggestion', quantiteAvant: 100, quantiteApres: 200 })],
      }
    )
    const r = findRootCause(avancement({ article: 'ROOT' }), loader)
    // ROOT → B → C → (B déjà visité) → arrêt
    assert.lengthOf(r.chaine, 3) // ROOT, B, C
    assert.equal(r.pointDArret.type, 'cause_inconnue')
    if (r.pointDArret.type === 'cause_inconnue') {
      assert.equal(r.pointDArret.motif, 'cycle_detecte')
      assert.include(r.pointDArret.parentsVerifies, 'B')
    }
  })
})

// ─── Hors périmètre V1 (point 9) ───────────────────────────────────────

test.group('findRootCause — hors périmètre V1', () => {
  test('nature ≠ date → hors_perimetre', ({ assert }) => {
    const r = findRootCause(avancement({ nature: 'quantite' }), mockLoader({}, {}))
    assert.equal(r.pointDArret.type, 'hors_perimetre')
  })

  test('delta positif (retard) → hors_perimetre', ({ assert }) => {
    const r = findRootCause(
      avancement({ echeanceAvant: '2026-12-15', echeanceApres: '2027-01-01' }),
      mockLoader({}, {})
    )
    assert.equal(r.pointDArret.type, 'hors_perimetre')
  })
})

// ─── Tie-break déterministe (point 10) ─────────────────────────────────

test.group('findRootCause — tie-break', () => {
  test('amplitudes égales → article le plus petit alphabétiquement gagne', ({ assert }) => {
    const loader = mockLoader(
      { CHILD: [nom('ZZZ', 'CHILD'), nom('AAA', 'CHILD')] },
      {
        CHILD: [
          ecart({
            source: 'appro_suggestion',
            nature: 'date',
            echeanceAvant: '2027-01-01',
            echeanceApres: '2026-12-15',
          }),
        ],
        ZZZ: [ecart({ source: 'of_suggestion', quantiteAvant: 100, quantiteApres: 200 })],
        AAA: [ecart({ source: 'of_suggestion', quantiteAvant: 100, quantiteApres: 200 })],
      }
    )
    const r = findRootCause(avancement({ article: 'CHILD' }), loader)
    assert.equal(r.chaine[1]!.article, 'AAA')
  })
})

// ─── Profondeur max avec demande (point 8) ─────────────────────────────

test.group('findRootCause — profondeur max', () => {
  test('demande sur le dernier ancêtre à MAX_NIVEAUX est détectée', ({ assert }) => {
    const parents: Record<string, NomenclatureEntry[]> = {}
    const ecarts: Record<string, EcartBrut[]> = {}
    let prev = 'START'
    ecarts.START = [
      ecart({
        source: 'appro_suggestion',
        nature: 'date',
        echeanceAvant: '2027-01-01',
        echeanceApres: '2026-12-15',
      }),
    ]
    for (let i = 1; i <= MAX_NIVEAUX; i++) {
      const child = `N${i}`
      parents[prev] = [nom(child, prev)]
      ecarts[child] = [ecart({ source: 'of_suggestion', quantiteAvant: 100, quantiteApres: 200 })]
      prev = child
    }
    // Ajouter une demande sur le dernier
    ecarts[prev]!.push(
      ecart({
        source: 'demande_ferme',
        nature: 'apparue',
        quantiteAvant: null,
        quantiteApres: 9999,
      })
    )

    const r = findRootCause(avancement({ article: 'START' }), mockLoader(parents, ecarts))
    assert.equal(r.pointDArret.type, 'demande_independante')
  })

  test('sans demande au bout → profondeur_max', ({ assert }) => {
    const parents: Record<string, NomenclatureEntry[]> = {}
    const ecarts: Record<string, EcartBrut[]> = {}
    let prev = 'START'
    ecarts.START = [
      ecart({
        source: 'appro_suggestion',
        nature: 'date',
        echeanceAvant: '2027-01-01',
        echeanceApres: '2026-12-15',
      }),
    ]
    for (let i = 1; i <= MAX_NIVEAUX; i++) {
      const child = `M${i}`
      parents[prev] = [nom(child, prev)]
      ecarts[child] = [ecart({ source: 'of_suggestion', quantiteAvant: 100, quantiteApres: 200 })]
      prev = child
    }
    const r = findRootCause(avancement({ article: 'START' }), mockLoader(parents, ecarts))
    assert.equal(r.pointDArret.type, 'cause_inconnue')
    if (r.pointDArret.type === 'cause_inconnue') assert.equal(r.pointDArret.motif, 'profondeur_max')
  })
})

// ─── Parents dupliqués (point 12) ──────────────────────────────────────

test.group('findRootCause — parents dupliqués', () => {
  test('trois liens identiques → un seul appel, pas de doublon dans la chaîne', ({ assert }) => {
    let appels = 0
    const loader: RootCauseLoader = {
      parentsDe: () => [nom('P', 'C'), nom('P', 'C'), nom('P', 'C')],
      ecartsBruts: (a) => {
        appels++
        return a === 'P'
          ? [ecart({ source: 'of_suggestion', quantiteAvant: 100, quantiteApres: 200 })]
          : []
      },
    }
    const r = findRootCause(avancement({ article: 'C' }), loader)
    assert.lengthOf(r.chaine, 2)
    // P n'est requêté qu'une seule fois malgré 3 liens
    assert.equal(appels, 2) // C + P
  })
})
