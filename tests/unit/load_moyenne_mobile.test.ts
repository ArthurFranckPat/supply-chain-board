/**
 * Le cran « Moyenne mobile » de /charge doit éteindre la courbe, pas seulement
 * la légende. HistogrammeCharge trace dès que `moyenneMobile` est un nombre.
 */
import { test } from '@japa/runner'
import { fenetreMoyenneMobile } from '../../inertia-react/lib/load/moyenne-mobile.ts'

test.group('fenetreMoyenneMobile — cran /charge', () => {
  test('cran off : pas de courbe, quelle que soit la maille', ({ assert }) => {
    assert.isNull(fenetreMoyenneMobile(false, 'month'))
    assert.isNull(fenetreMoyenneMobile(false, 'week'))
  })

  test('cran on : 2 périodes en mois, 8 en semaine', ({ assert }) => {
    assert.equal(fenetreMoyenneMobile(true, 'month'), 2)
    assert.equal(fenetreMoyenneMobile(true, 'week'), 8)
  })
})
