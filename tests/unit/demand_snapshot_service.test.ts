import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import {
  DemandSnapshotService,
  MemoJourneesBorne,
  messageSnapshotRow,
  type ApproMessageSnapshotRow,
  type DemandSnapshotRow,
  type SnapshotPayload,
} from '#services/demand_snapshot_service'
import type { ApproMessageRow } from '#app/repositories/appro_repository'

/**
 * Swap transactionnel + garde-fou vide (#74 lot 1, absorbé par #98 lot 4 ;
 * étendu aux messages de replanification par #138 lot 0).
 *
 * L'extraction X3 (`buildPayload`) n'est pas testée ici — elle délègue à des
 * repositories déjà couverts et exigerait X3 joignable, même motif que
 * `replica_sync.test.ts`. Ce qui est propre à ce service — et donc testé —
 * c'est `write()` : le swap est-il atomique sur les DEUX tables, le garde-fou
 * vide protège-t-il une photo existante, l'échec laisse-t-il l'état intact.
 *
 * Tests directement sur les tables, avec une date sentinelle 1900 pour ne
 * jamais toucher une vraie photo (même précaution que les autres tests
 * réplique).
 */

const SENTINEL_DATE = '1900-01-01'

/** Ouvre `write`, seule méthode testable sans X3. */
class ProbeService extends DemandSnapshotService {
  runWrite(dateStr: string, fetchRows: () => Promise<SnapshotPayload>) {
    return this.write(dateStr, 'test', fetchRows)
  }
}

/**
 * Compte les lectures RÉELLES de journée (#143 défaut 2, revue de code sur le
 * memo borné) : `lireJourneeBrute` est le seul point d'I/O que `loadDayRows`
 * appelle, l'intercepter ici mesure directement le gain de la mémoïsation
 * sans instrumenter la connexion SQLite elle-même.
 */
class ProbeServiceCompteur extends ProbeService {
  nbLectures = 0
  protected lireJourneeBrute(day: string) {
    this.nbLectures += 1
    return super.lireJourneeBrute(day)
  }
}

function row(overrides: Partial<DemandSnapshotRow> = {}): DemandSnapshotRow {
  return {
    snapshot_date: SENTINEL_DATE,
    source: 'stock',
    itmref: 'ART-1',
    vcrnum: null,
    vcrlin: null,
    quantity: 10,
    date_echeance: null,
    fournisseur: null,
    ...overrides,
  }
}

function msg(overrides: Partial<ApproMessageSnapshotRow> = {}): ApproMessageSnapshotRow {
  return {
    snapshot_date: SENTINEL_DATE,
    vcrnum: 'POF-1',
    vcrlin: 1,
    vcrseq: '1000',
    itmref: 'ART-1',
    fournisseur: 'BPR001',
    mrpmes: 2,
    mrpdat: '1900-02-01',
    enddat: '1900-03-01',
    quantity: 100,
    ...overrides,
  }
}

/** Raccourci : la plupart des cas n'ont rien à dire sur l'une des deux populations. */
const payload = (
  demand: DemandSnapshotRow[],
  messages: ApproMessageSnapshotRow[] = [],
  sourcesEnEchec: string[] = []
): SnapshotPayload => ({ demand, messages, sourcesEnEchec })

