import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { DemandSnapshotService } from '#services/demand_snapshot_service'
import type { DemandSnapshotRow, ApproMessageSnapshotRow } from '#app/domain/snapshot_rows'

const SENTINEL_DEPUIS = '2099-01-05'
const SENTINEL_APRES = '2099-01-10'
const SENTINEL_TROU = '2099-01-07'
const SENTINEL_ARTICLE = 'V9999TEST'
const SENTINEL_CLE = 'TEST999:1000:1'

class ProbeDiff extends DemandSnapshotService {
  historique(cle: string) {
    return this.historiqueMessage(cle)
  }
  temporel(article: string, cle: string) {
    return this.diffTemporel(article, cle)
  }
}

function dRow(over: Partial<DemandSnapshotRow> = {}): DemandSnapshotRow {
  return {
    snapshot_date: SENTINEL_APRES,
    source: 'stock',
    itmref: SENTINEL_ARTICLE,
    vcrnum: null,
    vcrlin: null,
    quantity: 10,
    date_echeance: null,
    fournisseur: null,
    ...over,
  }
}

function mRow(over: Partial<ApproMessageSnapshotRow> = {}): ApproMessageSnapshotRow {
  return {
    snapshot_date: SENTINEL_DEPUIS,
    vcrnum: 'TEST999',
    vcrlin: 1000,
    vcrseq: '1',
    itmref: SENTINEL_ARTICLE,
    fournisseur: 'BPR001',
    mrpmes: 2,
    mrpdat: '2099-02-01',
    enddat: '2099-03-01',
    quantity: 100,
    ...over,
  }
}

