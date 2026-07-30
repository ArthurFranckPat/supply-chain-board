import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import stockFluxReplicaRepository from '#repositories/stock_flux_replica_repository'

/**
 * Lecture `stock_flux_replica` (#98, lot 3 — scoping du 30/07/2026).
 *
 * Même précaution que les autres repos réplique : la connexion `replica`
 * pointe le même fichier en test qu'en dev (une vraie ingestion `--only=stock-flux`
 * peut y avoir tourné). Article marqueur `ART-FLUX-TEST` (n'existe pas dans le
 * référentiel réel), teardown filtré dessus, jamais un DELETE sans filtre.
 */

const ARTICLE = 'ART-FLUX-TEST'

test.group('StockFluxReplicaRepository', (group) => {
  const conn = db.connection('replica')

  group.each.teardown(async () => {
    await conn.from('stock_flux_replica').where('article', ARTICLE).delete()
  })

  test('mappe une ligne réplique vers StockFluxDocRow', async ({ assert }) => {
    await conn.table('stock_flux_replica').insert({
      article: ARTICLE,
      jour: '2026-07-15',
      vcrtyp: '6',
      vcrnum: 'REC2607AE100099',
      net_doc: 42.5,
    })

    const rows = await stockFluxReplicaRepository.getFluxNetByDocument(
      new Date('2026-07-01T00:00:00'),
      new Date('2026-07-31T00:00:00')
    )
    const ours = rows.filter((r) => r.article === ARTICLE)

    assert.lengthOf(ours, 1)
    assert.deepEqual(ours[0], {
      article: ARTICLE,
      jour: new Date('2026-07-15T00:00:00'),
      vcrtyp: '6',
      vcrnum: 'REC2607AE100099',
      netDoc: 42.5,
    })
  })

  test('filtre sur jour ∈ [from, to] inclusif', async ({ assert }) => {
    await conn.table('stock_flux_replica').insert([
      {
        article: ARTICLE,
        jour: '2026-06-30',
        vcrtyp: '1',
        vcrnum: 'OUT1',
        net_doc: -1,
      },
      {
        article: ARTICLE,
        jour: '2026-07-01',
        vcrtyp: '1',
        vcrnum: 'IN1',
        net_doc: 10,
      },
      {
        article: ARTICLE,
        jour: '2026-07-31',
        vcrtyp: '1',
        vcrnum: 'IN2',
        net_doc: 20,
      },
      {
        article: ARTICLE,
        jour: '2026-08-01',
        vcrtyp: '1',
        vcrnum: 'OUT2',
        net_doc: -2,
      },
    ])

    const rows = await stockFluxReplicaRepository.getFluxNetByDocument(
      new Date('2026-07-01T00:00:00'),
      new Date('2026-07-31T00:00:00')
    )
    const ours = rows.filter((r) => r.article === ARTICLE)

    assert.deepEqual(ours.map((r) => r.vcrnum).sort(), ['IN1', 'IN2'])
  })
})
