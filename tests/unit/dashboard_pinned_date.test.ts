import { test } from '@japa/runner'
import { isPinnedDate } from '#controllers/dashboard_controller'

/**
 * `pinned` décide de la FORME de la clé de cache : valeur figée portée telle
 * quelle, plage glissante par défaut réduite à ses buckets de période.
 *
 * Le test était `Boolean(referenceDate)`. Or le front envoie TOUJOURS
 * `referenceDate`, initialisé à aujourd'hui — donc `pinned` valait toujours
 * `true`, et le préchauffage (qui appelle sans `pinned`) remplissait une clé que
 * personne ne lisait. Mesuré en mode direct le 01/08/2026 : préchauffage
 * stock-valuation 10 312 ms, puis la requête repaie 9 976 ms.
 *
 * Quatrième occurrence de la classe « clé de cache instable » sur ce projet
 * (350396b, 84112b2, 25dae94). Les trois précédentes tournaient à minuit ;
 * celle-ci ne se réveillait jamais.
 */

const dayOffset = (n: number): Date => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d
}

test.group('date de référence figée ou défaut', () => {
  test('aucune date fournie → non figée', ({ assert }) => {
    assert.isFalse(isPinnedDate(undefined, new Date()))
    assert.isFalse(isPinnedDate('', new Date()))
  })

  test("la date d'AUJOURD'HUI est le défaut, même envoyée explicitement", ({ assert }) => {
    // Le cœur du correctif : c'est ce que le front envoie à chaque chargement.
    assert.isFalse(isPinnedDate('2026-08-01', new Date()))
  })

  test('une date passée est figée', ({ assert }) => {
    assert.isTrue(isPinnedDate('2026-01-15', dayOffset(-30)))
  })

  test('une date future est figée', ({ assert }) => {
    assert.isTrue(isPinnedDate('2026-12-31', dayOffset(30)))
  })

  test('hier est figé — la comparaison est au JOUR, pas au mois', ({ assert }) => {
    assert.isTrue(isPinnedDate('hier', dayOffset(-1)))
  })

  test('date invalide → non figée, jamais de clé bâtie sur Invalid Date', ({ assert }) => {
    // `toISOString()` sur une Invalid Date lève : la clé ne doit jamais la porter.
    assert.isFalse(isPinnedDate('pas-une-date', new Date('pas-une-date')))
  })
})
