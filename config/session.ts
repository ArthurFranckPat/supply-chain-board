import app from '@adonisjs/core/services/app'
import { defineConfig, stores } from '@adonisjs/session'

const sessionConfig = defineConfig({
  enabled: true,
  cookieName: 'supply_session',

  /**
   * When set to true, the session id cookie will be deleted
   * once the user closes the browser.
   */
  clearWithBrowser: false,

  /**
   * Define how long to keep the session data alive without
   * any activity.
   */
  age: '8h',

  /**
   * Configuration for session cookie and the cookie store.
   */
  cookie: {
    path: '/',
    httpOnly: true,
    secure: app.inProduction,
    sameSite: 'lax',
  },

  /**
   * The store to use. Cookie store keeps the (encrypted) session
   * payload client-side — fine for the small payload we keep
   * (auth id + selected X3 env). No password is stored here.
   */
  store: 'cookie',
  stores: {
    cookie: stores.cookie(),
  },
})

export default sessionConfig