test.group('DemandSnapshotService — write', (group) => {
  const conn = db.connection()
  const service = new ProbeService()

  group.each.teardown(async () => {
    await conn.from('demand_snapshots').where('snapshot_date', SENTINEL_DATE).delete()
    await conn.from('appro_message_snapshots').where('snapshot_date', SENTINEL_DATE).delete()
    try {
      await conn.from('demand_snapshot_sources').where('snapshot_date', SENTINEL_DATE).delete()
    } catch {}
  })

  test('insère les lignes et retourne un statut ok', async ({ assert }) => {
    const result = await service.runWrite(SENTINEL_DATE, async () =>
      payload([row({ itmref: 'ART-1' }), row({ itmref: 'ART-2' })])
    )

    assert.equal(result.status, 'ok')
    assert.equal(result.rows, 2)

    const rows = await conn
      .from('demand_snapshots')
      .where('snapshot_date', SENTINEL_DATE)
      .orderBy('itmref')
    assert.deepEqual(
      rows.map((r) => r.itmref),
      ['ART-1', 'ART-2']
    )
  })

  test('idempotent : rejouer pour la même date REMPLACE, ne duplique pas', async ({ assert }) => {
    await service.runWrite(SENTINEL_DATE, async () => payload([row({ itmref: 'ART-1' })]))
    const second = await service.runWrite(SENTINEL_DATE, async () =>
      payload([row({ itmref: 'ART-2' })])
    )

    assert.equal(second.status, 'ok')
    const rows = await conn.from('demand_snapshots').where('snapshot_date', SENTINEL_DATE)
    assert.lengthOf(rows, 1)
    assert.equal(rows[0].itmref, 'ART-2')
  })

  test('une source EN ÉCHEC conserve ses lignes du run précédent', async ({ assert }) => {
    // Run nocturne complet, puis run manuel où l'extraction CBN lève : sans ce
    // garde-fou, les suggestions figées la nuit disparaîtraient et
    // /approvisionnements resterait sans diff.
    await service.runWrite(SENTINEL_DATE, async () =>
      payload([row({ source: 'stock', itmref: 'ART-1' }), row({ source: 'appro_suggestion' })])
    )

    const second = await service.runWrite(SENTINEL_DATE, async () =>
      payload([row({ source: 'stock', itmref: 'ART-2' })], [], ['appro_suggestion'])
    )

    assert.equal(second.status, 'ok')
    // `appro_message: 0` et non « absent » : le CBN n'était pas en échec côté
    // messages, ce run a donc bien réécrit leur photo — avec zéro ligne.
    assert.deepEqual(second.sourceBreakdown, { stock: 1, appro_message: 0 })

    const rows = await conn
      .from('demand_snapshots')
      .where('snapshot_date', SENTINEL_DATE)
      .orderBy('source')
    assert.deepEqual(
      rows.map((r) => [r.source, r.itmref]),
      [
        ['appro_suggestion', 'ART-1'],
        ['stock', 'ART-2'],
      ]
    )
  })

  test('une source revenue VIDE, sans échec, perd ses lignes du run précédent', async ({
    assert,
  }) => {
    // Le pendant du test précédent, et la raison pour laquelle le garde-fou
    // porte sur l'échec et non sur l'absence : 120 OF planifiés figés à 04 h
    // puis tous passés en ferme à 15 h doivent DISPARAÎTRE de la photo, sinon
    // elle les compte deux fois — une fois planifiés, une fois fermes.
    await service.runWrite(SENTINEL_DATE, async () =>
      payload([
        row({ source: 'of_planifie', itmref: 'ART-1' }),
        row({ source: 'of_ferme', itmref: 'ART-9' }),
      ])
    )

    await service.runWrite(SENTINEL_DATE, async () =>
      payload([row({ source: 'of_ferme', itmref: 'ART-1' })])
    )

    const rows = await conn.from('demand_snapshots').where('snapshot_date', SENTINEL_DATE)
    assert.deepEqual(
      rows.map((r) => [r.source, r.itmref]),
      [['of_ferme', 'ART-1']]
    )
  })

  test('garde-fou : extraction vide ne touche PAS une photo existante', async ({ assert }) => {
    await service.runWrite(SENTINEL_DATE, async () => payload([row({ itmref: 'ART-1' })]))

    const empty = await service.runWrite(SENTINEL_DATE, async () => payload([]))

    assert.equal(empty.status, 'skipped-empty')
    const rows = await conn.from('demand_snapshots').where('snapshot_date', SENTINEL_DATE)
    assert.lengthOf(rows, 1)
    assert.equal(rows[0].itmref, 'ART-1')
  })

  test('échec pendant l’extraction laisse la photo existante intacte', async ({ assert }) => {
    await service.runWrite(SENTINEL_DATE, async () => payload([row({ itmref: 'ART-1' })]))

    const failed = await service.runWrite(SENTINEL_DATE, async () => {
      throw new Error('X3 indisponible')
    })

    assert.equal(failed.status, 'failed')
    assert.include(failed.error ?? '', 'X3 indisponible')
    const rows = await conn.from('demand_snapshots').where('snapshot_date', SENTINEL_DATE)
    assert.lengthOf(rows, 1)
    assert.equal(rows[0].itmref, 'ART-1')
  })

  test('échec pendant l’insertion (transaction) laisse la photo existante intacte', async ({
    assert,
  }) => {
    await service.runWrite(SENTINEL_DATE, async () => payload([row({ itmref: 'ART-1' })]))

    // SQLite n'applique pas les longueurs `string(N)` de Lucid (pas de table
    // STRICT ici) — seule une contrainte NOT NULL déclenche une vraie erreur
    // SQL côté insert. `quantity` est NOT NULL ; on la force à `null` via un
    // cast pour vérifier que le rollback couvre aussi cet échec-là, pas
    // seulement `fetchRows()` qui lève.
    const failed = await service.runWrite(SENTINEL_DATE, async () =>
      payload([{ ...row({ itmref: 'ART-2' }), quantity: null } as unknown as DemandSnapshotRow])
    )

    assert.equal(failed.status, 'failed')
    const rows = await conn.from('demand_snapshots').where('snapshot_date', SENTINEL_DATE)
    assert.lengthOf(rows, 1)
    assert.equal(rows[0].itmref, 'ART-1')
  })
})

