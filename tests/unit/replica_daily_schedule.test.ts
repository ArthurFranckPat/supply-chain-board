import { test } from '@japa/runner'
import { dailyWindowStart, needsDailyRun } from '#providers/replica_sync_provider'

/**
 * Planification quotidienne de `stock_flux_replica` (#98, lot 3 — cadence actée
 * le 31/07/2026). Fonctions pures : l'état vit dans `ingestion_log`, jamais dans
 * la mémoire du process, et c'est précisément ce que ces tests verrouillent.
 *
 * Le bug qu'un `setInterval(24 h)` aurait produit — et qu'aucun de ces tests ne
 * peut plus laisser passer — est muet : un redémarrage quotidien avant l'heure
 * de synchro remet le compte à zéro, la synchro ne part jamais, et rien ne le
 * signale sinon une réplique qui vieillit.
 */

const HOUR = 60 * 60 * 1000

/** Date locale — la fenêtre suit l'heure de l'usine, pas UTC. */
function local(y: number, m: number, d: number, h: number, min = 0): Date {
  return new Date(y, m - 1, d, h, min, 0, 0)
}

test.group('dailyWindowStart', () => {
  test("l'heure du jour est passée : la fenêtre a ouvert aujourd'hui", ({ assert }) => {
    const now = local(2026, 7, 31, 9, 30)
    assert.equal(dailyWindowStart(now, 3).getTime(), local(2026, 7, 31, 3).getTime())
  })

  test("l'heure du jour n'est pas encore atteinte : la fenêtre a ouvert hier", ({ assert }) => {
    const now = local(2026, 7, 31, 1, 15)
    assert.equal(dailyWindowStart(now, 3).getTime(), local(2026, 7, 30, 3).getTime())
  })

  test('pile à l’heure : la fenêtre du jour est déjà ouverte (borne incluse)', ({ assert }) => {
    const now = local(2026, 7, 31, 3, 0)
    assert.equal(dailyWindowStart(now, 3).getTime(), local(2026, 7, 31, 3).getTime())
  })

  test('recule sur le mois précédent sans produire de date invalide', ({ assert }) => {
    const now = local(2026, 8, 1, 2, 0)
    assert.equal(dailyWindowStart(now, 3).getTime(), local(2026, 7, 31, 3).getTime())
  })
})

test.group('needsDailyRun', () => {
  const now = local(2026, 7, 31, 9, 0)
  const windowStart = local(2026, 7, 31, 3)
  const iso = (d: Date) => d.toISOString()

  test('jamais ingérée : lance au premier tick', ({ assert }) => {
    assert.isTrue(needsDailyRun({ lastAttemptAt: null, lastSuccessAt: null }, now, windowStart))
  })

  test('succès dans la fenêtre du jour : ne relance pas', ({ assert }) => {
    const at = iso(local(2026, 7, 31, 3, 4))
    assert.isFalse(needsDailyRun({ lastAttemptAt: at, lastSuccessAt: at }, now, windowStart))
  })

  test('succès de la veille : la fenêtre a tourné, on relance', ({ assert }) => {
    const at = iso(local(2026, 7, 30, 3, 4))
    assert.isTrue(needsDailyRun({ lastAttemptAt: at, lastSuccessAt: at }, now, windowStart))
  })

  test("succès juste AVANT l'ouverture de la fenêtre : on relance", ({ assert }) => {
    // Un run à 02 h 55 appartient encore à la journée précédente. Sans ça, un run
    // légèrement en avance ferait sauter celui du jour.
    const at = iso(local(2026, 7, 31, 2, 55))
    assert.isTrue(needsDailyRun({ lastAttemptAt: at, lastSuccessAt: at }, now, windowStart))
  })

  test('app arrêtée toute la nuit : rattrape au premier tick au lieu du lendemain', ({
    assert,
  }) => {
    // Le cas que la fenêtre existe pour couvrir : redémarrage à 09 h, dernier
    // succès la veille à 03 h. Un « âge > 24 h » aurait attendu 03 h le lendemain.
    const at = iso(local(2026, 7, 30, 3, 2))
    assert.isTrue(needsDailyRun({ lastAttemptAt: at, lastSuccessAt: at }, now, windowStart))
  })

  test('échec récent : temporise au lieu de marteler X3 à chaque tick', ({ assert }) => {
    const runs = {
      lastAttemptAt: iso(local(2026, 7, 31, 8, 30)),
      lastSuccessAt: iso(local(2026, 7, 30, 3)),
    }
    assert.isFalse(needsDailyRun(runs, now, windowStart, HOUR))
  })

  test('échec ancien : reprise autorisée dans la journée', ({ assert }) => {
    const runs = {
      lastAttemptAt: iso(local(2026, 7, 31, 4, 0)),
      lastSuccessAt: iso(local(2026, 7, 30, 3)),
    }
    assert.isTrue(needsDailyRun(runs, now, windowStart, HOUR))
  })

  test('un succès du jour prime sur la temporisation', ({ assert }) => {
    // Tentative récente ET succès dans la fenêtre : c'est le succès qui décide.
    const runs = {
      lastAttemptAt: iso(local(2026, 7, 31, 8, 45)),
      lastSuccessAt: iso(local(2026, 7, 31, 8, 45)),
    }
    assert.isFalse(needsDailyRun(runs, now, windowStart, HOUR))
  })

  test('horodatage de tentative illisible : ne retient pas le déclenchement', ({ assert }) => {
    // Seul un SUCCÈS autorise à ne rien faire. Une tentative indatable ne peut pas
    // bloquer indéfiniment la table sur la voie directe.
    const runs = { lastAttemptAt: 'pas-une-date', lastSuccessAt: null }
    assert.isTrue(needsDailyRun(runs, now, windowStart, HOUR))
  })
})
