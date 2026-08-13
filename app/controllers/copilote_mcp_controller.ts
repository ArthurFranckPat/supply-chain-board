/**
 * Pont HTTP entre l'hôte MCP Apps du navigateur (/copilote) et le client MCP
 * in-process — issue #89, lot 3.
 *
 * L'app tourne dans une iframe sandbox : elle n'a ni accès réseau (CSP fermée),
 * ni session, ni cookie. Tout ce qu'elle demande passe par le pont `AppBridge`
 * côté page, qui appelle ces deux routes, qui rejouent la demande **par le
 * protocole MCP** (`resources/read`, `tools/call`) via `mcp_client.ts`.
 *
 * Rien ici ne lit un fichier ni n'appelle une primitive en direct : sinon l'hôte
 * web et Claude Desktop pourraient divergerment, et c'est exactement ce que #89
 * refuse.
 *
 * Sécurité :
 *  - les deux routes sont derrière `middleware.auth()` (cf. start/routes.ts) ;
 *  - une app ne peut appeler qu'un tool **annoncé par le serveur** — même liste
 *    que celle proposée au modèle. Un nom hors liste est refusé avant tout appel ;
 *  - seules les URI `ui://` sont lisibles : pas de lecture de resource arbitraire.
 */

import type { HttpContext } from '@adonisjs/core/http'

import { getSupplyMcpConnection, readMcpResource } from '#services/agent/mcp_client'

/** MIME des resources d'app (SEP-1865). */
const APP_MIME = 'text/html;profile=mcp-app'

export default class CopiloteMcpController {
  /**
   * GET /api/v1/copilote/mcp/app?uri=ui://supply-board/charge
   *
   * Rend le HTML de l'app + son `_meta.ui` (CSP, permissions, préférence de
   * bordure) tel que le serveur MCP les déclare. L'hôte construit sa CSP à
   * partir de ces valeurs et n'élargit jamais au-delà.
   */
  async app(ctx: HttpContext) {
    const uri = ctx.request.input('uri')
    if (typeof uri !== 'string' || !uri.startsWith('ui://')) {
      return ctx.response.badRequest({
        error: 'Paramètre « uri » attendu, schéma ui:// obligatoire.',
      })
    }

    try {
      const result = await readMcpResource(uri)
      // `contents[]` est une union texte | blob : seul le texte nous intéresse
      // (une app est du HTML, jamais un binaire).
      const content = result.contents.find(
        (
          c
        ): c is { uri: string; text: string; mimeType?: string; _meta?: Record<string, unknown> } =>
          typeof c.mimeType === 'string' &&
          c.mimeType.startsWith('text/html') &&
          typeof (c as { text?: unknown }).text === 'string'
      )
      if (!content) {
        return ctx.response.status(415).json({
          error: `La resource ${uri} ne rend pas de HTML d'app (mimeType attendu ${APP_MIME}).`,
        })
      }
      return ctx.response.ok({
        uri,
        mimeType: content.mimeType,
        html: content.text,
        // `_meta.ui` du content item fait foi côté hôte (la valeur de
        // `resources/list` n'est qu'un défaut consultable à la connexion).
        meta: content._meta ?? null,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return ctx.response.notFound({ error: `Resource ${uri} illisible : ${message}` })
    }
  }

  /**
   * POST /api/v1/copilote/mcp/call — `tools/call` demandé par une app.
   *
   * body: { name: string, arguments?: object }
   */
  async call(ctx: HttpContext) {
    const body = ctx.request.body()
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name) {
      return ctx.response.badRequest({ error: 'Champ « name » requis.' })
    }
    const args =
      typeof body.arguments === 'object' &&
      body.arguments !== null &&
      !Array.isArray(body.arguments)
        ? (body.arguments as Record<string, unknown>)
        : {}

    const connection = await getSupplyMcpConnection()
    // Allowlist = ce que le serveur annonce. Une app ne gagne aucun droit
    // supplémentaire par rapport au modèle.
    if (!connection.tools.some((t) => t.name === name)) {
      return ctx.response.forbidden({ error: `Tool « ${name} » non exposé par le serveur MCP.` })
    }

    try {
      const result = await connection.client.callTool({ name, arguments: args })
      // Renvoyé tel quel : c'est un `CallToolResult` que l'AppBridge repasse à
      // l'app sans retouche (content + structuredContent + isError).
      return ctx.response.ok(result)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return ctx.response.status(422).json({ error: `Appel ${name} refusé : ${message}` })
    }
  }
}
