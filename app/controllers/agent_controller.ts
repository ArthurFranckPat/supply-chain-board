/**
 * Endpoint SSE du copilote supply (couche agentique v1).
 *
 * POST /api/v1/agent/chat
 * body: { message: string, conversationId?, page?, selection?, filters? }
 *
 * Stream `text/event-stream` au **UI Message Stream Protocol** de l'AI SDK
 * v6 (`x-vercel-ai-ui-message-stream: v1`) — consommé par `useChat` +
 * `DefaultChatTransport` côté front (React, `@ai-sdk/react`). Le mapping
 * `AgentSseEvent` → `UIMessageChunk` vit dans
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

import { AgentUIMessageMapper, rehydrateAppLinks } from '#services/agent/ui_message_stream'
import { assertAgentProviderConfigured, runAgentTurn } from '#services/agent_service'
import { ConversationStore } from '#services/conversation_store'
import { compactHistory } from '#services/agent/history_compact'
import { AgentMessageAssembler, makeUserMessage } from '#services/agent/message_assembler'
import { hasStoredSession } from '#services/agent/session_store'

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
  private conversations = new ConversationStore()

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

    // Ré-hydratation du contexte : si la session Pi n'est plus vivante
    // (TTL 30 min / redémarrage) mais qu'un historique persisté existe pour la
    // conversation, on le compacte pour le réinjecter dans le system prompt de
    // la session recréée. Session vivante = contexte déjà en mémoire, rien à faire.
    let historySeed: string | undefined
    if (rawConversationId && userId !== undefined) {
      if (!hasStoredSession(userId, rawConversationId)) {
        const existing = await this.conversations.get(userId, rawConversationId)
        if (existing && existing.messages.length > 0) {
          historySeed = compactHistory(existing.messages) || undefined
        }
      }
    }

    // Titre de la conversation (1er message user tronqué, comme le front).
    const title = message.length > 42 ? `${message.slice(0, 42)}…` : message

    // Mapping événements agent → UI message stream (AI SDK v6). Les erreurs
    // fatales du tour deviennent un chunk `error` (onError) — plus besoin
    // d'écrire de frames à la main. L'assembleur reconstruit en parallèle le
    // UIMessage assistant pour la persistence de l'historique.
    const mapper = new AgentUIMessageMapper()
    const assembler = new AgentMessageAssembler()
    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        for await (const event of runAgentTurn({
          message,
          conversationId: rawConversationId,
          userId,
          historySeed,
          screenContext: {
            page: typeof body.page === 'string' ? body.page : undefined,
            selection: asIdMap(body.selection),
            filters: asIdMap(body.filters),
          },
          signal: abort.signal,
        })) {
          assembler.feed(event)
          for (const chunk of mapper.map(event)) {
            writer.write(chunk)
          }
        }

        // Persistence du tour (user + assistant). Best-effort : un échec
        // d'écriture ne doit pas casser le stream déjà envoyé au client.
        if (rawConversationId && userId !== undefined) {
          try {
            await this.conversations.appendTurn(
              userId,
              rawConversationId,
              title,
              makeUserMessage(message),
              assembler.toMessage()
            )
          } catch {
            /* best-effort */
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

  /**
   * GET /api/v1/agent/conversations — liste de l'historique de l'user (sidebar).
   */
  async conversationsIndex(ctx: HttpContext) {
    const userId = ctx.auth.user?.id
    if (userId === undefined) {
      return ctx.response.unauthorized({ error: 'Authentification requise.' })
    }
    return ctx.response.json({ conversations: await this.conversations.list(userId) })
  }

  /**
   * GET /api/v1/agent/conversations/:id — messages d'une conversation (rechargement).
   */
  async conversationsShow(ctx: HttpContext) {
    const userId = ctx.auth.user?.id
    if (userId === undefined) {
      return ctx.response.unauthorized({ error: 'Authentification requise.' })
    }
    const conversationId = String(ctx.params.id ?? '')
      .trim()
      .slice(0, 64)
    const row = await this.conversations.get(userId, conversationId)
    if (!row) return ctx.response.notFound({ error: 'Conversation introuvable.' })
    // Les tours enregistrés sans enveloppe d'app (avant #89, ou avant le
    // correctif de persistance) retrouvent ici leur lien vers l'app : la donnée
    // est en base, seul le `resourceUri` manquait.
    return ctx.response.json({ ...row, messages: rehydrateAppLinks(row.messages) })
  }

  /**
   * DELETE /api/v1/agent/conversations/:id — supprime une conversation.
   */
  async conversationsDestroy(ctx: HttpContext) {
    const userId = ctx.auth.user?.id
    if (userId === undefined) {
      return ctx.response.unauthorized({ error: 'Authentification requise.' })
    }
    const conversationId = String(ctx.params.id ?? '')
      .trim()
      .slice(0, 64)
    const ok = await this.conversations.delete(userId, conversationId)
    if (!ok) return ctx.response.notFound({ error: 'Conversation introuvable.' })
    return ctx.response.json({ ok: true })
  }
}
