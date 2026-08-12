import { test } from '@japa/runner'
import { sanitizeError, sanitizeSqlErrorMessage } from '#app/utils/sanitize_sql_error'

/**
 * Message tel que Knex le produit : requête compilée, bindings interpolés,
 * séparateur ` - `, puis message du driver.
 */
const MESSAGE_KNEX =
  'insert into `demand_snapshots` (`created_at`, `fournisseur`, `itmref`, `quantity`, `vcrnum`) ' +
  "select '2026-08-12 11:17:47.393' as `created_at`, 'VPK CONVERTING SAS' as `fournisseur`, " +
  "'E7147' as `itmref`, 10800 as `quantity`, 'CG2601409' as `vcrnum` union all " +
  "select '2026-08-12 11:17:47.393' as `created_at`, 'VPK CONVERTING SAS' as `fournisseur`, " +
  "'E7010' as `itmref`, 2430 as `quantity`, 'CG2601410' as `vcrnum`" +
  ' - SQLITE_ERROR: no such column: itmrefori'

test.group('sanitizeSqlErrorMessage', () => {
  test('supprime les valeurs métier du préfixe SQL de Knex', ({ assert }) => {
    const propre = sanitizeSqlErrorMessage(MESSAGE_KNEX)

    for (const fuite of ['VPK CONVERTING SAS', 'E7147', 'CG2601409', '10800', '2430']) {
      assert.notInclude(propre, fuite, `valeur métier laissée dans le message : ${fuite}`)
    }
  })

  test('garde la cause réelle et la table visée', ({ assert }) => {
    const propre = sanitizeSqlErrorMessage(MESSAGE_KNEX)

    assert.include(propre, 'SQLITE_ERROR: no such column: itmrefori')
    assert.include(propre, 'demand_snapshots')
    assert.include(propre, 'insert')
  })

  test('laisse intact un message sans SQL', ({ assert }) => {
    assert.equal(sanitizeSqlErrorMessage('X3 timeout après 30 s'), 'X3 timeout après 30 s')
  })

  test('masque aussi une requête sans message de driver', ({ assert }) => {
    const propre = sanitizeSqlErrorMessage("select * from `orders` where `itmref` = 'E7147'")

    assert.notInclude(propre, 'E7147')
    assert.include(propre, 'orders')
  })

  test('borne la longueur des messages non SQL', ({ assert }) => {
    const propre = sanitizeSqlErrorMessage('x'.repeat(5000))

    assert.isBelow(propre.length, 1100)
    assert.include(propre, '[tronqué]')
  })

  test('sanitizeError accepte Error comme valeur brute', ({ assert }) => {
    assert.notInclude(sanitizeError(new Error(MESSAGE_KNEX)), 'VPK CONVERTING SAS')
    assert.equal(sanitizeError('rien à masquer'), 'rien à masquer')
    assert.equal(sanitizeError(null), 'null')
  })
})

/**
 * La fonction pure ne protège rien si elle n'est pas câblée. Ce groupe verrouille
 * le branchement dans `config/logger.ts` : c'est lui qui couvre la quarantaine de
 * `logger.error({ err }, …)` du projet, aucun d'eux n'assainissant lui-même.
 */
test.group('sérialiseur err du logger', () => {
  test('le logger configuré masque le SQL, message ET stack', async ({ assert }) => {
    const { default: loggerConfig } = await import('#config/logger')
    const serializer = loggerConfig.loggers.app.serializers?.err

    assert.isFunction(serializer, 'config/logger.ts ne branche plus de sérialiseur `err`')

    const serialise = serializer!(new Error(MESSAGE_KNEX)) as Record<string, string>
    assert.notInclude(serialise.message, 'VPK CONVERTING SAS')
    assert.notInclude(serialise.stack, 'VPK CONVERTING SAS')
    assert.include(serialise.message, 'SQLITE_ERROR: no such column: itmrefori')

    // Une bonne moitié des sites passe déjà `err` sous forme de chaîne.
    assert.notInclude(serializer!(MESSAGE_KNEX) as string, 'VPK CONVERTING SAS')
  })
})
