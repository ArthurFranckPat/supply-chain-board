import { assert } from '@japa/assert'
import app from '@adonisjs/core/services/app'
import type { Config } from '@japa/runner/types'
import { pluginAdonisJS } from '@japa/plugin-adonisjs'
import { apiClient } from '@japa/api-client'
import { dbAssertions } from '@adonisjs/lucid/plugins/db'

// @ts-ignore - module augmentation for Japa API client types
declare module '@japa/api-client/types' {
  interface RoutesRegistry {}
}

export const plugins: Config['plugins'] = [
  assert(),
  apiClient(),
  pluginAdonisJS(app),
  dbAssertions(app),
]

export const runnerHooks: Required<Pick<Config, 'setup' | 'teardown'>> = {
  setup: [],
  teardown: [],
}

export const configureSuite: Config['configureSuite'] = (suite) => {
  if (suite.name === 'functional') {
    suite.setup(async () => {
      const testUtils = await app.container.make('testUtils')
      await testUtils.boot()
      const closeServer = await testUtils.httpServer().start()
      return () => closeServer()
    })
  }
}
