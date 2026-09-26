import BaseInertiaMiddleware from '@adonisjs/inertia/inertia_middleware'
import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'

import staticSync from '#services/static_sync_service'

/**
 * Fraîcheur X3 partagée à toutes les pages (`usePage().props.x3LastSync`) —
 * date de la dernière extraction des tables statiques X3 → SQLite. Cache
 * processus 60 s : la requête (max synced_at) est triviale mais inutile de la
 * rejouer à chaque navigation Inertia.
 */
const X3_SYNC_TTL_MS = 60_000
let x3SyncCache: { at: number; lastSync: number | null } = { at: 0, lastSync: null }

/**
 * La classe de base d'@adonisjs/inertia expose un cycle `init`/`dispose`,
 * alors que le routeur AdonisJS attend des middlewares à `handle(ctx, next)`.
 * Ce wrapper fait le pont : `init` avant la suite de la chaîne, `dispose`
 * après (toujours, même en cas d'erreur, pour poser les en-têtes Inertia).
 *
 * Définir des props partagées à toutes les pages via `share()` ci-dessous.
 */
class InertiaCore extends BaseInertiaMiddleware {
  async share(ctx: HttpContext) {
    const isAuthed = await ctx.auth.use('web').check()
    if (Date.now() - x3SyncCache.at > X3_SYNC_TTL_MS) {
      // Un SQLite momentanément indisponible ne doit pas casser le rendu de
      // toutes les pages : lastSync retombe à null (indicateur « inconnue »).
      const lastSync = await staticSync.lastSync().catch(() => null)
      x3SyncCache = { at: Date.now(), lastSync }
    }
    // Objet littéral (et non l'interface `ViewPrefs`) : les props Inertia exigent
    // une signature d'index JSON ; un type nommé sans index ne s'y prête pas.
    const prefs = isAuthed && ctx.auth.user ? ctx.auth.user.getViewPrefs() : null
    return {
      authUser:
        isAuthed && ctx.auth.user
          ? { username: ctx.auth.user.username, env: ctx.auth.user.lastEnv }
          : null,
      // Préférences de vues (pages + sous-vues) — partagées à toutes les pages
      // pour que le masthead et chaque sélecteur de sous-vues les lisent sans
      // requête dédiée. `null` hors session.
      viewPrefs: prefs
        ? {
            version: prefs.version,
            hiddenPages: prefs.hiddenPages,
            hiddenSubviews: prefs.hiddenSubviews,
          }
        : null,
      flash: ctx.session?.flashMessages.all() ?? {},
      x3LastSync: x3SyncCache.lastSync,
    }
  }
}

export default class InertiaMiddleware {
  #core = new InertiaCore()

  async handle(ctx: HttpContext, next: NextFn) {
    await this.#core.init(ctx)
    try {
      return await next()
    } finally {
      this.#core.dispose(ctx)
    }
  }
}
