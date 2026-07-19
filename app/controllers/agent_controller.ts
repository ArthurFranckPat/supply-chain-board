/**
 * Endpoint SSE du copilote supply (couche agentique v1).
 *
 * POST /api/v1/agent/chat
 * body: { message: string, conversationId?, page?, selection?, filters? }
 *
 * Stream `text/event-stream` au **UI Message Stream Protocol** de l'AI SDK
 * v6 (`x-vercel-ai-ui-message-stream: v1`) — consommé par `useChat` +
 * `DefaultChatTransport` côté front (Solid via `@kodehort/ai-sdk-solid`,
 * puis React à #77). Le mapping `AgentSseEvent` → `UIMessageChunk` vit dans
 * `agent/ui_message_stream.ts`.
 *
 * Session Pi in-memory, persistée par conversationId (mémoire multi-tour,
 * TTL 30 min) — jetable si absent.
 *
 * K5 (sécu) : la session est namespacée par `ctx.auth.user.id` côté
 * `session_store` — un attaquant qui devine un `conversationId` ne peut
 * plus lire la session Pi d'un autre user. Derrière `middleware.auth()`.
 */

import type { HttpContext } from '@adonisjs/core/http'
import {
  createUIMessageStream,
  JsonToSseTransformStream,
  UI_MESSAGE_STREAM_HEADERS,
} from 'ai'

import { AgentUIMessageMapper } from '#services/agent/ui_message_stream'
import { assertAgentProviderConfigured, runAgentTurn } from '#services/agent_service'

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function asIdMap(
  v: unknown
): Record<string, string | number | null | undefined> | undefined {
  if (!isPlainObject(v)) return undefined
  const out: Record<string, string | number | null | undefined> = {}
  for (const [k, val] of Object.entries(v)) {
    if (
      val === null ||
      val === undefined ||
      typeof val === 'string' ||
      typeof val === 'number'
    ) {
      out[k] = val as string | number | null | undefined
    }
  }
  return out
}

export default class AgentController {
  /** GET /copilote — page chat Solid (jetable à #77). */
  async show(ctx: HttpContext) {
    return ctx.inertia.render('copilote', {})
  }

  /**
   * GET /api/v1/agent/health — prouve provider + présence clé (sans LLM).
   */
  async health(ctx: HttpContext) {
    try {
      const info = assertAgentProviderConfigured()
      return ctx.response.ok({
        ok: info.hasKey,
        provider: info.provider,
        model: info.model,
        hasKey: info.hasKey,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return ctx.response.status(503).json({ ok: false, error: message })
    }
  }

  /**
   * POST /api/v1/agent/chat — tour conversationnel SSE.
   */
  async chat(ctx: HttpContext) {
    const body = ctx.request.body()
    const message = typeof body.message === 'string' ? body.message.trim() : ''
    if (!message) {
      return ctx.response.badRequest({ error: 'Champ « message » requis.' })
    }

    const rawConversationId =
      typeof body.conversationId === 'string'
        ? body.conversationId.trim().slice(0, 64) || undefined
        : undefined
    const userId = ctx.auth.user?.id

    // K5 — sans user authentifié, on refuse la persistence conversationnelle
    // (defense in depth : le middleware.auth() devrait déjà bloquer, mais on
    // ne veut jamais keyer une session sur un id absent car cela ouvrirait un
    // namespace partagé "undefined:*" — un avatar d'IDOR).
    if (rawConversationId && userId === undefined) {
      return ctx.response.unauthorized({
        error: 'Authentification requise pour la mémoire conversationnelle.',
      })
    }

    const abort = new AbortController()
    const onClose = () => abort.abort()
    ctx.request.request.on('close', onClose)

    // Mapping événements agent → UI message stream (AI SDK v6). Les erreurs
    // fatales du tour deviennent un chunk `error` (onError) — plus besoin
    // d'écrire de frames à la main.
    const mapper = new AgentUIMessageMapper()
    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        for await (const event of runAgentTurn({
          message,
          conversationId: rawConversationId,
          userId,
          screenContext: {
            page: typeof body.page === 'string' ? body.page : undefined,
            selection: asIdMap(body.selection),
            filters: asIdMap(body.filters),
          },
          signal: abort.signal,
        })) {
          for (const chunk of mapper.map(event)) {
            writer.write(chunk)
          }
        }
      },
      onError: (err) => (err instanceof Error ? err.message : String(err)),
    })

    // Headers standard AI SDK (incl. x-accel-buffering: no).
    ctx.response.response.writeHead(200, UI_MESSAGE_STREAM_HEADERS)

    const sse = stream
      .pipeThrough(new JsonToSseTransformStream())
      .pipeThrough(new TextEncoderStream())
    const reader = sse.getReader()
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        ctx.response.response.write(value)
      }
    } finally {
      ctx.request.request.off('close', onClose)
      ctx.response.response.end()
    }

    // Empêche Adonis de re-sérialiser un body (stream déjà terminé).
    return ctx.response
  }
}
