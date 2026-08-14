import { test } from '@japa/runner'
import { dashboardGridModeForWidth } from '../../inertia-react/lib/dashboard/types.ts'

test.group('dashboardGridModeForWidth', () => {
  test('retourne mobile sous 768 px de viewport', ({ assert }) => {
    assert.equal(dashboardGridModeForWidth(390), 'mobile')
    assert.equal(dashboardGridModeForWidth(767), 'mobile')
  })

  test('retourne tablette entre 768 et 1023 px de viewport', ({ assert }) => {
    assert.equal(dashboardGridModeForWidth(768), 'tablet')
    assert.equal(dashboardGridModeForWidth(1023), 'tablet')
  })

  test('retourne desktop à partir de 1024 px de viewport', ({ assert }) => {
    assert.equal(dashboardGridModeForWidth(1024), 'desktop')
    assert.equal(dashboardGridModeForWidth(1440), 'desktop')
  })
})