test.group('DemandSnapshotService — messages de replanification (#138 lot 0)', (group) => {
  const conn = db.connection()
  const service = new ProbeService()

  group.each.teardown(async () => {
    await conn.from('demand_snapshots').where('snapshot_date', SENTINEL_DATE).delete()
    await conn.from('appro_message_snapshots').where('snapshot_date', SENTINEL_DATE).delete()
    try {
      await conn.from('demand_snapshot_sources').where('snapshot_date', SENTINEL_DATE).delete()
    } catch {}
  })

  test('fige les messages et les compte dans le détail par source', async ({ assert }) => {
    const result = await service.runWrite(SENTINEL_DATE, async () =>
      payload(
        [row({ source: 'stock' }), row({ source: 'appro_suggestion', itmref: 'ART-9' })],
        [msg({ vcrlin: 1, mrpmes: 2 }), msg({ vcrlin: 2, mrpmes: 3, mrpdat: null })]
      )
    )

    assert.equal(result.status, 'ok')
    assert.equal(result.rows, 4)
    assert.deepEqual(result.sourceBreakdown, {
      stock: 1,
      appro_suggestion: 1,
      appro_message: 2,
    })

    const rows = await conn
      .from('appro_message_snapshots')
      .where('snapshot_date', SENTINEL_DATE)
      .orderBy('vcrlin')
    assert.lengthOf(rows, 2)
    assert.equal(rows[0].vcrnum, 'POF-1')
    assert.equal(rows[0].mrpmes, 2)
    assert.equal(rows[0].quantity, 100)
    // Une date proposée absente (cas normal d'« inutile ») doit rester NULLE en
    // base, pas devenir une chaîne vide ou un 0 que le diff lirait comme une date.
    assert.isNull(rows[1].mrpdat)
  })

  test('deux messages ne différant QUE par la séquence restent deux lignes distinctes', async ({
    assert,
  }) => {
    // Cas réel : `COA2400006` ligne 1 porte cinq messages « inutile » que seule
    // `VCRSEQ_0` distingue (777 lignes pour 773 couples vcrnum×vcrlin, mesuré
    // le 06/08/2026). Sans `vcrseq`, ils seraient indiscernables en base.
    await service.runWrite(SENTINEL_DATE, async () =>
      payload(
        [row()],
        [msg({ vcrseq: '344000', quantity: 20_000 }), msg({ vcrseq: '372000', quantity: 20_000 })]
      )
    )

    const rows = await conn
      .from('appro_message_snapshots')
      .where('snapshot_date', SENTINEL_DATE)
      .orderBy('vcrseq')
    assert.deepEqual(
      rows.map((r) => r.vcrseq),
      ['344000', '372000']
    )
  })

  test('idempotent : rejouer REMPLACE la photo des messages du jour', async ({ assert }) => {
    await service.runWrite(SENTINEL_DATE, async () =>
      payload([row()], [msg({ vcrnum: 'POF-1' }), msg({ vcrnum: 'POF-2' })])
    )
    await service.runWrite(SENTINEL_DATE, async () => payload([row()], [msg({ vcrnum: 'POF-3' })]))

    const rows = await conn.from('appro_message_snapshots').where('snapshot_date', SENTINEL_DATE)
    assert.lengthOf(rows, 1)
    assert.equal(rows[0].vcrnum, 'POF-3')
  })

  test('extraction CBN en échec : la photo des messages tient, celle du besoin passe quand même', async ({
    assert,
  }) => {
    await service.runWrite(SENTINEL_DATE, async () =>
      payload([row({ itmref: 'ART-1' })], [msg({ vcrnum: 'POF-1' })])
    )

    const result = await service.runWrite(SENTINEL_DATE, async () =>
      payload([row({ itmref: 'ART-2' })], [], ['appro_suggestion', 'appro_message'])
    )

    assert.equal(result.status, 'ok')
    assert.isUndefined(result.sourceBreakdown.appro_message)

    const messages = await conn
      .from('appro_message_snapshots')
      .where('snapshot_date', SENTINEL_DATE)
    assert.lengthOf(messages, 1)
    assert.equal(messages[0].vcrnum, 'POF-1')

    const besoin = await conn.from('demand_snapshots').where('snapshot_date', SENTINEL_DATE)
    assert.lengthOf(besoin, 1)
    assert.equal(besoin[0].itmref, 'ART-2')
  })

  test('CBN joignable mais sans message : la photo des messages est VIDÉE, pas conservée', async ({
    assert,
  }) => {
    // Zéro message sans échec est un état réel du CBN (tous les messages
    // soldés). Le conserver ferait croire au lot 1 que 777 messages tiennent
    // encore alors qu'il n'y en a plus.
    await service.runWrite(SENTINEL_DATE, async () => payload([row()], [msg({ vcrnum: 'POF-1' })]))

    await service.runWrite(SENTINEL_DATE, async () => payload([row()], []))

    const messages = await conn
      .from('appro_message_snapshots')
      .where('snapshot_date', SENTINEL_DATE)
    assert.lengthOf(messages, 0)
  })

  test('photo du besoin vide : rien n’est écrit, messages compris', async ({ assert }) => {
    await service.runWrite(SENTINEL_DATE, async () => payload([row()], [msg({ vcrnum: 'POF-1' })]))

    const result = await service.runWrite(SENTINEL_DATE, async () =>
      payload([], [msg({ vcrnum: 'POF-2' })])
    )

    assert.equal(result.status, 'skipped-empty')
    const rows = await conn.from('appro_message_snapshots').where('snapshot_date', SENTINEL_DATE)
    assert.lengthOf(rows, 1)
    assert.equal(rows[0].vcrnum, 'POF-1')
  })

  test('un message invalide annule TOUTE la transaction, les deux tables restent intactes', async ({
    assert,
  }) => {
    await service.runWrite(SENTINEL_DATE, async () =>
      payload([row({ itmref: 'ART-1' })], [msg({ vcrnum: 'POF-1' })])
    )

    const failed = await service.runWrite(SENTINEL_DATE, async () =>
      payload(
        [row({ itmref: 'ART-2' })],
        [{ ...msg({ vcrnum: 'POF-2' }), mrpmes: null } as unknown as ApproMessageSnapshotRow]
      )
    )

    assert.equal(failed.status, 'failed')
    const messages = await conn
      .from('appro_message_snapshots')
      .where('snapshot_date', SENTINEL_DATE)
    assert.lengthOf(messages, 1)
    assert.equal(messages[0].vcrnum, 'POF-1')
    // La photo du besoin est écrite AVANT les messages dans la transaction :
    // c'est elle qui prouve que le rollback couvre bien l'ensemble.
    const besoin = await conn.from('demand_snapshots').where('snapshot_date', SENTINEL_DATE)
    assert.lengthOf(besoin, 1)
    assert.equal(besoin[0].itmref, 'ART-1')
  })
})

/**
 * Le mapping X3 → colonnes est la seule partie du lot qui décide du CONTENU
 * figé, et une photo fausse ne se rattrape pas : il est testé à part, sans base
 * ni X3 joignable.
 */
test.group('messageSnapshotRow — mapping X3 → photo', () => {
  const x3 = (over: Partial<ApproMessageRow> = {}): ApproMessageRow => ({
    numero: 'COA2400006',
    ligne: 1,
    sequence: '344000',
    article: 'A7752L01',
    designation: 'Moteur EC 200W',
    date: new Date(2026, 8, 3),
    dateProposee: new Date(2026, 7, 20),
    message: 2,
    quantite: 20_000,
    fournisseur: 'BPR001',
    ...over,
  })

  test('reporte la clé complète et les deux dates', ({ assert }) => {
    assert.deepEqual(messageSnapshotRow(x3(), '2026-08-06'), {
      snapshot_date: '2026-08-06',
      vcrnum: 'COA2400006',
      vcrlin: 1,
      vcrseq: '344000',
      itmref: 'A7752L01',
      fournisseur: 'BPR001',
      mrpmes: 2,
      mrpdat: '2026-08-20',
      enddat: '2026-09-03',
      quantity: 20_000,
    })
  })

  test('une date absente reste nulle — cas normal d’« inutile »', ({ assert }) => {
    // `appro_repository.parseDate` a déjà ramené la sentinelle X3 `31-DEC-99` à
    // `null` : la photo doit la propager telle quelle, pas la matérialiser.
    const r = messageSnapshotRow(x3({ message: 6, dateProposee: null }), '2026-08-06')
    assert.isNull(r.mrpdat)
    assert.equal(r.mrpmes, 6)
  })

  test('un code fournisseur vide devient NULL, pas une chaîne vide', ({ assert }) => {
    assert.isNull(messageSnapshotRow(x3({ fournisseur: '' }), '2026-08-06').fournisseur)
  })

  test('la designation X3 n’est pas figée — elle se relit dans ITMMASTER', ({ assert }) => {
    assert.notProperty(messageSnapshotRow(x3(), '2026-08-06'), 'designation')
  })
})

/**
 * `diagnostic()` lit les tables ENTIÈRES : `jours`, `dernier` et `derniereTotal`
 * dépendent des vraies photos, présentes en local et absentes en CI. Seules
 * `premier` et `manquants` sont assertables des deux côtés — la convention
 * sentinelle 1900 du fichier garantit qu'aucune photo réelle ne les précède.
 */
