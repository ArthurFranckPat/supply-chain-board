import { test } from '@japa/runner'
import {
  findRootCause,
  ecartsBrutsPour,
  estCoherentAvancement,
  type EcartBrut,
  type RootCauseLoader,
} from '#app/domain/cbn_root_cause'
import type { DriverDiffEntry } from '#app/domain/cbn_driver_diff'
import type { DemandSnapshotRow } from '#app/domain/snapshot_rows'
import type { NomenclatureEntry } from '#app/domain/models/nomenclature'

// ─── Fabriques ───────────────────────────────────────────────────────────

const row = (over: Partial<DemandSnapshotRow>): DemandSnapshotRow => ({
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

const entry = (over: Partial<DriverDiffEntry> = {}): DriverDiffEntry => ({
  article: 'A7370',
  source: 'appro_suggestion',
  nature: 'date',
  quantiteAvant: 14400,
  quantiteApres: 14400,
  echeanceAvant: '2027-06-14',
  echeanceApres: '2027-05-31',
  detail: 'appro_suggestion échéance 14/06/2027 → 31/05/2027 (-14 j) — A7370.',
  designation: 'CYLINDRE SERINGUE MM BDH',
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

/** Construit un loader à partir de maps simples. */
function mockLoader(
  parents: Record<string, NomenclatureEntry[]>,
  ecarts: Record<string, EcartBrut[]>
): RootCauseLoader {
  return {
    parentsDe: (article: string) => parents[article] ?? [],
    ecartsBruts: (article: string) => ecarts[article] ?? [],
  }
}

// ─── ecartsBrutsPour ────────────────────────────────────────────────────

test.group('ecartsBrutsPour — détection sans seuil', () => {
  test('quantité changée même sous le seuil de 20 %', ({ assert }) => {
    const avant = [row({ source: 'of_suggestion', quantity: 1000 })]
    const apres = [row({ source: 'of_suggestion', quantity: 1050 })]
    const ecarts = ecartsBrutsPour(avant, apres)
    assert.isTrue(ecarts.some((e) => e.nature === 'quantite'))
  })

  test('date changée même sous le seuil de 7 j', ({ assert }) => {
    const avant = [row({ source: 'appro', quantity: 500, date_echeance: '2026-09-10' })]
    const apres = [row({ source: 'appro', quantity: 500, date_echeance: '2026-09-12' })]
    const ecarts = ecartsBrutsPour(avant, apres)
    assert.isTrue(ecarts.some((e) => e.nature === 'date'))
  })

  test('source apparue', ({ assert }) => {
    const ecarts = ecartsBrutsPour(
      [],
      [row({ source: 'of_suggestion', quantity: 320, date_echeance: '2026-08-25' })]
    )
    assert.lengthOf(ecarts, 1)
    assert.equal(ecarts[0].nature, 'apparue')
    assert.equal(ecarts[0].quantiteApres, 320)
  })

  test('source disparue', ({ assert }) => {
    const ecarts = ecartsBrutsPour([row({ source: 'demande_ferme', quantity: 800 })], [])
    assert.lengthOf(ecarts, 1)
    assert.equal(ecarts[0].nature, 'disparue')
    assert.equal(ecarts[0].quantiteAvant, 800)
  })

  test('rien ne bouge → vide', ({ assert }) => {
    const avant = [row({ source: 'stock', quantity: 1200 })]
    const apres = [row({ source: 'stock', quantity: 1200 })]
    assert.lengthOf(ecartsBrutsPour(avant, apres), 0)
  })

  test('plusieurs sources en même temps', ({ assert }) => {
    const avant = [
      row({ source: 'stock', quantity: 1000 }),
      row({ source: 'of_suggestion', quantity: 500, date_echeance: '2026-09-15' }),
    ]
    const apres = [
      row({ source: 'stock', quantity: 800 }),
      row({ source: 'of_suggestion', quantity: 700, date_echeance: '2026-09-10' }),
    ]
    const ecarts = ecartsBrutsPour(avant, apres)
    assert.lengthOf(ecarts, 3) // stock quantite + of_suggestion quantite + of_suggestion date
  })
})

// ─── estCoherentAvancement ──────────────────────────────────────────────

test.group('estCoherentAvancement — cohérence de sens', () => {
  test('of_suggestion quantité hausse → cohérent', ({ assert }) => {
    assert.isTrue(
      estCoherentAvancement(
        ecart({
          source: 'of_suggestion',
          nature: 'quantite',
          quantiteAvant: 853,
          quantiteApres: 1233,
        })
      )
    )
  })

  test('of_suggestion quantité baisse → incohérent', ({ assert }) => {
    assert.isFalse(
      estCoherentAvancement(
        ecart({
          source: 'of_suggestion',
          nature: 'quantite',
          quantiteAvant: 1233,
          quantiteApres: 853,
        })
      )
    )
  })

  test('of_suggestion apparue → cohérent', ({ assert }) => {
    assert.isTrue(estCoherentAvancement(ecart({ source: 'of_suggestion', nature: 'apparue' })))
  })

  test('of_suggestion disparue → incohérent', ({ assert }) => {
    assert.isFalse(estCoherentAvancement(ecart({ source: 'of_suggestion', nature: 'disparue' })))
  })

  test('demande_ferme apparue → cohérent', ({ assert }) => {
    assert.isTrue(estCoherentAvancement(ecart({ source: 'demande_ferme', nature: 'apparue' })))
  })

  test('stock baisse → cohérent', ({ assert }) => {
    assert.isTrue(
      estCoherentAvancement(
        ecart({ source: 'stock', nature: 'quantite', quantiteAvant: 1200, quantiteApres: 740 })
      )
    )
  })

  test('stock hausse → incohérent', ({ assert }) => {
    assert.isFalse(
      estCoherentAvancement(
        ecart({ source: 'stock', nature: 'quantite', quantiteAvant: 740, quantiteApres: 1200 })
      )
    )
  })

  test('appro quantité baisse → cohérent (moins de dispo)', ({ assert }) => {
    assert.isTrue(
      estCoherentAvancement(
        ecart({ source: 'appro', nature: 'quantite', quantiteAvant: 500, quantiteApres: 300 })
      )
    )
  })

  test('appro apparue → incohérent (plus de dispo)', ({ assert }) => {
    assert.isFalse(estCoherentAvancement(ecart({ source: 'appro', nature: 'apparue' })))
  })

  test('appro date recul → cohérent (dispo plus tardive)', ({ assert }) => {
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

  test('of_suggestion date recul → incohérent', ({ assert }) => {
    assert.isFalse(
      estCoherentAvancement(
        ecart({
          source: 'of_suggestion',
          nature: 'date',
          echeanceAvant: '2026-09-01',
          echeanceApres: '2026-09-15',
        })
      )
    )
  })

  test('renumerotation → toujours incohérent', ({ assert }) => {
    assert.isFalse(estCoherentAvancement(ecart({ nature: 'renumerotation' })))
  })
})

// ─── Cas réel A7370 (−14 j) ─────────────────────────────────────────────

test.group('findRootCause — cas réel A7370 (−14 j)', () => {
  const a7370Entry = entry()

  const loader = mockLoader(
    {
      // A7370 est composant de SE7630
      A7370: [nom('SE7630', 'A7370')],
      // SE7630 est composant de MM7586
      SE7630: [nom('MM7586', 'SE7630')],
      // MM7586 a 3 parents, tous gelés
      MM7586: [nom('BDH*AL', 'MM7586'), nom('11033436', 'MM7586'), nom('11033532', 'MM7586')],
    },
    {
      // A7370 : appro_suggestion avancée, stock/appro stables,
      // aucune demande indépendante.
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
      // SE7630 : of_suggestion quantité 853 → 1233 (+45 %)
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
      // MM7586 : of_suggestion apparue (320, 25/08/2026)
      'MM7586': [
        ecart({
          source: 'of_suggestion',
          nature: 'apparue',
          quantiteAvant: null,
          quantiteApres: 320,
          echeanceAvant: null,
          echeanceApres: '2026-08-25',
          detail: 'of_suggestion apparue : 320 unités, échéance 25/08/2026.',
        }),
      ],
      // Tous gelés au-dessus de MM7586
      'BDH*AL': [],
      '11033436': [],
      '11033532': [],
    }
  )

  test('chaîne complète : A7370 → SE7630 → MM7586', ({ assert }) => {
    const result = findRootCause(a7370Entry, loader)
    assert.lengthOf(result.chaine, 3)
    assert.equal(result.chaine[0].article, 'A7370')
    assert.equal(result.chaine[1].article, 'SE7630')
    assert.equal(result.chaine[2].article, 'MM7586')
  })

  test('niveaux consécutifs 0, 1, 2', ({ assert }) => {
    const result = findRootCause(a7370Entry, loader)
    assert.equal(result.chaine[0].niveau, 0)
    assert.equal(result.chaine[1].niveau, 1)
    assert.equal(result.chaine[2].niveau, 2)
  })

  test('SE7630 porte le mouvement of_suggestion quantité', ({ assert }) => {
    const result = findRootCause(a7370Entry, loader)
    assert.equal(result.chaine[1].source, 'of_suggestion')
    assert.equal(result.chaine[1].nature, 'quantite')
    assert.equal(result.chaine[1].quantiteAvant, 853)
    assert.equal(result.chaine[1].quantiteApres, 1233)
  })

  test('MM7586 porte le mouvement of_suggestion apparue', ({ assert }) => {
    const result = findRootCause(a7370Entry, loader)
    assert.equal(result.chaine[2].source, 'of_suggestion')
    assert.equal(result.chaine[2].nature, 'apparue')
    assert.equal(result.chaine[2].quantiteApres, 320)
  })

  test("point d'arrêt : cause inconnue (rien ne bouge au-dessus de MM7586)", ({ assert }) => {
    const result = findRootCause(a7370Entry, loader)
    assert.equal(result.pointDArret.type, 'cause_inconnue')
    if (result.pointDArret.type === 'cause_inconnue') {
      assert.equal(result.pointDArret.article, 'MM7586')
      assert.include(result.pointDArret.parentsVerifies, 'BDH*AL')
      assert.include(result.pointDArret.parentsVerifies, '11033436')
      assert.include(result.pointDArret.parentsVerifies, '11033532')
    }
  })
})

// ─── Point d'arrêt : demande indépendante ───────────────────────────────

test.group("findRootCause — point d'arrêt demande indépendante", () => {
  test("remonte jusqu'à une demande_ferme apparue", ({ assert }) => {
    const loader = mockLoader(
      {
        COMP: [nom('PARENT', 'COMP')],
        PARENT: [nom('TOP', 'PARENT')],
      },
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
          ecart({
            source: 'of_suggestion',
            nature: 'quantite',
            quantiteAvant: 100,
            quantiteApres: 200,
          }),
          // Demande indépendante : cause racine trouvée
          ecart({
            source: 'demande_ferme',
            nature: 'apparue',
            quantiteAvant: null,
            quantiteApres: 500,
            detail: 'demande_ferme apparue : 500 unités.',
          }),
        ],
      }
    )

    const result = findRootCause(entry({ article: 'COMP' }), loader)
    assert.lengthOf(result.chaine, 2) // COMP + PARENT
    assert.equal(result.pointDArret.type, 'demande_independante')
    if (result.pointDArret.type === 'demande_independante') {
      assert.equal(result.pointDArret.article, 'PARENT')
      assert.equal(result.pointDArret.source, 'demande_ferme')
    }
  })

  test("demande indépendante sur l'article de départ → chaîne de longueur 1", ({ assert }) => {
    const loader = mockLoader(
      { START: [nom('PARENT', 'START')] },
      {
        START: [
          ecart({
            source: 'appro_suggestion',
            nature: 'date',
            echeanceAvant: '2027-01-01',
            echeanceApres: '2026-12-15',
          }),
          ecart({
            source: 'demande_prevision',
            nature: 'quantite',
            quantiteAvant: 100,
            quantiteApres: 300,
            detail: 'demande_prevision 100 → 300.',
          }),
        ],
      }
    )

    const result = findRootCause(entry({ article: 'START' }), loader)
    assert.lengthOf(result.chaine, 1)
    assert.equal(result.pointDArret.type, 'demande_independante')
    if (result.pointDArret.type === 'demande_independante') {
      assert.equal(result.pointDArret.source, 'demande_prevision')
    }
  })
})

// ─── Point d'arrêt : cause inconnue ─────────────────────────────────────

test.group("findRootCause — point d'arrêt cause inconnue", () => {
  test('aucun parent ne bouge → parents vérifiés listés', ({ assert }) => {
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

    const result = findRootCause(entry({ article: 'LEAF' }), loader)
    assert.lengthOf(result.chaine, 1)
    assert.equal(result.pointDArret.type, 'cause_inconnue')
    if (result.pointDArret.type === 'cause_inconnue') {
      assert.lengthOf(result.pointDArret.parentsVerifies, 2)
    }
  })

  test("parent qui recule (incohérent) n'est pas suivi", ({ assert }) => {
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
        // Parent : of_suggestion DIMINUE → incohérent avec avancement enfant
        PARENT: [
          ecart({
            source: 'of_suggestion',
            nature: 'quantite',
            quantiteAvant: 500,
            quantiteApres: 200,
          }),
        ],
      }
    )

    const result = findRootCause(entry({ article: 'CHILD' }), loader)
    assert.lengthOf(result.chaine, 1)
    assert.equal(result.pointDArret.type, 'cause_inconnue')
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

    const result = findRootCause(entry({ article: 'ORPHAN' }), loader)
    assert.lengthOf(result.chaine, 1)
    assert.equal(result.pointDArret.type, 'cause_inconnue')
    if (result.pointDArret.type === 'cause_inconnue') {
      assert.lengthOf(result.pointDArret.parentsVerifies, 0)
    }
  })
})

// ─── Anti-cycle ─────────────────────────────────────────────────────────

test.group('findRootCause — anti-cycle', () => {
  test('cycle dans la nomenclature : ne boucle pas', ({ assert }) => {
    // A → B → A (cycle)
    const loader = mockLoader(
      {
        A: [nom('B', 'A')],
        B: [nom('A', 'B')],
      },
      {
        A: [
          ecart({
            source: 'appro_suggestion',
            nature: 'date',
            echeanceAvant: '2027-01-01',
            echeanceApres: '2026-12-15',
          }),
        ],
        B: [
          ecart({
            source: 'of_suggestion',
            nature: 'quantite',
            quantiteAvant: 100,
            quantiteApres: 200,
          }),
        ],
      }
    )

    const result = findRootCause(entry({ article: 'A' }), loader)
    // A est visité, B est visité, puis B's parent A est déjà visité → stop
    assert.isAtMost(result.chaine.length, 3)
    assert.equal(result.pointDArret.type, 'cause_inconnue')
  })
})

// ─── Plusieurs parents : le plus fort gagne ─────────────────────────────

test.group('findRootCause — sélection du parent le plus fort', () => {
  test('entre deux parents cohérents, le plus gros amplitude gagne', ({ assert }) => {
    const loader = mockLoader(
      {
        CHILD: [nom('BIG', 'CHILD'), nom('SMALL', 'CHILD')],
      },
      {
        CHILD: [
          ecart({
            source: 'appro_suggestion',
            nature: 'date',
            echeanceAvant: '2027-01-01',
            echeanceApres: '2026-12-15',
          }),
        ],
        BIG: [
          ecart({
            source: 'of_suggestion',
            nature: 'quantite',
            quantiteAvant: 100,
            quantiteApres: 1000,
            detail: 'BIG of_suggestion +900.',
          }),
        ],
        SMALL: [
          ecart({
            source: 'of_suggestion',
            nature: 'quantite',
            quantiteAvant: 100,
            quantiteApres: 150,
            detail: 'SMALL of_suggestion +50.',
          }),
        ],
      }
    )

    const result = findRootCause(entry({ article: 'CHILD' }), loader)
    assert.lengthOf(result.chaine, 2)
    assert.equal(result.chaine[1].article, 'BIG')
  })
})
