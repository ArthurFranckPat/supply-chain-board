import { type HttpContext } from '@adonisjs/core/http'
import replicaGate, {
  getDataModeConfig,
  type DataModeSetting,
  type ReplicaTable,
} from '#services/replica_gate'
import replicaSyncService from '#services/replica_sync_service'
import systemSettingsRepository from '#repositories/system_settings_repository'

/**
 * Contrôleur d'administration et de configuration du mode de données et des répliques.
 *
 * Page `/configuration/donnees` et endpoints `/api/v1/config/data/*`.
 */
export default class DataConfigController {
  /** GET /configuration/donnees — page Inertia. */
  async index(ctx: HttpContext) {
    // Initialise le cache de réglages si nécessaire
    await systemSettingsRepository.loadAll()

    const [tables, logs, isSyncRunning] = await Promise.all([
      replicaGate.getTableStatuses(),
      replicaSyncService.getLogs(1, 25, 'all'),
      Promise.resolve(replicaSyncService.isSyncRunning()),
    ])

    const dataMode = getDataModeConfig()

    return ctx.inertia.render('config/donnees', {
      dataMode,
      tables,
      logs,
      isSyncRunning,
    })
  }

  /** GET /api/v1/config/data/status — statut complet en JSON. */
  async status({ response }: HttpContext) {
    const dataMode = getDataModeConfig()
    const tables = await replicaGate.getTableStatuses()
    const isSyncRunning = replicaSyncService.isSyncRunning()

    return response.ok({
      dataMode,
      tables,
      isSyncRunning,
    })
  }

  /** POST /api/v1/config/data/mode — changer le mode de données. */
  async updateMode({ request, response, auth }: HttpContext) {
    const { mode } = request.only(['mode']) as { mode?: unknown }

    if (mode !== 'replica' && mode !== 'direct' && mode !== 'env') {
      return response.badRequest({
        ok: false,
        error: "Mode invalide. Les valeurs autorisées sont 'replica', 'direct' ou 'env'.",
      })
    }

    const username = auth.user?.username ?? 'system'

    if (mode === 'env') {
      await systemSettingsRepository.delete('data_mode')
    } else {
      await systemSettingsRepository.set('data_mode', mode as DataModeSetting, username)
    }

    return response.ok({
      ok: true,
      dataMode: getDataModeConfig(),
    })
  }

  /** POST /api/v1/config/data/sync — déclencher une synchronisation manuelle. */
  async sync({ request, response }: HttpContext) {
    const { table } = request.only(['table']) as { table?: ReplicaTable | 'all' }
    const targetTable = table ?? 'all'

    if (replicaSyncService.isSyncRunning()) {
      return response.status(409).send({
        ok: false,
        error: 'Une synchronisation est déjà en cours.',
      })
    }

    try {
      const result = await replicaSyncService.triggerManualSync(targetTable, 'manual_ui')
      const tables = await replicaGate.getTableStatuses()
      return response.ok({
        ok: true,
        result,
        tables,
      })
    } catch (error: any) {
      return response.status(error.status ?? 500).send({
        ok: false,
        error: error.message || 'Erreur lors de la synchronisation',
      })
    }
  }

  /** POST /api/v1/config/data/reset-dirty — lever les marquages dirty. */
  async resetDirty({ request, response }: HttpContext) {
    const { table } = request.only(['table']) as { table?: ReplicaTable | 'all' }
    const targetTable = table ?? 'all'

    await replicaSyncService.resetDirty(targetTable)
    const tables = await replicaGate.getTableStatuses()

    return response.ok({
      ok: true,
      tables,
    })
  }

  /** GET /api/v1/config/data/logs — logs d'ingestion paginés. */
  async logs({ request, response }: HttpContext) {
    const page = Math.max(1, Number(request.input('page', 1)))
    const limit = Math.min(100, Math.max(5, Number(request.input('limit', 25))))
    const status = request.input('status', 'all') as 'all' | 'ok' | 'failed'

    const logs = await replicaSyncService.getLogs(page, limit, status)

    return response.ok(logs)
  }
}
