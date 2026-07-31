import { test } from '@japa/runner'
import { localDay, needsSnapshot } from '#providers/demand_snapshot_provider'

/**
 * Planification de la photo nocturne (#74 lot 1 / #98 lot 4 — câblée le
 * 31/07/2026). Fonctions pures : la garde durable est la PHOTO elle-même
 * (`demand_snapshots.snapshot_date`), pas un compteur en mémoire, et ce sont
 * ces tests qui l'imposent.
 */

const HOUR = 60 * 60 * 1000

function local(y: number, m: number, d: number, h: number, min = 0): Date {
  return new Date(y, m - 1, d, h, min, 0, 0)
}

test.group('localDay', () => {
  test('rend le jour LOCAL, pas le jour UTC', ({ assert }) => {
    // Le piège : `toISOString().slice(0,10)` sur 00 h 30 locale en France (UTC+2)
    // renvoie la VEILLE. La garde conclurait « photo du jour absente » et
    // relancerait une extraction déjà faite.
    const minuitPasse = local(2026, 7, 31, 0, 30)
    assert.equal(localDay(minuitPasse), '2026-07-31')
  })

  test('zéro-pad le mois et le jour', ({ assert }) => {
    assert.equal(localDay(local(2026, 1, 5, 12)), '2026-01-05')
  })
})

test.group('needsSnapshot', () => {
  const hier = '2026-07-30'
  const aujourdhui = '2026-07-31'

  test("avant l'heure visée : ne déclenche pas", ({ assert }) => {
    // 02 h : la photo de la veille est la plus récente, et c'est normal.
    assert.isFalse(needsSnapshot(hier, local(2026, 7, 31, 2), null, 4, HOUR))
  })

  test("après l'heure visée sans photo du jour : déclenche", ({ assert }) => {
    assert.isTrue(needsSnapshot(hier, local(2026, 7, 31, 4, 5), null, 4, HOUR))
  })

  test('photo du jour déjà prise : ne déclenche pas', ({ assert }) => {
    assert.isFalse(needsSnapshot(aujourdhui, local(2026, 7, 31, 9), null, 4, HOUR))
  })

  test('table vide : déclenche dès que l’heure est passée', ({ assert }) => {
    assert.isTrue(needsSnapshot(null, local(2026, 7, 31, 6), null, 4, HOUR))
  })

  test('table vide mais avant l’heure : attend quand même', ({ assert }) => {
    assert.isFalse(needsSnapshot(null, local(2026, 7, 31, 1), null, 4, HOUR))
  })

  test('app arrêtée toute la nuit : rattrape au boot', ({ assert }) => {
    // Démarrage à 10 h, dernière photo la veille. C'est le cas que le lot 1
    // laissait ouvert (commande manuelle seulement).
    assert.isTrue(needsSnapshot(hier, local(2026, 7, 31, 10), null, 4, HOUR))
  })

  test('tentative récente : temporise', ({ assert }) => {
    const now = local(2026, 7, 31, 5)
    const attempt = local(2026, 7, 31, 4, 30).getTime()
    assert.isFalse(needsSnapshot(hier, now, attempt, 4, HOUR))
  })

  test('tentative ancienne : reprise autorisée dans la journée', ({ assert }) => {
    const now = local(2026, 7, 31, 6)
    const attempt = local(2026, 7, 31, 4, 30).getTime()
    assert.isTrue(needsSnapshot(hier, now, attempt, 4, HOUR))
  })

  test('une photo du jour prime sur la temporisation', ({ assert }) => {
    const now = local(2026, 7, 31, 5)
    const attempt = local(2026, 7, 31, 4, 55).getTime()
    assert.isFalse(needsSnapshot(aujourdhui, now, attempt, 4, HOUR))
  })

  test('un backfill daté du jour compte comme la photo du jour', ({ assert }) => {
    // `snapshot:run --date=` écrit la même colonne : la garde ne distingue pas
    // l'origine, et c'est voulu — la question est « la photo existe-t-elle ».
    assert.isFalse(needsSnapshot(aujourdhui, local(2026, 7, 31, 23), null, 4, HOUR))
  })
})
