/**
 * Contrat de la couche MCP Apps (issue #89, lot 1).
 *
 * Ce que ces tests verrouillent :
 *  - la conversion TypeBox → zod, seul chemin possible vers le `McpServer`
 *    high-level, ne perd ni l'optionalité ni les descriptions, et **lève** au lieu
 *    de dégrader un schéma qu'elle ne sait pas traduire ;
 *  - tous les tools réels passent cette conversion (une régression y casserait
 *    le boot du serveur MCP, pas un appel isolé) ;
 *  - chaque app déclarée a bien son artefact HTML commité — sans ce contrôle,
 *    l'oubli de `npm run mcp:apps` ne se voit qu'à l'exécution, en iframe vide ;
 *  - `structuredContent` n'est émis que par les tools qui ont une app — c'est ce
 *    qui garantit qu'un tool sans UI répond exactement comme avant #89.
 */

import { test } from '@japa/runner'
import { Type } from 'typebox'
import { Check } from 'typebox/value'
import { defineTool } from '@earendil-works/pi-coding-agent'
import { jsonSchemaToZodShape } from '#services/agent/mcp_schema'
import { adaptPiToolsForMcp } from '#services/agent/mcp_adapter'
import {
  adaptMcpToolsForPi,
  takeToolUi,
  type SupplyMcpConnection,
} from '#services/agent/mcp_client'
import { buildAgentTools } from '#services/agent/tools'
import { MCP_APPS, mcpAppForTool, readMcpAppHtml } from '#services/agent/mcp_apps'
import { AgentUIMessageMapper, rehydrateAppLinks } from '#services/agent/ui_message_stream'
import { AgentMessageAssembler } from '#services/agent/message_assembler'

test.group('mcp_schema — TypeBox → zod', () => {
  test('optionalité, description et types de base survivent', ({ assert }) => {
    const shape = jsonSchemaToZodShape(
      Type.Object({
        obligatoire: Type.String({ description: 'code exact' }),
        facultatif: Type.Optional(Type.Number()),
        drapeau: Type.Optional(Type.Boolean()),
        libre: Type.Array(Type.Any()),
      }) as never,
      'test'
    )

    assert.deepEqual(Object.keys(shape).sort(), ['drapeau', 'facultatif', 'libre', 'obligatoire'])
    // Un champ requis refuse l'absence, un champ optionnel l'accepte.
    assert.isFalse(shape.obligatoire.safeParse(undefined).success)
    assert.isTrue(shape.facultatif.safeParse(undefined).success)
    assert.isFalse(shape.obligatoire.safeParse(42).success)
    assert.isTrue(shape.obligatoire.safeParse('PP_830').success)
    // La description est le seul canal d'explication d'un paramètre vers le modèle.
    assert.equal(shape.obligatoire.description, 'code exact')
    // Type.Any() ne contraint rien : la conversion ne doit pas durcir le contrat.
    assert.isTrue(shape.libre.safeParse([{ quoi: 'que ce soit' }]).success)
  })

  test('un schéma non convertible lève au lieu de dégrader', ({ assert }) => {
    assert.throws(
      () => jsonSchemaToZodShape({ type: 'object', properties: { x: { type: 'null' } } }, 'test'),
      /non convertible/
    )
    assert.throws(() => jsonSchemaToZodShape({ type: 'string' }, 'test'), /Type.Object est attendu/)
  })
})

