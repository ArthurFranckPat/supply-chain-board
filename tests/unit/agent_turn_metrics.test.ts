import { test } from '@japa/runner'

import agentTurnMetrics, {
  recordAgentTurn,
  type AgentTurnSample,
} from '#services/agent/turn_metrics'

/** Échantillon minimal — seuls les champs testés sont surchargés. */
function sample(over: Partial<AgentTurnSample> = {}): AgentTurnSample {
  return {
    at: Date.now(),
    model: 'zai/glm-5.2',
    persistent: true,
    durationMs: 1000,
    ttftMs: 200,
    toolCalls: 1,
    toolErrors: 0,
    tools: ['getVerdict'],
    tokens: { input: 100, output: 50, cacheRead: 0, cacheWrite: 0, total: 150 },
    costUsd: 0.001,
    contextTokens: 8000,
    contextPercent: 4,
    outcome: 'ok',
    ...over,
  }
}

test.group('agentTurnMetrics', (group) => {
  group.each.setup(() => {
    agentTurnMetrics.reset()
  })

  test("l'histogramme d'appels de tools et la part multi-étapes — le gate #93", ({ assert }) => {
    // 2 tours sans tool, 3 tours mono-appel, 1 tour à 4 appels.
    agentTurnMetrics.record(sample({ toolCalls: 0, tools: [] }))
    agentTurnMetrics.record(sample({ toolCalls: 0, tools: [] }))
    agentTurnMetrics.record(sample({ toolCalls: 1, tools: ['getStock'] }))
    agentTurnMetrics.record(sample({ toolCalls: 1, tools: ['getStock'] }))
    agentTurnMetrics.record(sample({ toolCalls: 1, tools: ['getVerdict'] }))
    agentTurnMetrics.record(
      sample({
        toolCalls: 4,
        tools: ['getVerdict', 'descendreBOM', 'getPromise', 'listerRuptures'],
      })
    )

    const stats = agentTurnMetrics.snapshot()
    assert.equal(stats.count, 6)
    assert.deepEqual(stats.toolCallsHistogram, { '0': 2, '1': 3, '4': 1 })
    // Seul le tour à 4 appels est multi-étapes : c'est la seule population que
    // Code Mode pourrait rendre moins chère.
    assert.equal(stats.multiStepCount, 1)
    assert.closeTo(stats.multiStepShare, 1 / 6, 0.0001)
    assert.equal(stats.toolCalls.max, 4)
  })

  test('un tool appelé deux fois dans le même tour compte 2 appels mais 1 tour', ({ assert }) => {
    agentTurnMetrics.record(sample({ toolCalls: 2, tools: ['getCharge', 'getCharge'] }))
    agentTurnMetrics.record(sample({ toolCalls: 1, tools: ['getCharge'] }))

    const usage = agentTurnMetrics.snapshot().toolUsage
    assert.deepEqual(usage, [{ tool: 'getCharge', calls: 3, turns: 2 }])
  })

  test('les tours sans usage rapporté ne diluent pas les moyennes de tokens', ({ assert }) => {
    agentTurnMetrics.record(
      sample({ tokens: { input: 200, output: 100, cacheRead: 0, cacheWrite: 0, total: 300 } })
    )
    agentTurnMetrics.record(sample({ tokens: null, costUsd: null }))

    const { tokens } = agentTurnMetrics.snapshot()
    // Moyenne sur le seul tour mesuré — pas 150, qui laisserait croire à une
    // consommation deux fois moindre.
    assert.equal(tokens.totalAvg, 300)
    assert.equal(tokens.totalSum, 300)
  })

  test('les issues du tour sont comptées séparément', ({ assert }) => {
    agentTurnMetrics.record(sample({ outcome: 'ok' }))
    agentTurnMetrics.record(sample({ outcome: 'error', error: 'boom' }))
    agentTurnMetrics.record(sample({ outcome: 'aborted' }))
    agentTurnMetrics.record(sample({ outcome: 'rejected' }))
    agentTurnMetrics.record(sample({ outcome: 'rejected' }))

    assert.deepEqual(agentTurnMetrics.snapshot().outcomes, {
      ok: 1,
      error: 1,
      aborted: 1,
      rejected: 2,
    })
  })

  test('percentiles de durée et TTFT sur la fenêtre', ({ assert }) => {
    for (const ms of [100, 200, 300, 400, 500]) {
      agentTurnMetrics.record(sample({ durationMs: ms, ttftMs: ms / 2 }))
    }
    const stats = agentTurnMetrics.snapshot()
    assert.equal(stats.durationMs.p50, 300)
    assert.equal(stats.durationMs.max, 500)
    assert.equal(stats.ttftMs.p50, 150)
  })

  test('un TTFT absent ne compte pas comme un zéro', ({ assert }) => {
    // Tour qui échoue avant le premier token : il ne doit pas tirer le P50 vers 0.
    agentTurnMetrics.record(sample({ ttftMs: null, outcome: 'error' }))
    agentTurnMetrics.record(sample({ ttftMs: 400 }))
    assert.equal(agentTurnMetrics.snapshot().ttftMs.p50, 400)
  })

  test('la fenêtre est bornée mais le compteur cumulé ne l’est pas', ({ assert }) => {
    for (let i = 0; i < 520; i++) agentTurnMetrics.record(sample({ toolCalls: 1 }))
    const stats = agentTurnMetrics.snapshot()
    assert.equal(stats.count, 520)
    // 500 échantillons conservés : l'histogramme borne, le compteur non.
    assert.equal(stats.toolCallsHistogram['1'], 500)
  })

  test('recordAgentTurn enregistre — et le log ne peut pas casser le tour', ({ assert }) => {
    // Le wrapper émet une ligne de log en plus du stockage ; l'émission est
    // best-effort (import dynamique du logger) et ne doit jamais lever.
    assert.doesNotThrow(() => recordAgentTurn(sample({ toolCalls: 2 })))
    assert.equal(agentTurnMetrics.snapshot().count, 1)
  })

  test('recent rend les derniers tours du plus récent au plus ancien', ({ assert }) => {
    agentTurnMetrics.record(sample({ durationMs: 1 }))
    agentTurnMetrics.record(sample({ durationMs: 2 }))
    agentTurnMetrics.record(sample({ durationMs: 3 }))
    assert.deepEqual(
      agentTurnMetrics.recent(2).map((s) => s.durationMs),
      [3, 2]
    )
  })
})
