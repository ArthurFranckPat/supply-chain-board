/**
 * Contrats de forme des 4 primitifs agent — pas d'I/O X3 obligatoire.
 * getPromise / getVerdict skip si pool/date vides.
 */

import { test } from '@japa/runner'
import { agentToolNames, buildAgentTools } from '#services/agent/tools'
import { getPromise } from '#services/agent/primitives'

test.group('agent tools registry', () => {
  test('tools métier + ping en allowlist, zéro builtin', ({ assert }) => {
    const names = agentToolNames(buildAgentTools())
    for (const n of [
      'listerOF',
      'rechercherArticle',
      'getVerdict',
      'descendreBOM',
      'getPromise',
      'listerRetardsPrevus',
      'listerRuptures',
      'simulerDecalage',
      'enregistrerScenario',
      'getEngagementPoste',
      'rafraichir',
      'ping',
    ]) {
      assert.include(names, n)
    }
    for (const banned of ['bash', 'read', 'write', 'edit']) {
      assert.notInclude(names, banned)
    }
  })
})

test.group('agent primitives validation', () => {
  test('getPromise rejette quantity invalide sans I/O', async ({ assert }) => {
    const r = await getPromise({ article: 'X', quantity: 0 })
    assert.property(r, 'error')
    assert.equal((r as { _source: string })._source, 'getPromise')
  })

  test('getPromise rejette article vide', async ({ assert }) => {
    const r = await getPromise({ article: '  ', quantity: 10 })
    assert.property(r, 'error')
  })
})
