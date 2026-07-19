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

// Version lue depuis package.json : les payloads `_source` deviennent un
// contrat public (issue #80) → la version exposée doit suivre le package,
// pas une constante qu'on oublie de bumper.
const { readFile } = await import('node:fs/promises')
const PKG_VERSION: string = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
  .version

const SERVER_INFO = { name: 'supply-board', version: PKG_VERSION } as const

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

  // ─── 1bis. SQLite locale prête (critère « PC vierge » #80) ───
  // Scénarios + référentiels statiques (static_articles, local_menus, …) vivent
  // dans tmp/db.sqlite3. Sur un PC vierge, sans migration : rechercherArticle
  // renvoie [] SILENCIEUSEMENT (catch → [] dans boardDataset.getArticles) et
  // enregistrerScenario plante. Auto-migration idempotente (= migration:run)
  // + warning explicite si les référentiels ne sont pas peuplés (sync:x3).
  try {
    const { mkdir } = await import('node:fs/promises')
    await mkdir(app.tmpPath(), { recursive: true }) // sqlite3 ne crée pas le dossier parent
    const db = await app.container.make('lucid.db')
    const { MigrationRunner } = await import('@adonisjs/lucid/migration')
    const migrator = new MigrationRunner(db, app, {
      direction: 'up',
      connectionName: db.primaryConnectionName,
    })
    await migrator.run()
    // MigrationRunner.run() ne throw JAMAIS : il avale l'erreur dans
    // `migrator.error` (lucid runner.js). Sans ce rethrow, une migration
    // cassée passe silencieusement et le catch ci-dessous ne fire pas.
    if (migrator.error) throw migrator.error
    const applied = Object.values(migrator.migratedFiles).filter(
      (f) => f.status === 'completed'
    ).length
    if (applied > 0) {
      console.error(`[supply-board MCP] SQLite locale : ${applied} migration(s) appliquée(s)`)
    }
  } catch (migrationError) {
    // Dégradé mais fonctionnel : les tools X3 restent utilisables ; seuls les
    // scénarios et référentiels locaux seront KO (erreurs propres à l'appel).
    const msg = migrationError instanceof Error ? migrationError.message : String(migrationError)
    console.error(
      `[supply-board MCP] ⚠ Auto-migration SQLite impossible (${msg}) — lancer "node ace migration:run"`
    )
  }
  try {
    const { default: StaticArticle } = await import('#models/static_article')
    const { default: LocalMenu } = await import('#models/local_menu')
    const articles = await StaticArticle.query().count('* as total').first()
    const menus = await LocalMenu.query().count('* as total').first()
    const missing: string[] = []
    if (Number(articles?.$extras.total ?? 0) === 0) missing.push('static_articles (sync:x3)')
    if (Number(menus?.$extras.total ?? 0) === 0) missing.push('local_menus (sync:local-menus)')
    if (missing.length > 0) {
      console.error(
        `[supply-board MCP] ⚠ Référentiels vides : ${missing.join(', ')} — ` +
          'sans eux rechercherArticle muet, verdicts dégradés, labels de statuts absents'
      )
    }
  } catch {
    // Tables absentes → le warning migration ci-dessus couvre déjà le diagnostic.
  }

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

  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
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
    // extra.signal : annulation côté client. Transmis jusqu'à execute(), mais
    // les tools supply (tools.ts) ne consomment pas encore le signal — un appel
    // X3 en cours ira au bout. Effectif le jour où les primitives le brancheront.
    return (await tool.handler(
      (request.params.arguments ?? {}) as Record<string, unknown>,
      extra.signal
    )) as CallToolResult
  })

  // ─── 4. Connexion stdio (bloquant jusqu'à déconnexion client) ───
  // Restaure stdout : le boot est fini, la bannière dotenvx a été redirigée
  // vers stderr. Le transport MCP reprend la main sur stdout pour le JSON-RPC.
  process.stdout.write = realStdoutWrite

  const transport = new StdioServerTransport()
  // Client parti (stdin EOF) → terminer. Le StdioServerTransport du SDK n'écoute
  // pas 'end' (onclose ne fire jamais sur EOF) ; sans ce hook le process reste
  // vivant (pool Lucid + caches gardent l'event loop) : zombie si le client ne
  // SIGTERM pas. terminate() ferme les providers ; exit force les handles restants.
  process.stdin.once('end', async () => {
    console.error('[supply-board MCP] stdin fermé — arrêt')
    await app.terminate().catch(() => {})
    process.exit(0)
  })
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
