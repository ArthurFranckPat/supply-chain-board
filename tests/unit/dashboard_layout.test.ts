import { test } from '@japa/runner'
import { dashboardGridModeForWidth } from '../../inertia-react/lib/dashboard/types.ts'

test.group('dashboardGridModeForWidth', () => {
  test('retourne mobile sous 680 pixels de contenu', ({ assert }) => {
    assert.equal(dashboardGridModeForWidth(390), 'mobile')
    assert.equal(dashboardGridModeForWidth(679), 'mobile')
  })

  test('retourne tablette entre 680 et 1039 pixels de contenu', ({ assert }) => {
    assert.equal(dashboardGridModeForWidth(680), 'tablet')
    assert.equal(dashboardGridModeForWidth(1039), 'tablet')
  })

  test('retourne desktop à partir de 1040 pixels de contenu', ({ assert }) => {
    assert.equal(dashboardGridModeForWidth(1040), 'desktop')
    assert.equal(dashboardGridModeForWidth(1440), 'desktop')
  })
})