test.group('DemandSnapshotService — diagnostic', (group) => {
  const conn = db.connection()
  const service = new ProbeService()
  const J1 = '1900-01-01'
  const J3 = '1900-01-03'

  group.each.teardown(async () => {
    await conn.from('demand_snapshots').whereIn('snapshot_date', [J1, J3]).delete()
    await conn.from('appro_message_snapshots').whereIn('snapshot_date', [J1, J3]).delete()
    try {
      await conn.from('demand_snapshot_sources').whereIn('snapshot_date', [J1, J3]).delete()
    } catch {}
  })

  // `.timeout()` et non un 3e argument : Japa n'accepte que `(titre, callback)`,
  // la forme à trois arguments lève `options.executor is not a function`.
  test('rend le premier jour et le trou entre deux photos', async ({ assert }) => {
    await service.runWrite(J1, async () => payload([row({ snapshot_date: J1 })]))
    await service.runWrite(J3, async () => payload([row({ snapshot_date: J3 })]))

    const { besoin } = await service.diagnostic()

    assert.equal(besoin.premier, J1)
    assert.include(besoin.manquants, '1900-01-02')
  }).timeout(15_000)

  test('une photo écrite sous une autre date est signalée comme antidatée', async ({ assert }) => {
    // C'est exactement ce que fait `snapshot:run --date` : l'état de today figé
    // sous une date passée. `created_at` est la seule trace qui le trahit.
    await service.runWrite(J1, async () => payload([row({ snapshot_date: J1 })]))

    const { besoin } = await service.diagnostic()

    assert.include(besoin.antidates, J1)
  }).timeout(15_000)
})

test.group('DemandSnapshotService — fenêtre de photos (lot 2)', (group) => {
  const conn = db.connection()
  const service = new ProbeService()
  // Dates loin dans le FUTUR : la table réelle porte déjà des photos (2026),
  // et `photosMessagesFenetre` lit la plus récente. Des dates sentinelles
  // passées trieraient sous les vraies photos et le test lirait la prod.
  const DATES = ['2099-01-01', '2099-01-08', '2099-01-15', '2099-01-20']

  group.each.teardown(async () => {
    // `runWrite` écrit dans LES DEUX tables : purger aussi `demand_snapshots`,
    // sinon les lignes 2099 y restent après le run et polluent les tests suivants.
    await conn.from('demand_snapshots').whereIn('snapshot_date', DATES).delete()
    await conn.from('appro_message_snapshots').whereIn('snapshot_date', DATES).delete()
  })

  test('lit les photos et délègue le choix de la fenêtre à photoLaPlusProche', async ({
    assert,
  }) => {
    for (const d of DATES)
      await service.runWrite(d, async () =>
        payload([row({ snapshot_date: d })], [msg({ snapshot_date: d })])
      )

    const [apres, avant] = (await service.photosMessagesFenetre(7))!

    assert.equal(apres, '2099-01-20')
    assert.equal(avant, '2099-01-15')
  }).timeout(15_000)

  test('patterns : la dominance passe par les couples CONSÉCUTIFS de la fenêtre', async ({
    assert,
  }) => {
    // Le même message porté par les quatre photos : un message qui dure, pas
    // quatre messages. Et trois couples consécutifs à analyser, pas un diff
    // unique 01→20 — c'est ce qui distingue une régularité d'une photo de plus.
    for (const d of DATES)
      await service.runWrite(d, async () =>
        payload([row({ snapshot_date: d })], [msg({ snapshot_date: d })])
      )

    const patterns = (await service.patterns(30))!

    assert.equal(patterns.avant, '2099-01-01')
    assert.equal(patterns.apres, '2099-01-20')
    assert.equal(patterns.joursCouverts, 4)
    assert.equal(patterns.diffsAnalyses, 3)
    assert.lengthOf(patterns.articles, 1)
    assert.equal(patterns.articles[0].nbMessages, 1)
    assert.equal(patterns.articles[0].joursSousMessage, 4)
  }).timeout(15_000)
})

/**
 * Périmètre comparable du diff des drivers (#145), bout en bout : la règle pure
 * est testée dans `snapshot_perimetre.test.ts`, ici on vérifie qu'elle est bien
 * CÂBLÉE — que `diffDrivers` filtre réellement les lignes, remonte les sources
 * écartées et ne rend pas un diff vide indistinguable d'une nuit calme.
 *
 * Le cache est `getOrSetForever` sur le couple de jours : chaque test utilise
 * donc un couple de dates sentinelles PROPRE, sinon le second test lirait le
 * résultat du premier.
 */
