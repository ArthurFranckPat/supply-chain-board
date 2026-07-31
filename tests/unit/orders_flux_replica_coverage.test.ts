import { test } from '@japa/runner'
import { replicaCoversOrdersRange } from '#repositories/orders_flux_replica_repository'

/**
 * `/suivi` laisse choisir sa fenêtre au CALENDRIER : `getLive(from, to)` reçoit
 * une plage arbitraire, quand l'ingestion d'`orders_flux_replica` est bornée à
 * −90 j / +1 an.
 *
 * Sans ce contrôle, une plage hors bornes serait servie depuis la réplique avec
 * une population tronquée — pas d'erreur, pas d'écran vide, juste un plan
 * amputé. C'est la panne la plus difficile à voir de toute la réplique, parce
 * que le résultat reste plausible.
 *
 * La fraîcheur ne répond PAS à cette question : un run parfait d'il y a trente
 * secondes ne dit rien de la plage qu'il a balayée.
 */

const COVERAGE = { from: '2026-05-02', to: '2027-07-31' }

test.group('couverture de plage — orders_flux_replica', () => {
  test('plage strictement incluse → couverte', ({ assert }) => {
    assert.isTrue(replicaCoversOrdersRange(COVERAGE, '2026-07-31', '2026-08-14'))
  })

  test('plage exactement égale aux bornes → couverte (bornes inclusives)', ({ assert }) => {
    assert.isTrue(replicaCoversOrdersRange(COVERAGE, '2026-05-02', '2027-07-31'))
  })

  test('`from` avant la borne basse → NON couverte', ({ assert }) => {
    // Le cas du calendrier reculé sur un historique plus profond.
    assert.isFalse(replicaCoversOrdersRange(COVERAGE, '2026-01-01', '2026-08-14'))
  })

  test('`to` après la borne haute → NON couverte', ({ assert }) => {
    // Le cas du calendrier poussé au-delà de l'horizon d'un an.
    assert.isFalse(replicaCoversOrdersRange(COVERAGE, '2026-07-31', '2029-03-01'))
  })

  test('plage entièrement hors couverture → NON couverte', ({ assert }) => {
    assert.isFalse(replicaCoversOrdersRange(COVERAGE, '2028-01-01', '2028-12-31'))
  })

  test('couverture inconnue → NON couverte, jamais couverte par défaut', ({ assert }) => {
    // Note absente ou illisible dans `ingestion_log` : une couverture
    // indémontrable ne doit jamais valoir couverture. Même principe que l'âge
    // indémontrable dans `ReplicaGate`.
    assert.isFalse(replicaCoversOrdersRange(null, '2026-07-31', '2026-08-14'))
  })
})