test.group('DemandSnapshotService — diffTemporel Q8/Q12', (group) => {
  const conn = db.connection()
  const service = new ProbeDiff()
  const cle = SENTINEL_CLE
  const article = SENTINEL_ARTICLE
  const dates = [
    SENTINEL_DEPUIS,
    SENTINEL_APRES,
    SENTINEL_TROU,
    '2099-01-01',
    '2099-01-02',
    '2099-01-06',
    '2099-01-08',
  ]

  group.each.teardown(async () => {
    await conn.from('demand_snapshots').whereIn('snapshot_date', dates).delete()
    await conn.from('appro_message_snapshots').whereIn('snapshot_date', dates).delete()
    try {
      await conn.from('demand_snapshot_sources').whereIn('snapshot_date', dates).delete()
    } catch {}
  })

  test('depuis = première photo où MRPMES != 1 (Q8)', async ({ assert }) => {
    await conn.table('appro_message_snapshots').insert([
      { ...mRow({ snapshot_date: '2099-01-05', mrpmes: 1 }), created_at: new Date() },
      { ...mRow({ snapshot_date: '2099-01-06', mrpmes: 1 }), created_at: new Date() },
      { ...mRow({ snapshot_date: '2099-01-08', mrpmes: 2 }), created_at: new Date() },
      { ...mRow({ snapshot_date: '2099-01-10', mrpmes: 2 }), created_at: new Date() },
    ])
    const depuis = await service.historique(cle)
    assert.equal(depuis, '2099-01-08')
  })

  test('depuis null si jamais apparu', async ({ assert }) => {
    await conn
      .table('appro_message_snapshots')
      .insert([{ ...mRow({ snapshot_date: '2099-01-05', mrpmes: 1 }), created_at: new Date() }])
    const direct = await service.temporel(article, cle)
    assert.equal(direct?.depuis, null)
    assert.deepEqual(direct?.entrees, [])
  })

  test('diff porte sur 6 sources terrain uniquement, exclut sorties CBN', async ({ assert }) => {
    await conn.table('appro_message_snapshots').insert([
      { ...mRow({ snapshot_date: SENTINEL_DEPUIS, mrpmes: 2 }), created_at: new Date() },
      { ...mRow({ snapshot_date: SENTINEL_APRES, mrpmes: 2 }), created_at: new Date() },
    ])
    await conn.table('demand_snapshots').insert([
      {
        ...dRow({ snapshot_date: SENTINEL_DEPUIS, source: 'stock', quantity: 120 }),
        created_at: new Date(),
      },
      {
        ...dRow({ snapshot_date: SENTINEL_APRES, source: 'stock', quantity: 32 }),
        created_at: new Date(),
      },
      {
        ...dRow({
          snapshot_date: SENTINEL_DEPUIS,
          source: 'of_ferme',
          itmref: article,
          vcrnum: 'OF01',
          quantity: 100,
        }),
        created_at: new Date(),
      },
      {
        ...dRow({
          snapshot_date: SENTINEL_APRES,
          source: 'of_ferme',
          itmref: article,
          vcrnum: 'OF01',
          quantity: 200,
        }),
        created_at: new Date(),
      },
      {
        ...dRow({
          snapshot_date: SENTINEL_DEPUIS,
          source: 'appro',
          itmref: article,
          vcrnum: 'CG09',
          quantity: 50,
        }),
        created_at: new Date(),
      },
      {
        ...dRow({
          snapshot_date: SENTINEL_APRES,
          source: 'appro',
          itmref: article,
          vcrnum: 'CG09',
          quantity: 80,
        }),
        created_at: new Date(),
      },
      {
        ...dRow({
          snapshot_date: SENTINEL_DEPUIS,
          source: 'of_planifie',
          itmref: article,
          vcrnum: 'FP01',
          quantity: 10,
        }),
        created_at: new Date(),
      },
      {
        ...dRow({
          snapshot_date: SENTINEL_APRES,
          source: 'of_planifie',
          itmref: article,
          vcrnum: 'FP02',
          quantity: 999,
        }),
        created_at: new Date(),
      },
      {
        ...dRow({
          snapshot_date: SENTINEL_DEPUIS,
          source: 'of_suggestion',
          itmref: article,
          vcrnum: 'FS01',
          quantity: 5,
        }),
        created_at: new Date(),
      },
      {
        ...dRow({
          snapshot_date: SENTINEL_APRES,
          source: 'of_suggestion',
          itmref: article,
          vcrnum: 'FS02',
          quantity: 500,
        }),
        created_at: new Date(),
      },
      {
        ...dRow({
          snapshot_date: SENTINEL_DEPUIS,
          source: 'appro_suggestion',
          itmref: article,
          vcrnum: 'AS01',
          quantity: 1,
        }),
        created_at: new Date(),
      },
      {
        ...dRow({
          snapshot_date: SENTINEL_APRES,
          source: 'appro_suggestion',
          itmref: article,
          vcrnum: 'AS02',
          quantity: 100,
        }),
        created_at: new Date(),
      },
      {
        ...dRow({
          snapshot_date: SENTINEL_DEPUIS,
          source: 'besoin_matiere',
          itmref: article,
          vcrnum: 'OF501',
          quantity: 1200,
        }),
        created_at: new Date(),
      },
      {
        ...dRow({
          snapshot_date: SENTINEL_APRES,
          source: 'besoin_matiere',
          itmref: article,
          vcrnum: 'OF501',
          quantity: 600,
        }),
        created_at: new Date(),
      },
    ])
    try {
      await conn.table('demand_snapshot_sources').insert([
        {
          snapshot_date: SENTINEL_DEPUIS,
          source: 'stock',
          statut: 'capturee',
          lignes: 1,
          created_at: new Date(),
        },
        {
          snapshot_date: SENTINEL_APRES,
          source: 'stock',
          statut: 'capturee',
          lignes: 1,
          created_at: new Date(),
        },
        {
          snapshot_date: SENTINEL_DEPUIS,
          source: 'of_ferme',
          statut: 'capturee',
          lignes: 1,
          created_at: new Date(),
        },
        {
          snapshot_date: SENTINEL_APRES,
          source: 'of_ferme',
          statut: 'capturee',
          lignes: 1,
          created_at: new Date(),
        },
        {
          snapshot_date: SENTINEL_DEPUIS,
          source: 'appro',
          statut: 'capturee',
          lignes: 1,
          created_at: new Date(),
        },
        {
          snapshot_date: SENTINEL_APRES,
          source: 'appro',
          statut: 'capturee',
          lignes: 1,
          created_at: new Date(),
        },
        {
          snapshot_date: SENTINEL_DEPUIS,
          source: 'besoin_matiere',
          statut: 'capturee',
          lignes: 1,
          created_at: new Date(),
        },
        {
          snapshot_date: SENTINEL_APRES,
          source: 'besoin_matiere',
          statut: 'capturee',
          lignes: 1,
          created_at: new Date(),
        },
        {
          snapshot_date: SENTINEL_DEPUIS,
          source: 'of_planifie',
          statut: 'capturee',
          lignes: 1,
          created_at: new Date(),
        },
        {
          snapshot_date: SENTINEL_APRES,
          source: 'of_planifie',
          statut: 'capturee',
          lignes: 1,
          created_at: new Date(),
        },
        {
          snapshot_date: SENTINEL_DEPUIS,
          source: 'of_suggestion',
          statut: 'capturee',
          lignes: 1,
          created_at: new Date(),
        },
        {
          snapshot_date: SENTINEL_APRES,
          source: 'of_suggestion',
          statut: 'capturee',
          lignes: 1,
          created_at: new Date(),
        },
        {
          snapshot_date: SENTINEL_DEPUIS,
          source: 'appro_suggestion',
          statut: 'capturee',
          lignes: 1,
          created_at: new Date(),
        },
        {
          snapshot_date: SENTINEL_APRES,
          source: 'appro_suggestion',
          statut: 'capturee',
          lignes: 1,
          created_at: new Date(),
        },
      ])
    } catch {}
    const res = await service.temporel(article, cle)
    assert.equal(res?.depuis, SENTINEL_DEPUIS)
    const sources = (res?.entrees ?? []).map((e) => e.source)
    for (const s of sources) {
      assert.include(
        ['stock', 'demande_ferme', 'demande_prevision', 'appro', 'of_ferme', 'besoin_matiere'],
        s
      )
    }
    assert.notInclude(sources, 'of_planifie')
    assert.notInclude(sources, 'of_suggestion')
    assert.notInclude(sources, 'appro_suggestion')
    assert.include(sources, 'stock')
    assert.include(sources, 'besoin_matiere')
  }).timeout(15_000)

  test('perimetre echec écarté, vide comparé (journal)', async ({ assert }) => {
    const depuisPerim = '2099-01-01'
    const apresPerim = '2099-01-02'
    await conn.table('appro_message_snapshots').insert([
      { ...mRow({ snapshot_date: depuisPerim, mrpmes: 2 }), created_at: new Date() },
      { ...mRow({ snapshot_date: apresPerim, mrpmes: 2 }), created_at: new Date() },
    ])
    await conn.table('demand_snapshots').insert([
      {
        ...dRow({ snapshot_date: depuisPerim, source: 'stock', quantity: 100 }),
        created_at: new Date(),
      },
      {
        ...dRow({ snapshot_date: apresPerim, source: 'stock', quantity: 50 }),
        created_at: new Date(),
      },
      {
        ...dRow({ snapshot_date: depuisPerim, source: 'appro', quantity: 10 }),
        created_at: new Date(),
      },
      {
        ...dRow({ snapshot_date: depuisPerim, source: 'of_ferme', quantity: 5 }),
        created_at: new Date(),
      },
    ])
    try {
      await conn.table('demand_snapshot_sources').insert([
        {
          snapshot_date: depuisPerim,
          source: 'stock',
          statut: 'capturee',
          lignes: 1,
          created_at: new Date(),
        },
        {
          snapshot_date: apresPerim,
          source: 'stock',
          statut: 'capturee',
          lignes: 1,
          created_at: new Date(),
        },
        {
          snapshot_date: depuisPerim,
          source: 'appro',
          statut: 'capturee',
          lignes: 1,
          created_at: new Date(),
        },
        {
          snapshot_date: apresPerim,
          source: 'appro',
          statut: 'vide',
          lignes: 0,
          created_at: new Date(),
        },
        {
          snapshot_date: depuisPerim,
          source: 'of_ferme',
          statut: 'capturee',
          lignes: 1,
          created_at: new Date(),
        },
        {
          snapshot_date: apresPerim,
          source: 'of_ferme',
          statut: 'echec',
          lignes: 0,
          created_at: new Date(),
        },
      ])
    } catch {}
    const res = await service.temporel(article, cle)
    const sources = (res?.entrees ?? []).map((e) => e.source)
    assert.include(sources, 'stock')
    assert.notInclude(sources, 'of_ferme')
  }).timeout(15_000)

  test('trous week-ends/pannes sautés — depuis photo la plus proche', async ({ assert }) => {
    await conn.table('appro_message_snapshots').insert([
      { ...mRow({ snapshot_date: '2099-01-06', mrpmes: 2 }), created_at: new Date() },
      { ...mRow({ snapshot_date: SENTINEL_APRES, mrpmes: 2 }), created_at: new Date() },
    ])
    await conn.table('demand_snapshots').insert([
      {
        ...dRow({ snapshot_date: '2099-01-05', source: 'stock', quantity: 100 }),
        created_at: new Date(),
      },
      {
        ...dRow({ snapshot_date: SENTINEL_APRES, source: 'stock', quantity: 90 }),
        created_at: new Date(),
      },
    ])
    try {
      await conn.table('demand_snapshot_sources').insert([
        {
          snapshot_date: '2099-01-05',
          source: 'stock',
          statut: 'capturee',
          lignes: 1,
          created_at: new Date(),
        },
        {
          snapshot_date: SENTINEL_APRES,
          source: 'stock',
          statut: 'capturee',
          lignes: 1,
          created_at: new Date(),
        },
      ])
    } catch {}
    const res = await service.temporel(article, cle)
    assert.equal(res?.depuis, '2099-01-06')
    assert.isNotNull(res?.entrees)
  }).timeout(15_000)
})
