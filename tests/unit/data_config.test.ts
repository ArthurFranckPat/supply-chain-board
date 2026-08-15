import { test } from '@japa/runner'
import env from '#start/env'
import systemSettingsRepository from '#repositories/system_settings_repository'
import replicaGate, { replicaReadsEnabled, getDataModeConfig } from '#services/replica_gate'
import replicaSyncService from '#services/replica_sync_service'

test.group('DataConfig — SystemSettingsRepository', (group) => {
  group.each.setup(async () => {
    systemSettingsRepository.clearCache()
    await systemSettingsRepository.delete('data_mode')
  })

  group.each.teardown(async () => {
    systemSettingsRepository.clearCache()
    await systemSettingsRepository.delete('data_mode')
  })

  test('écrit et relit un paramètre système avec persistance et cache', async ({ assert }) => {
    assert.isUndefined(await systemSettingsRepository.get('test_key'))

    await systemSettingsRepository.set('test_key', 'test_value', 'arthur')
    assert.equal(await systemSettingsRepository.get('test_key'), 'test_value')
    assert.equal(systemSettingsRepository.getSync('test_key'), 'test_value')

    await systemSettingsRepository.delete('test_key')
    assert.isUndefined(await systemSettingsRepository.get('test_key'))
  })
})

test.group('DataConfig — ReplicaGate mode dynamique', (group) => {
  group.each.setup(async () => {
    systemSettingsRepository.clearCache()
    await systemSettingsRepository.delete('data_mode')
  })

  group.each.teardown(async () => {
    systemSettingsRepository.clearCache()
    await systemSettingsRepository.delete('data_mode')
  })

  test('par défaut (absent de DB) : hérite de la variable d’environnement REPLICA_READS', async ({
    assert,
  }) => {
    const config = getDataModeConfig()
    assert.equal(config.configuredMode, 'env')
    assert.equal(config.envDefault, env.get('REPLICA_READS', false) === true)
    assert.equal(replicaReadsEnabled(), env.get('REPLICA_READS', false) === true)
  })

  test('surcharge dynamique en mode réplique', async ({ assert }) => {
    await systemSettingsRepository.set('data_mode', 'replica', 'test_user')

    const config = getDataModeConfig()
    assert.equal(config.configuredMode, 'replica')
    assert.isTrue(config.effectiveMode)
    assert.isTrue(replicaReadsEnabled())
  })

  test('surcharge dynamique en mode direct X3', async ({ assert }) => {
    await systemSettingsRepository.set('data_mode', 'direct', 'test_user')

    const config = getDataModeConfig()
    assert.equal(config.configuredMode, 'direct')
    assert.isFalse(config.effectiveMode)
    assert.isFalse(replicaReadsEnabled())
  })

  test('retour au mode env lors de la suppression', async ({ assert }) => {
    await systemSettingsRepository.set('data_mode', 'replica', 'test_user')
    assert.isTrue(replicaReadsEnabled())

    await systemSettingsRepository.delete('data_mode')
    assert.equal(replicaReadsEnabled(), env.get('REPLICA_READS', false) === true)
  })

  test('getTableStatuses retourne les 8 tables répliquées avec métadonnées complètes', async ({
    assert,
  }) => {
    const statuses = await replicaGate.getTableStatuses()
    assert.equal(statuses.length, 8)

    const tableNames = statuses.map((s) => s.table)
    assert.include(tableNames, 'orders_flux_replica')
    assert.include(tableNames, 'stock_replica')
    assert.include(tableNames, 'stock_flux_replica')
    assert.include(tableNames, 'receptions_replica')
    assert.include(tableNames, 'operations_replica')
    assert.include(tableNames, 'stock_detail_replica')
    assert.include(tableNames, 'latency_replica')
    assert.include(tableNames, 'operations_trk_replica')

    for (const s of statuses) {
      assert.isString(s.label)
      assert.isString(s.description)
      assert.isNumber(s.rowCount)
      assert.isBoolean(s.isDirty)
      assert.isNumber(s.maxAgeMs)
      assert.isString(s.source)
    }
  })
})

test.group('DataConfig — ReplicaSyncService helpers & logs', () => {
  test('resetDirty et getLogs s’exécutent sans lever', async ({ assert }) => {
    await replicaSyncService.resetDirty('all')

    const logs = await replicaSyncService.getLogs(1, 10, 'all')
    assert.isArray(logs.rows)
    assert.isNumber(logs.total)
  })
})
