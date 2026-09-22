import { test } from '@japa/runner'
import { X3HealthcheckService } from '#services/x3_healthcheck'
import type { X3Connection } from '#app/x3/connection'
import type { X3QueryResult } from '#app/x3/types'

const TIMEOUT_REASON = 'Connexion X3 indisponible (délai dépassé).'
const UNAVAILABLE_REASON = 'Identifiants X3 refusés ou accès indisponible.'
const UNREACHABLE_REASON = 'Connexion X3 indisponible.'

function serviceWithQuery(
  query: Pick<X3Connection, 'query'>['query'],
  timeoutMs = 100
): X3HealthcheckService {
  return new X3HealthcheckService(() => ({ query }), timeoutMs)
}

function successfulQueryResult(): X3QueryResult {
  return { success: true, count: 1, data: [{ ITMREF_0: 'ARTICLE' }] }
}

test.group('X3HealthcheckService', () => {
  test('exécute une lecture réussie et conserve le contrat Promise', async ({ assert }) => {
    const result = await serviceWithQuery(async () => successfulQueryResult()).check(
      'test',
      'user',
      'password'
    )

    assert.deepEqual(result, { ok: true, reason: '' })
  })

  test('retourne le motif neutre existant quand X3 refuse la lecture', async ({ assert }) => {
    const result = await serviceWithQuery(async () => ({
      success: false,
      count: 0,
      data: [],
    })).check('test', 'user', 'password')

    assert.deepEqual(result, { ok: false, reason: UNAVAILABLE_REASON })
  })

  test('un rejet inattendu ne se fait pas passer pour un timeout', async ({ assert }) => {
    const result = await serviceWithQuery(async () => {
      throw new Error('détail interne qui ne doit pas être affiché')
    }).check('test', 'user', 'password')

    assert.deepEqual(result, { ok: false, reason: UNREACHABLE_REASON })
  })

  test('le timeout Effect annule la requête sous-jacente', async ({ assert }) => {
    let aborted = false
    const result = await serviceWithQuery(
      (_sql, _params, options) =>
        new Promise<X3QueryResult>((_resolve, reject) => {
          const signal = options?.signal
          if (!signal) throw new Error('signal d’annulation absent')

          const onAbort = () => {
            aborted = true
            reject(signal.reason)
          }

          if (signal.aborted) onAbort()
          else signal.addEventListener('abort', onAbort, { once: true })
        }),
      5
    ).check('test', 'user', 'password')

    assert.deepEqual(result, { ok: false, reason: TIMEOUT_REASON })
    assert.isTrue(aborted)
  })
})