test.group('DemandSnapshotService — périmètre comparable du diff (#145)', (group) => {
  const conn = db.connection()
  const service = new ProbeService()
  const jours: string[] = []

  /** Deux jours sentinelles distincts par test, pour ne pas croiser le cache. */
  const couple = (n: number): [string, string] => {
    const a = `1900-02-${String(n * 2 + 1).padStart(2, '0')}`
    const b = `1900-02-${String(n * 2 + 2).padStart(2, '0')}`
    jours.push(a, b)
    return [a, b]
  }

  group.each.teardown(async () => {
    await conn.from('demand_snapshots').whereIn('snapshot_date', jours).delete()
    await conn.from('appro_message_snapshots').whereIn('snapshot_date', jours).delete()
    try {
      await conn.from('demand_snapshot_sources').whereIn('snapshot_date', jours).delete()
    } catch {}
    jours.length = 0
  })

  test('une source absente de la photo AVANT est écartée, jamais comptée « apparue »', async ({
    assert,
  }) => {
    // Le cas de l'issue : `appro_suggestion` naît le 06/08, la photo du 04/08 ne
    // la porte pas. Sans le périmètre, ses lignes remontent en bloc comme des
    // apparitions — 5 469 fausses lignes en PROD.
    const [avant, apres] = couple(1)
    await service.runWrite(avant, async () =>
      payload([
        row({ snapshot_date: avant, source: 'stock', itmref: 'ART-1' }),
        row({ snapshot_date: avant, source: 'of_ferme', itmref: 'ART-2' }),
        row({ snapshot_date: avant, source: 'appro', itmref: 'ART-3' }),
      ])
    )
    await service.runWrite(apres, async () =>
      payload([
        row({ snapshot_date: apres, source: 'stock', itmref: 'ART-1' }),
        row({ snapshot_date: apres, source: 'of_ferme', itmref: 'ART-2' }),
        row({ snapshot_date: apres, source: 'appro', itmref: 'ART-3' }),
        row({ snapshot_date: apres, source: 'appro_suggestion', itmref: 'ART-4' }),
      ])
    )
    // Historique pré-#149 : pas de journal → retombe sur perimetreComparable (garde-fou).
    try {
      await conn.from('demand_snapshot_sources').whereIn('snapshot_date', [avant, apres]).delete()
    } catch {}

    const diff = await service.diffDrivers(apres, avant)

    assert.isNotNull(diff)
    assert.deepEqual(diff!.sourcesEcartees, [
      { source: 'appro_suggestion', manqueDans: 'avant', raison: 'inconnu' },
    ])
    assert.deepEqual(diff!.sourcesComparees, ['appro', 'of_ferme', 'stock'])
    assert.isNull(diff!.message)
    // Aucune entrée sur la source écartée, et surtout aucune « apparue ».
    assert.isEmpty(diff!.entrees.filter((e) => e.source === 'appro_suggestion'))
    assert.isEmpty(diff!.entrees.filter((e) => e.article === 'ART-4'))
  }).timeout(20_000)

  test('deux photos sans aucune source commune : message explicite, pas un diff vide', async ({
    assert,
  }) => {
    const [avant, apres] = couple(2)
    await service.runWrite(avant, async () =>
      payload([row({ snapshot_date: avant, source: 'stock', itmref: 'ART-1' })])
    )
    await service.runWrite(apres, async () =>
      payload([row({ snapshot_date: apres, source: 'of_ferme', itmref: 'ART-1' })])
    )
    try {
      await conn.from('demand_snapshot_sources').whereIn('snapshot_date', [avant, apres]).delete()
    } catch {}

    const diff = await service.diffDrivers(apres, avant)

    assert.isNotNull(diff)
    assert.isEmpty(diff!.sourcesComparees)
    assert.isEmpty(diff!.entrees)
    // Le point du test : un diff vide SANS message se lirait « rien n'a bougé ».
    assert.isNotNull(diff!.message)
    assert.include(diff!.message ?? '', 'aucune source commune')
    assert.deepEqual(diff!.sourcesEcartees, [
      { source: 'of_ferme', manqueDans: 'avant', raison: 'inconnu' },
      { source: 'stock', manqueDans: 'apres', raison: 'inconnu' },
    ])
  }).timeout(20_000)

  test('périmètre identique des deux côtés : aucune source écartée (le bandeau disparaît)', async ({
    assert,
  }) => {
    const [avant, apres] = couple(3)
    await service.runWrite(avant, async () =>
      payload([
        row({ snapshot_date: avant, source: 'stock', itmref: 'ART-1', quantity: 10 }),
        row({ snapshot_date: avant, source: 'of_ferme', itmref: 'ART-2', quantity: 10 }),
      ])
    )
    await service.runWrite(apres, async () =>
      payload([
        row({ snapshot_date: apres, source: 'stock', itmref: 'ART-1', quantity: 10 }),
        row({ snapshot_date: apres, source: 'of_ferme', itmref: 'ART-2', quantity: 10 }),
      ])
    )
    try {
      await conn.from('demand_snapshot_sources').whereIn('snapshot_date', [avant, apres]).delete()
    } catch {}

    const diff = await service.diffDrivers(apres, avant)

    assert.isNotNull(diff)
    assert.isEmpty(diff!.sourcesEcartees)
    assert.deepEqual(diff!.sourcesComparees, ['of_ferme', 'stock'])
    assert.isNull(diff!.message)
  }).timeout(20_000)
})

/**
 * Journal des sources capturées par run (#149).
 *
 * Avant le journal, une source réellement vide (CBN à 0 OF suggéré) était
 * confondue avec une source en échec : le périmètre l'écartait et la disparition
 * de ~2 000 lignes restait invisible. Ces tests vérifient que write() persiste
 * le verdict et que diffDrivers() le lit au lieu de déduire.
 */
