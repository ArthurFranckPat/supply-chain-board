import { test } from '@japa/runner'

import { AgentMessageAssembler, makeUserMessage } from '#services/agent/message_assembler'
import { compactHistory } from '#services/agent/history_compact'
import type { AgentSseEvent } from '#services/agent_service'
import type { StoredChatMessage } from '#services/conversation_store'

/** Lit les parts d'un message assemblé sous une forme simple à assertir. */
function plainParts(message: StoredChatMessage) {
  return message.parts.map((p) => p as Record<string, unknown>)
}

test.group('AgentMessageAssembler (persistence historique)', () => {
  test('metadata du tour portée sur le message assistant', ({ assert }) => {
    const asm = new AgentMessageAssembler()
    asm.feed({ type: 'session', sessionId: 's-1', model: 'zai/glm-5.2', tools: ['getVerdict'] })
    asm.feed({ type: 'done', sessionId: 's-1' })
    const msg = asm.toMessage()
    assert.equal(msg.role, 'assistant')
    assert.isString(msg.id)
    assert.deepEqual(msg.metadata, {
      sessionId: 's-1',
      model: 'zai/glm-5.2',
      tools: ['getVerdict'],
    })
  })

  test('deltas texte concaténés en un seul bloc texte', ({ assert }) => {
    const asm = new AgentMessageAssembler()
    const seq: AgentSseEvent[] = [
      { type: 'text_delta', text: 'Bon' },
      { type: 'text_delta', text: 'jour' },
      { type: 'done', sessionId: 's' },
    ]
    seq.forEach((e) => asm.feed(e))
    const parts = plainParts(asm.toMessage())
    assert.lengthOf(parts, 1)
    assert.deepEqual(parts[0], { type: 'text', text: 'Bonjour' })
  })

  test('reasoning conservé dans sa propre part', ({ assert }) => {
    const asm = new AgentMessageAssembler()
    asm.feed({ type: 'thinking_delta', text: 'analyse' })
    asm.feed({ type: 'done', sessionId: 's' })
    const parts = plainParts(asm.toMessage())
    assert.deepEqual(parts[0], { type: 'reasoning', text: 'analyse' })
  })

  test('tool part au format AI SDK (input puis output)', ({ assert }) => {
    const asm = new AgentMessageAssembler()
    const seq: AgentSseEvent[] = [
      { type: 'tool_start', toolName: 'getVerdict', toolCallId: 'tc-1', args: { numOf: 'MFG-1' } },
      { type: 'tool_end', toolName: 'getVerdict', toolCallId: 'tc-1', isError: false, result: { verdict: 'ok' } },
      { type: 'done', sessionId: 's' },
    ]
    seq.forEach((e) => asm.feed(e))
    const parts = plainParts(asm.toMessage())
    assert.lengthOf(parts, 1)
    assert.equal(parts[0].type, 'tool-getVerdict')
    assert.equal(parts[0].toolCallId, 'tc-1')
    assert.equal(parts[0].state, 'output-available')
    assert.deepEqual(parts[0].input, { numOf: 'MFG-1' })
    assert.deepEqual(parts[0].output, { verdict: 'ok' })
  })

  test('tool en erreur → state output-error + errorText', ({ assert }) => {
    const asm = new AgentMessageAssembler()
    asm.feed({ type: 'tool_start', toolName: 'getVerdict', toolCallId: 'tc-2', args: {} })
    asm.feed({ type: 'tool_end', toolName: 'getVerdict', toolCallId: 'tc-2', isError: true, result: 'boom' })
    asm.feed({ type: 'done', sessionId: 's' })
    const part = plainParts(asm.toMessage())[0]
    assert.equal(part.state, 'output-error')
    assert.equal(part.errorText, 'boom')
  })

  test('ordre des blocs préservé : texte → tool → texte', ({ assert }) => {
    const asm = new AgentMessageAssembler()
    const seq: AgentSseEvent[] = [
      { type: 'text_delta', text: 'A' },
      { type: 'tool_start', toolName: 'getVerdict', toolCallId: 'tc', args: {} },
      { type: 'tool_end', toolName: 'getVerdict', toolCallId: 'tc', isError: false, result: 1 },
      { type: 'text_delta', text: 'B' },
      { type: 'done', sessionId: 's' },
    ]
    seq.forEach((e) => asm.feed(e))
    const types = plainParts(asm.toMessage()).map((p) => p.type)
    assert.deepEqual(types, ['text', 'tool-getVerdict', 'text'])
  })

  test('makeUserMessage = part texte brute', ({ assert }) => {
    const msg = makeUserMessage('Pourquoi cet OF est bloqué ?')
    assert.equal(msg.role, 'user')
    assert.isString(msg.id)
    assert.deepEqual(plainParts(msg), [{ type: 'text', text: 'Pourquoi cet OF est bloqué ?' }])
  })
})

/** Construit un message assistant texte (helper pour les tests de compaction). */
function assistantMessage(text: string): StoredChatMessage {
  return {
    id: `a-${Math.random()}`,
    role: 'assistant',
    parts: [{ type: 'text', text }],
  } as StoredChatMessage
}

test.group('compactHistory (ré-hydratation contexte LLM)', () => {
  test('transcript user / assistant', ({ assert }) => {
    const out = compactHistory([
      makeUserMessage('Date engageante ?'),
      assistantMessage('La date engageante est le 12/08.'),
    ])
    assert.include(out, 'Utilisateur : Date engageante ?')
    assert.include(out, 'Copilote : La date engageante est le 12/08.')
    assert.include(out, '[historique de la conversation')
  })

  test('reasoning et tool parts ignorés', ({ assert }) => {
    const msg = {
      id: 'a-1',
      role: 'assistant',
      parts: [
        { type: 'reasoning', text: 'je réfléchis' },
        { type: 'tool-getVerdict', toolCallId: 'tc', state: 'output-available', input: {}, output: {} },
        { type: 'text', text: 'réponse finale' },
      ],
    } as unknown as StoredChatMessage
    const out = compactHistory([makeUserMessage('q'), msg])
    assert.include(out, 'Copilote : réponse finale')
    assert.notInclude(out, 'je réfléchis')
    assert.notInclude(out, 'tool-getVerdict')
  })

  test('réponses longues tronquées', ({ assert }) => {
    const long = 'x'.repeat(1000)
    const out = compactHistory([assistantMessage(long)])
    assert.notInclude(out, long)
    assert.include(out, 'x'.repeat(400))
    assert.include(out, '…')
  })

  test('historique vide → chaîne vide', ({ assert }) => {
    assert.equal(compactHistory([]), '')
  })
})
