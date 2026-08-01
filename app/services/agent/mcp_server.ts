/**
 * Montage du serveur MCP supply-board — `McpServer` high-level + MCP Apps (issue #89).
 *
 * Ce module ne connaît AUCUN transport : il rend un `McpServer` prêt à être branché
 * sur stdio (`bin/mcp_supply.ts`, pour Claude Desktop / Claude Code) ou sur un
 * `InMemoryTransport` (lot 2 : le backend copilote devient client MCP in-process).
 * C'est ce découplage qui fait que /copilote et Claude Desktop consommeront la même
 * chose par le même chemin — le protocole — sans branche de code spécifique.
 *
 * ── Pourquoi le high-level `McpServer` alors que le low-level marchait ──
 * `registerAppTool` / `registerAppResource` de `@modelcontextprotocol/ext-apps`
 * n'existent que sur le high-level. Prix à payer : `inputSchema` n'accepte que du
 * zod, d'où la conversion TypeBox → zod (cf. mcp_schema.ts). Gain : la déclaration
 * des apps passe par l'extension officielle, pas par un `_meta` écrit à la main.
 *
 * ── Gate de capacité ──
 * Un client qui n'annonce pas l'extension `io.modelcontextprotocol/ui` retrouve
 * exactement le comportement d'avant #89 : `_meta.ui` retiré des tools et
 * `structuredContent` non émis. Pas de demi-mesure où le client reçoit des champs
 * qu'il ne sait pas lire.
 */

import { readFile } from 'node:fs/promises'
import { McpServer, type RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js'
import {
  registerAppResource,
  registerAppTool,
  getUiCapability,
  RESOURCE_MIME_TYPE,
} from '@modelcontextprotocol/ext-apps/server'
import { buildAgentTools } from '#services/agent/tools'
import { adaptPiToolsForMcp, type McpToolRegistration } from '#services/agent/mcp_adapter'
import { MCP_APPS, readMcpAppHtml } from '#services/agent/mcp_apps'

/** Journalisation : jamais stdout — il appartient au JSON-RPC en transport stdio. */
export type McpLogger = (message: string) => void

export interface SupplyMcpServer {
  server: McpServer
  /** Tools exposés, dans l'ordre de `buildAgentTools()`. */
  toolNames: string[]
  /** Apps MCP déclarées en resources `ui://`. */
  appUris: string[]
}

/** Métadonnée UI d'une resource app : aucun domaine réseau autorisé. */
const APP_RESOURCE_UI_META = {
  ui: {
    // Objet CSP vide = aucun domaine déclaré = aucune requête réseau permise.
    // Les apps sont des bundles autonomes (JS/CSS inlinés) alimentés par le
    // protocole ; elles n'ont rien à aller chercher dehors.
    csp: {},
    // Les graphes s'affichent mieux détachés du fil de discussion.
    prefersBorder: true,
  },
} as const

async function packageVersion(): Promise<string> {
  const pkg = JSON.parse(await readFile(new URL('../../../package.json', import.meta.url), 'utf8'))
  return String(pkg.version ?? '0.0.0')
}

/**
 * Construit le serveur MCP : les tools agent + les apps déclarées dans MCP_APPS.
 *
 * @throws si `buildAgentTools()` rend une liste vide (façade cassée) ou si un schéma
 *         de tool n'est pas convertible en zod — les deux doivent tomber au boot,
 *         pas au premier appel client.
 */
export async function createSupplyMcpServer(
  options: { log?: McpLogger } = {}
): Promise<SupplyMcpServer> {
  const log = options.log ?? ((m: string) => console.error(m))

  const registrations = adaptPiToolsForMcp(buildAgentTools())
  if (registrations.length === 0) {
    throw new Error('Aucun tool exposé — buildAgentTools() a retourné []')
  }

  const server = new McpServer({ name: 'supply-board', version: await packageVersion() })

  /**
   * Vrai jusqu'à preuve du contraire : tant que le client n'a pas répondu, on
   * suppose qu'il sait lire les apps. `oninitialized` tranche définitivement.
   */
  let uiEnabled = true
  /** Tools porteurs d'une app, à dégrader si le client ne sait pas les afficher. */
  const appTools: RegisteredTool[] = []

  for (const reg of registrations) {
    const registered = registerToolForMcp(server, reg, () => uiEnabled)
    if (reg.app) appTools.push(registered)
  }

  for (const app of MCP_APPS) {
    registerAppResource(
      server,
      app.title,
      app.resourceUri,
      {
        description: app.description,
        mimeType: RESOURCE_MIME_TYPE,
        // `_meta.ui` ici sert de valeur par défaut visible dès `resources/list` :
        // l'hôte peut valider la CSP à la connexion, avant tout appel de tool.
        _meta: APP_RESOURCE_UI_META,
      },
      async () => ({
        contents: [
          {
            uri: app.resourceUri,
            mimeType: RESOURCE_MIME_TYPE,
            text: await readMcpAppHtml(app),
            // Répété sur le content item : c'est la valeur qui fait foi côté hôte
            // (elle prime sur celle de `resources/list`).
            _meta: APP_RESOURCE_UI_META,
          },
        ],
      })
    )
  }

  // Gate de capacité : le client vient d'annoncer ce qu'il sait faire.
  server.server.oninitialized = () => {
    const ui = getUiCapability(server.server.getClientCapabilities())
    uiEnabled = ui?.mimeTypes?.includes(RESOURCE_MIME_TYPE) ?? false
    if (uiEnabled) {
      log(`[supply-board MCP] client MCP Apps détecté — ${MCP_APPS.length} app(s) disponibles`)
      return
    }
    // Client sans MCP Apps : on retire le lien vers l'UI pour ne pas lui annoncer
    // une capacité qu'il n'a pas. `update` émet un `tools/list_changed`, que les
    // clients savent ignorer s'ils ne suivent pas les listes dynamiques.
    for (const tool of appTools) tool.update({ _meta: {} })
    log(
      "[supply-board MCP] client sans MCP Apps — apps désactivées (texte seul, comportement d'avant #89)"
    )
  }

  return {
    server,
    toolNames: registrations.map((r) => r.name),
    appUris: MCP_APPS.map((a) => a.resourceUri),
  }
}

/** Enregistre un tool, avec son app quand il en a une. */
function registerToolForMcp(
  server: McpServer,
  reg: McpToolRegistration,
  uiEnabled: () => boolean
): RegisteredTool {
  const callback = async (args: Record<string, unknown>, extra: { signal?: AbortSignal }) => {
    const result = await reg.handler(args ?? {}, extra?.signal)
    // Gate de capacité, versant données : pas d'app affichable → pas de payload
    // structuré. Le client retrouve exactement la réponse d'avant #89.
    if (!uiEnabled() && result.structuredContent) {
      const textOnly = { ...result }
      delete textOnly.structuredContent
      return textOnly
    }
    return result
  }

  if (reg.app) {
    return registerAppTool(
      server,
      reg.name,
      {
        title: reg.app.title,
        description: reg.description,
        inputSchema: reg.inputShape,
        // Le lien tool → UI, seul champ qui fait d'un tool une app.
        _meta: { ui: { resourceUri: reg.app.resourceUri } },
      },
      callback as never
    )
  }

  return server.registerTool(
    reg.name,
    { description: reg.description, inputSchema: reg.inputShape },
    callback as never
  )
}