test.group('DemandSnapshotService — journal des sources capturées (#149)', (group) => {
  const conn = db.connection()
  const service = new ProbeService()
  const J1 = '1900-03-01'
  const J2 = '1900-03-02'
  const J3 = '1900-03-03'
  const J4 = '1900-03-04'
  const J5 = '1900-03-05'
  const J6 = '1900-03-06'
  const J7 = '1900-03-07'
  const J8 = '1900-03-08'

  const DATES = [J1, J2, J3, J4, J5, J6, J7, J8]

  group.each.teardown(async () => {
    await conn.from('demand_snapshots').whereIn('snapshot_date', DATES).delete()
    await conn.from('appro_message_snapshots').whereIn('snapshot_date', DATES).delete()
    try {
      await conn.from('demand_snapshot_sources').whereIn('snapshot_date', DATES).delete()
    } catch {}
  })

  test('write persiste le journal : capturee / vide / echec avec lignes', async ({ assert }) => {
    await service.runWrite(J1, async () =>
      payload(
        [row({ snapshot_date: J1, source: 'stock', itmref: 'A1' })],
        [msg({ snapshot_date: J1, vcrnum: 'POF-1' })],
        ['appro_suggestion', 'appro_message']
      )
    )

    const rows = await conn
      .from('demand_snapshot_sources')
      .where('snapshot_date', J1)
      .orderBy('source')
    const bySource = new Map(rows.map((r: Record<string, unknown>) => [String(r.source), r]))
    // capturee
    assert.equal((bySource.get('stock') as Record<string, unknown>)?.statut, 'capturee')
    assert.equal((bySource.get('stock') as Record<string, unknown>)?.lignes, 1)
    // vide — aucune ligne pour of_ferme mais pas en échec
    assert.equal((bySource.get('of_ferme') as Record<string, unknown>)?.statut, 'vide')
    assert.equal((bySource.get('of_ferme') as Record<string, unknown>)?.lignes, 0)
    // echec
    assert.equal((bySource.get('appro_suggestion') as Record<string, unknown>)?.statut, 'echec')
    assert.equal((bySource.get('appro_message') as Record<string, unknown>)?.statut, 'echec')
    // Toutes les sources attendues sont tracées (8 demand + 1 message)
    assert.lengthOf(rows, 9)
  }).timeout(15_000)

  test('une source réellement vide reste comparée : sa disparition est affichée', async ({
    assert,
  }) => {
    // Avant : of_suggestion capturee avec une ligne. Après : vide (succès, 0 ligne).
    await service.runWrite(J1, async () =>
      payload([
        row({ snapshot_date: J1, source: 'stock', itmref: 'S1', quantity: 10 }),
        row({ snapshot_date: J1, source: 'of_suggestion', itmref: 'A1', quantity: 100 }),
      ])
    )
    await service.runWrite(J2, async () =>
      payload([row({ snapshot_date: J2, source: 'stock', itmref: 'S1', quantity: 10 })])
    )

    const diff = await service.diffDrivers(J2, J1)
    assert.isNotNull(diff)
    // of_suggestion est vide après, pas en échec -> COMPARÉE, pas écartée
    assert.isTrue(diff!.sourcesComparees.includes('of_suggestion'))
    assert.isEmpty(diff!.sourcesEcartees.filter((e) => e.source === 'of_suggestion'))
    // La ligne disparue est bien rapportée, pas escamotée
    assert.isTrue(diff!.entrees.some((e) => e.article === 'A1' && e.nature === 'disparue'))
  }).timeout(20_000)

  test('une source en échec est écartée avec raison echec', async ({ assert }) => {
    await service.runWrite(J3, async () =>
      payload([row({ snapshot_date: J3, source: 'stock', itmref: 'S1' })], [], ['of_suggestion'])
    )
    await service.runWrite(J4, async () =>
      payload([
        row({ snapshot_date: J4, source: 'stock', itmref: 'S1' }),
        row({ snapshot_date: J4, source: 'of_suggestion', itmref: 'A1' }),
      ])
    )

    const diff = await service.diffDrivers(J4, J3)
    assert.isNotNull(diff)
    assert.deepEqual(
      diff!.sourcesEcartees.find((e) => e.source === 'of_suggestion'),
      { source: 'of_suggestion', manqueDans: 'avant', raison: 'echec' }
    )
    assert.isFalse(diff!.sourcesComparees.includes('of_suggestion'))
  }).timeout(20_000)

  test('journal mixte : historique sans journal vs nuit vide -> disparition affichée', async ({
    assert,
  }) => {
    // J5 sans journal (historique pré-#149) avec of_suggestion, J6 avec journal vide pour of_suggestion
    // Simule en effaçant le journal de J5 après écriture
    await service.runWrite(J5, async () =>
      payload([
        row({ snapshot_date: J5, source: 'stock', itmref: 'S1' }),
        row({ snapshot_date: J5, source: 'of_suggestion', itmref: 'A1' }),
      ])
    )
    await conn.from('demand_snapshot_sources').where('snapshot_date', J5).delete()
    await service.runWrite(J6, async () =>
      payload([row({ snapshot_date: J6, source: 'stock', itmref: 'S1' })])
    )

    const diff = await service.diffDrivers(J6, J5)
    assert.isNotNull(diff)
    assert.isTrue(diff!.sourcesComparees.includes('of_suggestion'))
    assert.isTrue(diff!.entrees.some((e) => e.article === 'A1'))
  }).timeout(20_000)

  test('re-run en échec sur une source déjà capturée : le journal ne contredit pas les lignes préservées', async ({
    assert,
  }) => {
    // Défaut bloquant (revue de code #149) : run nocturne complet à 04 h qui
    // fige `appro_suggestion`, puis `snapshot:run` relancé à la main à 15 h
    // pendant qu'X3 sature. L'appel CBN lève -> les lignes `appro_suggestion`
    // de la nuit SURVIVENT (garde-fou par source), mais avant ce fix le
    // journal était réécrit en `echec` pour la même source : le bandeau de
    // /besoins/evolution affichait "capture perdue" sur des données réelles,
    // présentes et valides des deux côtés. Le journal doit rester symétrique
    // de `demand_snapshots` (même `whereNotIn`).
    await service.runWrite(J7, async () =>
      payload([
        row({ snapshot_date: J7, source: 'stock', itmref: 'S1' }),
        row({ snapshot_date: J7, source: 'appro_suggestion', itmref: 'A1' }),
        row({ snapshot_date: J7, source: 'appro_suggestion', itmref: 'A2' }),
      ])
    )

    const second = await service.runWrite(J7, async () =>
      payload(
        [row({ snapshot_date: J7, source: 'stock', itmref: 'S2' })],
        [],
        ['appro_suggestion', 'appro_message']
      )
    )
    assert.equal(second.status, 'ok')

    const journalRows = await conn
      .from('demand_snapshot_sources')
      .where('snapshot_date', J7)
      .andWhere('source', 'appro_suggestion')
    assert.lengthOf(journalRows, 1)
    // Toujours `capturee`, avec le compte d'ORIGINE (2 lignes) — pas `echec`.
    assert.equal(journalRows[0].statut, 'capturee')
    assert.equal(journalRows[0].lignes, 2)

    // Les lignes `demand_snapshots` de la source ont bien survécu au re-run.
    const demandRows = await conn
      .from('demand_snapshots')
      .where('snapshot_date', J7)
      .andWhere('source', 'appro_suggestion')
      .orderBy('itmref')
    assert.deepEqual(
      demandRows.map((r) => r.itmref),
      ['A1', 'A2']
    )
  }).timeout(20_000)

  test('premier run du jour en échec d’emblée : la ligne de journal echec EST créée', async ({
    assert,
  }) => {
    // Cas complémentaire : rien à préserver puisqu'aucun journal ne survit
    // pour cette source sur cette date -> `echec` doit bien être écrit.
    const result = await service.runWrite(J8, async () =>
      payload([row({ snapshot_date: J8, source: 'stock', itmref: 'S1' })], [], ['appro_suggestion'])
    )
    assert.equal(result.status, 'ok')

    const journalRows = await conn
      .from('demand_snapshot_sources')
      .where('snapshot_date', J8)
      .andWhere('source', 'appro_suggestion')
    assert.lengthOf(journalRows, 1)
    assert.equal(journalRows[0].statut, 'echec')
    assert.equal(journalRows[0].lignes, 0)
  }).timeout(20_000)
})

