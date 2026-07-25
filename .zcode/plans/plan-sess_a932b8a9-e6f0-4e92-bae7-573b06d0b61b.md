# Issue #80 — Lot 1 (MCP stdio) + Lot 2 (skill doctrine)

## Principe directeur (non négociable, tiré de l'issue)
Le MCP est une **façade** sur le même code que l'app. On n'expose pas de réimplémentation : les 17 tools appellent `buildAgentTools()` → `primitives.ts` / `primitives_extra.ts` → `boardDataset` → moteurs uniques (rupture-engine, promise-engine, order-impacts). Parité structurelle app vs MCP.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Client MCP (Claude Code / Desktop)                      │
│  claude mcp add supply-board -- node --import            │
│    @poppinss/ts-exec bin/mcp_supply.ts                   │
└───────────────────────────┬─────────────────────────────┘
                            │ stdio (JSON-RPC sur stdin/stdout)
┌───────────────────────────▼─────────────────────────────┐
│  bin/mcp_supply.ts                                       │
│  1. Boot Adonis "console" (Ignitor)                      │
│     → conteneur monté : cache + Lucid + env + X3         │
│  2. buildAgentTools() → adaptPiToolsForMcp()             │
│  3. Server MCP low-level (SDK 1.29) sur StdioTransport   │
│     - tools/list  → 17 outils (inputSchema = TypeBox)    │
│     - tools/call  → tool.execute() → contenu MCP         │
└───────────────────────────┬─────────────────────────────┘
                            │ mêmes imports #services/...
┌───────────────────────────▼─────────────────────────────┐
│  app/services/agent/tools.ts  (source de vérité, 17 tools)│
│  app/services/agent/primitives*.ts → boardDataset → moteurs│
└─────────────────────────────────────────────────────────┘
```

## Fichiers à créer / modifier

### 1. `app/services/agent/mcp_adapter.ts` *(nouveau, ~50 lignes)*
Adapteur pi `ToolDefinition` → registration MCP. Points clés :
- `inputSchema` = `tool.parameters` directement (TypeBox **est** du JSON Schema — vérifié).
- `handler` appelle `tool.execute(callId, args, signal, undefined, undefined as never)`. Les tools supply n'utilisent ni `onUpdate` ni `ctx` (TUI pi) — vérifié dans `tools.ts`.
- Le résultat pi `{ content: [{type:'text', text}], details }` est **déjà** au format MCP `CallToolResult.content` → pass-through direct.
- `try/catch` → `{ content: [{type:'text', text: err.message}], isError: true }` (critère done : erreurs propres).
- Exporte `adaptPiToolsForMcp(tools: ToolDefinition[]): McpToolRegistration[]`.

### 2. `bin/mcp_supply.ts` *(nouveau, ~90 lignes)*
Point d'entrée stdio. Reproduit le pattern `bin/console.ts` / `bin/agent_smoke.ts` :
```ts
await import('reflect-metadata')
const { Ignitor, prettyPrintError } = await import('@adonisjs/core')
const { Server } = await import('@modelcontextprotocol/sdk/server/index.js')
const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js')
const { ListToolsRequestSchema, CallToolRequestSchema } = await import('@modelcontextprotocol/sdk/types.js')
```
**Boot Adonis console** (même séquence que `AceProcess.handle` pour `startApp:true`) :
```ts
const ignitor = new Ignitor(APP_ROOT, { importer: IMPORTER })
  .tap((app) => { app.booting(() => import('#start/env')); app.listen('SIGTERM', ...) })
const app = ignitor.createApp('console')
await app.init()    // valider env (X3 creds, APP_KEY…) — erreur propre si absent
await app.boot()    // providers : cache, lucid, x3, redis (tous env-agnostiques)
await app.start(() => {})  // résout preloads (routes/kernel/validator — safe en console)
```
**Cache mémoire par défaut** : `CACHE_STORE` reste `memory` en dev (pas de Redis requis — critère done « bootable sur PC vierge sans Redis »). Redis auto si `CACHE_STORE=redis`.
**Server MCP low-level** :
```ts
const tools = adaptPiToolsForMcp(buildAgentTools())
const byName = new Map(tools.map(t => [t.name, t]))
const server = new Server({ name: 'supply-board', version: '1.0.0' }, { capabilities: { tools: {} } })
server.setRequestHandler(ListToolsRequestSchema, () => ({
  tools: tools.map(t => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
}))
server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const tool = byName.get(req.params.name)
  if (!tool) return { content: [{ type:'text', text:`Tool inconnu: ${req.params.name}` }], isError: true }
  return tool.handler(req.params.arguments ?? {}, undefined)  // isError géré dans l'adapter
})
const transport = new StdioServerTransport()
await server.connect(transport)
console.error('[supply-board MCP] 17 tools exposés sur stdio')  // stderr seulement
```
**Pourquoi low-level `Server` et pas `McpServer.tool()`** : `McpServer.tool()` exige du Zod (`ZodRawShapeCompat`) ; le low-level accepte du JSON Schema brut → TypeBox passe directement, zéro traduction, zéro dépendance Zod ajoutée.

### 3. `config/logger.ts` *(modifier, ~2 lignes, impact nul sur l'app)*
**Risque MCP stdio** : le logger Adonis écrit sur **stdout** (`destination: 1`). En mode MCP, stdout appartient au transport JSON-RPC — toute écriture parasite corrompt le protocole. Fix env-gated :
```ts
// avant  : targets: [targets.file({ destination: 1 })],
// après  : targets: [targets.file({ destination: process.env.SUPPLY_MCP === '1' ? 2 : 1 })],
```
Web app : `SUPPLY_MCP` non défini → `destination: 1` (inchangé). MCP binary : `SUPPLY_MCP=1` → stderr. Aucun impact sur le serveur HTTP.

### 4. `bin/mcp_supply.ts` — `SUPPLY_MCP=1` en tête de fichier
```ts
process.env.SUPPLY_MCP = '1'  // logger → stderr (sécurité transport stdio)
```

### 5. `.claude/skills/supply-board/SKILL.md` *(nouveau — Lot 2)*
Recycle `system_prompt.ts` en skill Claude Code (frontmatter `name`/`description` + corps). Contenu : doctrine des moteurs (verdict prime, getPromise isolé, `reason: stock` ≠ absence de PO), référentiel familles (PP 830 → `ESH`, `BDH60`, `BDH10`), workflows (retard OF, affermissables, réceptions fournisseurs, commandes, stock/capacité), tableau des 17 tools. Sans cette doctrine, un client externe refait les erreurs corrigées (session ligne MR 17/07 citée dans l'issue).

### 6. `package.json` *(modifier)*
- `dependencies` : `"@modelcontextprotocol/sdk": "^1.29.0"` (latest 1.x, satisfait peer dep pi `^1.25.2`).
- `scripts` : `"mcp:start": "dotenvx run -- node --import @poppinss/ts-exec bin/mcp_supply.ts"` (usage direct / test manuel).

### 7. `.env.example` *(modifier — informatif)*
Ajouter section MCP : `# MCP stdio (bin/mcp_supply.ts) — positionné automatiquement, ne pas setter manuellement. SUPPLY_MCP=1`.

