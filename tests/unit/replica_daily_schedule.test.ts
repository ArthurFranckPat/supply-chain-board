import { test } from '@japa/runner'
import {
  SCHEDULE,
  dailyWindowStart,
  needsDailyRun,
  needsIntervalRun,
} from '#providers/replica_sync_provider'
import { maxAgeMsFor } from '#services/replica_gate'

/**
 * Cadences des tables hors `syncAll()` (#98, lot 3 — actées le 31/07/2026) :
 * fenêtre quotidienne pour `stock_flux_replica`, intervalle périodique pour
 * `operations_replica` (10 min), `stock_detail_replica` (2 h) et
 * `latency_replica` (6 h, #105).
 *
 * Fonctions pures : l'état vit dans `ingestion_log`, jamais dans la mémoire du
 * process, et c'est précisément ce que ces tests verrouillent.
 *
 * Le bug qu'un `setInterval` aurait produit — et qu'aucun de ces tests ne peut
 * plus laisser passer — est muet : un redémarrage remet le compte à zéro, la
 * synchro ne part jamais, et rien ne le signale sinon une réplique qui vieillit.
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

/**
 * Cadence périodique — `operations_replica` (10 min) et `stock_detail_replica`
 * (2 h). L'invariant qui compte n'est pas la valeur des intervalles mais leur
 * rapport au seuil de `ReplicaGate` : une cadence égale au seuil ferait clignoter
 * la table entre réplique et voie directe. Ce rapport est vérifié plus bas.
 */
test.group('needsIntervalRun', () => {
  const now = local(2026, 7, 31, 12, 0)
  const iso = (d: Date) => d.toISOString()
  const TEN_MIN = 10 * 60 * 1000

  test('jamais ingérée : lance au premier tick', ({ assert }) => {
    assert.isTrue(needsIntervalRun({ lastAttemptAt: null, lastSuccessAt: null }, now, TEN_MIN))
  })

  test('succès plus récent que la cadence : ne relance pas', ({ assert }) => {
    const at = iso(local(2026, 7, 31, 11, 56))
    assert.isFalse(needsIntervalRun({ lastAttemptAt: at, lastSuccessAt: at }, now, TEN_MIN))
  })

  test('succès plus vieux que la cadence : relance', ({ assert }) => {
    const at = iso(local(2026, 7, 31, 11, 45))
    assert.isTrue(needsIntervalRun({ lastAttemptAt: at, lastSuccessAt: at }, now, TEN_MIN))
  })

  test('un échec récent temporise à la cadence, pas à chaque tick de 5 min', ({ assert }) => {
    // Dernier SUCCÈS très ancien (donc « dû »), mais tentative il y a 4 min :
    // sans cette borne, le tick de 5 min rappellerait l'ingestion en boucle.
    const runs = {
      lastAttemptAt: iso(local(2026, 7, 31, 11, 56)),
      lastSuccessAt: iso(local(2026, 7, 30, 8, 0)),
    }
    assert.isFalse(needsIntervalRun(runs, now, TEN_MIN))
  })

  test('échec plus vieux que la cadence : reprise autorisée', ({ assert }) => {
    const runs = {
      lastAttemptAt: iso(local(2026, 7, 31, 11, 40)),
      lastSuccessAt: iso(local(2026, 7, 30, 8, 0)),
    }
    assert.isTrue(needsIntervalRun(runs, now, TEN_MIN))
  })

  test('horodatage illisible : ne retient pas le déclenchement', ({ assert }) => {
    const runs = { lastAttemptAt: 'pas-une-date', lastSuccessAt: 'pas-une-date' }
    assert.isTrue(needsIntervalRun(runs, now, TEN_MIN))
  })
})

/**
 * Le rapport cadence/seuil, vérifié en une fois. C'est l'invariant qui a
 * réellement manqué : `43f94e0` a câblé deux tables en lecture sans cadence, et
 * `4ae1146` leur a posé un seuil — la combinaison des deux les renvoyait en voie
 * directe à peu près toujours, pour un gain nul.
 */
test.group('cadences vs seuils du portail', () => {
  test('toute table périodique tient au moins 3 fois dans son seuil', ({ assert }) => {
    // Lit `SCHEDULE`, pas des constantes recopiées : le jour où une cadence
    // change ou qu'une table s'ajoute, c'est ce test qui doit le rattraper.
    const periodiques = SCHEDULE.filter((e) => e.everyMs !== undefined)
    assert.isNotEmpty(periodiques)

    for (const entry of periodiques) {
      const seuil = maxAgeMsFor(entry.table)
      assert.isBelow(entry.everyMs!, seuil, entry.table)
      // Deux runs manqués tolérés avant que la table ne bascule en voie directe.
      assert.isAtLeast(seuil / entry.everyMs!, 3, entry.table)
    }
  })

  test('toute table quotidienne a un seuil qui dépasse 24 h', ({ assert }) => {
    // Seul régime dont le rapport au seuil est proche de 1 : une ingestion
    // quotidienne ne peut pas tenir trois fois dans son propre seuil sans imposer
    // un seuil de 3 jours, qui autoriserait de la donnée franchement périmée. La
    // marge est donc absolue (2 h) au lieu d'être proportionnelle.
    const quotidiennes = SCHEDULE.filter((e) => e.dailyHour !== undefined)
    assert.isNotEmpty(quotidiennes)

    for (const entry of quotidiennes) {
      assert.isAbove(maxAgeMsFor(entry.table), 24 * HOUR, entry.table)
    }
  })

  test('chaque entrée déclare exactement un régime de cadence', ({ assert }) => {
    for (const entry of SCHEDULE) {
      const regimes = [entry.everyMs, entry.dailyHour].filter((v) => v !== undefined)
      assert.lengthOf(regimes, 1, entry.table)
    }
  })
})
