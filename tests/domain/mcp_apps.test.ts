/**
 * Contrat de la couche MCP Apps (issue #89, lot 1).
 *
 * Ce que ces tests verrouillent :
 *  - la conversion TypeBox → zod, seul chemin possible vers le `McpServer`
 *    high-level, ne perd ni l'optionalité ni les descriptions, et **lève** au lieu
 *    de dégrader un schéma qu'elle ne sait pas traduire ;
 *  - les 18 tools réels passent tous cette conversion (une régression y casserait
 *    le boot du serveur MCP, pas un appel isolé) ;
 *  - `structuredContent` n'est émis que par les tools qui ont une app — c'est ce
 *    qui garantit qu'un tool sans UI répond exactement comme avant #89.
 */

import { test } from '@japa/runner'
import { Type } from 'typebox'
import { defineTool } from '@earendil-works/pi-coding-agent'
import { jsonSchemaToZodShape } from '#services/agent/mcp_schema'
import { adaptPiToolsForMcp } from '#services/agent/mcp_adapter'
import { buildAgentTools } from '#services/agent/tools'
import { MCP_APPS, mcpAppForTool } from '#services/agent/mcp_apps'

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

    assert.deepEqual(Object.keys(shape).sort(), [
      'drapeau',
      'facultatif',
      'libre',
      'obligatoire',
    ])
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
  test('les 18 tools réels se convertissent tous', ({ assert }) => {
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

  test('arguments invalides : erreur de tool, pas exception', async ({ assert }) => {
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
