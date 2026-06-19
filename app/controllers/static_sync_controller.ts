import { HttpContext } from '@adonisjs/core/http'
import staticSync from '#services/static_sync_service'
import boardDataset from '#services/board_dataset'

export default class StaticSyncController {
  /** GET /api/v1/static/status — état des tables statiques */
  async status(_ctx: HttpContext) {
    return staticSync.counts()
  }

  /** POST /api/v1/static/sync — sync X3 → SQLite (bloquant, ~60s première fois) */
  async sync(_ctx: HttpContext) {
    const result = await staticSync.syncAll()
    // Invalide le cache (board:*) pour que le prochain accès lise les nouvelles données
    await boardDataset.reloadAll()
    return result
  }
}
