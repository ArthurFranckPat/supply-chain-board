/**
 * Client MCP in-process du copilote — issue #89, lot 2.
 *
 * Le backend /copilote ne branche plus les tools directement sur pi : il devient
 * **client MCP** du serveur monté par `createSupplyMcpServer()`, relié par
 * `InMemoryTransport` (aucun process enfant, aucune socket, aucune latence).
 *
 * Ce que ça change concrètement, et c'est tout l'objet de #89 : chaque appel de
 * tool du chat traverse le protocole, donc le résultat rapporte ce que le
 * protocole transporte — `structuredContent` et `_meta.ui.resourceUri`. Sans ce
 * détour, /copilote n'aurait aucun moyen de savoir qu'un tool sait s'afficher en
 * app, et il aurait fallu un second registre côté front (exactement ce qui a été
 * refusé).
 *
 * Corollaire : Claude Desktop (transport stdio) et /copilote (transport mémoire)
 * consomment le MÊME serveur, le même montage, les mêmes apps.
 *
 * `@earendil-works/pi-coding-agent` n'a aucun support de client MCP (vérifié :
 * zéro occurrence dans le dist) — d'où cet adaptateur, exact inverse de
 * `mcp_adapter.ts`.
 */

import { Type } from 'typebox'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server'
import type { CallToolResult, ReadResourceResult, Tool } from '@modelcontextprotocol/sdk/types.js'
import { defineTool, type ToolDefinition } from '@earendil-works/pi-coding-agent'

import { createSupplyMcpServer } from '#services/agent/mcp_server'

/** Extension MCP Apps annoncée par le copilote (SEP-1865). */
const UI_EXTENSION_ID = 'io.modelcontextprotocol/ui'

/** Ce qu'une app a besoin de savoir pour s'afficher, tiré du `_meta` du tool. */
export interface AgentToolUi {
  /** Resource `ui://…` à charger dans l'iframe hôte. */
  resourceUri: string
}

export interface SupplyMcpConnection {
  client: Client
  /** `tools/list` tel que le serveur l'annonce (avec `_meta`). */
  tools: Tool[]
  close: () => Promise<void>
}

let connection: Promise<SupplyMcpConnection> | null = null

/**
 * Connexion MCP du process (singleton).
 *
 * Une seule paire client/serveur pour toutes les conversations : le serveur est
 * sans état (les tools tapent les caches board), et un montage par requête
 * rebâtirait 18 tools + relirait package.json à chaque message.
 */
export function getSupplyMcpConnection(): Promise<SupplyMcpConnection> {
  if (!connection) {
    connection = connectSupplyMcp().catch((error) => {
      // Sans ce reset, un échec de boot (X3 absent, tool cassé) resterait mis en
      // cache pour la vie du process et le chat serait mort jusqu'au restart.
      connection = null
      throw error
    })
  }
  return connection
}

/** Ferme la connexion (tests). */
export async function resetSupplyMcpConnection(): Promise<void> {
  const current = connection
  connection = null
  if (current) {
    await current.then((c) => c.close()).catch(() => {})
  }
}

async function connectSupplyMcp(): Promise<SupplyMcpConnection> {
  const { server } = await createSupplyMcpServer()
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()

  const client = new Client(
    { name: 'supply-board-copilote', version: '1.0.0' },
    {
      capabilities: {
        // Annonce MCP Apps : c'est ce qui débloque `_meta.ui` et
        // `structuredContent` côté serveur (gate de `mcp_server.ts`).
        // `extensions` n'est pas encore dans le type `ClientCapabilities` du SDK
        // (SEP-1724 en attente) — d'où le cast, pas d'un champ inventé.
        extensions: {
          [UI_EXTENSION_ID]: { mimeTypes: [RESOURCE_MIME_TYPE] },
        },
      } as never,
    }
  )

  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
  const { tools } = await client.listTools()

  return {
    client,
    tools,
    close: async () => {
      await client.close().catch(() => {})
      await server.close().catch(() => {})
    },
  }
}

/* ────────────────────────────────────────────────────────────────────────────
 * Registre `toolCallId → app`
 *
 * `AgentToolResult` de pi n'a que `content` et `details` : aucun emplacement
 * pour dire « ce résultat s'affiche dans telle app ». Plutôt que de polluer
 * `details` (que l'inspecteur affiche tel quel) avec un champ de protocole, le
 * lien voyage à côté, indexé par `toolCallId` — que l'événement pi
 * `tool_execution_end` porte déjà.
 * ──────────────────────────────────────────────────────────────────────────── */

const TOOL_UI_CAP = 200
const toolUiByCallId = new Map<string, AgentToolUi>()

