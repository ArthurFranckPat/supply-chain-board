import { test } from '@japa/runner'

import { AgentUIMessageMapper } from '#services/agent/ui_message_stream'
import type { AgentSseEvent } from '#services/agent_service'

test.group('agent → UI message stream (mapper)', () => {
  test('session → start avec metadata', ({ assert }) => {
    const mapper = new AgentUIMessageMapper()
    const chunks = mapper.map({
      type: 'session',
      sessionId: 's-1',
      model: 'zai/glm-5.2',
      tools: ['getVerdict'],
    })
    assert.lengthOf(chunks, 1)
    assert.equal(chunks[0].type, 'start')
    const start = chunks[0] as Extract<
      (typeof chunks)[number],
      { type: 'start' }
    >
    assert.isString(start.messageId)
    assert.deepEqual(start.messageMetadata, {
      sessionId: 's-1',
      model: 'zai/glm-5.2',
      tools: ['getVerdict'],
    })
  })

  test('texte : start/delta/end regroupés en un bloc', ({ assert }) => {
    const mapper = new AgentUIMessageMapper()
    const seq: AgentSseEvent[] = [
      { type: 'text_delta', text: 'Bon' },
      { type: 'text_delta', text: 'jour' },
      { type: 'done', sessionId: 's-1' },
    ]
    const chunks = seq.flatMap((e) => mapper.map(e))
    assert.deepEqual(
      chunks.map((c) => c.type),
      ['text-start', 'text-delta', 'text-delta', 'text-end', 'finish']
    )
    const deltas = chunks.filter((c) => c.type === 'text-delta')
    assert.deepEqual(
      deltas.map((d) => (d as { delta: string }).delta).join(''),
      'Bonjour'
    )
  })

  test('thinking → reasoning-start/delta/end', ({ assert }) => {
    const mapper = new AgentUIMessageMapper()
    const chunks = [
      ...mapper.map({ type: 'thinking_delta', text: 'analyse' }),
      ...mapper.map({ type: 'done', sessionId: 's' }),
    ]
    assert.deepEqual(
      chunks.map((c) => c.type),
      ['reasoning-start', 'reasoning-delta', 'reasoning-end', 'finish']
    )
  })

  test('tool_start ferme le texte ouvert et propage les args', ({ assert }) => {
    const mapper = new AgentUIMessageMapper()
    const chunks = [
      ...mapper.map({ type: 'text_delta', text: 'Je regarde' }),
      ...mapper.map({
        type: 'tool_start',
        toolName: 'getVerdict',
        toolCallId: 'tc-1',
        args: { numOf: 'MFG-1' },
      }),
    ]
    assert.deepEqual(
      chunks.map((c) => c.type),
      ['text-start', 'text-delta', 'text-end', 'tool-input-available']
    )
    const input = chunks[3] as Extract<
      (typeof chunks)[number],
      { type: 'tool-input-available' }
    >
    assert.equal(input.toolCallId, 'tc-1')
    assert.equal(input.toolName, 'getVerdict')
    assert.deepEqual(input.input, { numOf: 'MFG-1' })
  })

  test('tool_end propage le résultat (succès et erreur)', ({ assert }) => {
    const mapper = new AgentUIMessageMapper()
    const ok = mapper.map({
      type: 'tool_end',
      toolName: 'getVerdict',
      toolCallId: 'tc-1',
      isError: false,
      result: { verdict: 'bloqué' },
    })
    assert.equal(ok[0].type, 'tool-output-available')
    assert.deepEqual(
      (ok[0] as Extract<(typeof ok)[number], { type: 'tool-output-available' }>).output,
      { verdict: 'bloqué' }
    )

    const ko = mapper.map({
      type: 'tool_end',
      toolName: 'getVerdict',
      toolCallId: 'tc-2',
      isError: true,
      result: 'boom',
    })
    assert.equal(ko[0].type, 'tool-output-error')
    assert.equal(
      (ko[0] as Extract<(typeof ko)[number], { type: 'tool-output-error' }>).errorText,
      'boom'
    )
  })

  test('deux appels parallèles au même tool matchent par toolCallId', ({ assert }) => {
    const mapper = new AgentUIMessageMapper()
    const seq: AgentSseEvent[] = [
      { type: 'tool_start', toolName: 'getVerdict', toolCallId: 'a', args: { numOf: '1' } },
      { type: 'tool_start', toolName: 'getVerdict', toolCallId: 'b', args: { numOf: '2' } },
      { type: 'tool_end', toolName: 'getVerdict', toolCallId: 'a', isError: false, result: 1 },
      { type: 'tool_end', toolName: 'getVerdict', toolCallId: 'b', isError: false, result: 2 },
    ]
    const chunks = seq.flatMap((e) => mapper.map(e))
    const ids = chunks
      .filter((c) => c.type.startsWith('tool-'))
      .map((c) => (c as { toolCallId: string }).toolCallId)
    assert.deepEqual(ids, ['a', 'b', 'a', 'b'])
  })

  test('error ferme les blocs ouverts avant le chunk error', ({ assert }) => {
    const mapper = new AgentUIMessageMapper()
    const chunks = [
      ...mapper.map({ type: 'thinking_delta', text: 'hmm' }),
      ...mapper.map({ type: 'error', message: 'fatal' }),
    ]
    assert.deepEqual(
      chunks.map((c) => c.type),
      ['reasoning-start', 'reasoning-delta', 'reasoning-end', 'error']
    )
    assert.equal(
      (chunks[3] as Extract<(typeof chunks)[number], { type: 'error' }>).errorText,
      'fatal'
    )
  })

  test('done sans contenu → finish seul', ({ assert }) => {
    const mapper = new AgentUIMessageMapper()
    const chunks = mapper.map({ type: 'done', sessionId: 's' })
    assert.deepEqual(
      chunks.map((c) => c.type),
      ['finish']
    )
  })
})
