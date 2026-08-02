import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import {
  computeLatencyFromEvents,
  type LatencyEvent,
} from '#repositories/supplier_latency_repository'
import latencyReplicaRepository from '#repositories/latency_replica_repository'

/**
 * Latence fournisseur (#105) — la règle de calcul est UNE, partagée par la voie
 * directe et la voie réplique : `computeLatencyFromEvents` est pure, et
 * `latency_replica` ne stocke que les événements bruts (article, prévu, réel).
 *
 * Le test de lecture écrit dans la vraie table de réplique puis nettoie ; les
 * articles sont préfixés pour ne jamais heurter une ingestion réelle.
 */

const PREFIX = 'ZZLAT-'

/** `YYYY-MM-DD` local — même format que l'ingestion. */
function iso(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const da = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${da}`
}

function day(offsetDays: number): Date {
  const d = new Date('2026-07-01T00:00:00')
  d.setDate(d.getDate() + offsetDays)
  return d
}

test.group('computeLatencyFromEvents — règle de calcul', () => {
  test('moyenne des écarts réel − prévu, arrondie', ({ assert }) => {
    const events: LatencyEvent[] = [
      { article: 'A', prevu: day(0), reel: day(3) },
      { article: 'A', prevu: day(0), reel: day(5) },
    ]
    const latency = computeLatencyFromEvents(events)
    assert.equal(latency.get('A'), 4)
  })

  test('un article à l’heure ou en avance reste dans la carte', ({ assert }) => {
    const events: LatencyEvent[] = [
      { article: 'A', prevu: day(0), reel: day(0) },
      { article: 'B', prevu: day(0), reel: day(-2) },
    ]
    const latency = computeLatencyFromEvents(events)
    assert.equal(latency.get('A'), 0)
    assert.equal(latency.get('B'), -2)
  })

  test('les outliers hors [−30, +90] sont écartés, pas comptés', ({ assert }) => {
    const events: LatencyEvent[] = [
      { article: 'A', prevu: day(0), reel: day(91) },
      { article: 'A', prevu: day(0), reel: day(-31) },
      { article: 'A', prevu: day(0), reel: day(4) },
    ]
    const latency = computeLatencyFromEvents(events)
    assert.equal(latency.get('A'), 4)
  })
})

test.group('latency_replica — lecture des événements bruts', (group) => {
  const conn = db.connection('replica')

  const cleanup = async () => {
    await conn.from('latency_replica').where('article', 'like', `${PREFIX}%`).delete()
  }
  group.each.setup(cleanup)
  group.teardown(cleanup)

  test('les événements ingérés sont relus et calculables à la lecture', async ({ assert }) => {
    await conn.table('latency_replica').insert([
      { article: `${PREFIX}A`, date_prevue: iso(day(0)), date_reelle: iso(day(3)) },
      { article: `${PREFIX}A`, date_prevue: iso(day(0)), date_reelle: iso(day(5)) },
      { article: `${PREFIX}B`, date_prevue: iso(day(0)), date_reelle: iso(day(1)) },
    ])

    const events = await latencyReplicaRepository.getLatencyEvents()
    const ours = events.filter((e) => e.article.startsWith(PREFIX))

    assert.lengthOf(ours, 3)
    const latency = computeLatencyFromEvents(ours)
    assert.equal(latency.get(`${PREFIX}A`), 4)
    assert.equal(latency.get(`${PREFIX}B`), 1)
  })

  test('une date illisible (écartée à l’ingestion) ne fausse pas le calcul', async ({ assert }) => {
    await conn.table('latency_replica').insert([
      { article: `${PREFIX}A`, date_prevue: '', date_reelle: iso(day(3)) },
      { article: `${PREFIX}A`, date_prevue: iso(day(0)), date_reelle: iso(day(3)) },
    ])

    const events = await latencyReplicaRepository.getLatencyEvents()
    const ours = events.filter((e) => e.article.startsWith(PREFIX))

    assert.lengthOf(ours, 1)
    const latency = computeLatencyFromEvents(ours)
    assert.equal(latency.get(`${PREFIX}A`), 3)
  })
})
