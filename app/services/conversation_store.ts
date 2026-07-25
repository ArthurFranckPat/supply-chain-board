import type { UIMessage } from 'ai'

import Conversation from '#models/conversation'
import type { AgentMessageMetadata } from '#services/agent/ui_message_stream'

/** Message de chat persisté — un UIMessage AI SDK (texte + réflexion + tools). */
export type StoredChatMessage = UIMessage<AgentMessageMetadata>

/** Vue liste de la sidebar : pas besoin des messages, juste l'en-tête. */
export interface ConversationSummary {
  conversationId: string
  title: string | null
  updatedAt: string
}

/** Vue complète : messages désérialisés, pour recharger une conversation. */
export interface ConversationDetail extends ConversationSummary {
  messages: StoredChatMessage[]
}

function parseMessages(raw: string): StoredChatMessage[] {
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as StoredChatMessage[]) : []
  } catch {
    return []
  }
}

function toSummary(m: Conversation): ConversationSummary {
  return {
    conversationId: m.conversationId,
    title: m.title,
    updatedAt: m.updatedAt?.toISO() ?? '',
  }
}

/**
 * Persistance de l'historique copilote. Même pattern que `ScenarioStore` :
 * couche fine sur le modèle Lucid, (dé)sérialisation JSON à la frontière.
 *
 * K5 (anti-IDOR) : toutes les lectures/écritures sont scopées par `userId` —
 * un `conversationId` deviné ne donne jamais accès à l'historique d'autrui.
 */
export class ConversationStore {
  async list(userId: number): Promise<ConversationSummary[]> {
    const rows = await Conversation.query().where('user_id', userId).orderBy('updated_at', 'desc')
    return rows.map(toSummary)
  }

  async get(userId: number, conversationId: string): Promise<ConversationDetail | null> {
    const row = await Conversation.query()
      .where('user_id', userId)
      .andWhere('conversation_id', conversationId)
      .first()
    if (!row) return null
    return { ...toSummary(row), messages: parseMessages(row.messages) }
  }

  /**
   * Ajoute un tour (message user + message assistant) à la conversation,
   * créée si absente. Le `title` n'est posé qu'à la création (1er message).
   */
  async appendTurn(
    userId: number,
    conversationId: string,
    title: string | null,
    userMessage: StoredChatMessage,
    assistantMessage: StoredChatMessage
  ): Promise<void> {
    const row = await Conversation.query()
      .where('user_id', userId)
      .andWhere('conversation_id', conversationId)
      .first()

    if (row) {
      const messages = parseMessages(row.messages)
      messages.push(userMessage, assistantMessage)
      row.messages = JSON.stringify(messages)
      await row.save()
      return
    }

    await Conversation.create({
      userId,
      conversationId,
      title,
      messages: JSON.stringify([userMessage, assistantMessage]),
    })
  }

  async delete(userId: number, conversationId: string): Promise<boolean> {
    const row = await Conversation.query()
      .where('user_id', userId)
      .andWhere('conversation_id', conversationId)
      .first()
    if (!row) return false
    await row.delete()
    return true
  }
}