/**
 * Frise des drivers sur une plage (#143 défaut 5) : rien ne couvrait
 * jusqu'ici `friseDrivers` lui-même — plafond `MAX_PAS_FRISE`, chaînage des
 * pas, trous — la revue de code #143 n'avait que les 12 tests du domaine pur
 * (`diff_frise.test.ts`) pour s'appuyer.
 */
test.group('DemandSnapshotService — frise des drivers (#143)', (group) => {
  const conn = db.connection()
  const service = new ProbeService()
  const dates: string[] = []

  group.each.teardown(async () => {
    await conn.from('demand_snapshots').whereIn('snapshot_date', dates).delete()
    await conn.from('appro_message_snapshots').whereIn('snapshot_date', dates).delete()
    try {
      await conn.from('demand_snapshot_sources').whereIn('snapshot_date', dates).delete()
    } catch {}
    dates.length = 0
  })

  test('une série de 3 photos → autant de pas que d’intervalles, en ordre chronologique', async ({
    assert,
  }) => {
    const J1 = '1900-04-01'
    const J2 = '1900-04-02'
    const J3 = '1900-04-03'
    dates.push(J1, J2, J3)
    await service.runWrite(J1, async () =>
      payload([row({ snapshot_date: J1, source: 'stock', itmref: 'A1', quantity: 10 })])
    )
    await service.runWrite(J2, async () =>
      payload([row({ snapshot_date: J2, source: 'stock', itmref: 'A1', quantity: 20 })])
    )
    await service.runWrite(J3, async () =>
      payload([row({ snapshot_date: J3, source: 'stock', itmref: 'A1', quantity: 30 })])
    )

    const frise = await service.friseDrivers(J3, J1)

    assert.isNotNull(frise)
    assert.isNull(frise!.message)
    assert.isEmpty(frise!.trous)
    assert.lengthOf(frise!.pas, 2)
    assert.equal(frise!.pas[0].avant, J1)
    assert.equal(frise!.pas[0].apres, J2)
    assert.equal(frise!.pas[1].avant, J2)
    assert.equal(frise!.pas[1].apres, J3)
  }).timeout(20_000)

  test('un trou dans la série est remonté dans trous, le pas qui l’enjambe existe quand même', async ({
    assert,
  }) => {
    const J1 = '1900-04-10'
    const J2 = '1900-04-13' // 2 jours de trou (11 et 12)
    dates.push(J1, J2)
    await service.runWrite(J1, async () =>
      payload([row({ snapshot_date: J1, source: 'stock', itmref: 'A1', quantity: 10 })])
    )
    await service.runWrite(J2, async () =>
      payload([row({ snapshot_date: J2, source: 'stock', itmref: 'A1', quantity: 20 })])
    )

    const frise = await service.friseDrivers(J2, J1)

    assert.isNotNull(frise)
    assert.deepEqual(frise!.trous, [{ entre: J1, et: J2, manquants: ['1900-04-11', '1900-04-12'] }])
    // Le trou n'enjambe pas le pas en silence : le pas existe toujours.
    assert.lengthOf(frise!.pas, 1)
    assert.equal(frise!.pas[0].avant, J1)
    assert.equal(frise!.pas[0].apres, J2)
  }).timeout(20_000)

  test('moins de deux photos dans la plage → null', async ({ assert }) => {
    const J1 = '1900-04-20'
    dates.push(J1)
    await service.runWrite(J1, async () =>
      payload([row({ snapshot_date: J1, source: 'stock', itmref: 'A1' })])
    )

    const frise = await service.friseDrivers(J1, J1)

    assert.isNull(frise)
  }).timeout(15_000)

  test('plafond MAX_PAS_FRISE dépassé → message « plage trop large », pas: [], trous quand même renseigné', async ({
    assert,
  }) => {
    // Le plafond se déclenche AVANT tout `diffDrivers` (juste sur le nombre de
    // dates distinctes) : inutile de payer 47 écritures transactionnelles,
    // une insertion directe minimale suffit à peupler `demand_snapshots`.
    const JOUR_MS = 86_400_000
    const debut = Date.UTC(1901, 0, 1)
    const jours: string[] = []
    // 44 jours consécutifs...
    for (let i = 0; i < 44; i++) {
      jours.push(new Date(debut + i * JOUR_MS).toISOString().slice(0, 10))
    }
    // ...puis un vrai trou de 3 jours avant les 3 dernières photos — 47 dates
    // distinctes au total (46 pas > MAX_PAS_FRISE = 45), et un trou réel pour
    // vérifier que `detecterTrous` tourne quand même avant le plafond.
    const apresLeTrou = debut + (44 + 3) * JOUR_MS
    for (let i = 0; i < 3; i++) {
      jours.push(new Date(apresLeTrou + i * JOUR_MS).toISOString().slice(0, 10))
    }
    assert.lengthOf(jours, 47)
    dates.push(...jours)

    await conn.table('demand_snapshots').insert(
      jours.map((d) => ({
        snapshot_date: d,
        source: 'stock',
        itmref: 'A1',
        quantity: 1,
        created_at: new Date(),
      }))
    )

    const frise = await service.friseDrivers(jours[jours.length - 1], jours[0])

    assert.isNotNull(frise)
    assert.deepEqual(frise!.pas, [])
    assert.include(frise!.message ?? '', 'plage trop large')
    // Le trou existe toujours dans la réponse malgré le plafond : la détection
    // ne dépend pas du calcul des pas qui, lui, est coupé court.
    assert.isAbove(frise!.trous.length, 0)
  }).timeout(20_000)

  test('le memo borné déduplique bien les lectures : 6 photos (5 pas) → 6 lectures, pas 10 (défaut 2, revue de code)', async ({
    assert,
  }) => {
    // Régression du memo NON borné signalé en revue de code : `friseDrivers`
    // relisait chaque journée deux fois (le pas i lit dates[i+1], le pas i+1
    // la relit). Une série de 6 photos tient largement dans la fenêtre
    // (CAPACITE_MEMO_JOURNEES = 8) : le gain doit donc être ENTIER ici, pas
    // seulement partiel — 6 lectures pour 6 dates distinctes, pas 10
    // (2 × 5 pas) comme avant la mémoïsation.
    const serviceCompteur = new ProbeServiceCompteur()
    const jours = [
      '1900-04-30',
      '1900-05-01',
      '1900-05-02',
      '1900-05-03',
      '1900-05-04',
      '1900-05-05',
    ]
    dates.push(...jours)
    for (const [i, j] of jours.entries()) {
      await serviceCompteur.runWrite(j, async () =>
        payload([row({ snapshot_date: j, source: 'stock', itmref: 'A1', quantity: 10 + i })])
      )
    }

    const frise = await serviceCompteur.friseDrivers(jours[jours.length - 1], jours[0])

    assert.isNotNull(frise)
    assert.lengthOf(frise!.pas, 5)
    assert.equal(serviceCompteur.nbLectures, 6)
  }).timeout(20_000)
})