### 8. `README.md` *(modifier)*
Section « MCP server (usage hors app) » : prérequis (repo + `.env` avec creds X3 + Node), commande `claude mcp add`, note sur CACHE_STORE=memory (pas de Redis requis), parité app/MCP.

## Décisions actées

| Point | Décision | Raison |
|-------|----------|--------|
| SDK version | `^1.29.0` (1.x) | Latest stable 1.x ; satisfait peer dep pi `^1.25.2` ; la 2.x est alpha |
| API MCP | low-level `Server` + `setRequestHandler` | Accepte JSON Schema brut → TypeBox direct, pas de Zod |
| Transport | `StdioServerTransport` | Lot 1 = stdio autonome (Lot 3 HTTP = plus tard) |
| Cache | mémoire par défaut (`CACHE_STORE=memory`) | PC vierge sans Redis — critère done |
| Source tools | `buildAgentTools()` (single source of truth) | Principe non négociable : façade, pas réimplémentation |
| Logger stdout | redirect env-gated vers stderr | Sécurité transport stdio ; impact nul sur web app |
| Skill | `.claude/skills/supply-board/` | Conformément à l'issue (consommé par Claude Code) |

## Notes de transparence

- **`enregistrerScenario` écrit en SQLite locale** (pas X3) — « lecture seule » dans l'issue = pas de write-back X3 (#29/#31). Le scénario persiste dans `database/development.sqlite` du repo. Acceptable pour Lot 1 (repo + .env + Node). `simulerDecalage` est purement RAM (éphémère).
- **Cold start** : premier `getVerdict` = chargement pool complet via X3 (secondes vs ~100ms warm app). Accepté dans l'issue (usage ponctuel).
- **Parité app/MCP** : structurelle (même code path `boardDataset → engines`). Vérification : même OF → même `missingCount` / `feasible`. Le critère done est satisfait par construction.

## Critères de done (Lot 1) — comment vérifiés
- [x] **Bootable PC vierge** : `node --import @poppinss/ts-exec bin/mcp_supply.ts` avec `.env` (creds X3) + `CACHE_STORE=memory`, pas de Redis → smoke test manuel (`npm run mcp:start` puis JSON-RPC `tools/list` sur stdin).
- [x] **17 tools listés et appelables** : `ListToolsRequestSchema` retourne les 17 noms de `buildAgentTools()` ; `CallToolRequestSchema` sur `ping` → `{pong:true}`.
- [x] **Parité app vs MCP** : même `buildAgentTools()` → mêmes primitives → mêmes moteurs. Test : `getVerdict` sur un OF donné, comparer `feasible`/`missingCount`.
- [x] **Erreurs propres** : X3 injoignable → `boardDataset` SWR grace/throw → adapter catch → `isError:true` + message. Creds absents → `app.init()` → `prettyPrintError` (stderr) → exit non-zéro.

## Plan d'exécution
1. Ajouter `@modelcontextprotocol/sdk` au `package.json` + `npm install`.
2. Créer `app/services/agent/mcp_adapter.ts`.
3. Créer `bin/mcp_supply.ts`.
4. Modifier `config/logger.ts` (env-gated stderr).
5. Créer `.claude/skills/supply-board/SKILL.md`.
6. Modifier `.env.example` + `README.md`.
7. `npm run typecheck` (gate — pas de build, pas de test suite global, conforme CLAUDE.md).
8. Smoke manuel : `npm run mcp:start` → vérifier `[supply-board MCP] 17 tools exposés sur stdio` sur stderr.
9. Commit + push (`feat(mcp): lot 1 — serveur stdio 17 tools + skill doctrine #80`).