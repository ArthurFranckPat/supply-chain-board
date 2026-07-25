/**
 * Adaptateur pi-coding-agent `ToolDefinition` → configuration de tool MCP.
 *
 * Le MCP supply-board (issue #80) est une **façade** sur le même code que
 * l'app copilote : il consomme `buildAgentTools()` (source de vérité unique,
 * `app/services/agent/tools.ts`) — aucune réimplémentation ici.
 *
 * Ce que l'adaptateur produit, c'est une config prête pour `registerTool` /
 * `registerAppTool` du `McpServer` high-level :
 *  - `inputShape` : shape zod dérivée du TypeBox du tool (cf. mcp_schema.ts pour
 *    la raison de cette conversion) ;
 *  - `handler` : exécute le tool et rend un payload `CallToolResult` ;
 *  - `app` : l'app MCP rattachée au tool, quand il y en a une (issue #89).
 *
 * Les tools supply n'utilisent ni `onUpdate` (callback TUI de streaming) ni
 * `ctx` (ExtensionContext pi, hors scope serveur). Vérifié dans `tools.ts`.
 */

import type { ToolDefinition } from '@earendil-works/pi-coding-agent'
import { Check, Errors } from 'typebox/value'
import {
  jsonSchemaToZodShape,
  type JsonSchemaNode,
  type ZodShape,
} from '#services/agent/mcp_schema'
import { mcpAppForTool, type McpAppDefinition } from '#services/agent/mcp_apps'

/** JSON Schema brut tel que TypeBox le produit. */
export type JsonSchema = JsonSchemaNode

/** Tool ré-exposé pour MCP : shape zod + handler + app éventuelle. */
export interface McpToolRegistration {
  name: string
  description: string
  /** Shape zod dérivée du TypeBox du tool — ce que `registerTool` attend. */
  inputShape: ZodShape
  /** App MCP (SEP-1865) rattachée à ce tool, si déclarée dans MCP_APPS. */
  app?: McpAppDefinition
  /** Exécute le tool et retourne un payload `CallToolResult` MCP. */
  handler: (
    args: Record<string, unknown>,
    signal: AbortSignal | undefined
  ) => Promise<McpToolCallResult>
}

export interface McpToolCallResult {
  content: Array<{ type: 'text'; text: string }>
  /**
   * Payload structuré complet, **non tronqué**, destiné à l'app UI (poussé par
   * l'hôte en `ui/notifications/tool-result`). Renseigné seulement pour les tools
   * qui ont une app : ailleurs, il doublerait la réponse sans lecteur.
   *
   * Ne va PAS au modèle : le modèle ne lit que `content[].text`, tronqué à 24k par
   * `toolResult` (tools.ts). C'est ce qui permet à l'app d'avoir la donnée entière
   * sans coûter un octet de contexte.
   */
  structuredContent?: Record<string, unknown>
  isError?: boolean
}

/** Objet JSON simple — seule forme acceptable pour `structuredContent`. */
function asStructuredContent(details: unknown): Record<string, unknown> | undefined {
  if (details === null || typeof details !== 'object' || Array.isArray(details)) return undefined
  return details as Record<string, unknown>
}

/**
 * Construit les configs MCP à partir des ToolDefinition pi.
 *
 * La sécurité de l'app copilote repose sur une allowlist de tools ; le MCP
 * expose exactement les mêmes tools (lecture-seule hors `enregistrerScenario`
 * qui persiste en SQLite locale — documenté dans l'issue #80).
 */
export function adaptPiToolsForMcp(tools: ToolDefinition[]): McpToolRegistration[] {
  return tools.map((tool) => {
    const app = mcpAppForTool(tool.name)
    return {
      name: tool.name,
      description: tool.description,
      inputShape: jsonSchemaToZodShape(tool.parameters as JsonSchemaNode | undefined, tool.name),
      app,
      handler: async (args, signal) => {
        // Le McpServer valide déjà les arguments contre la shape zod avant
        // d'appeler ce handler. Ce Check TypeBox reste la validation de
        // référence : il porte sur le schéma d'origine, donc il rattrape un
        // écart de conversion (mcp_schema.ts) au lieu de laisser un argument
        // douteux descendre dans les primitives, où il ressortirait en erreur
        // moteur illisible.
        if (!Check(tool.parameters, args)) {
          const details = Errors(tool.parameters, args)
            .map((e) => `${e.instancePath || '/'} ${e.message}`)
            .slice(0, 5)
            .join(' ; ')
          return {
            content: [{ type: 'text', text: `Arguments invalides pour ${tool.name}: ${details}` }],
            isError: true,
          }
        }
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
            ...(app ? { structuredContent: asStructuredContent(result.details) } : {}),
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
    }
  })
}
