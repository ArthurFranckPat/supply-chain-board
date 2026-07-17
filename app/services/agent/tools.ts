/**
 * Tools custom exposés au runtime Pi.
 *
 * v1 étape 1 : un seul tool de smoke (`ping`) pour prouver no-builtins + GLM.
 * Étape 2 : getVerdict / descendreBOM / getPromise / listerRetardsPrevus.
 *
 * Barrière sécu : ce module ne doit **jamais** enregistrer bash/read/write/edit.
 */

import { Type } from 'typebox'
import { defineTool, type ToolDefinition } from '@earendil-works/pi-coding-agent'

/**
 * Tool minimal pour valider le provider + la barrière `tools` allowlist /
 * absence de builtins dans le smoke test et les processus de prod démarrés
 * avant branchement des primitifs supply.
 */
export const pingTool = defineTool({
  name: 'ping',
  label: 'Ping',
  description:
    'Smoke-test du runtime agent. Renvoie { pong: true }. À utiliser uniquement pour valider la connectivité.',
  parameters: Type.Object({
    msg: Type.Optional(Type.String({ description: 'Message écho optionnel' })),
  }),
  execute: async (_toolCallId, params) => {
    const payload = {
      pong: true as const,
      msg: params.msg ?? null,
      source: 'ping' as const,
    }
    return {
      content: [{ type: 'text', text: JSON.stringify(payload) }],
      details: payload,
    }
  },
})

/** Ensemble de tools actifs pour l'étape courante du build. */
export function buildAgentTools(): ToolDefinition[] {
  return [pingTool]
}

/** Noms allowlistés — à passer à `createAgentSession({ tools })`. */
export function agentToolNames(tools: ToolDefinition[] = buildAgentTools()): string[] {
  return tools.map((t) => t.name)
}