function recordToolUi(toolCallId: string, ui: AgentToolUi): void {
  // Borne dure : un appel dont personne ne lit le résultat (abort client) ne doit
  // pas faire grossir la Map indéfiniment.
  if (toolUiByCallId.size >= TOOL_UI_CAP) {
    const oldest = toolUiByCallId.keys().next()
    if (!oldest.done) toolUiByCallId.delete(oldest.value)
  }
  toolUiByCallId.set(toolCallId, ui)
}

/** Lit et retire le lien app d'un appel de tool. */
export function takeToolUi(toolCallId: string): AgentToolUi | undefined {
  const ui = toolUiByCallId.get(toolCallId)
  if (ui) toolUiByCallId.delete(toolCallId)
  return ui
}

/* ──────────────────────────────────────────────────────────────────────────── */

/** `_meta.ui.resourceUri` d'un tool, forme canonique ou legacy. */
function uiResourceUri(tool: Tool): string | undefined {
  const meta = tool._meta as
    { 'ui'?: { resourceUri?: string }; 'ui/resourceUri'?: string } | undefined
  const uri = meta?.ui?.resourceUri ?? meta?.['ui/resourceUri']
  return typeof uri === 'string' && uri.startsWith('ui://') ? uri : undefined
}

/** Un tool réservé aux apps ne doit pas être proposé au modèle. */
function isAppOnly(tool: Tool): boolean {
  const visibility = (tool._meta as { ui?: { visibility?: unknown } } | undefined)?.ui?.visibility
  return Array.isArray(visibility) && !visibility.includes('model')
}

/** Payload métier d'un résultat MCP : `structuredContent`, sinon le texte reparsé. */
function toDetails(result: CallToolResult): unknown {
  if (result.structuredContent !== undefined) return result.structuredContent
  const texts = (result.content ?? [])
    .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
    .map((c) => c.text)
  if (texts.length === 0) return null
  const joined = texts.join('\n')
  try {
    return JSON.parse(joined)
  } catch {
    return joined
  }
}

/**
 * `tools/list` MCP → `ToolDefinition[]` pi.
 *
 * Le schéma d'entrée annoncé par le serveur est réutilisé tel quel via
 * `Type.Unsafe` : TypeBox 1.x valide directement du JSON Schema brut (vérifié —
 * requis manquant, mauvais type et description sont bien pris en compte). Aucun
 * second convertisseur, donc aucune dérive possible entre ce que le serveur
 * annonce et ce que pi valide.
 */
export function adaptMcpToolsForPi(conn: SupplyMcpConnection): ToolDefinition[] {
  return conn.tools
    .filter((tool) => !isAppOnly(tool))
    .map((tool) => {
      const resourceUri = uiResourceUri(tool)
      return defineTool({
        name: tool.name,
        label: tool.title ?? tool.name,
        description: tool.description ?? '',
        parameters: Type.Unsafe(tool.inputSchema as Record<string, unknown>),
        execute: async (toolCallId, params, signal) => {
          let result: CallToolResult
          try {
            result = (await conn.client.callTool(
              { name: tool.name, arguments: (params ?? {}) as Record<string, unknown> },
              undefined,
              { signal }
            )) as CallToolResult
          } catch (error) {
            // Erreur protocole (args refusés par le serveur, transport coupé) :
            // pi attend un throw pour marquer l'appel en erreur, mais le message
            // brut du SDK (« MCP error -32602: … ») n'aide personne côté chat.
            const message = error instanceof Error ? error.message : String(error)
            throw new Error(`Appel MCP ${tool.name} refusé : ${message}`)
          }

          const details = toDetails(result)

          if (result.isError) {
            // Le SDK client transforme aussi les erreurs de protocole (arguments
            // refusés par la validation serveur) en résultat `isError` — d'où le
            // préfixe : sans lui le chat affiche un « MCP error -32602 » orphelin.
            const text = (result.content ?? [])
              .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
              .map((c) => c.text)
              .join('\n')
            throw new Error(`Tool ${tool.name} en erreur : ${text || 'raison non précisée'}`)
          }

          // L'app est déclarée par le TOOL (pas par l'appel) : c'est le serveur
          // qui décide, le front ne fait que suivre.
          if (resourceUri) recordToolUi(toolCallId, { resourceUri })

          return {
            content: result.content as never,
            details,
          }
        },
      })
    })
}

/** Tools du copilote, servis par le protocole MCP. */
export async function buildMcpBackedTools(): Promise<ToolDefinition[]> {
  return adaptMcpToolsForPi(await getSupplyMcpConnection())
}

/**
 * Lit une resource UI (`ui://…`) par le protocole.
 *
 * Utilisé par la route qui sert les apps à l'hôte /copilote (lot 3) : le HTML ne
 * vient jamais du disque côté contrôleur, toujours de `resources/read`, pour que
 * l'hôte web et Claude Desktop voient exactement la même chose.
 */
export async function readMcpResource(uri: string): Promise<ReadResourceResult> {
  const { client } = await getSupplyMcpConnection()
  return client.readResource({ uri })
}