test.group('mcp_adapter — façade sur buildAgentTools', () => {
  test('tous les tools réels se convertissent', ({ assert }) => {
    const registrations = adaptPiToolsForMcp(buildAgentTools())
    assert.isAbove(registrations.length, 0)
    for (const reg of registrations) {
      assert.isString(reg.name)
      assert.isNotEmpty(reg.description)
      assert.isObject(reg.inputShape)
    }
  })

  test('chaque app déclarée pointe un tool existant', ({ assert }) => {
    const names = new Set(buildAgentTools().map((t) => t.name))
    for (const app of MCP_APPS) {
      assert.isTrue(names.has(app.toolName), `app ${app.name} → tool ${app.toolName} inconnu`)
      assert.match(app.resourceUri, /^ui:\/\//)
    }
  })

  test('chaque app déclarée a son artefact HTML construit et commité', async ({ assert }) => {
    for (const app of MCP_APPS) {
      const html = await readMcpAppHtml(app)
      assert.match(html, /<html/i, `app ${app.name} : artefact vide ou non HTML`)
      // Autonomie : la CSP de la resource n'autorise aucun domaine, donc aucune
      // référence de fichier externe ne doit subsister après l'inlining.
      assert.notMatch(
        html,
        /(?:src|href)="(?!data:)[^"]*\.(?:js|css|woff2?|png|svg|jpe?g)"/i,
        `app ${app.name} : référence un fichier externe — relancer npm run mcp:apps`
      )
    }
  })

  test('structuredContent uniquement pour les tools porteurs d’une app', async ({ assert }) => {
    const payload = { _source: 'faux', postes: [{ poste: 'PP_830' }] }
    const faux = (name: string) =>
      defineTool({
        name,
        label: name,
        description: 'tool de test',
        parameters: Type.Object({}),
        execute: async () => ({
          content: [{ type: 'text' as const, text: JSON.stringify(payload) }],
          details: payload,
        }),
      })

    // getCharge porte l'app « charge » ; ping n'en a pas.
    const [avecApp, sansApp] = adaptPiToolsForMcp([faux('getCharge'), faux('ping')])

    assert.equal(avecApp.app?.resourceUri, mcpAppForTool('getCharge')?.resourceUri)
    assert.isUndefined(sansApp.app)

    const resAvec = await avecApp.handler({}, undefined)
    const resSans = await sansApp.handler({}, undefined)
    assert.deepEqual(resAvec.structuredContent, payload)
    assert.isUndefined(resSans.structuredContent)
    // Le canal texte (seul vu par le modèle) reste identique dans les deux cas.
    assert.deepEqual(resAvec.content, resSans.content)
  })

  test('arguments invalides : erreur de tool, pas exception (sens serveur)', async ({ assert }) => {
    const tool = defineTool({
      name: 'exigeant',
      label: 'exigeant',
      description: 'tool de test',
      parameters: Type.Object({ poste: Type.String() }),
      execute: async () => ({ content: [{ type: 'text' as const, text: 'ok' }], details: {} }),
    })
    const [reg] = adaptPiToolsForMcp([tool])
    const res = await reg.handler({ poste: 42 } as never, undefined)
    assert.isTrue(res.isError)
    assert.match(res.content[0].text, /Arguments invalides pour exigeant/)
  })
})

/**
 * Sens inverse (lot 2) : ce que le copilote voit du protocole. La connexion est
 * simulée — `tools/list` et `tools/call` sont les seuls points de contact, et
 * c'est justement le contrat qu'on veut verrouiller.
 */
function fakeConnection(result: Record<string, unknown>): SupplyMcpConnection {
  return {
    tools: [
      {
        name: 'getCharge',
        title: 'Charge vs capacité',
        description: 'charge par poste',
        inputSchema: {
          type: 'object',
          properties: { poste: { type: 'string', description: 'code poste' } },
          required: ['poste'],
        },
        _meta: { ui: { resourceUri: 'ui://supply-board/charge' } },
      },
      {
        name: 'ping',
        description: 'smoke',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'uiSeulement',
        description: 'réservé aux apps',
        inputSchema: { type: 'object', properties: {} },
        _meta: { ui: { resourceUri: 'ui://supply-board/charge', visibility: ['app'] } },
      },
    ],
    client: { callTool: async () => result },
    close: async () => {},
  } as unknown as SupplyMcpConnection
}

test.group('mcp_client — tools MCP → pi', () => {
  test('un tool réservé aux apps n’est pas proposé au modèle', ({ assert }) => {
    const tools = adaptMcpToolsForPi(fakeConnection({ content: [], structuredContent: {} }))
    assert.deepEqual(
      tools.map((t) => t.name),
      ['getCharge', 'ping']
    )
  })

  test('le schéma annoncé par le serveur valide côté pi (Type.Unsafe)', ({ assert }) => {
    const [charge] = adaptMcpToolsForPi(fakeConnection({ content: [], structuredContent: {} }))
    // Le JSON Schema du serveur est réutilisé tel quel : aucun second
    // convertisseur, donc pas de dérive — mais il doit valider pour de vrai.
    assert.isTrue(Check(charge.parameters, { poste: 'PP_830' }))
    assert.isFalse(Check(charge.parameters, {}))
    assert.isFalse(Check(charge.parameters, { poste: 42 }))
  })

  test('structuredContent devient details, et l’app est enregistrée sur le toolCallId', async ({
    assert,
  }) => {
    const payload = { _source: 'getCharge', postes: [{ poste: 'PP_830' }] }
    const [charge, ping] = adaptMcpToolsForPi(
      fakeConnection({
        content: [{ type: 'text', text: JSON.stringify(payload) }],
        structuredContent: payload,
      })
    )

    const res = await charge.execute(
      'call-1',
      { poste: 'PP' } as never,
      undefined,
      undefined,
      undefined as never
    )
    assert.deepEqual(res.details, payload)
    assert.deepEqual(takeToolUi('call-1'), { resourceUri: 'ui://supply-board/charge' })
    // Consommé une fois : un second message ne doit pas ré-afficher l'app d'avant.
    assert.isUndefined(takeToolUi('call-1'))

    await ping.execute('call-2', {} as never, undefined, undefined, undefined as never)
    assert.isUndefined(takeToolUi('call-2'))
  })

  test('un résultat isError remonte en exception nommée', async ({ assert }) => {
    const [charge] = adaptMcpToolsForPi(
      fakeConnection({ content: [{ type: 'text', text: 'X3 injoignable' }], isError: true })
    )
    await assert.rejects(
      () =>
        charge.execute(
          'call-3',
          { poste: 'PP' } as never,
          undefined,
          undefined,
          undefined as never
        ),
      /Tool getCharge en erreur : X3 injoignable/
    )
  })
})

