/**
 * Barrière sécu layer agentique : les builtins Pi ne doivent jamais
 * être actifs, le modèle doit être glm-5.2 / zai.
 *
 * Gate étape 1 (Q12 + noTools).
 */

import { test } from '@japa/runner'
import { AGENT_MODEL_ID, AGENT_PROVIDER, createAgentRuntime } from '#services/agent_service'
import { buildAgentTools } from '#services/agent/tools'

test.group('agent runtime barrier', () => {
  test('provider + modèle + aucun builtin', async ({ assert }) => {
    // Skip si clé absente (CI sans secret) — pas un échec de contrat.
    if (!process.env.ZAI_API_KEY) {
      // En local dotenvx charge via ace ; sous japa env peut être plat.
      // On échoue seulement si on est en mode strict AGENT_STRICT=1.
      if (process.env.AGENT_STRICT === '1') {
        assert.fail('ZAI_API_KEY requise (AGENT_STRICT=1)')
      }
      return
    }

    const { session, dispose, modelLabel, toolNames } = await createAgentRuntime(buildAgentTools())
    try {
      assert.equal(modelLabel, `${AGENT_PROVIDER}/${AGENT_MODEL_ID}`)
      assert.include(toolNames, 'ping')
      for (const banned of ['bash', 'read', 'write', 'edit', 'grep', 'find', 'ls']) {
        assert.notInclude(toolNames, banned)
      }
      // session model must match
      assert.equal(session.agent.state.model?.id, AGENT_MODEL_ID)
      assert.equal(session.agent.state.model?.provider, AGENT_PROVIDER)
    } finally {
      dispose()
    }
  })
})
