import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import {
  DemandSnapshotService,
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
  })

  test(
    'rend le premier jour et le trou entre deux photos',
    { timeout: 15000 },
    async ({ assert }) => {
      await service.runWrite(J1, async () => payload([row({ snapshot_date: J1 })]))
      await service.runWrite(J3, async () => payload([row({ snapshot_date: J3 })]))

      const { besoin } = await service.diagnostic()

      assert.equal(besoin.premier, J1)
      assert.include(besoin.manquants, '1900-01-02')
    }
  )

  test(
    'une photo écrite sous une autre date est signalée comme antidatée',
    { timeout: 15000 },
    async ({ assert }) => {
      // C'est exactement ce que fait `snapshot:run --date` : l'état de today figé
      // sous une date passée. `created_at` est la seule trace qui le trahit.
      await service.runWrite(J1, async () => payload([row({ snapshot_date: J1 })]))

      const { besoin } = await service.diagnostic()

      assert.include(besoin.antidates, J1)
    }
  )
})