test.group('ui_message_stream — enveloppe d’app', () => {
  test('output nu sans app, enveloppe marquée avec app', ({ assert }) => {
    const payload = { postes: [1, 2] }

    const sansApp = new AgentUIMessageMapper().map({
      type: 'tool_end',
      toolName: 'listerOF',
      toolCallId: 'c1',
      isError: false,
      result: payload,
    })
    // Forme historique : tout l'historique persisté avant #89 en dépend.
    assert.deepEqual(sansApp, [
      { type: 'tool-output-available', toolCallId: 'c1', output: payload },
    ])

    const avecApp = new AgentUIMessageMapper().map({
      type: 'tool_end',
      toolName: 'getCharge',
      toolCallId: 'c2',
      isError: false,
      result: payload,
      ui: { resourceUri: 'ui://supply-board/charge' },
    })
    assert.deepEqual(avecApp, [
      {
        type: 'tool-output-available',
        toolCallId: 'c2',
        output: { __mcpUi: { resourceUri: 'ui://supply-board/charge' }, data: payload },
      },
    ])
  })

  test('le message persisté porte la MÊME enveloppe que le stream', ({ assert }) => {
    const payload = { article: '11022900', projection: [1, 2, 3] }
    const event = {
      type: 'tool_end' as const,
      toolName: 'projeterStock',
      toolCallId: 'c3',
      isError: false,
      result: payload,
      ui: { resourceUri: 'ui://supply-board/stock' },
    }

    const [chunk] = new AgentUIMessageMapper().map(event)
    const assembler = new AgentMessageAssembler()
    assembler.feed({
      type: 'tool_start',
      toolName: 'projeterStock',
      toolCallId: 'c3',
      args: { article: '11022900' },
    })
    assembler.feed(event)
    const part = assembler.toMessage().parts.find((p) => p.type === 'tool-projeterStock')

    // La divergence entre ces deux chemins faisait disparaître le graphe au
    // rechargement de la conversation : affiché pendant le tour, absent après.
    assert.deepEqual(
      (part as { output?: unknown }).output,
      (chunk as { output?: unknown }).output
    )
    assert.deepEqual((part as { output?: unknown }).output, {
      __mcpUi: { resourceUri: 'ui://supply-board/stock' },
      data: payload,
    })
  })

  test('sans app, le message persisté garde le payload nu', ({ assert }) => {
    const payload = { ofs: [1] }
    const assembler = new AgentMessageAssembler()
    assembler.feed({ type: 'tool_start', toolName: 'listerOF', toolCallId: 'c4', args: {} })
    assembler.feed({
      type: 'tool_end',
      toolName: 'listerOF',
      toolCallId: 'c4',
      isError: false,
      result: payload,
    })
    const part = assembler.toMessage().parts.find((p) => p.type === 'tool-listerOF')
    assert.deepEqual((part as { output?: unknown }).output, payload)
  })
})

test.group('rehydrateAppLinks — conversations relues', () => {
  test('un tour enregistré sans enveloppe retrouve son app', ({ assert }) => {
    const payload = { article: '11022900' }
    const [message] = rehydrateAppLinks([
      {
        role: 'assistant',
        parts: [
          { type: 'text', text: 'voici' },
          {
            type: 'tool-projeterStock',
            toolCallId: 'c1',
            state: 'output-available',
            input: {},
            output: payload,
          },
        ],
      },
    ])

    assert.deepEqual(message.parts[1], {
      type: 'tool-projeterStock',
      toolCallId: 'c1',
      state: 'output-available',
      input: {},
      output: { __mcpUi: { resourceUri: 'ui://supply-board/stock' }, data: payload },
    })
  })

  test('un tool sans app et une enveloppe déjà posée sont laissés tels quels', ({ assert }) => {
    const nu = { ofs: [1] }
    const deja = { __mcpUi: { resourceUri: 'ui://supply-board/charge' }, data: { postes: [] } }
    const [message] = rehydrateAppLinks([
      {
        role: 'assistant',
        parts: [
          {
            type: 'tool-listerOF',
            toolCallId: 'c2',
            state: 'output-available',
            input: {},
            output: nu,
          },
          {
            type: 'tool-getCharge',
            toolCallId: 'c3',
            state: 'output-available',
            input: {},
            output: deja,
          },
          // Un appel encore en cours n'a pas d'output à envelopper.
          { type: 'tool-getCharge', toolCallId: 'c4', state: 'input-available', input: {} },
        ],
      },
    ])

    assert.deepEqual((message.parts[0] as { output: unknown }).output, nu)
    assert.deepEqual((message.parts[1] as { output: unknown }).output, deja)
    assert.isUndefined((message.parts[2] as { output?: unknown }).output)
  })
})
