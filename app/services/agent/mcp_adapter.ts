/**
 * Adaptateur pi-coding-agent `ToolDefinition` → registration MCP.
 *
 * Le MCP supply-board (issue #80) est une **façade** sur le même code que
 * l'app copilote : il consomme `buildAgentTools()` (source de vérité unique,
 * `app/services/agent/tools.ts`) — aucune réimplémentation ici.
 *
 * Pourquoi c'est quasi un pass-through :
 *  - `tool.parameters` est un schéma TypeBox, qui **est** du JSON Schema
 *    (le format exact attendu par MCP `inputSchema`).
 *  - `tool.execute()` retourne un `AgentToolResult<T>` dont le champ
 *    `content: (TextContent|ImageContent)[]` est compatible 1:1 avec
 *    `CallToolResult.content` du protocole MCP.
 *
 * Les tools supply n'utilisent ni `onUpdate` (callback TUI de streaming) ni
 * `ctx` (ExtensionContext pi, hors scope serveur). Vérifié dans `tools.ts`.
 */

import type { ToolDefinition } from '@earendil-works/pi-coding-agent'

/** JSON Schema brut tel que l'attend l'API low-level du SDK MCP. */
export type JsonSchema = {
  type?: string
  properties?: Record<string, unknown>
  required?: string[]
  [k: string]: unknown
}

/** Tool ré-exposé pour MCP : schéma JSON + handler stdio-compatible. */
export interface McpToolRegistration {
  name: string
  description: string
  /** JSON Schema (issu du TypeBox pi). */
  inputSchema: JsonSchema
  /** Exécute le tool et retourne un payload `CallToolResult` MCP. */
  handler: (
    args: Record<string, unknown>,
    signal: AbortSignal | undefined
  ) => Promise<McpToolCallResult>
}

export interface McpToolCallResult {
  content: Array<{ type: 'text'; text: string }>
  isError?: boolean
}

/**
 * Construit les registrations MCP à partir des ToolDefinition pi.
 *
 * La sécurité de l'app copilote repose sur une allowlist de tools ; le MCP
 * expose exactement les mêmes tools (lecture-seule hors `enregistrerScenario`
 * qui persiste en SQLite locale — documenté dans l'issue #80).
 */
export function adaptPiToolsForMcp(tools: ToolDefinition[]): McpToolRegistration[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    // TypeBox ≡ JSON Schema : `Type.Object({...})` produit `{type:'object', properties, required}`.
    inputSchema: (tool.parameters as JsonSchema) ?? { type: 'object', properties: {} },
    handler: async (args, signal) => {
      try {
        // execute(toolCallId, params, signal, onUpdate?, ctx?) — onUpdate/ctx non utilisés par les tools supply.
        const result = await tool.execute(
          `mcp-${tool.name}-${Date.now()}`,
          args as never,
          signal,
          undefined,
          undefined as never
        )
        return {
          // Le format pi `content` est déjà compatible MCP (TextContent|ImageContent).
          content: result.content as McpToolCallResult['content'],
        }
      } catch (err) {
        // Critère done #80 : erreurs propres si X3 injoignable / param invalide.
        const message = err instanceof Error ? err.message : String(err)
        return {
          content: [{ type: 'text', text: `Erreur tool ${tool.name}: ${message}` }],
          isError: true,
        }
      }
    },
  }))
}
