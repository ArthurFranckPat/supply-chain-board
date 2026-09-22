import { test } from '@japa/runner'
import { Effect, Either } from 'effect'
import { X3Connection } from '#app/x3/connection'
import { classifyResponse, type X3SoapConfig } from '#app/x3/soap_client'
import { X3QueueSaturatedError } from '#app/x3/x3_concurrency'
import { isTransient, X3CurlFailed, X3Fault, X3ResultXmlNil } from '#app/x3/x3_errors'
import type { SoapResponse } from '#app/x3/types'

/** Port fermé : curl échoue en « connection refused » sans attendre de réseau. */
const UNREACHABLE: X3SoapConfig = {
  host: '127.0.0.1',
  port: '1',
  user: 'user',
  password: 'password',
  pool: 'POOL',
  ws: 'WS',
  grpSql: 'GRP1',
  grpRes: 'GRP2',
  grpCount: 'GRP3',
}

function response(partial: Partial<SoapResponse>): SoapResponse {
  return { status: 1, data: [], count: 0, error: '', ...partial }
}

test.group('x3_errors — classification des échecs SOAP', () => {
  test('isTransient décide sur le tag, pas sur le texte', ({ assert }) => {
    assert.isTrue(isTransient(new X3CurlFailed({ message: 'curl: (7) refused' })))
    assert.isTrue(isTransient(new X3ResultXmlNil({ message: 'resultXml is nil', status: 1 })))
    assert.isFalse(isTransient(new X3QueueSaturatedError(120_000, 4)))
    assert.isFalse(
      isTransient(new X3Fault({ message: 'ORA-00904: invalid identifier', status: 0 }))
    )
    assert.isTrue(isTransient(new X3Fault({ message: 'Connection reset by peer', status: 0 })))
  })

  test('classifyResponse : succès seulement si status = 1 et resultXml présent', ({ assert }) => {
    const run = (resp: SoapResponse) => Effect.runSync(Effect.either(classifyResponse(resp)))

    assert.isTrue(Either.isRight(run(response({ data: ['A'] }))))

    const nil = run(response({ error: 'resultXml is nil' }))
    assert.isTrue(Either.isLeft(nil) && nil.left._tag === 'X3ResultXmlNil')

    const fault = run(response({ status: 0, error: 'ORA-00942' }))
    assert.isTrue(Either.isLeft(fault) && fault.left._tag === 'X3Fault')
  })
})

test.group('X3Connection — réessai et annulation', () => {
  test('un curl en échec est réessayé, puis rendu en X3QueryResult', async ({ assert }) => {
    const startedAt = Date.now()
    const result = await new X3Connection(UNREACHABLE).query(
      'SELECT ITMREF_0 FROM ITMMASTER',
      null,
      {
        retries: 1,
      }
    )

    assert.isFalse(result.success)
    assert.match(result.error ?? '', /^curl: /)
    assert.isNull(result.status)
    assert.isAtLeast(Date.now() - startedAt, 1_000, 'un réessai après 1 s')
  }).timeout(10_000)

  test("l'annulation interrompt l'attente entre deux tentatives", async ({ assert }) => {
    const controller = new AbortController()
    setTimeout(() => controller.abort(), 200)

    const startedAt = Date.now()
    const result = await new X3Connection(UNREACHABLE).query(
      'SELECT ITMREF_0 FROM ITMMASTER',
      null,
      {
        retries: 3,
        signal: controller.signal,
      }
    )

    assert.deepEqual(result, {
      success: false,
      error: 'X3 query aborted',
      status: null,
      count: 0,
      data: [],
    })
    assert.isBelow(Date.now() - startedAt, 900, "pas d'attente du délai de réessai")
  }).timeout(10_000)
})
