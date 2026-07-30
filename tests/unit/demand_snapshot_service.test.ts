import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { DemandSnapshotService, type DemandSnapshotRow } from '#services/demand_snapshot_service'

/**
 * Swap transactionnel + garde-fou vide (#74 lot 1, absorbé par #98 lot 4).
 *
 * L'extraction X3 (`buildRows`) n'est pas testée ici — elle délègue à des
 * repositories déjà couverts et exigerait X3 joignable, même motif que
 * `replica_sync.test.ts`. Ce qui est propre à ce service — et donc testé —
 * c'est `write()` : le swap est-il atomique, le garde-fou vide protège-t-il
 * une photo existante, l'échec laisse-t-il l'état intact.
 *
 * `demand_snapshots` est une table dédiée neuve (pas encore lue par l'app) :
 * test directement dessus, avec une date sentinelle 1900 pour ne jamais
 * toucher une vraie photo (même précaution que les autres tests réplique).
 */

const SENTINEL_DATE = '1900-01-01'

/** Ouvre `write`, seule méthode testable sans X3. */
class ProbeService extends DemandSnapshotService {
  runWrite(dateStr: string, fetchRows: () => Promise<DemandSnapshotRow[]>) {
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

test.group('DemandSnapshotService — write', (group) => {
  const conn = db.connection()
  const service = new ProbeService()

  group.each.teardown(async () => {
    await conn.from('demand_snapshots').where('snapshot_date', SENTINEL_DATE).delete()
  })

  test('insère les lignes et retourne un statut ok', async ({ assert }) => {
    const result = await service.runWrite(SENTINEL_DATE, async () => [
      row({ itmref: 'ART-1' }),
      row({ itmref: 'ART-2' }),
    ])

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
    await service.runWrite(SENTINEL_DATE, async () => [row({ itmref: 'ART-1' })])
    const second = await service.runWrite(SENTINEL_DATE, async () => [row({ itmref: 'ART-2' })])

    assert.equal(second.status, 'ok')
    const rows = await conn.from('demand_snapshots').where('snapshot_date', SENTINEL_DATE)
    assert.lengthOf(rows, 1)
    assert.equal(rows[0].itmref, 'ART-2')
  })

  test('garde-fou : extraction vide ne touche PAS une photo existante', async ({ assert }) => {
    await service.runWrite(SENTINEL_DATE, async () => [row({ itmref: 'ART-1' })])

    const empty = await service.runWrite(SENTINEL_DATE, async () => [])

    assert.equal(empty.status, 'skipped-empty')
    const rows = await conn.from('demand_snapshots').where('snapshot_date', SENTINEL_DATE)
    assert.lengthOf(rows, 1)
    assert.equal(rows[0].itmref, 'ART-1')
  })

  test('échec pendant l’extraction laisse la photo existante intacte', async ({ assert }) => {
    await service.runWrite(SENTINEL_DATE, async () => [row({ itmref: 'ART-1' })])

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
    await service.runWrite(SENTINEL_DATE, async () => [row({ itmref: 'ART-1' })])

    // SQLite n'applique pas les longueurs `string(N)` de Lucid (pas de table
    // STRICT ici) — seule une contrainte NOT NULL déclenche une vraie erreur
    // SQL côté insert. `quantity` est NOT NULL ; on la force à `null` via un
    // cast pour vérifier que le rollback couvre aussi cet échec-là, pas
    // seulement `fetchRows()` qui lève.
    const failed = await service.runWrite(SENTINEL_DATE, async () => [
      { ...row({ itmref: 'ART-2' }), quantity: null } as unknown as DemandSnapshotRow,
    ])

    assert.equal(failed.status, 'failed')
    const rows = await conn.from('demand_snapshots').where('snapshot_date', SENTINEL_DATE)
    assert.lengthOf(rows, 1)
    assert.equal(rows[0].itmref, 'ART-1')
  })
})
