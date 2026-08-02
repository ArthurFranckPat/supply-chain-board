import { test } from '@japa/runner'
import { replicaCoversOrdersRange } from '#repositories/orders_flux_replica_repository'
import { orderLinesReplicaWindow } from '#services/replica_sync_service'
import { RETARD_LOOKBACK_DAYS } from '#services/suivi_service'
import { isoDay } from '#app/utils/dates'

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

/**
 * Le KPI retard (#105) est soumis à la MÊME couverture, et pour une raison plus
 * mordante encore que `/suivi` : sa fenêtre est `[refDate − RETARD_LOOKBACK_DAYS,
 * refDate]`, où `refDate` vient du paramètre `referenceDate` du dashboard.
 * Reculer cette date place la borne basse sous celle de l'ingestion — la réplique
 * rendrait un retard SOUS-ÉVALUÉ, sans erreur ni écran vide.
 *
 * Le cas par défaut tient parce que le lookback d'ingestion reprend la même
 * variable. C'est un alignement, pas une garantie : ces deux tests le
 * verrouillent, et rattraperont le jour où l'un des deux lookbacks bouge seul.
 */
test.group('couverture de plage — KPI retard', () => {
  const NOW = new Date(2026, 7, 2, 14, 30)

  function retardWindow(refDate: Date): { from: string; to: string } {
    const from = new Date(refDate)
    from.setDate(refDate.getDate() - RETARD_LOOKBACK_DAYS)
    return { from: isoDay(from), to: isoDay(refDate) }
  }

  test('refDate = aujourd’hui → la fenêtre du KPI tient dans la plage ingérée', ({ assert }) => {
    const { from, to } = retardWindow(NOW)
    assert.isTrue(replicaCoversOrdersRange(orderLinesReplicaWindow(NOW), from, to))
  })

  test('refDate reculé → hors couverture, donc voie directe', ({ assert }) => {
    // Un mois en arrière suffit à sortir la borne basse de la plage ingérée.
    const refDate = new Date(NOW)
    refDate.setDate(refDate.getDate() - 30)
    const { from, to } = retardWindow(refDate)
    assert.isFalse(replicaCoversOrdersRange(orderLinesReplicaWindow(NOW), from, to))
  })
})
