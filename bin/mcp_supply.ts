/*
|--------------------------------------------------------------------------
| MCP supply-board — serveur stdio autonome (issue #80, Lot 1)
|--------------------------------------------------------------------------
|
| Expose les 17 primitives agent de l'app (getVerdict, descendreBOM,
| getPromise, listerOF, listerRuptures, listerCommandesStatut, getStock,
| getCharge, …) en serveur MCP consommable hors de l'app (Claude Code,
| Claude Desktop, autres agents) — sur le modèle du MCP SageX3.
|
| Principe non négociable : c'est une **façade** sur le même code que le
| copilote /copilote. Les 17 tools viennent de `buildAgentTools()` (source de
| vérité unique), qui orchestre les moteurs uniques via boardDataset. Aucune
| réimplémentation — parité structurelle app vs MCP.
|
| Boot Adonis en mode **console** (Ignitor) : pas de serveur HTTP, mais
| conteneur monté (cache @adonisjs/cache + Lucid + env + X3). Même séquence
| que `AceProcess.handle` pour une commande ace `startApp: true`.
|
| Cache mémoire par défaut (CACHE_STORE=memory) — bootable sur un PC vierge
| sans Redis. Redis automatique si CACHE_STORE=redis.
|
| Usage direct :
|   npm run mcp:start
| Enregistrement Claude Code :
|   claude mcp add supply-board -- node --import @poppinss/ts-exec bin/mcp_supply.ts
|
| Note transport : stdout appartient au JSON-RPC MCP — RIEN d'autre ne doit
| y être écrit. `SUPPLY_MCP=1` (positionné ci-dessous) redirige le logger
| Adonis vers stderr (config/logger.ts). Tous nos logs vont sur stderr.
*/

// DOIT être positionné avant tout import Adonis — le logger se branche au boot.
process.env.SUPPLY_MCP = '1'

await import('reflect-metadata')
const { Ignitor, prettyPrintError } = await import('@adonisjs/core')
// Imports profond via sous-chemins explicites (.js requis) : le export racine
// "." du SDK pointe vers un index.js inexistant (bug connu du SDK 1.x).
const { Server } = await import('@modelcontextprotocol/sdk/server/index.js')
const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js')
const {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} = await import('@modelcontextprotocol/sdk/types.js')
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'

/**
 * Pendant le boot Adonis, `start/env.ts` importe `@dotenvx/dotenvx/config` qui
 * écrit sa bannière `⟐ injected env …` sur **stdout** (logger.successv, niveau
 * info par défaut — aucun flag pour le taire via config()). Or stdout appartient
 * au transport JSON-RPC MCP : toute ligne non-JSON-RPC est une violation du
 * protocole (les clients stricts la rejettent).
 *
 * Fix : rediriger stdout → stderr le temps du boot (init/boot/start), puis
 * restaurer stdout juste avant `server.connect(transport)`. Le transport ne
 * commence à écrire qu'après connect() → aucun impact sur le JSON-RPC.
 */
const realStdoutWrite = process.stdout.write.bind(process.stdout)
process.stdout.write = ((chunk: any, ...rest: any[]) => process.stderr.write(chunk, ...rest)) as any

const APP_ROOT = new URL('../', import.meta.url)
const IMPORTER = (filePath: string) => {
  if (filePath.startsWith('./') || filePath.startsWith('../')) {
    return import(new URL(filePath, APP_ROOT).href)
  }
  return import(filePath)
}

const SERVER_INFO = { name: 'supply-board', version: '1.0.0' } as const

async function main() {
  // ─── 1. Boot Adonis "console" (conteneur monté, pas de HTTP) ───
  // Reproduit la séquence de AceProcess.handle pour une commande `startApp:true`
  // (cf. bin/console.ts, commands/sync_static_data.ts). Les providers (cache,
  // lucid, x3, redis) sont env-agnostiques ; cache_preheat_provider est gardé
  // web-only (startsWith('web')).
  const ignitor = new Ignitor(APP_ROOT, { importer: IMPORTER }).tap((app) => {
    app.booting(async () => {
      await import('#start/env')
    })
    app.listen('SIGTERM', () => app.terminate())
    app.listenIf(app.managedByPm2, 'SIGINT', () => app.terminate())
  })

  const app = ignitor.createApp('console')
  await app.init() // valide env (X3 creds, APP_KEY) — erreur propre si absent
  await app.boot() // providers : cache, lucid, x3, redis
  await app.start(() => {}) // résout les preloads (routes/kernel/validator — safe en console)

  // ─── 2. Construction des tools (source de vérité unique) ───
  const { buildAgentTools } = await import('#services/agent/tools')
  const { adaptPiToolsForMcp } = await import('#services/agent/mcp_adapter')
  const tools = adaptPiToolsForMcp(buildAgentTools())
  const byName = new Map(tools.map((t) => [t.name, t]))

  if (tools.length === 0) {
    console.error('[supply-board MCP] Aucun tool exposé — buildAgentTools() a retourné []')
    process.exit(1)
  }

  // ─── 3. Serveur MCP low-level (accepte du JSON Schema brut → TypeBox direct) ───
  // Low-level plutôt que McpServer.tool() : cette dernière exige du Zod
  // (ZodRawShapeCompat), le low-level accepte le JSON Schema que TypeBox produit
  // déjà — zéro traduction, zéro dépendance Zod.
  const server = new Server(SERVER_INFO, {
    capabilities: { tools: {} },
  })

  server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  }))

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const name = request.params.name
    const tool = byName.get(name)
    if (!tool) {
      return {
        content: [{ type: 'text' as const, text: `Tool inconnu: ${name}` }],
        isError: true,
      } satisfies CallToolResult
    }
    // L'adapter retourne un payload compatible CallToolResult (content + isError).
    // Le cast explicite documente la compatibilité de forme — pi `AgentToolResult.content`
    // et MCP `CallToolResult.content` partagent le même contrat (TextContent|ImageContent).
    return (await tool.handler(
      (request.params.arguments ?? {}) as Record<string, unknown>,
      undefined
    )) as CallToolResult
  })

  // ─── 4. Connexion stdio (bloquant jusqu'à déconnexion client) ───
  // Restaure stdout : le boot est fini, la bannière dotenvx a été redirigée
  // vers stderr. Le transport MCP reprend la main sur stdout pour le JSON-RPC.
  process.stdout.write = realStdoutWrite

  const transport = new StdioServerTransport()
  await server.connect(transport)

  console.error(
    `[supply-board MCP] ${tools.length} tools exposés sur stdio: ${tools.map((t) => t.name).join(', ')}`
  )
}

main().catch((error) => {
  // Critère done #80 : erreurs propres si X3 injoignable / creds absents.
  // prettyPrintError écrit sur stderr — n'altère pas le transport stdout.
  process.exitCode = 1
  prettyPrintError(error)
})