test.group('MemoJourneesBorne (#143 défaut 2, borné en revue de code)', () => {
  const p = (n: number) => Promise.resolve([{ n }])

  test('une même journée demandée deux fois ne déclenche qu’une lecture : `set` puis `get` rendent la MÊME promesse', ({
    assert,
  }) => {
    const memo = new MemoJourneesBorne(4)
    assert.isUndefined(memo.get('J1'))
    const promesse = p(1)
    memo.set('J1', promesse)
    assert.strictEqual(memo.get('J1'), promesse)
    // Un second `get` (ce que ferait un second appelant) rend la même
    // référence : aucune seconde lecture ne serait déclenchée par l'appelant.
    assert.strictEqual(memo.get('J1'), promesse)
  })

  test('la capacité est respectée : au-delà, la plus ANCIENNE entrée insérée est évincée (FIFO)', ({
    assert,
  }) => {
    const memo = new MemoJourneesBorne(3)
    memo.set('J1', p(1))
    memo.set('J2', p(2))
    memo.set('J3', p(3))
    assert.equal(memo.taille, 3)

    // J4 dépasse la capacité : J1 (la plus ancienne INSÉRÉE) est évincée,
    // même si elle a été relue entre-temps (FIFO, pas LRU — cf. doc de la classe).
    assert.isDefined(memo.get('J1'))
    memo.set('J4', p(4))

    assert.equal(memo.taille, 3)
    assert.isUndefined(memo.get('J1'))
    assert.isDefined(memo.get('J2'))
    assert.isDefined(memo.get('J3'))
    assert.isDefined(memo.get('J4'))
  })

  test('évincer une clé pendant qu’une promesse est en vol ne casse rien pour l’appelant qui la détient déjà', async ({
    assert,
  }) => {
    const memo = new MemoJourneesBorne(1)
    const promesseJ1 = p(1)
    memo.set('J1', promesseJ1)
    // Un appelant récupère sa référence AVANT l'éviction — c'est exactement
    // ce que fait `loadDayRows` : `promesse = memo.get(day)` puis `return
    // promesse`, jamais un accès différé au memo.
    const referenceAppelant = memo.get('J1')
    memo.set('J2', p(2)) // évince J1 (capacité 1)

    assert.isUndefined(memo.get('J1'))
    assert.isDefined(referenceAppelant)
    // La promesse détenue par l'appelant résout normalement, indépendamment
    // du memo qui ne la connaît plus.
    assert.deepEqual(await referenceAppelant, [{ n: 1 }])
  })
})

/**
 * Deux exclusions du diff des drivers, une seule passe (08/08/2026).
 *
 * La règle de catégorie Z existait déjà, mais elle se résout via
 * `static_articles` — table qui, jusqu'à cette date, ne contenait QUE les
 * articles actifs. Un article passé « Non utilisable » en sortait donc, et
 * devenait invisible au filtre censé l'écarter : 106 références `ET####`
 * (catégorie `ZHE`, statut 6) traversaient la frise, porteuses de 112 OF fermes
 * de quantité 1 repoussés en bloc depuis juin.
 *
 * Ces tests verrouillent les deux exclusions ET le cas qui ne doit pas exclure —
 * un statut inconnu, faute de référentiel synchronisé.
 */
test.group('DemandSnapshotService — articles écartés du diff des drivers', (group) => {
  const conn = db.connection()
  const service = new ProbeService()
  const J1 = '1900-01-01'
  const J2 = '1900-01-02'
  const CODES = ['ZZ-VIVANT', 'ZZ-CATZ', 'ZZ-MORT', 'ZZ-INCONNU']

  group.each.setup(async () => {
    await conn.table('static_articles').multiInsert([
      { code: 'ZZ-VIVANT', description: 'Vivant', category: 'PF', status: 1, synced_at: 0 },
      { code: 'ZZ-CATZ', description: 'Outillage', category: 'ZOU', status: 1, synced_at: 0 },
      { code: 'ZZ-MORT', description: 'Mort', category: 'PF', status: 6, synced_at: 0 },
    ])
  })

  group.each.teardown(async () => {
    await conn.from('static_articles').whereIn('code', CODES).delete()
    await conn.from('demand_snapshots').whereIn('snapshot_date', [J1, J2]).delete()
    await conn.from('demand_snapshot_sources').whereIn('snapshot_date', [J1, J2]).delete()
  })

  /** Variation de stock franche : au-delà des ±20 %, elle sort du diff. */
  const bouge = (jour: string, itmref: string, quantity: number): DemandSnapshotRow =>
    row({ snapshot_date: jour, itmref, quantity })

  test('statut « Non utilisable » et catégorie Z écartent ; l’inconnu reste', async ({
    assert,
  }) => {
    await service.runWrite(J1, async () => payload(CODES.map((c) => bouge(J1, c, 1000))))
    await service.runWrite(J2, async () => payload(CODES.map((c) => bouge(J2, c, 100))))

    const r = await service.diffDrivers(J2, J1)
    assert.isNotNull(r)
    const articles = [...new Set(r!.entrees.map((e) => e.article))].sort()

    // `ZZ-INCONNU` n'est dans aucun référentiel : il RESTE. Une table jamais
    // synchronisée doit salir la page visiblement, pas la vider en silence.
    assert.deepEqual(articles, ['ZZ-INCONNU', 'ZZ-VIVANT'])

    const vivant = r!.entrees.find((e) => e.article === 'ZZ-VIVANT')
    assert.equal(vivant?.designation, 'Vivant')
    assert.equal(vivant?.nature, 'quantite')
  })
})
